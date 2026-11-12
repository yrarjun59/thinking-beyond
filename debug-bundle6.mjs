import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const regex = /"id":"ep-4-68ecb0"[^}]*"views":(\d+)/g;
    let match;
    let count = 0;
    while ((match = regex.exec(o.code)) !== null) {
      console.log('Chunk ' + i + ': views=' + match[1] + ' at index ' + match.index);
    }
  }
});
