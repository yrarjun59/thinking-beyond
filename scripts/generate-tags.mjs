// Automatic episode tag generation — runs unattended in the daily cron.
// No signup AI flow: uses Pollinations' free OpenAI-compatible endpoint by default.
// Flow: pull untagged episodes → auto-fetch YouTube captions → AI extraction
// → QC validation → auto-approve → channel taxonomy pass → src/tag-library.json
//
// Env overrides (all optional):
//   TAG_AI_URL        default https://text.pollinations.ai/openai
//   TAG_AI_MODEL      default openai
//   TAG_AI_KEY        optional (for any OpenAI-compatible endpoint later)
//   TAG_BATCH_LIMIT   default 8 episodes per run
//   TAG_DELAY_MS      default 4000 (respects free-tier rate limits)

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  EXTRACTION_SYSTEM_PROMPT,TAXONOMY_COMPACT_SYSTEM_PROMPT,
  applyExtraction,applyTaxonomyResult,composeExtractionInput,composeExtractionPrompt,
  cleanTranscript,extractJson,mergeChunkResults,
  splitTranscriptChunks,validateTagResult
} from '../src/tagWorkflow.js';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...args)=>console.log('[generate-tags]',...args);

const AI_URL=process.env.TAG_AI_URL||'https://text.pollinations.ai/openai';
const AI_MODEL=process.env.TAG_AI_MODEL||'openai';
const AI_KEY=process.env.TAG_AI_KEY||'';
const BATCH=Math.max(1,Number(process.env.TAG_BATCH_LIMIT)||6);
const DELAY=Math.max(3000,Number(process.env.TAG_DELAY_MS)||48000); // free tier: 1 reply / 45s per IP
const RETRY_DAYS=3*24*60*60*1000;
const CHANNEL={name:'Thinking Beyond with Manisha Neupane',description:'A Nepal podcast hosted by Manisha Neupane — thoughtful conversations about business, growth, health, culture, and society.'};

// Compact system prompt for metadata mode: the full transcript-mode prompt is
// too long for the free tier's output budget and makes the model reason past it.
const METADATA_SYSTEM_PROMPT=`You are an expert podcast content analyst. Dissect a podcast episode's metadata and produce descriptive content tags.

You receive an episode title, description, and guest name. No transcript exists.

Rules:
1. Dissect the title: extract the guest name, core topic words, and named subjects.
2. Use the description for topics the title does not carry.
3. Tags must describe THIS episode, not the channel. No generic labels (Business, Motivation, Success, Podcast, Interview, Life, Technology).
4. Never assign two tags that repeat the same idea — each tag must be a distinct subject.
5. Do not invent topics. Only use what is explicitly named or unambiguously central in the metadata.
6. Concise noun phrases, 1-4 words, preserve proper-noun capitalization, no hashtags, no sentences.
7. relevance_score: integer 0-100. Only include tags scoring 75+ (strong, central subjects). Prefer 3-6 tags; return fewer if fewer are truly supported. Include the guest as an entity tag when a guest is named in the title or description.
8. Reuse existing channel tags when they fit.

Return valid JSON only — no prose, no markdown:
{"episode_summary":"one concise sentence","primary_topic":"central topic","tags":[{"name":"","slug":"","type":"topic|concept|industry|entity|technology|problem|framework","relevance_score":0,"reason":"max 15 words","decision":"existing|new"}],"rejected_candidates":[{"name":"","reason":""}],"warnings":[]}`;

// ---------- AI call (no signup; optional key for later upgrades) ----------
// Pollinations free tier: 1 reply per 45s per IP — 429/402 responses carry that limit.
async function callAI(messages){
  const body={model:AI_MODEL,messages,temperature:0.2,max_tokens:2000,referrer:'thinking-beyond'};
  const headers={'Content-Type':'application/json'};
  if(AI_KEY)headers.Authorization=`Bearer ${AI_KEY}`;
  let lastError='';
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const res=await fetch(AI_URL,{method:'POST',headers,body:JSON.stringify(body)});
      if(res.status===429||res.status===402||res.status===400){
        // Free-tier limit answers 429/402/400 with a FREE_LIMIT body.
        const detail=await res.text().catch(()=>'');
        if(detail.includes('FREE_LIMIT')||detail.includes('Free limit')){
          const wait=Number(detail.match(/every (\d+) seconds/)?.[1])||45;
          lastError='rate limit';
          log(`  rate limited — waiting ${wait}s…`);
          await sleep(wait*1000+2000);
          continue;
        }
        if(res.status===400)throw new Error(`AI HTTP 400: ${detail.slice(0,200)}`);
        lastError=`HTTP ${res.status}`;
        await sleep(15000*attempt);continue;
      }
      if(res.status>=500){
        lastError=`HTTP ${res.status}`;
        await sleep(15000*attempt);continue;
      }
      if(!res.ok)throw new Error(`AI HTTP ${res.status}`);
      const type=res.headers.get('content-type')||'';
      if(type.includes('application/json')){
        const data=await res.json();
        const content=data?.choices?.[0]?.message?.content;
        if(!content)throw new Error('AI returned an empty completion.');
        return content;
      }
      const text=await res.text();
      if(!text.trim())throw new Error('AI returned an empty body.');
      return text;
    }catch(error){
      lastError=error.message;
      if(String(error.message).includes('AI HTTP'))throw error; // non-retryable client error
      await sleep(10000*attempt);
    }
  }
  throw new Error(`AI request failed after retries (${lastError}).`);
}

