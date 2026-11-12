import { build } from 'vite';
const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});
result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const idx = o.code.indexOf('Rekha Yadav');
    if (idx >= 0) {
      console.log('Context:', o.code.slice(idx, idx + 1000));
    }
  }
});
