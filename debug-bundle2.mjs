import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Search for the specific episode data in the bundle
    const idx = o.code.indexOf('Rekha Yadav');
    if (idx >= 0) {
      console.log('Found Rekha Yadav at index:', idx);
      console.log('Context:', o.code.slice(idx - 200, idx + 500));
    }
  }
});
