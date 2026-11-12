import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,Check,Copy,Download,Play,Plus,RefreshCw,Save,Trash2,Upload,X} from 'lucide-react';
import channelVideos from './channel-videos.json';
import config from './channel-config.json';
import committedLibrary from './tag-library.json';
import {
  EXTRACTION_SYSTEM_PROMPT,TAXONOMY_SYSTEM_PROMPT,
  applyExtraction,applyTaxonomyResult,composeExtractionInput,composeExtractionPrompt,
  composeTaxonomyPrompt,cleanTranscript,mergeChunkResults,refreshUsageCounts,
  slugify,splitTranscriptChunks,validateTagResult
} from './tagWorkflow.js';

const DRAFT_KEY='thinking-beyond-tag-library';
const AI_KEY='thinking-beyond-ai-config';
const CHANNEL={name:'Thinking Beyond with Manisha Neupane',description:'A Nepal podcast hosted by Manisha Neupane — thoughtful conversations about business, growth, health, culture, and society.'};

function readDraft(){try{const parsed=JSON.parse(localStorage.getItem(DRAFT_KEY));return parsed&&parsed.version?parsed:null}catch{return null}}
function readAI(){try{return JSON.parse(localStorage.getItem(AI_KEY))||{}}catch{return {}}}

async function callAI(ai,messages){
  const url=`${String(ai.baseUrl||'').replace(/\/+$/,'')}/chat/completions`;
  const body={model:ai.model,messages,temperature:0.2};
  let response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ai.apiKey}`},body:JSON.stringify({...body,response_format:{type:'json_object'}})});
  if(!response.ok&&response.status===400){
    response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ai.apiKey}`},body:JSON.stringify(body)});
  }
  if(!response.ok)throw Error(`AI request failed (${response.status}).`);
  const data=await response.json();
  const content=data?.choices?.[0]?.message?.content;
  if(!content)throw Error('The AI returned an empty response.');
  return content;
}

function EpisodeTagRow({tag,onAccept,onReject,onRename}){
  const [name,setName]=useState(tag.name);
  const stateColor=tag.status==='approved'?'is-approved':tag.status==='rejected'?'is-rejected':'is-proposed';
  return <div className={`tag-studio-row ${stateColor}`}>
    <div className="tag-studio-row-main">
      <input className="tag-studio-tag-name" value={name} onChange={e=>setName(e.target.value)} onBlur={()=>onRename(tag,name)} aria-label="Tag name"/>
      <span className="tag-studio-tag-meta">{tag.type} · {tag.relevanceScore}/100 · {tag.status}</span>
      {tag.evidence&&<p className="tag-studio-evidence">“{tag.evidence.length>180?`${tag.evidence.slice(0,180)}…`:tag.evidence}”</p>}
      {tag.reason&&<p className="tag-studio-reason">{tag.reason}</p>}
    </div>
    <div className="tag-studio-row-actions">
      <button className="admin-icon-button" onClick={()=>onAccept(tag)} aria-label={`Approve ${tag.name}`} title="Approve"><Check size={16}/></button>
      <button className="admin-icon-button" onClick={()=>onReject(tag)} aria-label={`Reject ${tag.name}`} title="Reject"><X size={16}/></button>
    </div>
  </div>;
}

