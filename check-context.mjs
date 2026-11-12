import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const idx1 = o.code.indexOf('Rekha Yadav');
    const idx2 = o.code.indexOf('ep-4-68ecb0');
    console.log('Rekha Yadav at:', idx1);
    console.log('ep-4-68ecb0 at:', idx2);
    if (idx1 >= 0) {
      console.log('Context 1:', o.code.slice(Math.max(0, idx1-100), idx1+200));
    }
    if (idx2 >= 0) {
      console.log('Context 2:', o.code.slice(Math.max(0, idx2-100), idx2+100));
    }
  }
});