// ---------- Transcript acquisition (no signup; YouTube caption tracks) ----------
const ANDROID_UA='com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip';
const WEB_UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const INNERTUBE_KEY='AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w';

async function fetchPlayer(videoId,client){
  const contexts={
    ANDROID:{clientName:'ANDROID',clientVersion:'19.09.37',androidSdkVersion:30,hl:'en'},
    WEB:{clientName:'WEB',clientVersion:'2.20240401.00.00',hl:'en'}
  };
  const res=await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,{
    method:'POST',
    headers:{'Content-Type':'application/json','User-Agent':client==='ANDROID'?ANDROID_UA:WEB_UA},
    body:JSON.stringify({context:{client:contexts[client]},videoId})
  });
  if(!res.ok)throw new Error(`player HTTP ${res.status}`);
  return res.json();
}

async function fetchCaptionText(trackUrl){
  const res=await fetch(`${trackUrl}&fmt=json3`,{headers:{'User-Agent':WEB_UA,'Accept-Language':'en'}});
  if(!res.ok)throw new Error(`captions HTTP ${res.status}`);
  const data=await res.json();
  const lines=(data.events||[])
    .map(event=>(event.segs||[]).map(seg=>seg.utf8||'').join('').replace(/\n/g,' ').trim())
    .filter(Boolean);
  if(!lines.length)throw new Error('empty caption track');
  return lines.join('\n');
}

function pickTrack(tracks){
  if(!Array.isArray(tracks)||!tracks.length)return null;
  return tracks.find(t=>String(t.languageCode||'').startsWith('en'))
    ||tracks.find(t=>String(t.languageCode||'').startsWith('ne'))
    ||tracks[0];
}

