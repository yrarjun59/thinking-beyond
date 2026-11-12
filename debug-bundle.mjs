import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Check which import is being used for Rekha Yadav
    const match1 = o.code.match(/Rekha Yadav[^}]*views\":(\d+)/);
    if (match1) console.log(`Chunk ${i}: Rekha Yadav views: ${match1[1]}`);
    
    // Check if channelVideos is being used
    const match2 = o.code.match(/channelVideos/);
    if (match2) console.log(`Chunk ${i}: uses channelVideos`);
    
    // Check if fallback is being used
    const match3 = o.code.match(/fallback/);
    if (match3) console.log(`Chunk ${i}: uses fallback`);
  }
});
