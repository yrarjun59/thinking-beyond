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
    while ((match = regex.exec(o.code)) !== null) {
      const idx = match.index;
      console.log('Found at index:', match.index, 'views:', match[1]);
      console.log('Context:', o.code.slice(Math.max(0, idx-200), idx+200));
      console.log('---');
    }
  }
});
EOF
node debug-context.mjs