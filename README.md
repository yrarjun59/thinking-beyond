# Thinking Beyond

Thinking Beyond is a React/Vite redesign for the Thinking Beyond podcast with Manisha Neupane. It adds a studio hero, rotating guest illustrations, YouTube episode playback, archive pagination, contact topics, newsletter signup, sponsor credit, social links, channel statistics, and browser-local admin editors.

## Stack

- React 19
- Vite 6
- React Router
- Lucide React icons
- Simple Icons for platform marks
- GitHub Pages deployment through GitHub Actions

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A browser with JavaScript enabled
- (Optional) `YOUTUBE_API_KEY` environment variable for exact metrics and video tags

## Install and run locally

```sh
git clone https://github.com/yrarjun59/thinking-beyond.git
cd thinking-beyond
npm install
npm run dev
```

Open `http://localhost:5173/thinking-beyond/`.

- Media/personalization admin: `http://localhost:5173/thinking-beyond/admin`
- Main content/feed settings: `http://localhost:5173/thinking-beyond/admin/settings`

The Vite base path is `/thinking-beyond/` for the GitHub Pages project site. If deploying to a custom domain (e.g. `thethinkingbeyond.com`), set `SITE_BASE=/` in the environment. See the **Deployment** section below.

## Production build

```sh
npm run build
npm run preview
```

The build is written to `dist/`. The host must serve `dist/index.html` as a fallback for `/episodes`, `/contact`, `/admin`, and episode detail routes. The GitHub Pages workflow copies `dist/index.html` to `dist/404.html` for this purpose.

## Admin and personalization

The redesign has two browser-local admin surfaces.

### `/admin`

- Site name, host name, footer tagline, and site logo URL
- Add/delete sponsor credits and store sponsor logo URLs
- Sponsor name, website, and logo URL
- Add/delete social links
- Social label, URL, and optional custom icon URL

### `/admin/settings`

- Site identity and SEO copy
- Hero message sequence with add/delete/edit controls
- Explore topics with add/delete/edit controls
- Footer social links
- Footer listen links and their display order
- Sponsor name and website
- YouTube channel URL
- Refresh and export the latest 14 episode records

Settings are saved to `localStorage` in the current browser. To publish changes for every visitor, export the settings JSON, apply it to the source data/configuration, rebuild, and deploy. A production admin should move this storage to an authenticated database or CMS before public use.

## YouTube and episode data

The site uses one channel feed as the source for episode updates:

- **Runtime fallback:** `https://thethinkingbeyond.com/api/episodes?sort=new` (if `YOUTUBE_API_KEY` is set)
- **Static fallback:** `src/channel-videos.json` (public scraping, no API key needed)
- **Public episode cap:** latest 17 videos (dynamic — see "Podcast boundary" below)
- **Episodes page:** 9 items per page, up to 9 visible pagination buttons
- **Episode sorting:** newest, oldest, most viewed, and longest

### Podcast boundary (dynamic episode selection)

The "podcast episodes" are not a fixed count — they are the videos **from the point where the podcast content begins** onward. The boundary is detected automatically:

- The oldest video that has site metadata (guest name, summary, or episode number) is where the podcast starts
- Everything from that video **newest-first** are podcast episodes
- This shifts automatically when new videos are uploaded (the window slides forward)

Manual override: set `MAX_CHANNEL_VIDEOS` in the environment to cap the total fetched from YouTube.

Manual refresh commands:

```sh
node scripts/update-channel-videos.mjs
node scripts/channel-stats.mjs
node scripts/generate-sitemap.mjs
node scripts/generate-keywords.mjs
node scripts/generate-rss.mjs
node scripts/generate-llms.mjs
node scripts/generate-youtube-kit.mjs
```

The GitHub Pages workflow runs daily. It refreshes episodes and channel statistics, regenerates all metadata, builds the SPA, and deploys the artifact.

## GitHub Pages deployment

This repo has a `CNAME` file (`thethinkingbeyond.com`) for a custom domain, but the GitHub Pages **project site** URL is `https://yrarjun59.github.io/thinking-beyond/`.

| Deployment target | `SITE_BASE` value | Use case |
|-------------------|-------------------|----------|
| GitHub Pages project site | `/thinking-beyond/` | `https://yrarjun59.github.io/thinking-beyond/` (default) |
| Custom domain (CNAME) | `/` | `https://thethinkingbeyond.com/` |

### Workflow behavior

- If `SITE_BASE` is **not set** (or empty): the workflow sets `SITE_BASE=/thinking-behind/` and deploys to the project site URL.
- If `SITE_BASE=/` is set: the workflow deploys to the custom domain root (`thethinkingbeyond.com`).
- The workflow installs dependencies, pulls the latest episodes, refreshes statistics, generates sitemap/keywords/RSS/LLM files/YouTube kit, builds the SPA, and deploys Pages.

To set `SITE_BASE=/` for custom domain deployment, add it as a secret in GitHub Actions or set it in the workflow directly.

### Channel statistics

The header displays subscribers, episode count, and views. Local Vite development provides `/api/channel-stats` with a five-minute cache.