async function fetchTranscript(videoId){
  const attempts=[
    async()=>{const data=await fetchPlayer(videoId,'ANDROID');return pickTrack(data?.captions?.playerCaptionsTracklistRenderer?.captionTracks)},
    async()=>{const data=await fetchPlayer(videoId,'WEB');return pickTrack(data?.captions?.playerCaptionsTracklistRenderer?.captionTracks)},
    async()=>{
      const res=await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`,{headers:{'User-Agent':WEB_UA,'Accept-Language':'en-US,en;q=0.9'}});
      const html=await res.text();
      const match=html.match(/"captionTracks":(\[.*?\])/s);
      if(!match)return null;
      const tracks=JSON.parse(match[1].replace(/\\u0026/g,'&'));
      return pickTrack(tracks);
    }
  ];
  for(const attempt of attempts){
    try{
      const track=await attempt();
      if(!track?.baseUrl)continue;
      return await fetchCaptionText(track.baseUrl);
    }catch{}
    await sleep(1500);
  }
  return null;
}

// ---------- Main ----------
const libraryPath=path.join(ROOT,'src','tag-library.json');
const library=JSON.parse(fs.readFileSync(libraryPath,'utf8'));
const videos=JSON.parse(fs.readFileSync(path.join(ROOT,'src','channel-videos.json'),'utf8'));
library.canonicalTags=library.canonicalTags||[];
library.episodes=library.episodes||{};

const now=Date.now();
const isMetadataTagged=video=>{
  const entry=library.episodes[video.id];
  const tags=(entry?.tags||[]).filter(t=>t.status==='approved');
  return tags.length>0&&tags.every(t=>(t.source||'transcript')==='title-description');
};
const hasApproved=video=>(library.episodes[video.id]?.tags||[]).some(tag=>tag.status==='approved');
// New/untagged episodes first (newest first), then metadata-tagged ones to upgrade
// the moment captions appear on YouTube.
const fresh=videos.filter(video=>!hasApproved(video));
const upgrades=videos.filter(video=>hasApproved(video)&&isMetadataTagged(video));
const targets=[...fresh.sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))),...upgrades]
  .filter(video=>{
    const attempt=library.episodes[video.id]?.lastAttempt;
    return !(attempt?.reason==='ai-unavailable'&&now-Date.parse(attempt.at)<RETRY_DAYS);
  })
  .slice(0,BATCH);

if(!targets.length){log('Nothing to do — every episode already has approved tags (or is in retry cooldown).');}

let tagged=0;
for(const video of targets){
  const upgrade=isMetadataTagged(video)&&hasApproved(video);
  log(`Episode: ${video.title}${upgrade?' (upgrade: captions may have appeared)':''}`);
  let raw=null;
  try{raw=await fetchTranscript(video.id)}
  catch(error){log('  transcript fetch error:',error.message)}
  await sleep(1500);
  if(!raw&&!upgrade){
    // No captions on YouTube → guarded metadata mode: title + description + guest only.
    // The title is dissected (guest name, core topic words); the description adds
    // context. QC collapses repetitive/synonym tags within the episode.
    const description=String(video.description||'').slice(0,2000);
    const metadataTranscript=`(No captions are available for this video. Do NOT invent topics and do not rely on assumptions about the guest. Derive tags strictly by dissecting the episode title and description below: extract the guest name, the core topic words, and important subjects actually named there. Only include a tag when it is explicitly named or unambiguously central in those sources. Never assign two tags that repeat the same idea — each tag must be a distinct subject.)\n\nEpisode description:\n${description}`;
    const validation=await generate({video,transcript:metadataTranscript,mode:'metadata'});
    if(!validation)continue;
    applyValidation(video,validation,metadataTranscript,'title-description','metadata');
    continue;
  }
  if(!raw){log('  still no captions — upgrade deferred');continue}
  const transcript=cleanTranscript(raw);
  const chunks=splitTranscriptChunks(transcript,50000);
  const results=[];
  let aiFailed=null;
  for(const chunk of chunks){
    const chunkNote=chunks.length>1
      ?`You are analyzing part ${chunk.index} of ${chunk.total} of a longer transcript. Score only topics substantively discussed in this portion. Use the same JSON structure.`
      :'';
    try{
      const reply=await callAI([
        {role:'system',content:EXTRACTION_SYSTEM_PROMPT},
        {role:'user',content:composeExtractionPrompt(composeExtractionInput({
          channel:CHANNEL,
          episode:{title:video.title,guest:video.guest||''},
          transcript:chunk.text,
          existingChannelTags:[...new Set(library.canonicalTags.filter(t=>t.status!=='retired').map(t=>t.name))].slice(0,80),
          existingEpisodeTags:(library.episodes[video.id]?.tags||[]).map(t=>t.name).slice(0,12)
        }),chunkNote)}
      ]);
      results.push(validateTagResult(reply));
    }catch(error){aiFailed=error.message;break}
    await sleep(DELAY);
  }
  if(aiFailed){
    const entry=library.episodes[video.id]||{episodeId:video.id};
    entry.lastAttempt={at:new Date().toISOString(),reason:'ai-unavailable'};
    entry.warnings=[...new Set([...(entry.warnings||[]),`AI unavailable this run (${aiFailed}) — will retry next cron.`])];
    library.episodes[video.id]=entry;
    log('  AI unavailable — will retry next run:',aiFailed);
    continue;
  }
  const validation=chunks.length===1?results[0]:mergeChunkResults(results);
  if(!validation.ok||!validation.tags.length){
    const entry=library.episodes[video.id]||{episodeId:video.id};
    entry.lastAttempt={at:new Date().toISOString(),reason:'validation-empty'};
    entry.warnings=[...new Set([...(entry.warnings||[]),...validation.warnings,'The AI response produced no valid tags — will retry next cron.'])];
    library.episodes[video.id]=entry;
    log('  no valid tags — will retry next run');
    continue;
  }
  // Captions exist: store the transcript and replace any metadata-mode tags.
  applyValidation(video,validation,transcript,'transcript',upgrade?'metadata-upgraded-to-transcript':'captions');
}

// Shared: send one extraction request. In metadata mode the thumbnail image is
// attached so the vision model can read the text on it.
async function generate({video,transcript,mode='transcript'}){
  const input=composeExtractionInput({
    channel:CHANNEL,
    episode:{title:video.title,guest:video.guest||''},
    transcript,
    existingChannelTags:[...new Set(library.canonicalTags.filter(t=>t.status!=='retired').map(t=>t.name))].slice(0,80),
    existingEpisodeTags:(library.episodes[video.id]?.tags||[]).map(t=>t.name).slice(0,12)
  });
  const system=mode==='metadata'?METADATA_SYSTEM_PROMPT:EXTRACTION_SYSTEM_PROMPT;
  const userContent=mode==='metadata'
    ?`Here is the episode data:\n\n${JSON.stringify(input,null,2)}\n\nReturn only the JSON object.`
    :composeExtractionPrompt(input);
  try{
    const reply=await callAI([
      {role:'system',content:system},
      {role:'user',content:userContent}
    ]);
    await sleep(DELAY);
    const validation=validateTagResult(reply);
    if(!validation.ok||!validation.tags.length){
      const entry=library.episodes[video.id]||{episodeId:video.id};
      entry.lastAttempt={at:new Date().toISOString(),reason:'validation-empty'};
      entry.warnings=[...new Set([...(entry.warnings||[]),...validation.warnings,'The AI response produced no valid tags — will retry next cron.'])];
      library.episodes[video.id]=entry;
      log('  no valid tags — will retry next run');
      return null;
    }
    return validation;
  }catch(error){
    const entry=library.episodes[video.id]||{episodeId:video.id};
    entry.lastAttempt={at:new Date().toISOString(),reason:'ai-unavailable'};
    entry.warnings=[...new Set([...(entry.warnings||[]),`AI unavailable this run (${error.message}) — will retry next cron.`])];
    library.episodes[video.id]=entry;
    log('  AI unavailable — will retry next run:',error.message);
    return null;
  }
}

// Shared: apply validated tags, auto-approve (no human review in automatic mode).
function applyValidation(video,validation,transcript,source,transcriptSource){
  applyExtraction(library,{id:video.id,title:video.title,guest:video.guest||''},validation,transcript);
  const stored=library.episodes[video.id];
  stored.lastAttempt={at:new Date().toISOString(),reason:'ok'};
  stored.transcriptSource=transcriptSource;
  for(const tag of stored.tags){tag.status='approved';tag.source=source}
  for(const tag of library.canonicalTags){
    if(tag.status==='proposed'&&stored.tags.some(t=>t.slug===tag.slug))tag.status='approved';
  }
  tagged++;
  log(`  tagged (${source}): ${stored.tags.map(t=>t.name).join(' · ')}`);
}

// Channel-level normalization pass when few new tags added (free tier output budget).
if(tagged>0&&tagged<=2&&Object.keys(library.episodes).length>=2){
  let reply='';
  let taxonomyReply='';
  try{
    // Compact payload: only slugs/names/scores per episode + existing canonical tags.
    const payload={
      episodes:Object.values(library.episodes).map(entry=>({
        episode_id:entry.episodeId,
        title:entry.title,
        summary:entry.summary||'',
        candidate_tags:(entry.tags||[]).filter(t=>t.status!=='rejected').map(t=>({name:t.name,slug:t.slug,score:t.relevanceScore}))
      })),
      existing_canonical:(library.canonicalTags||[]).map(t=>({name:t.name,slug:t.slug,aliases:t.aliases,usage_count:t.usageCount||0,status:t.status}))
    };
    taxonomyReply=await callAI([
      {role:'system',content:TAXONOMY_COMPACT_SYSTEM_PROMPT},
      {role:'user',content:`Channel: ${CHANNEL.name}\n\nData:\n${JSON.stringify(payload)}\n\nReturn only the JSON object.`}
    ]);
    const result=applyTaxonomyResult(library,taxonomyReply);
    log(`taxonomy pass: ${result.merges} merged, ${result.assigned} assignments confirmed, ${result.removed} retired`);
    if(result.review.length)log('  review notes:',result.review.join('; '));
  }catch(error){
    log('taxonomy pass skipped:',error.message);
  }
}

library.generatedAt=new Date().toISOString();
fs.writeFileSync(libraryPath,JSON.stringify(library,null,2)+'\n');
const approved=Object.values(library.episodes).filter(e=>(e.tags||[]).some(t=>t.status==='approved')).length;
log(`done — ${tagged} newly tagged this run, ${approved}/${videos.length} episodes have approved tags`);
