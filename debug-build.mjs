import { build } from 'vite';
const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});
result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Check multiple episodes
    const episodes = ['Rekha Yadav', 'Sanjib Subba', 'Dashrath Sunar', 'Mohan Tamang'];
    episodes.forEach(name => {
      const match = o.code.match(new RegExp(name + '[^}]*views\":(\\d+)'));
      if (match) console.log(`Chunk ${i}: ${name} views: ${match[1]}`);
    });
  }
});