- **With `YOUTUBE_API_KEY`:** exact views, subscriber count, video count from YouTube API
- **Without API key:** public YouTube About metadata (rounded subscriber counts)

Episode cards display compact YouTube-style view labels such as `5.7K` and `41.5K`. The value shown by the public site prefers verified static YouTube refresh data over a stale runtime feed value.

For a deployed API, set `VITE_CHANNEL_STATS_URL` to a public JSON endpoint matching `public/data/channel-stats.json`. Never expose `YOUTUBE_API_KEY` in a `VITE_` variable; use a server environment variable or GitHub Actions secret.

## SEO and AI-readable metadata

- `index.html`: title, description, author, canonical URL, Open Graph, Twitter Card, and Schema.org graph data
- `public/robots.txt`: crawler policy and sitemap location (allows AI crawlers: GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
- `public/sitemap.xml`: public route inventory, regenerated from episode data (77 URLs)
- `public/llms.txt`: concise machine-readable site context and official links
- `public/llms-full.txt`: full machine-readable context
- `public/agents.md`: agent instructions and tool definitions
- `public/.well-known/security.txt`: security contact information
- `Seo` component: updates title, description, Open Graph title/description, and canonical URL for SPA routes

Do not include `/admin` in the sitemap. It is disallowed in `robots.txt`.

### Daily regeneration pipeline (runs 08:02 Nepal time / `17 2 * * *`)

| Script | Output | Purpose |
|--------|--------|---------|
| `scripts/update-channel-videos.mjs` | `src/channel-videos.json` | Fetches all 74 channel videos, exact views, relative dates, per-video tags |
| `scripts/channel-stats.mjs` | `public/data/channel-stats.json` | Subscribers (3,500), views (397K), videoCount (261), episodes (17) |
| `scripts/generate-keywords.mjs` | `src/site-keywords.json` | 60 keywords (channel anchors + latest 17 video tags) |
| `scripts/generate-rss.mjs` | `public/rss.xml` | 74 items, iTunes tags, `itunes:keywords` |
| `scripts/generate-llms.mjs` | `public/llms.txt`, `llms-full.txt`, `agents.md` | Machine-readable site context |
| `scripts/generate-sitemap.mjs` | `public/sitemap.xml` | 77 URLs (episodes + static routes) |
| `scripts/generate-youtube-kit.mjs` | `YOUTUBE-CHANNEL-SEO.md` | Studio-ready channel description, 25 keywords, per-video tags |

## Visual and responsive behavior

- The home hero uses a 50/50 desktop split: editorial copy on the left and the studio illustration on the right.
- At tablet and mobile widths, the hero stacks the copy above the visual and keeps the studio composition inside a mobile-safe crop.
- The latest and archive conversation sections share the same player, thumbnail, and hover-preview behavior.
- Sponsor credits are sourced from browser-local admin settings. A single sponsor is centered without marquee motion; multiple sponsors can rotate slowly in the footer (marquee with "WITH THANKS TO" label).
- Footer listen links, social links, sponsor name, sponsor URL, and sponsor logo URL are rendered from saved admin settings.

## Project structure

```text
src/main.jsx                 Public routes, layout, player, contact, and settings admin
src/ChannelStats.jsx         Cached channel statistics widget
src/podcast.json             Brand, links, pillars, and show defaults
src/channel-videos.json      Static latest episode fallback
src/channel-config.json      Channel ID, handle, SEO anchors
src/site-keywords.json       Generated keyword set (60 keywords)
src/site-episodes.json       Merged episode data from channel + legacy site
scripts/channel-stats.mjs    Channel statistics fetch/cache plugin and CLI
scripts/update-channel-videos.mjs
scripts/generate-keywords.mjs
scripts/generate-rss.mjs
scripts/generate-llms.mjs
scripts/generate-sitemap.mjs
scripts/generate-youtube-kit.mjs
public/images/               Logos, host art, thumbnails, and studio art
public/robots.txt            Crawler policy and sitemap location
public/sitemap.xml           Public route inventory
public/llms.txt              Concise machine-readable site context
public/llms-full.txt         Full machine-readable context
public/agents.md             Agent instructions and tool definitions
public/.well-known/security.txt  Security contact information
.github/workflows/pages.yml  Daily build and GitHub Pages deployment
```

## Verification

```sh
npm run build
git diff --check
```

Before launch, verify YouTube playback, contact/newsletter API responses, social URLs, sponsor links/logos, keyboard navigation, reduced-motion behavior, mobile layouts, and GitHub Pages deep-link fallback.

## Important limitations

- Browser-local admin changes are not shared across visitors until exported and deployed.
- Automatic YouTube subscribe actions require YouTube's own confirmation flow.
- Public YouTube subscriber totals are rounded (without API key).
- The public episode feed and YouTube markup can change; the static fallback remains available when a refresh fails.
- Without `YOUTUBE_API_KEY`: exact view counts, like/dislike counts, and comments are approximated from public YouTube pages and RSS feed.
- Episode boundary detection is automatic but may need manual adjustment if the podcast start point changes.