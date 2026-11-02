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

const rows = flatten(await response.json())
  .filter(item => item?.youtubeId && item?.title)
  .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
  .slice(0, 14);

if (!rows.length) throw new Error('Episode feed returned no usable videos');

const previous = JSON.parse(await readFile(targetFile, 'utf8'));
await writeFile(targetFile, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Updated ${rows.length} latest videos from ${feedUrl}`);
if (JSON.stringify(previous) === JSON.stringify(rows)) console.log('No video changes detected.');