export default function TagStudio(){
  const [library,setLibrary]=useState(()=>readDraft()||JSON.parse(JSON.stringify(committedLibrary)));
  const [ai,setAi]=useState(()=>readAI());
  const [episodeId,setEpisodeId]=useState(channelVideos[0]?.id||'');
  const [transcript,setTranscript]=useState('');
  const [responseText,setResponseText]=useState('');
  const [taxonomyText,setTaxonomyText]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);

  const episodes=useMemo(()=>channelVideos,[]);
  const episode=episodes.find(e=>e.id===episodeId)||episodes[0];
  const entry=library.episodes[episodeId];

  useEffect(()=>{setTranscript(entry?.transcript||'')},[episodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(next,note='Saved in this browser. Export tag-library.json to publish.'){
    setLibrary(next);localStorage.setItem(DRAFT_KEY,JSON.stringify(next));setStatus(note);
  }

  function saveTranscript(){
    const clean=cleanTranscript(transcript);
    if(!clean){setStatus('Paste a transcript first.');return}
    const next=JSON.parse(JSON.stringify(library));
    const existing=next.episodes[episodeId]||{episodeId,title:episode.title,guest:episode.guest||'',tags:[],rejected:[],warnings:[]};
    existing.transcript=clean;existing.transcriptChars=clean.length;existing.updatedAt=new Date().toISOString();
    next.episodes[episodeId]=existing;
    persist(next,`Transcript stored for “${episode.title}” (${clean.length} characters). Now generate tags.`);
  }

  function buildPrompt(chunk){
    const existingChannelTags=[...new Set(library.canonicalTags.filter(t=>t.status!=='retired').map(t=>t.name))];
    const existingEpisodeTags=(entry?.tags||[]).map(t=>t.name);
    return composeExtractionPrompt(composeExtractionInput({
      channel:CHANNEL,episode:{title:episode.title,guest:episode.guest||''},
      transcript:chunk?chunk.text:transcript||'(no transcript provided)',
      existingChannelTags,existingEpisodeTags
    }),chunk?`You are analyzing part ${chunk.index} of ${chunk.total} of a longer transcript. Score only topics substantively discussed in this portion. Use the same JSON structure.`:'');
  }

  async function copyPrompt(){
    try{await navigator.clipboard.writeText(buildPrompt());setStatus('Extraction prompt copied — paste it into any LLM with the transcript, then paste the JSON reply below.')}
    catch{setStatus('Copy failed — expand the prompt below and copy it manually.')}
  }

  async function runAI(){
    if(!ai.baseUrl||!ai.model||!ai.apiKey){setStatus('Add the AI endpoint, model, and API key first (they stay in this browser).');return}
    if(!transcript.trim()){setStatus('Paste and save a transcript first.');return}
    setBusy(true);setStatus('Requesting tags from the AI…');
    try{
      const chunks=splitTranscriptChunks(transcript);
      const results=[];
      for(const chunk of chunks){
        const text=await callAI(ai,[{role:'system',content:EXTRACTION_SYSTEM_PROMPT},{role:'user',content:buildPrompt(chunk)}]);
        results.push(validateTagResult(text));
      }
      const validation=chunks.length===1?results[0]:mergeChunkResults(results);
      if(!validation.ok){setStatus(validation.error||'Validation failed.');setBusy(false);return}
      const next=applyExtraction(JSON.parse(JSON.stringify(library)),{id:episodeId,title:episode.title,guest:episode.guest||''},validation,transcript);
      persist(next,`Staged ${validation.tags.length} proposed tags for review. Accept or reject each one.`);
    }catch(error){setStatus(error.message)}
    setBusy(false);
  }

  function validatePasted(){
    if(!responseText.trim()){setStatus('Paste the AI JSON response first.');return}
    const validation=validateTagResult(responseText);
    if(!validation.ok){setStatus(validation.error||'Validation failed.');return}
    if(!transcript.trim()){setStatus('Save the transcript first so the evidence stays auditable.');return}
    const next=applyExtraction(JSON.parse(JSON.stringify(library)),{id:episodeId,title:episode.title,guest:episode.guest||''},validation,transcript);
    persist(next,`Staged ${validation.tags.length} proposed tags for review. Accept or reject each one.`);
    setResponseText('');
  }

  const mutateTags=mutate=>{const next=JSON.parse(JSON.stringify(library));mutate(next.episodes[episodeId]);refreshUsageCounts(next);persist(next,'Tag review updated.')};
  const onAccept=tag=>mutateTags(entry=>{const target=entry.tags.find(t=>t.slug===tag.slug);if(target)target.status='approved'});
  const onReject=tag=>mutateTags(entry=>{const target=entry.tags.find(t=>t.slug===tag.slug);if(target)target.status='rejected'});
  const onRename=(tag,name)=>{const clean=name.trim();if(!clean||clean===tag.name)return;mutateTags(entry=>{const target=entry.tags.find(t=>t.slug===tag.slug);if(target){target.name=clean;target.slug=slugify(clean)}})};

  function libraryAction(action){
    const next=JSON.parse(JSON.stringify(library));action(next);refreshUsageCounts(next);persist(next);
  }
  const approveCanonical=slug=>libraryAction(next=>{const tag=next.canonicalTags.find(t=>t.slug===slug);if(tag)tag.status='approved'});
  const deleteCanonical=slug=>libraryAction(next=>{next.canonicalTags=next.canonicalTags.filter(t=>t.slug!==slug)});
  const addAlias=(slug,alias)=>{const clean=alias.trim();if(!clean)return;libraryAction(next=>{const tag=next.canonicalTags.find(t=>t.slug===slug);if(tag&&!tag.aliases.includes(clean))tag.aliases.push(clean)})};

  async function copyTaxonomyPrompt(){
    try{await navigator.clipboard.writeText(composeTaxonomyPrompt(library,CHANNEL));
      setStatus('Taxonomy prompt copied — paste it into your LLM, then paste the JSON reply below.');}
    catch{setStatus('Copy failed — prompt unavailable in this browser.');}
  }

  function applyTaxonomy(){
    if(!taxonomyText.trim()){setStatus('Paste the taxonomy JSON reply first.');return}
    const next=JSON.parse(JSON.stringify(library));
    try{const result=applyTaxonomyResult(next,taxonomyText);
      persist(next,`Taxonomy applied — ${result.merges} merged, ${result.assigned} assignments approved, ${result.removed} retired.${result.review.length?` Review: ${result.review.join('; ')}`:''}`);
      setTaxonomyText('');
    }catch(error){setStatus(`Taxonomy JSON invalid: ${error.message}`)}
  }

  function exportLibrary(){
    const payload={...library,generatedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='tag-library.json';link.click();URL.revokeObjectURL(link.href);
    setStatus('tag-library.json downloaded — replace src/tag-library.json in the repo, then deploy to publish.');
  }

  function importLibrary(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed.version)throw Error('Not a tag-library.json file.');persist(parsed,'Library imported from file.')}catch(error){setStatus(error.message)}};
    reader.readAsText(file);
  }

  const pendingCount=Object.values(library.episodes).reduce((sum,e)=>sum+(e.tags||[]).filter(t=>t.status==='proposed').length,0);
  const approvedCount=Object.values(library.episodes).reduce((sum,e)=>sum+(e.tags||[]).filter(t=>t.status==='approved').length,0);

  return <main className="inner admin-page">
    <div className="admin-heading"><div><span className="eyebrow">THINKING BEYOND / TAG STUDIO</span><h1>Precision tag studio.</h1><p>Transcript-grounded tags for every conversation — proposed by AI, decided by you.</p></div><span className="admin-local-badge">BROWSER DRAFT</span></div>
    <div className="admin-notice"><strong>Workflow</strong><p>1 · Paste the episode transcript. 2 · Generate candidate tags (AI request or copy-paste into any LLM). 3 · Review the evidence and accept or reject each tag. 4 · Run the channel taxonomy pass to normalize labels. 5 · Export tag-library.json and commit it to publish.</p></div>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">00 / AI CONNECTION</span><h2>Model endpoint (optional)</h2></div></div>
      <p className="admin-card-copy">Any OpenAI-compatible chat endpoint works. The key is stored only in this browser and never shipped with the site. Without a key, use the copy-paste workflow below.</p>
      <div className="admin-fields-three">
        <label>Base URL<input value={ai.baseUrl||''} onChange={e=>setAi({...ai,baseUrl:e.target.value})} placeholder="https://integrate.api.nvidia.com/v1"/></label>
        <label>Model<input value={ai.model||''} onChange={e=>setAi({...ai,model:e.target.value})} placeholder="meta/llama-3.3-70b-instruct"/></label>
        <label>API key<input type="password" value={ai.apiKey||''} onChange={e=>setAi({...ai,apiKey:e.target.value})} placeholder="nvapi-…"/></label>
      </div>
      <div className="admin-actions"><button className="admin-secondary" onClick={()=>{localStorage.setItem(AI_KEY,JSON.stringify(ai));setStatus('AI connection saved in this browser.')}}><Save size={16}/> Save connection</button></div>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">01 / EPISODE</span><h2>Pick an episode</h2></div><span className="tag-studio-counts">{approvedCount} approved · {pendingCount} awaiting review</span></div>
      <label className="admin-wide-field">Episode<input list="tag-studio-episodes" value={episodeId} onChange={e=>setEpisodeId(e.target.value)} placeholder="episode id"/></label>
      <datalist id="tag-studio-episodes">{episodes.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</datalist>
      <div className="tag-studio-episode-list">
        {episodes.slice(0,12).map(e=><button key={e.id} type="button" className={e.id===episodeId?'active':''} onClick={()=>setEpisodeId(e.id)}>{library.episodes[e.id]?.transcript?'✓ ':'· '}{e.title.length>46?`${e.title.slice(0,46)}…`:e.title}</button>)}
      </div>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">02 / TRANSCRIPT</span><h2>Episode transcript</h2></div></div>
      <p className="admin-card-copy">Paste the full transcript from any transcript extractor (YouTube2Text, LinkTranscript, TranscriptNote…). Speakers and timestamps are preserved; duplicate lines are cleaned automatically.</p>
      <label className="admin-wide-field">Transcript<textarea rows="9" value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Paste the complete transcript here…"/></label>
      <div className="admin-actions"><button className="admin-secondary" onClick={saveTranscript}><Save size={16}/> Save transcript</button>{entry?.transcriptChars?<span className="tag-studio-stored">Stored: {entry.transcriptChars} characters</span>:<span className="tag-studio-stored muted">No transcript stored yet</span>}</div>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">03 / GENERATE</span><h2>Candidate tags</h2></div></div>
      <div className="admin-actions">
        <button className="admin-secondary" onClick={copyPrompt}><Copy size={16}/> Copy extraction prompt</button>
        <button className="contact-submit" onClick={runAI} disabled={busy}><Play size={16}/> {busy?'Requesting…':'Run AI request'}</button>
      </div>
      <label className="admin-wide-field">AI JSON response (manual round-trip)<textarea rows="6" value={responseText} onChange={e=>setResponseText(e.target.value)} placeholder='{"episode_summary":"…","primary_topic":"…","tags":[…]}'/></label>
      <div className="admin-actions"><button className="admin-secondary" onClick={validatePasted}><Check size={16}/> Validate &amp; stage for review</button></div>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">04 / REVIEW</span><h2>{episode?.title?.length>40?`${episode.title.slice(0,40)}…`:episode?.title}</h2></div></div>
      {entry?.summary&&<p className="admin-card-copy"><strong>Summary:</strong> {entry.summary}{entry.primaryTopic?` — Primary topic: ${entry.primaryTopic}.`:''}</p>}
      {entry?.warnings?.length>0&&<div className="tag-studio-warnings">{entry.warnings.map((w,i)=><p key={i}>⚠ {w}</p>)}</div>}
      {(entry?.tags||[]).length>0?<div className="tag-studio-rows">{entry.tags.map(tag=><EpisodeTagRow key={tag.slug} tag={tag} onAccept={onAccept} onReject={onReject} onRename={onRename}/>)}</div>
        :<p className="admin-card-copy muted">No staged tags for this episode yet.</p>}
      {(entry?.rejected||[]).length>0&&<details className="tag-studio-rejected"><summary>{entry.rejected.length} rejected candidates</summary>{entry.rejected.map((r,i)=><p key={i}><strong>{r.name}</strong> — {r.reason}</p>)}</details>}
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">05 / CHANNEL TAXONOMY</span><h2>Canonical tag library</h2></div><button className="admin-secondary" onClick={copyTaxonomyPrompt}><Copy size={16}/> Copy taxonomy prompt</button></div>
      <div className="tag-studio-library">
        {library.canonicalTags.length===0&&<p className="admin-card-copy muted">No canonical tags yet — they appear when the first episode is tagged.</p>}
        {library.canonicalTags.map(tag=><div key={tag.slug} className="tag-studio-row">
          <div className="tag-studio-row-main">
            <strong>{tag.name}</strong>
            <span className="tag-studio-tag-meta">{tag.slug} · {tag.type} · used {tag.usageCount||0}× · {tag.status}</span>
            {tag.aliases.length>0&&<p className="tag-studio-reason">Aliases: {tag.aliases.join(', ')}</p>}
          </div>
          <div className="tag-studio-row-actions">
            <button className="admin-icon-button" onClick={()=>{const alias=window.prompt('Add alias for '+tag.name);if(alias)addAlias(tag.slug,alias)}} aria-label="Add alias" title="Add alias"><Plus size={16}/></button>
            <button className="admin-icon-button" onClick={()=>approveCanonical(tag.slug)} aria-label="Approve tag" title="Approve"><Check size={16}/></button>
            <button className="admin-icon-button" onClick={()=>deleteCanonical(tag.slug)} aria-label="Delete tag" title="Delete"><Trash2 size={16}/></button>
          </div>
        </div>)}
      </div>
      <label className="admin-wide-field">Taxonomy JSON response<textarea rows="5" value={taxonomyText} onChange={e=>setTaxonomyText(e.target.value)} placeholder='{"canonical_tags":[…],"episode_assignments":[…]}'/></label>
      <div className="admin-actions"><button className="admin-secondary" onClick={applyTaxonomy}><RefreshCw size={16}/> Apply taxonomy pass</button></div>
    </section>

    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="eyebrow">06 / PUBLISH</span><h2>Export the library</h2></div></div>
      <p className="admin-card-copy">Approved tags go live on the site. Replace <code>src/tag-library.json</code> with the exported file and deploy — the site displays approved tags and keeps the raw YouTube tags only as fallback.</p>
      <div className="admin-actions">
        <button className="contact-submit" onClick={exportLibrary}><Download size={16}/> Export tag-library.json</button>
        <label className="admin-secondary tag-studio-file"><Upload size={16}/> Import library<input type="file" accept="application/json" onChange={e=>importLibrary(e.target.files?.[0])}/></label>
        <Link className="admin-secondary" to="/admin/settings">Back to settings <ArrowUpRight size={14}/></Link>
      </div>
    </section>

    <div className="admin-savebar"><p role="status">{status}</p></div>
  </main>;
}
