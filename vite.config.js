import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {channelStatsPlugin} from './scripts/channel-stats.mjs';

export default defineConfig({
  plugins: [react(), channelStatsPlugin()],
  // Default: /thinking-beyond/ — matches local dev (http://localhost:5173/thinking-beyond/)
  // and the GitHub Pages project URL (https://yrarjun59.github.io/thinking-beyond/).
  // The production custom domain (CNAME = thethinkingbeyond.com) is served from the
  // domain root, so the deploy workflow sets SITE_BASE=/ for that case.
  base: process.env.SITE_BASE || '/thinking-beyond/',
});
