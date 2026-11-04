import { readFile, writeFile } from 'node:fs/promises';

const feedUrl = process.env.THINKING_BEYOND_EPISODES_URL || 'https://thethinkingbeyond.com/api/episodes?sort=new';
const targetFile = new URL('../src/channel-videos.json', import.meta.url);

function flatten(payload) {
  if (Array.isArray(payload?.episodes)) return payload.episodes;
  if (Array.isArray(payload)) return payload;
  return (payload?.months || []).flatMap(month => month.episodes || []);
}

const response = await fetch(feedUrl, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`Episode feed returned ${response.status}`);

let rows = flatten(await response.json())
  .filter(item => item?.youtubeId && item?.title)
  .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
  .slice(0, 14);

if (!rows.length) throw new Error('Episode feed returned no usable videos');

const apiKey = process.env.YOUTUBE_API_KEY;
if (apiKey) {
  const ids = rows.map(item => item.youtubeId).join(',');
  const statsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${apiKey}`, { headers: { accept: 'application/json' } });
  if (statsResponse.ok) {
    const statistics = await statsResponse.json();
    const byId = new Map((statistics.items || []).map(item => [item.id, item.statistics]));
    rows = rows.map(item => {
      const viewCount = Number(byId.get(item.youtubeId)?.viewCount);
      return Number.isFinite(viewCount) ? { ...item, views: viewCount, viewsSource: 'youtube-data-api', viewsFetchedAt: new Date().toISOString() } : item;
    });
    console.log(`Refreshed YouTube view counts for ${byId.size} videos.`);
  } else {
    console.warn(`YouTube statistics request returned ${statsResponse.status}; keeping feed values.`);
  }
}

// The public watch page exposes the current view count even when the API key
// is unavailable. Use it to correct stale values from the legacy episode feed.
const pageStats = await Promise.all(rows.map(async item => {
  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${item.youtubeId}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    if (!page.ok) return [item.youtubeId, null];
    const html = await page.text();
    const match = html.match(/"viewCount":"?(\d+)"?/);
    const views = match ? Number(match[1]) : NaN;
    return [item.youtubeId, Number.isFinite(views) ? views : null];
  } catch {
    return [item.youtubeId, null];
  }
}));
const publicViews = new Map(pageStats);
rows = rows.map(item => {
  const views = publicViews.get(item.youtubeId);
  return Number.isFinite(views) ? { ...item, views, viewsSource: 'youtube-watch-page', viewsFetchedAt: new Date().toISOString() } : item;
});
console.log(`Refreshed public YouTube view counts for ${[...publicViews.values()].filter(Number.isFinite).length} videos.`);

const previous = JSON.parse(await readFile(targetFile, 'utf8'));
await writeFile(targetFile, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Updated ${rows.length} latest videos from ${feedUrl}`);
if (JSON.stringify(previous) === JSON.stringify(rows)) console.log('No video changes detected.');
