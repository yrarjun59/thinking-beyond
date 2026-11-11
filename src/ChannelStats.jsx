import {useEffect,useState} from 'react';
import config from './channel-config.json';
const base=import.meta.env.BASE_URL;
const compact=n=>n==null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(n);
export default function ChannelStats(){
 const [stats,setStats]=useState(null),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const controller=new AbortController();let active=true;
 async function refresh(){if(document.hidden)return;const local=['localhost','127.0.0.1'].includes(location.hostname);const urls=[import.meta.env.VITE_CHANNEL_STATS_URL||(local?`${base}api/channel-stats`:null),`${base}data/channel-stats.json`].filter(Boolean);
 for(const url of urls){try{const r=await fetch(`${url}${url.includes('?')?'&':'?'}t=${Math.floor(Date.now()/300000)}`,{cache:'no-store',signal:controller.signal});if(!r.ok)continue;const d=await r.json();if(d.channelId!==config.channelId||!Number.isFinite(d.views)||!Number.isFinite(d.episodes)||!Number.isFinite(Date.parse(d.fetchedAt)))continue;if(active){setStats(d);setUnavailable(false)}return}catch{}}
 if(active)setUnavailable(true);
 }
 refresh();const timer=setInterval(refresh,300000);document.addEventListener('visibilitychange',refresh);return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
 },[]);
 const stale=unavailable||(stats&&Date.now()-Date.parse(stats.fetchedAt)>3600000);
 const title=stats?`${stale?'Last available figures':'Updated'} ${new Date(stats.fetchedAt).toLocaleString()}. YouTube rounds public subscriber counts.`:'Loading channel statistics';
 return <div className={`header-stats${stale?' is-stale':''}`} role="group" aria-label="YouTube channel statistics" title={title}>{[['subscribers','SUBSCRIBERS'],['episodes','EPISODES'],['views','VIEWS']].map(([key,label])=><span key={key}><strong>{compact(stats?.[key])}</strong><small>{label}</small></span>)}<span className="sr-only">{title}</span></div>;
}
