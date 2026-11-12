import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const idx = o.code.indexOf('ep-4-68ecb0');
    if (idx >= 0) {
      console.log('ep-4-68ecb0 at:', idx);
      console.log('Context:', o.code.slice(Math.max(0, idx-50), idx+300));
    }
  }
});
