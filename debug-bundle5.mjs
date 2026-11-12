import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const regex = /"id":"ep-4-68ecb0"[^}]*"views":(\d+)/g;
    const matches = [...o.code.matchAll(/id":"ep-4-68ecb0"[^}]*"views":(\d+)/g)];
    if (matches.length > 0) {
      console.log(`Chunk ${i}: ${matches.length} occurrences`);
      matches.forEach((m, j) => {
        const idx = o.code.indexOf(m[0]);
        console.log(`  Occurrence ${j+1}: views=${m[1]}, context: ${o.code.slice(idx-100, idx+100)}`);
      }
    }
  }
});
