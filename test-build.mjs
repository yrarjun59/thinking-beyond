import { build } from 'vite';
const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});
result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const match = o.code.match(/Rekha Yadav[^}]*views\":(\d+)/);
    if (match) console.log(`Chunk ${i}: views: ${match[1]}`);
  }
});
