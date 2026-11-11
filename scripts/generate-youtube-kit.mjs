// Generate YOUTUBE-CHANNEL-SEO.md — a ready-to-paste visibility kit for the
// Thinking Beyond YouTube channel itself (Studio → Customization → Basic info,
// and per-video tag fields). Tags are pulled from the latest videos, so the
// channel and the website target the same search terms.

import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const videos = JSON.parse(await readFile(new URL('../src/channel-videos.json', import.meta.url), 'utf8'));
const keywords = await readFile(new URL('../src/site-keywords.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => []);
const config = await readFile(new URL('../src/channel-config.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({}));
const SEO_VIDEO_COUNT = Number(process.env.SEO_VIDEO_COUNT) || 17;

const oneLine = text => String(text || '').replace(/\s+/g, ' ').trim();
const seoVideos = videos.slice(0, SEO_VIDEO_COUNT);

const channelDescription = `Thinking Beyond is Nepal's podcast for curious minds, hosted by Manisha Neupane. Deep, honest conversations with Nepal's entrepreneurs, creators, experts, and change-makers about business, money, technology, startups, mindset, health, culture, and society — plus big ideas shaping Nepal's future.

New video conversations every week. Subscribe for Nepal's fastest growing podcast on business and ideas.

Watch on YouTube: https://youtube.com/${config.handle || '@manishaneupane'}
Full episodes and show notes: https://thethinkingbeyond.com`;

const channelKeywords = keywords.slice(0, 25).join(', ');

const rows = seoVideos.map((video, index) => `| ${index + 1} | ${oneLine(video.title).replace(/\|/g, '/')} | ${(video.tags || []).join(', ') || '—'} |`).join('\n');

const markdown = `# YouTube Channel SEO Kit — Thinking Beyond

Generated ${new Date().toISOString().slice(0, 10)} from the live channel data.
Paste these into YouTube Studio so the channel and the website rank for the
same searches (Nepal podcast, best Nepali podcasts, business podcast Nepal).

## 1. Channel description (Studio → Customization → Basic info → Description)

\`\`\`
${channelDescription}
\`\`\`

## 2. Channel keywords / tags (Studio → Customization → Basic info → Keywords)

\`\`\`
${channelKeywords}
\`\`\`

## 3. Channel "About" translation (Studio → Customization → Basic info → About)

\`\`\`
Nepal's podcast for curious minds. Hosted by Manisha Neupane.
Conversations with Nepal's entrepreneurs, creators, and experts about
business, money, technology, startups, mindset, health, and society.
New video episodes every week — subscribe and think beyond.
\`\`\`

## 4. Per-video tags pulled from the latest ${seoVideos.length} uploads

Paste each video's tag row into YouTube Studio → Content → that video → Tags.

| # | Video | Tags |
|---|-------|------|
${rows}

## 5. Consistency checklist

- [ ] Channel description matches the site's about copy (Nepal podcast keywords)
- [ ] Every new video gets tags from its own description (first 17 are pre-filled above)
- [ ] Video titles keep the guest name and topic (they already do)
- [ ] Site RSS/sitemap/llms regenerate daily from the same data (GitHub Actions)
`;

await writeFile(resolve(process.cwd(), 'YOUTUBE-CHANNEL-SEO.md'), markdown);
console.log(`Wrote YOUTUBE-CHANNEL-SEO.md (${seoVideos.length} videos, ${channelKeywords.split(',').length} channel keywords) into repo root.`);
