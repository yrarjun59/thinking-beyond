import { build } from 'vite';
const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});
result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    // Check the raw JSON import
    const match = o.code.match(/channel-videos[^}]*ep-4-68ecb0[^}]*views\":(\d+)/);
    if (match) console.log('Found ep-4-68ecb0 views:', match[1]);
    else console.log('ep-4-68ecb0 NOT FOUND in chunk');
    
    // Check for 999999
    const match2 = o.code.match(/999999/);
    if (match2) console.log('Found 999999 in chunk');
    else console.log('999999 NOT FOUND in chunk');
  }
});
