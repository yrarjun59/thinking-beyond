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
      const context = o.code.slice(idx, idx + 2000);
      console.log('Context:', context);
    }
  }
});
