// Pull ALL videos from the Thinking Beyond YouTube channel and refresh their
// metrics (views, duration, publish dates) into src/channel-videos.json.
//
// With YOUTUBE_API_KEY set:
//   1. channels.list       -> uploads playlist for the configured channel
//   2. playlistItems.list  -> every upload, paginated
//   3. videos.list         -> exact views, likes, comments, duration
// Without a key:
//   1. Channel /videos page + innertube continuation -> every video, newest first
//   2. Channel RSS feed -> exact views and publish dates for the latest 15
//   3. Watch pages (only where the rounded label changed) -> exact views
//
// Guest, summary, and episode-number metadata from src/episodes.json and the
// legacy site feed are merged in by video ID so older pages keep their copy.

import {readFile, writeFile} from 'node:fs/promises';

const config = await readFile(new URL('../src/channel-config.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({}));
const channelId = process.env.YOUTUBE_CHANNEL_ID || config.channelId || 'UCUbXuNfuebW0MEfX4kouqHA';
const targetFile = new URL('../src/channel-videos.json', import.meta.url);
const feedUrl = process.env.THINKING_BEYOND_EPISODES_URL || 'https://thethinkingbeyond.com/api/episodes?sort=new';
const MAX_VIDEOS = Number(process.env.MAX_CHANNEL_VIDEOS) || 500;
// Keyword/SEO enrichment (YouTube description + tags) focuses on the latest
// videos, which are the ones search engines and AI crawlers care about most.
// The rest keep their stored metrics and are left alone on each refresh.
const SEO_VIDEO_COUNT = Number(process.env.SEO_VIDEO_COUNT) || 17;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function findNodes(node, key, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node[key]) found.push(node[key]);
  for (const child of Object.values(node)) findNodes(child, key, found);
  return found;
}

const compact = text => {const m = String(text).replaceAll(',', '').match(/([\d.]+)\s*([KMB])?/i); return m ? Math.round(Number(m[1]) * ({K: 1e3, M: 1e6, B: 1e9}[m[2]?.toUpperCase()] || 1)) : null};
const compactLabel = count => {if (!Number.isFinite(count) || count <= 0) return null; return new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(count)};
// The channel page shows relative labels ("17h ago", "1d ago", "3 weeks ago");
// convert them to real dates so sorting, sitemap dates, and RSS pubDates stay accurate.
const parsePublishedText = text => {const units = {s: 1e3, sec: 1e3, second: 1e3, seconds: 1e3, m: 6e4, min: 6e4, minute: 6e4, minutes: 6e4, h: 36e5, hr: 36e5, hour: 36e5, hours: 36e5, d: 864e5, day: 864e5, days: 864e5, w: 6048e5, wk: 6048e5, week: 6048e5, weeks: 6048e5, mo: 26298e5, month: 26298e5, months: 26298e5, y: 315576e5, yr: 315576e5, year: 315576e5, years: 315576e5}; const m = String(text || '').trim().match(/^(\d+)\s*([a-z]+)\s+ago$/i); if (!m) return null; const ms = units[m[2].toLowerCase()]; return ms ? new Date(Date.now() - Number(m[1]) * ms).toISOString() : null};
const durationToSeconds = text => {if (!text) return null; if (/^P/.test(text)) {const m = String(text).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return null; return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)} const parts = String(text).split(':').map(Number); if (parts.some(Number.isNaN)) return null; return parts.reduce((total, part) => total * 60 + part, 0)};

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, list.length)}, async () => {
    while (cursor < list.length) {const index = cursor++; out[index] = await fn(list[index], index).catch(() => null)}
  });
  await Promise.all(workers);
  return out;
}

// ---------- YouTube Data API path ----------

