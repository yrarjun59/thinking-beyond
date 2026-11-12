import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Search for the specific episode data with views
    const matches = o.code.matchAll(/"id":"ep-4-68ecb0"[^}]*"views":(\d+)/g);
    for (const match of matches) {
      console.log(`Chunk ${i}: ep-4-68ecb0 views: ${match[1]}`);
    }
  }
});
