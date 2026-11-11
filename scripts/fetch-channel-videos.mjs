// Pull the latest videos and metrics from ANY public YouTube channel.
//
// Usage:
//   node scripts/fetch-channel-videos.mjs <channelId | @handle> [count] [--out file.json]
//
// With YOUTUBE_API_KEY set, this uses the official YouTube Data API v3:
//   1. channels.list        -> resolve the channel and its uploads playlist
//   2. playlistItems.list   -> latest N video IDs
//   3. videos.list          -> views, likes, comments, duration per video
// Without a key it falls back to the public channel page, so the command
// still works for quick checks. Quota cost with a key: ~4 units per run.

import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
if (outIndex >= 0) args.splice(outIndex, 2);
const [channelArg, countArg] = args;
const count = Math.min(Math.max(Number(countArg) || 10, 1), 50);

if (!channelArg) {
  console.error('Usage: node scripts/fetch-channel-videos.mjs <channelId | @handle> [count] [--out file.json]');
  process.exit(1);
}

const apiKey = process.env.YOUTUBE_API_KEY;
const timeout = signal => ({signal: AbortSignal.timeout(15000), ...signal});

async function getJson(url) {
  const response = await fetch(url, {headers: {accept: 'application/json'}, ...timeout()});
  if (!response.ok) throw new Error(`Request returned ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

// ---------- Data API path ----------

async function fetchViaApi() {
  const query = channelArg.startsWith('UC') ? {id: channelArg, part: 'snippet,contentDetails,statistics'} : {forHandle: channelArg.replace(/^@?/, '@'), part: 'snippet,contentDetails,statistics'};
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.search = new URLSearchParams({...query, key: apiKey});
  const channel = (await getJson(url)).items?.[0];
  if (!channel) throw new Error('Channel not found via YouTube Data API');
  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) throw new Error('Channel has no public uploads playlist');

  const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  playlistUrl.search = new URLSearchParams({part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: String(count), key: apiKey});
  const videoIds = (await getJson(playlistUrl)).items?.map(item => item.contentDetails?.videoId).filter(Boolean) || [];
  if (!videoIds.length) throw new Error('Uploads playlist returned no videos');

  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.search = new URLSearchParams({part: 'snippet,statistics,contentDetails', id: videoIds.join(','), key: apiKey});
  const videos = await getJson(videosUrl);
  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title,
    subscribers: channel.statistics?.subscriberCount ? Number(channel.statistics.subscriberCount) : undefined,
    channelViews: channel.statistics?.viewCount ? Number(channel.statistics.viewCount) : undefined,
    videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : undefined,
    source: 'youtube-data-api',
    fetchedAt: new Date().toISOString(),
    videos: (videos.items || []).map(item => ({
      videoId: item.id,
      title: item.snippet?.title,
      publishedAt: item.snippet?.publishedAt,
      views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined,
      likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : undefined,
      comments: item.statistics?.commentCount ? Number(item.statistics.commentCount) : undefined,
      duration: item.contentDetails?.duration
    }))
  };
}

// ---------- Public page fallback ----------

function findNodes(node, key, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node[key]) found.push(node[key]);
  for (const child of Object.values(node)) findNodes(child, key, found);
  return found;
}

const compact = text => {const m = String(text).replaceAll(',', '').match(/([\d.]+)\s*([KMB])?/i); return m ? Math.round(Number(m[1]) * ({K: 1e3, M: 1e6, B: 1e9}[m[2]?.toUpperCase()] || 1)) : null};

async function fetchViaPublicPage() {
  const path = channelArg.startsWith('UC') ? `channel/${channelArg}` : channelArg.replace(/^@?/, '@');
  const response = await fetch(`https://www.youtube.com/${path}/videos?hl=en`, {headers: {accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}, ...timeout()});
  if (!response.ok) throw new Error(`Channel page returned ${response.status}`);
  const html = await response.text();
  const match = /var ytInitialData = (\{.*?\});</.exec(html);
  if (!match) throw new Error('Could not read channel page data');
  const data = JSON.parse(match[1]);

  // New channel markup (lockupViewModel) plus the legacy videoRenderer form.
  const entries = findNodes(data, 'lockupViewModel').slice(0, count).map(lockup => {
    const metadata = findNodes(lockup, 'lockupMetadataViewModel')[0] || {};
    const parts = findNodes(metadata, 'metadataParts')[0]?.flatMap(group => group) || [];
    const viewsText = parts[0]?.text?.content || '';
    const publishedText = parts[1]?.text?.content || null;
    const duration = findNodes(lockup, 'thumbnailBadgeViewModel').find(badge => /^\d+(:\d+)+$/.test(badge.text || ''))?.text || null;
    return {
      videoId: lockup.contentId,
      title: metadata.title?.content,
      publishedText,
      views: compact(viewsText),
      viewsLabel: viewsText || null,
      duration
    };
  });
  const legacy = findNodes(data, 'videoRenderer').slice(0, count).map(renderer => ({
    videoId: renderer.videoId,
    title: renderer.title?.runs?.[0]?.text,
    publishedText: renderer.publishedTimeText?.simpleText || null,
    views: compact(renderer.viewCountText?.simpleText || ''),
    viewsLabel: renderer.viewCountText?.simpleText || null,
    duration: renderer.lengthText?.simpleText || null
  }));
  const renderers = entries.length ? entries : legacy;
  if (!renderers.length) throw new Error('Channel page returned no videos');

  // Refine the rounded view labels ("41K") against the public watch pages.
  const exact = await Promise.all(renderers.map(async renderer => {
    try {
      const page = await fetch(`https://www.youtube.com/watch?v=${renderer.videoId}`, {headers: {accept: 'text/html'}, ...timeout()});
      if (!page.ok) return null;
      const pageHtml = await page.text();
      const viewMatch = /"viewCount":"?(\d+)"?/.exec(pageHtml);
      return viewMatch ? Number(viewMatch[1]) : null;
    } catch { return null; }
  }));

  return {
    channelId: null,
    channelTitle: /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1],
    source: 'youtube-public-channel',
    fetchedAt: new Date().toISOString(),
    videos: renderers.map((renderer, index) => ({
      videoId: renderer.videoId,
      title: renderer.title,
      publishedAt: null,
      publishedText: renderer.publishedText,
      views: Number.isFinite(exact[index]) ? exact[index] : renderer.views,
      viewsLabel: renderer.viewsLabel,
      duration: renderer.duration
    }))
  };
}

// ---------- Run ----------

const result = await (apiKey ? fetchViaApi() : fetchViaPublicPage());
const output = JSON.stringify(result, null, 2);
if (outFile) {
  const target = outFile.startsWith('/') ? outFile : resolve(new URL('..', import.meta.url).pathname, outFile);
  await writeFile(target, output + '\n');
  console.log(`Wrote ${result.videos.length} videos to ${target} (source: ${result.source})`);
} else {
  console.log(output);
}