async function getJson(url) {
  const response = await fetch(url, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Request returned ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

async function fetchViaApi() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const query = {id: channelId, part: 'contentDetails'};
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.search = new URLSearchParams({...query, key: apiKey});
  const uploadsPlaylist = (await getJson(url)).items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) throw new Error('Channel has no public uploads playlist');

  const rows = [];
  let pageToken = '';
  while (rows.length < MAX_VIDEOS) {
    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.search = new URLSearchParams({part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: '50', ...(pageToken ? {pageToken} : {}), key: apiKey});
    const page = await getJson(playlistUrl);
    rows.push(...(page.items || []).map(item => item.contentDetails?.videoId).filter(Boolean));
    pageToken = page.nextPageToken || '';
    if (!pageToken) break;
  }
  const ids = rows.slice(0, MAX_VIDEOS);
  if (!ids.length) throw new Error('Uploads playlist returned no videos');

  const byId = new Map();
  for (let start = 0; start < ids.length; start += 50) {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.search = new URLSearchParams({part: 'snippet,statistics,contentDetails', id: ids.slice(start, start + 50).join(','), key: apiKey});
    for (const item of (await getJson(videosUrl)).items || []) {
      byId.set(item.id, {
        videoId: item.id,
        title: item.snippet?.title,
        publishedAt: item.snippet?.publishedAt,
        description: item.snippet?.description || undefined,
        tags: item.snippet?.tags?.length ? item.snippet.tags : undefined,
        views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined,
        likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : undefined,
        comments: item.statistics?.commentCount ? Number(item.statistics.commentCount) : undefined,
        durationSec: durationToSeconds(item.contentDetails?.duration),
        source: 'youtube-data-api'
      });
    }
  }
  return ids.map(id => byId.get(id)).filter(Boolean);
}

// ---------- Public channel page path ----------

function parseLockup(lockup) {
  const metadata = findNodes(lockup, 'lockupMetadataViewModel')[0] || {};
  const parts = (findNodes(metadata, 'metadataParts')[0] || []).flatMap(group => group);
  const badge = findNodes(lockup, 'thumbnailBadgeViewModel').find(item => /^\d+(:\d+)+$/.test(item.text || ''))?.text;
  return {
    videoId: lockup.contentId,
    title: metadata.title?.content,
    viewsLabel: parts[0]?.text?.content || null,
    publishedText: parts[1]?.text?.content || null,
    durationSec: durationToSeconds(badge)
  };
}

