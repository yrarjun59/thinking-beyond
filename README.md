# Thinking Beyond

Thinking Beyond is a React/Vite redesign for the Thinking Beyond podcast with Manisha Neupane. It adds a studio hero, rotating guest illustrations, YouTube episode playback, archive pagination, contact topics, newsletter signup, sponsor credit, social links, channel statistics, and browser-local admin editors.

## Stack

- React 19
- Vite 6
- React Router
- Lucide React icons
- Simple Icons for platform marks
- GitHub Pages deployment through GitHub Actions

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A browser with JavaScript enabled

## Install and run locally

```sh
git clone https://github.com/yrarjun59/thinking-beyond.git
cd thinking-beyond
npm install
npm run dev
```

Open `http://localhost:4173/thinking-beyond/`.

- Media/personalization admin: `http://localhost:4173/thinking-beyond/admin`
- Main content/feed settings: `http://localhost:4173/thinking-beyond/admin/settings`

The Vite base path is `/thinking-beyond/` for GitHub Pages. If deploying to a different path, update `base` in `vite.config.js`, canonical URLs in `index.html`, and the sitemap origin.

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
- Add/delete sponsor credits
- Sponsor name, website, and logo URL
- Add/delete social links
- Social label, URL, and optional custom icon URL

### `/admin/settings`

- Site identity and SEO copy
- Hero message sequence with add/delete/edit controls
- Explore topics with add/delete/edit controls
- Footer social links
- Sponsor name and website
- YouTube channel URL
- Refresh and export the latest 14 episode records

Settings are saved to `localStorage` in the current browser. To publish changes for every visitor, export the settings JSON, apply it to the source data/configuration, rebuild, and deploy. A production admin should move this storage to an authenticated database or CMS before public use.

## YouTube and episode data

The site uses one channel feed as the source for episode updates:

- Runtime fallback: `https://thethinkingbeyond.com/api/episodes?sort=new`
- Static fallback: `src/channel-videos.json`
- Public episode cap: latest 14 videos
- Episodes page: 9 items per page, up to 9 visible pagination buttons
- Episode sorting: newest, oldest, most viewed, and longest

Manual refresh commands:

```sh
node scripts/update-channel-videos.mjs
node scripts/channel-stats.mjs
node scripts/generate-sitemap.mjs
```

The GitHub Pages workflow runs daily. It refreshes episodes and channel statistics, regenerates the sitemap, builds the SPA, and deploys the artifact. The schedule is `17 2 * * *` UTC, or 08:02 Nepal time. GitHub scheduled workflows can run later than requested.

### Channel statistics

The header displays subscribers, episode count, and views. Local Vite development provides `/api/channel-stats` with a five-minute cache. The server uses `YOUTUBE_API_KEY` when available and otherwise reads public YouTube About metadata scoped to the configured channel ID. YouTube public subscriber counts are rounded.

For a deployed API, set `VITE_CHANNEL_STATS_URL` to a public JSON endpoint matching `public/data/channel-stats.json`. Never expose `YOUTUBE_API_KEY` in a `VITE_` variable; use a server environment variable or GitHub Actions secret.

## GitHub Pages deployment

1. Push this repository to GitHub.
2. Enable Pages using **GitHub Actions** as the source.
3. Confirm `.github/workflows/pages.yml` exists.
4. Optionally add the repository secret `YOUTUBE_API_KEY`.
5. Push to `main` or run the workflow manually from Actions.

The workflow installs dependencies, pulls the latest 14 episodes, refreshes statistics, generates the sitemap, runs `npm run build`, prepares the SPA fallback, and deploys Pages.

## SEO and AI-readable metadata

- `index.html`: title, description, author, canonical URL, robots directives, Open Graph, Twitter Card, and Schema.org graph data
- `public/robots.txt`: crawler policy and sitemap location
- `public/sitemap.xml`: public route inventory, regenerated from episode data
- `public/llms.txt`: concise machine-readable site context and official links
- `Seo` component: updates title, description, Open Graph title/description, and canonical URL for SPA routes

Do not include `/admin` in the sitemap. It is disallowed in `robots.txt`.

## Project structure

```text
src/main.jsx                 Public routes, layout, player, contact, and settings admin
src/AdminPanel.jsx           Media, brand, sponsor, and social editor
src/ChannelStats.jsx         Cached channel statistics widget
src/podcast.json             Brand, links, pillars, and show defaults
src/channel-videos.json      Static latest episode fallback
public/images/               Logos, host art, thumbnails, and studio art
scripts/channel-stats.mjs    Channel statistics fetch/cache plugin and CLI
scripts/update-channel-videos.mjs
scripts/generate-sitemap.mjs
public/robots.txt
public/sitemap.xml
public/llms.txt
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
- Public YouTube subscriber totals are rounded.
- The public episode feed and YouTube markup can change; the static fallback remains available when a refresh fails.
