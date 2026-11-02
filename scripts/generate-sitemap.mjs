import { readFile, writeFile } from 'node:fs/promises';

const origin = process.env.SITE_ORIGIN || 'https://thethinkingbeyond.com';
const episodes = JSON.parse(await readFile(new URL('../src/channel-videos.json', import.meta.url), 'utf8'));
const urls = ['/', '/episodes', '/contact', ...episodes.map(episode => `/episodes/${episode.id}`)];
const body = urls.map(path => `  <url><loc>${origin}${path}</loc></url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml);
console.log(`Wrote sitemap with ${urls.length} URLs`);
