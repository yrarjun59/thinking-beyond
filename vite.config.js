import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {channelStatsPlugin} from './scripts/channel-stats.mjs';

export default defineConfig({
  plugins: [react(), channelStatsPlugin()],
  base: '/thinking-beyond/',
});
