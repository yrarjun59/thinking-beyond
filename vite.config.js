import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {channelStatsPlugin} from './scripts/channel-stats.mjs';

export default defineConfig({
  plugins: [react(), channelStatsPlugin()],
  // Local dev and the GitHub Pages project URL use /thinking-beyond/.
  // The production custom domain (thethinkingbeyond.com, see CNAME) is served
  // from the domain root, so the deploy workflow sets SITE_BASE=/.
  base: process.env.SITE_BASE || '/thinking-beyond/',
});