async function fetchChannelPageVideos() {
  const response = await fetch(`https://www.youtube.com/channel/${channelId}/videos?hl=en`, {headers: {accept: 'text/html', 'user-agent': UA}, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Channel page returned ${response.status}`);
  const html = await response.text();
  const match = /var ytInitialData = (\{.*?\});</.exec(html);
  if (!match) throw new Error('Could not read channel page data');
  let items = findNodes(JSON.parse(match[1]), 'lockupViewModel');
  let token = findNodes(JSON.parse(match[1]), 'continuationItemRenderer')[0]?.continuationEndpoint?.continuationCommand?.token;

  const context = {context: {client: {clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'en'}}};
  while (token && items.length < MAX_VIDEOS) {
    const response = await fetch('https://www.youtube.com/youtubei/v1/browse?hl=en&prettyPrint=false', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'user-agent': UA},
      body: JSON.stringify({...context, continuation: token}),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) break;
    const data = await response.json();
    const next = (data.onResponseReceivedActions || []).flatMap(action => action.appendContinuationItemsAction?.continuationItems || []);
    const nextLockups = findNodes(next, 'lockupViewModel');
    if (!nextLockups.length) break;
    items = items.concat(nextLockups);
    token = findNodes(next, 'continuationItemRenderer')[0]?.continuationEndpoint?.continuationCommand?.token;
  }
  return items.slice(0, MAX_VIDEOS).map(parseLockup).filter(row => row.videoId);
}

async function fetchRssEntries() {
  try {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(15000)});
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(entry => ({
      videoId: /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry[0])?.[1],
      title: /<title>([^<]+)<\/title>/.exec(entry[0])?.[1],
      publishedAt: /<published>([^<]+)<\/published>/.exec(entry[0])?.[1],
      views: Number(/<media:statistics views="(\d+)"/.exec(entry[0])?.[1]),
      description: /<media:description>([\s\S]*?)<\/media:description>/.exec(entry[0])?.[1]?.trim() || undefined
    })).filter(row => row.videoId);
  } catch { return []; }
}

function extractTagsFromContent(title, description, guest, summary) {
  const text = `${title} ${description || ''} ${guest || ''} ${summary || ''}`.toLowerCase();
  const stop = new Set('a,an,the,and,or,but,if,then,else,when,at,by,for,with,about,against,between,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,should,now,is,am,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,shall,may,might,must,of,it,its,this,that,these,those,i,you,he,she,we,they,them,his,her,their,our,your,my,me,him,us,what,which,who,whom,as,because,while,where,how,also,get,like,one,two,new,first,last,way,even,still,really,much,many,well,back,go,going,make,made,take,took,see,know,think,say,said,come,came,want,use,used,find,found,give,tell,work,call,try,ask,need,feel,become,leave,put,mean,keep,let,begin,seem,help,show,hear,play,run,move,live,believe,hold,bring,happen,write,provide,sit,stand,lose,pay,meet,include,continue,set,learn,change,lead,understand,watch,follow,stop,create,speak,read,allow,add,spend,grow,open,walk,win,offer,remember,love,consider,appear,buy,wait,serve,send,expect,build,stay,fall,cut,reach,remain,suggest,raise,pass,sell,require,report,decide,pull,return,explain,hope,develop,carry,break,receive,agree,support,hit,produce,eat,cover,catch,draw,choose,cause,point,listen,realize,place,close,involve,increase,reduce,establish,join,unit,plan,state,okay,yeah,yes,hi,hello,hey,thanks,thank,please,welcome,sorry,today,tomorrow,yesterday,ever,never,always,sometimes,often,usually,already,yet,almost,enough,quite,rather,kind,sort,lot,lots,ton,tons,bit,little,big,huge,small,large,great,good,bad,best,better,worse,worst,high,low,long,short,old,young,right,left,true,false,real,same,different,important,special,free,full,half,next,previous,early,late,quick,slow,hard,easy,simple,complex,clear,sure,certain,possible,impossible,available,ready,able,unable,afraid,angry,happy,sad,tired,excited,bored,surprised,interested,interesting,amazing,awesome,cool,nice,fine,super,such,whatever,whichever,whoever,wherever,whenever,however,despite,except,besides,including,regarding,concerning,according,due,owing,regardless,per,via,versus,etc,eg,ie,your,yours,mine,ours,theirs,itself,themselves,himself,herself,myself,ourselves,yourself,yourselves,does,done,went,gone,came,seen,taken,made,known,shown,written,been,being,having,doing,said,told,given,taken,left,kept,held,brought,thought,bought,fought,sought,taught,caught,bound,ground,sound,round,around,about,above,across,after,against,along,among,before,behind,beneath,beside,beyond,despite,except,inside,outside,throughout,toward,towards,underneath,unlike,until,upon,within,without'.split(','));
  
  // Nepal-specific terms get boosted
  const nepalTerms = ['nepal', 'nepali', 'kathmandu', 'himalaya', 'mount everest', 'pokhara', 'biratnagar', 'lalitpur', 'bhaktapur', 'dharan', 'butwal', 'hetauda', 'janakpur', 'birgunj', 'bharatpur'];
  
  const words = text.replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const phrases = new Map();
  
  // Unigrams
  for (const w of words) {
    if (w.length > 3 && !stop.has(w) && !/^\d+$/.test(w)) {
      let weight = 1;
      if (nepalTerms.some(t => w.includes(t))) weight = 3;
      if (w.length > 6) weight += 1;
      phrases.set(w, (phrases.get(w) || 0) + weight);
    }
  }
  
  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i], w2 = words[i + 1];
    if (w1.length > 2 && w2.length > 2 && !stop.has(w1) && !stop.has(w2)) {
      const bigram = `${w1} ${w2}`;
      let weight = 2;
      if (nepalTerms.some(t => bigram.includes(t))) weight = 5;
      phrases.set(bigram, (phrases.get(bigram) || 0) + weight);
    }
  }
  
  // Trigrams for specific topics
  for (let i = 0; i < words.length - 2; i++) {
    const w1 = words[i], w2 = words[i + 1], w3 = words[i + 2];
    if (w1.length > 2 && w2.length > 2 && w3.length > 2 && !stop.has(w1) && !stop.has(w2) && !stop.has(w3)) {
      const trigram = `${w1} ${w2} ${w3}`;
      if (nepalTerms.some(t => trigram.includes(t))) {
        phrases.set(trigram, (phrases.get(trigram) || 0) + 5);
      }
    }
  }
  
  // Guest name as a tag
  if (guest) {
    const g = guest.toLowerCase().trim();
    if (g.length > 2) phrases.set(g, (phrases.get(g) || 0) + 4);
  }
  
  return [...phrases.entries()].sort((a,b) => b[1] - a[1]).slice(0, 15).map(([tag]) => tag);
}

async function fetchWatchPage(videoId) {
  const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {headers: {accept: 'text/html', 'user-agent': UA}, signal: AbortSignal.timeout(12000)});
  if (!page.ok) return null;
  const html = await page.text();
  // YouTube exposes the view count in several shapes on the same page, e.g.
  //   "viewCount":"3259"            (videoDetails JSON — no separator)
  //   "viewCount":"3,259"           (listItemViewCountViewModel — commas!)
  // A naive /\d+/ capture stops at the comma and turns 47,788 into 47, which is
  // exactly how live counts got truncated to "48" / "3" / "10". Strip separators
  // from every candidate and take the largest, since they all describe the same
  // total and any unrelated "viewCount" field is always smaller.
  const viewCandidates = [...html.matchAll(/"viewCount":"?([\d.,\s]+)"?/g)]
    .map(match => Number(match[1].replace(/[^\d]/g, '')))
    .filter(count => Number.isFinite(count) && count > 0);
  const views = viewCandidates.length ? Math.max(...viewCandidates) : null;
  let description = null;
  const descMatch = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (descMatch) {try {description = JSON.parse(`"${descMatch[1]}"`)} catch {description = descMatch[1]}}
  let tags = null;
  const tagsMatch = /"keywords":\[((?:"(?:[^"\\]|\\.)*"[,]?)*)\]/.exec(html);
  if (tagsMatch) {try {const parsed = JSON.parse(`[${tagsMatch[1]}]`); if (Array.isArray(parsed) && parsed.length) tags = parsed.map(String)} catch {}}
  return {views, description, tags};
}

// ---------- Merge and write ----------

const previous = JSON.parse(await readFile(targetFile, 'utf8').catch(() => '[]'));
const previousById = new Map(previous.map(row => [row.youtubeId, row]));
const archive = JSON.parse(await readFile(new URL('../src/episodes.json', import.meta.url), 'utf8').catch(() => '{"months":[]}'));
const archiveById = new Map((archive.months || []).flatMap(month => month.episodes || []).filter(row => row?.youtubeId).map(row => [row.youtubeId, row]));

// The legacy site feed adds guest/summary copy for newly published episodes
// before they reach the static archive.
let feedRows = [];
try {
  const response = await fetch(feedUrl, {headers: {accept: 'application/json'}, signal: AbortSignal.timeout(8000)});
  if (response.ok) {
    const data = await response.json();
    feedRows = Array.isArray(data?.episodes) ? data.episodes : (data?.months || []).flatMap(month => month.episodes || []);
  }
} catch {}
const feedById = new Map(feedRows.filter(row => row?.youtubeId).map(row => [row.youtubeId, row]));

const apiKey = Boolean(process.env.YOUTUBE_API_KEY);
let fetched = apiKey ? await fetchViaApi() : await fetchChannelPageVideos();
console.log(`Fetched ${fetched.length} videos from the channel (${apiKey ? 'YouTube Data API' : 'public channel page'}).`);

const rssById = new Map((await fetchRssEntries()).filter(row => row.videoId).map(row => [row.videoId, row]));
if (rssById.size) console.log(`RSS feed contributed exact metrics for ${rssById.size} latest videos.`);

// Exact views are only re-scraped when the rounded label no longer matches the
// stored exact value, so daily runs touch a handful of pages instead of all.
// Watch pages also yield the YouTube description and keyword tags.
const watchData = await mapLimit(fetched, 8, async (row, index) => {
  const rss = rssById.get(row.videoId);
  if (index >= SEO_VIDEO_COUNT) {
    // Outside the SEO window: keep stored metrics, no new requests.
    const previousRow = previousById.get(row.videoId) || {};
    return {views: previousRow.views ?? null, description: previousRow.description, tags: previousRow.tags, fromRss: false};
  }
  if (Number.isFinite(rss?.views)) return {...rss, description: rss.description, tags: rss.tags, fromRss: true};
  if (apiKey && Number.isFinite(row.views)) return {views: row.views, description: row.description, tags: row.tags, fromRss: false};
  const previousRow = previousById.get(row.videoId);
  const cached = Number.isFinite(previousRow?.views) && compactLabel(previousRow.views) === row.viewsLabel;
  if (cached && previousRow.description) return {views: previousRow.views, description: previousRow.description, tags: previousRow.tags, fromRss: false};
  const page = row.viewsLabel ? await fetchWatchPage(row.videoId) : null;
  return page ? {...page, fromRss: false} : {views: cached ? previousRow.views : null, description: previousRow?.description, tags: previousRow?.tags, fromRss: false};
});
console.log(`Resolved exact view counts for ${watchData.filter(row => Number.isFinite(row.views)).length} videos (SEO window: latest ${Math.min(SEO_VIDEO_COUNT, fetched.length)}).`);

const rows = fetched.map((row, index) => {
  const archived = archiveById.get(row.videoId) || {};
  const feed = feedById.get(row.videoId) || {};
  const previousRow = previousById.get(row.videoId) || {};
  const watch = watchData[index] || {};
  const exact = watch.views;
  let views = Number.isFinite(exact) ? exact : compact(row.viewsLabel);
  let viewsSource = Number.isFinite(exact) ? (apiKey ? 'youtube-data-api' : rssById.has(row.videoId) ? 'youtube-rss' : 'youtube-watch-page') : 'youtube-channel-label';
  // Safety net against truncated scrapes: the rounded channel label ("49.6K")
  // is accurate to ~3 significant digits, so an exact count that is orders of
  // magnitude below it means the watch page was parsed badly. Trust the label.
  const labelViews = compact(row.viewsLabel);
  if (Number.isFinite(views) && Number.isFinite(labelViews) && labelViews > 0 && views > 0 && views < labelViews * 0.9) {
    views = labelViews;
    viewsSource = 'youtube-channel-label';
  }
  if (!Number.isFinite(views) && Number.isFinite(Number(previousRow.views))) {
    views = Number(previousRow.views);
    viewsSource = previousRow.viewsSource || 'previous-refresh';
  }
  const durationSec = row.durationSec ?? (Number(archived.durationMin) > 0 ? Math.round(Number(archived.durationMin) * 60) : null);
  
  // Generate video-specific tags from content for EVERY video (not just SEO window)
  const computedTags = extractTagsFromContent(
    row.title || feed.title || archived.title || previousRow.title || '',
    watch.description || previousRow.description || archived.summary || feed.summary || '',
    archived.guest || feed.guest || previousRow.guest,
    archived.summary || feed.summary || previousRow.summary || ''
  );
  
  return {
    id: archived.id || previousRow.id || `yt-${row.videoId}`,
    youtubeId: row.videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${row.videoId}`,
    title: row.title || feed.title || archived.title || previousRow.title || 'Untitled video',
    guest: archived.guest || feed.guest || previousRow.guest || undefined,
    summary: archived.summary || feed.summary || previousRow.summary || undefined,
    description: watch.description || previousRow.description || undefined,
    tags: computedTags.length ? computedTags : (watch.tags || previousRow.tags || undefined),
    number: archived.number ?? feed.number ?? previousRow.number ?? undefined,
    publishedAt: row.publishedAt || parsePublishedText(row.publishedText) || feed.publishedAt || archived.publishedAt || previousRow.publishedAt || undefined,
    durationMin: durationSec ? Math.round(durationSec / 60) : (archived.durationMin ?? previousRow.durationMin),
    durationSec,
    views,
    viewsSource,
    viewsFetchedAt: new Date().toISOString(),
    channelOrder: index + 1
  };
});

if (!rows.length) throw new Error('No videos could be read from the channel');
await writeFile(targetFile, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote all ${rows.length} channel videos (newest first) to src/channel-videos.json.`);
if (JSON.stringify(previous.map(row => `${row.youtubeId}:${row.views}`)) === JSON.stringify(rows.map(row => `${row.youtubeId}:${row.views}`))) console.log('No metric changes detected.');
