import {useEffect,useState} from 'react';
import config from './channel-config.json';
// Build-time snapshot: real numbers paint on first render (no "—" → value flash),
// then the runtime fetch only updates them when the figures actually change.
import initialStats from '../public/data/channel-stats.json';
const base=import.meta.env.BASE_URL;
const compact=n=>n==null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(n);
const valid=d=>!!d&&d.channelId===config.channelId&&Number.isFinite(d.views)&&Number.isFinite(d.episodes)&&Number.isFinite(Date.parse(d.fetchedAt));
const seed=valid(initialStats)?initialStats:null;
const sameFigures=(a,b)=>!!a&&!!b&&a.views===b.views&&a.subscribers===b.subscribers&&a.episodes===b.episodes&&a.videoCount===b.videoCount;
export default function ChannelStats(){
 const [stats,setStats]=useState(seed),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const controller=new AbortController();let active=true;
 async function refresh(){if(document.hidden)return;const local=['localhost','127.0.0.1'].includes(location.hostname);const urls=[import.meta.env.VITE_CHANNEL_STATS_URL||(local?`${base}api/channel-stats`:null),`${base}data/channel-stats.json`].filter(Boolean);
 for(const url of urls){try{const r=await fetch(`${url}${url.includes('?')?'&':'?'}t=${Math.floor(Date.now()/300000)}`,{cache:'no-store',signal:controller.signal});if(!r.ok)continue;const d=await r.json();if(!valid(d))continue;if(active){setUnavailable(false);setStats(previous=>sameFigures(previous,d)?previous:d)}return}catch{}}
 if(active)setUnavailable(true);
 }
 refresh();const timer=setInterval(refresh,300000);document.addEventListener('visibilitychange',refresh);return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
 },[]);
 // Figures refresh daily (cron), so a snapshot older than 26h counts as stale.
 const stale=unavailable||(stats&&Date.now()-Date.parse(stats.fetchedAt)>26*3600000);
 const title=stats?`${stale?'Last available figures':'Updated'} ${new Date(stats.fetchedAt).toLocaleString()}. YouTube rounds public subscriber counts.`:'Loading channel statistics';
 return <div className={`header-stats${stale?' is-stale':''}`} role="group" aria-label="YouTube channel statistics" title={title}>{[['subscribers','SUBSCRIBERS'],['episodes','EPISODES'],['views','VIEWS']].map(([key,label])=><span key={key}><strong>{compact(stats?.[key])}</strong><small>{label}</small></span>)}<span className="sr-only">{title}</span></div>;
}
