import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false },
  plugins: [
    {
      name: 'debug-imports',
      resolveId(id, importer) {
        if (id.includes('channel-videos') || id.includes('episodes')) {
          console.log('resolveId:', id, 'from', importer);
        }
        return null;
      },
      load(id) {
        if (id.includes('channel-videos') || id.includes('episodes')) {
          console.log('load:', id);
        }
        return null;
      },
      transform(code, id) {
        if (id.includes('channel-videos') || id.includes('episodes')) {
          console.log('transform:', id, code.slice(0, 100));
        }
        return null;
      }
    }
  ],
  build: { write: false }
});

console.log('Build completed');
