import { build } from 'vite';

const result = await build({
  configFile: 'vite.config.js',
  mode: 'production',
  build: { write: false }
});

result.output.forEach((o, i) => {
  if (o.type === 'chunk' && o.code) {
    const episodesCount = (o.code.match(/Episodes/g) || []).length;
    const detailCount = (o.code.match(/Detail/g) || []).length;
    const useEpisodesCount = (o.code.match(/useEpisodes/g) || []).length;
    console.log(`Chunk ${i}: Episodes=${episodesCount}, Detail=${detailCount}, useEpisodes=${useEpisodesCount}`);
  }
});
