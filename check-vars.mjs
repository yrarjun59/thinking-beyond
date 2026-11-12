import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Check for channelVideos usage
    const cvMatches = [...o.code.matchAll(/channelVideos/g)];
    const fbMatches = [...o.code.matchAll(/fallback(?!\.months)/g)];
    console.log(`Chunk ${i}: channelVideos=${cvMatches.length}, fallback=${fbMatches.length}`);
  }
});
