import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const config=await readFile(new URL('../src/channel-config.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>({}));
const channelId=process.env.YOUTUBE_CHANNEL_ID||config.channelId||'UCUbXuNfuebW0MEfX4kouqHA';
const channelHandle=process.env.YOUTUBE_CHANNEL_HANDLE||config.handle||'@manishaneupane';
const target=new URL('../public/data/channel-stats.json',import.meta.url);
// Second copy inside src/ so the app can import build-time values (Vite convention: no JS imports from public/)
const srcTarget=new URL('../src/data/channel-stats.json',import.meta.url);
const number = text => {const m=String(text).replaceAll(',','').match(/([\d.]+)\s*([KMB])?/i);return m?Math.round(Number(m[1])*({K:1e3,M:1e6,B:1e9}[m[2]?.toUpperCase()]||1)):null};
function findAbout(node){if(!node||typeof node!=='object')return null;if(node.aboutChannelViewModel?.channelId===channelId)return node.aboutChannelViewModel;for(const child of Object.values(node)){const found=findAbout(child);if(found)return found}return null}
let cache;
export async function getChannelStats(){
 if(cache && Date.now()-Date.parse(cache.fetchedAt)<300000)return cache;
 let subscribers,views,videoCount,source;
 if(process.env.YOUTUBE_API_KEY){
  const url=new URL('https://www.googleapis.com/youtube/v3/channels');url.search=new URLSearchParams({part:'statistics',id:channelId,key:process.env.YOUTUBE_API_KEY});
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('YouTube statistics unavailable');
  const s=(await response.json()).items?.[0]?.statistics;if(!s)throw new Error('Missing channel statistics');
  subscribers=s.hiddenSubscriberCount?null:Number(s.subscriberCount);views=Number(s.viewCount);videoCount=Number(s.videoCount);source='youtube-data-api';
 }else{
  const response=await fetch(`https://www.youtube.com/${channelHandle}/about?hl=en`,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Channel page unavailable');
  const html=await response.text();const match=/var ytInitialData = (\{.*?\});/.exec(html);if(!match)throw new Error('Channel data unavailable');
  const about=findAbout(JSON.parse(match[1]));if(!about)throw new Error('Channel metadata unavailable');
  subscribers=number(about.subscriberCountText);views=number(about.viewCountText);videoCount=number(about.videoCountText);source='youtube-public-channel';
 }
 if((subscribers!==null&&!Number.isFinite(subscribers))||!Number.isFinite(views)||views<=0)throw new Error('Invalid statistics');
 const archive=JSON.parse(await readFile(new URL('../src/episodes.json',import.meta.url),'utf8'));
 let episodes=archive.total;
 try{const rows=JSON.parse(await readFile(new URL('../src/channel-videos.json',import.meta.url),'utf8'));if(Array.isArray(rows)&&rows.length)episodes=rows.length}catch{}
 cache={channelId,subscribers,views,videoCount,episodes,fetchedAt:new Date().toISOString(),source};return cache;
}
export function channelStatsPlugin(){const configure=server=>{server.middlewares.use(async(req,res,next)=>{if(!req.url?.split('?')[0].endsWith('/api/channel-stats'))return next();try{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(await getChannelStats()))}catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Statistics temporarily unavailable'}))}})};return {name:'channel-statistics',configureServer:configure,configurePreviewServer:configure}}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const stats=await getChannelStats();await writeFile(target,JSON.stringify(stats,null,2)+'\n');await writeFile(srcTarget,JSON.stringify(stats,null,2)+'\n');console.log('Updated public channel statistics at '+stats.fetchedAt)}catch(error){console.error(error.message);process.exitCode=1}
}
