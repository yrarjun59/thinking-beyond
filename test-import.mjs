import channelVideos from './src/channel-videos.json' with { type: 'json' };
import fallback from './src/episodes.json' with { type: 'json' };

const v1 = channelVideos.find(x => x.id === 'ep-4-68ecb0');
const v2 = fallback.months.flatMap(m => m.episodes).find(x => x.id === 'ep-4-68ecb0');

console.log('channelVideos import views:', v1?.views);
console.log('fallback import views:', v2?.views);
