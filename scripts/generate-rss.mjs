// Generate public/rss.xml — a podcast feed for Thinking Beyond so podcast
// apps, RSS readers, and AI crawlers can consume the full episode list.
// Run by the daily GitHub Actions workflow alongside the other generators.

import {readFile, writeFile} from 'node:fs/promises';

const origin = process.env.SITE_ORIGIN || 'https://thethinkingbeyond.com';
const episodes = JSON.parse(await readFile(new URL('../src/channel-videos.json', import.meta.url), 'utf8'));
const config = await readFile(new URL('../src/channel-config.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({channelId: ''}));
const siteKeywords = await readFile(new URL('../src/site-keywords.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => []);

const xmlEscape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const toRfc822 = value => {const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toUTCString()};
const toItunesDuration = seconds => {const total = Math.max(Math.round(Number(seconds) || 0), 0); if (!total) return ''; const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), rest = total % 60; return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`};
const description = episode => xmlEscape(episode.summary || `Watch "${episode.title}" with ${episode.guest || 'the Thinking Beyond team'} on the Thinking Beyond YouTube channel.`);

const items = episodes.map(episode => `  <item>
    <title>${xmlEscape(episode.title)}</title>
    <link>${origin}/episodes/${xmlEscape(episode.id)}</link>
    <guid isPermaLink="true">${origin}/episodes/${xmlEscape(episode.id)}</guid>
    <pubDate>${toRfc822(episode.publishedAt)}</pubDate>
    <description>${description(episode)}</description>
    <itunes:subtitle>${xmlEscape((episode.summary || episode.title).split('\n')[0].slice(0, 255))}</itunes:subtitle>
    <itunes:duration>${toItunesDuration(episode.durationSec)}</itunes:duration>
    <itunes:image href="https://i.ytimg.com/vi/${xmlEscape(episode.youtubeId)}/hqdefault.jpg"/>
    <itunes:explicit>no</itunes:explicit>
  </item>`).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Thinking Beyond with Manisha Neupane</title>
    <link>${origin}/</link>
    <description>Thinking Beyond is a Nepal-based podcast hosted by Manisha Neupane. Thoughtful conversations about business, growth, health, culture, and society with curious guests from Nepal and beyond.</description>
    <language>en</language>
    <copyright>© ${new Date().getFullYear()} Thinking Beyond</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Thinking Beyond site generator</generator>
    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>Manisha Neupane</itunes:author>
    <itunes:owner>
      <itunes:name>Manisha Neupane</itunes:name>
    </itunes:owner>
    <itunes:summary>Thoughtful conversations about business, growth, health, culture, and society — hosted by Manisha Neupane from Nepal.</itunes:summary>
    <itunes:image href="${origin}/images/logo-mark.png"/>
    <itunes:category text="Society &amp; Culture"/>
    <itunes:category text="Business"/>
    <itunes:keywords>${xmlEscape(siteKeywords.slice(0, 12).join(', '))}</itunes:keywords>
    <itunes:explicit>no</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:episodeType>full</itunes:episodeType>
${items}
  </channel>
</rss>
`;

await writeFile(new URL('../public/rss.xml', import.meta.url), rss);
console.log(`Wrote RSS feed with ${episodes.length} episodes to public/rss.xml`);
