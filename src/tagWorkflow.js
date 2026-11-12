// Precision-first editorial tag workflow — pure logic, no React.
// Episode-level extraction prompt, channel-level taxonomy prompt,
// transcript cleanup/chunking, JSON repair, and the QC validation layer.

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert podcast content analyst and editorial taxonomy specialist.

Your responsibility is to identify the most accurate, specific, and useful topics discussed in a podcast episode.

You will receive an episode title, optional guest information, channel context, and the episode transcript.

Your objective is NOT to generate as many keywords as possible.

Your objective is to identify a small collection of high-quality tags that accurately describe the actual intellectual and practical substance of the episode.

Follow these rules strictly:

1. Read and analyze the transcript before generating tags.
2. Identify the central subject and the most important secondary subjects.
3. Distinguish substantive discussion from passing mentions.
4. Extract specific concepts, frameworks, problems, disciplines, technologies, industries, and named entities where relevant.
5. Prefer precise and distinctive tags over broad categories.
6. Avoid generic tags such as business, motivation, success, lifestyle, technology, podcast, interview, and personal development unless an unusually specific context makes one genuinely useful.
7. Avoid synonyms, near-duplicates, and overlapping tags within the same episode.
8. Do not invent subjects or infer information that is not supported by the transcript.
9. Use the episode title as supplementary context, not as a replacement for transcript analysis.
10. Do not use channel popularity, views, subscriber counts, or engagement metrics to determine relevance.
11. Do not force a fixed number of tags. Prefer 4–8 strong tags, but return fewer when appropriate.
12. Existing channel tags are provided for consistency. Reuse an existing tag when it accurately represents the subject. Do not reuse it merely because it exists.
13. A recurring subject can legitimately appear across episodes. Do not remove an accurate tag just to make every episode look unique.
14. Every proposed tag must have supporting evidence in the transcript or a clearly justified connection to both the title and transcript.

Tag quality evaluation:
- Relevance: Does it accurately represent the discussion?
- Specificity: Is it descriptive enough to distinguish the subject?
- Evidence: Is it supported by substantive transcript content?
- Discovery value: Would this tag help someone find an episode about this subject?
- Distinctiveness: Does it add information not already conveyed by another selected tag?

Give each candidate a relevance score from 0 to 100. Only select candidates scoring 75 or higher. A high score must reflect actual content evidence, not confidence or popularity.

Required output — return valid JSON only, using exactly this structure:

{
  "episode_summary": "One concise sentence describing the actual discussion.",
  "primary_topic": "The central topic of the episode.",
  "tags": [
    {
      "name": "Tag display name",
      "slug": "tag-slug",
      "type": "concept",
      "relevance_score": 90,
      "evidence": "A short direct quotation from the transcript.",
      "reason": "Why this tag accurately represents the discussion.",
      "decision": "new"
    }
  ],
  "rejected_candidates": [
    { "name": "Rejected tag", "reason": "Why it was rejected." }
  ],
  "warnings": []
}

Allowed tag types: topic, concept, industry, entity, technology, problem, framework.
Allowed decisions: existing (an existing channel tag accurately represents the subject), new (a meaningful new tag is required).

Important:
- Never copy example tags into an episode unless its transcript genuinely supports them.
- For evidence, use short verbatim transcript excerpts. Never fabricate quotations.
- If the transcript is insufficient, ambiguous, or corrupted, explain the limitation in warnings and do not compensate by generating speculative tags.
- No hashtags. No complete sentences as tags. No generic format labels (Podcast, Interview, Episode).`;

export const TAXONOMY_SYSTEM_PROMPT = `You are managing the central tag taxonomy of a podcast channel.

You will receive:
1. Episode titles.
2. Episode summaries.
3. Transcript-grounded candidate tags.
4. Existing channel tags.
5. Tag usage counts across episodes.

Your responsibility is to normalize the taxonomy without losing meaningful distinctions.

Tasks:
1. Identify semantically equivalent tags.
2. Merge spelling variants, synonyms, and redundant labels where appropriate.
3. Preserve distinctions between related but different concepts.
4. Reuse existing canonical tags when they accurately describe a new episode.
5. Identify broad tags being applied to too many unrelated episodes.
6. Identify generic tags that add little discovery value.
7. Identify tags that are too specific, weakly supported, or redundant.
8. Preserve legitimate recurring topics.
9. Never merge two tags merely because they belong to the same broad category.
10. Never remove a specific tag simply because it is used by only one episode.

Examples:
- "AI Agents" and "Artificial Intelligence Agents" may be merged.
- "Machine Learning" and "Deep Learning" should not automatically be merged.
- "Customer Discovery" and "Customer Retention" should remain separate.
- "Business" should not become a default tag for every episode in a business podcast.

Produce valid JSON only, using exactly this structure:

{
  "canonical_tags": [
    {
      "name": "AI Agents",
      "slug": "ai-agents",
      "aliases": ["Artificial Intelligence Agents"],
      "description": "Discussions about autonomous AI agents and their architectures.",
      "usage_count": 3
    }
  ],
  "episode_assignments": [
    { "episode_id": "episode-001", "tags": ["ai-agents", "machine-learning"] }
  ],
  "merges": [{ "from": "artificial-intelligence-agents", "to": "ai-agents" }],
  "removed_tags": ["motivation"],
  "review_required": []
}

Do not assign a canonical tag to an episode unless the original transcript evidence supports it.`;

export const GENERIC_TAG_NAMES = new Set([
  'business','technology','motivation','success','life','education',
  'entrepreneurship','personal development','innovation','mindset',
  'interview','podcast','lifestyle','episode',
  'nepal','nepali','nepalese' // channel-level geo, not episode-specific
]);

export const TAG_TYPES = new Set(['topic','concept','industry','entity','technology','problem','framework']);
export const MIN_SCORE = 75;
export const MAX_TAGS = 8;

export function slugify(value){
  return String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

export function cleanTranscript(text){
  // Preserve speakers/timestamps; remove duplicate consecutive lines and excess blank lines only.
  const lines=String(text||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/\s+$/,''));
  const out=[];let previous=null;
  for(const line of lines){
    const key=line.trim();
    if(key && key===previous) continue; // obvious duplicate line
    if(!key && (!out.length || !out[out.length-1].trim())) continue; // collapse blank runs
    out.push(line);previous=key;
  }
  return out.join('\n').trim();
}

export function splitTranscriptChunks(text,size=60000,overlap=2000){
  const clean=String(text||'');
  if(clean.length<=size)return [{index:1,total:1,text:clean}];
  const chunks=[];let start=0,total=Math.ceil((clean.length-overlap)/(size-overlap));
  for(let i=0;i<total;i++){
    const end=Math.min(start+size,clean.length);
    chunks.push({index:i+1,total,text:clean.slice(start,end)});
    if(end>=clean.length)break;
    start=end-overlap;
  }
  return chunks;
}

// Extract a JSON object from an LLM reply: strips code fences, locates the outermost object, repairs trailing commas.
export function extractJson(text){
  const raw=String(text||'');
  // Strip invisible characters (soft hyphens U+00AD, zero-width) the model sometimes emits.
  const cleaned=raw.replace(/[\u00AD\u200B-\u200D\uFEFF]/g,'');
  const unfenced=cleaned.replace(/```(?:json)?/gi,'```').split('```').map(s=>s.trim()).filter(Boolean);
  const candidates=[cleaned,...unfenced];
  for(const candidate of candidates){
    const begin=candidate.indexOf('{');
    const end=candidate.lastIndexOf('}');
    if(begin<0||end<=begin)continue;
    const slice=candidate.slice(begin,end+1);
    for(const attempt of [slice,slice.replace(/,\s*([}\]])/g,'$1')]){
      try{return {ok:true,json:JSON.parse(attempt)}}catch{}
    }
  }
  return {ok:false,error:'No valid JSON object found in the response.'};
}

// Light stemming so agents/agent, startups/startup, growing/grow compare as the same token.
function stemToken(token){
  return token
    .replace(/ies$/,'y')
    .replace(/(sses|ches|shes|ses|xes|es)$/,'')
    .replace(/s$/,'')
    .replace(/(ing|ed)$/,'') || token;
}
function tokenSet(slug){return new Set(String(slug||'').split('-').filter(Boolean).map(stemToken))}
function jaccard(a,b){
  const A=tokenSet(a),B=tokenSet(b);
  if(!A.size||!B.size)return 0;
  let shared=0;for(const t of A)if(B.has(t))shared++;
  return shared/(A.size+B.size-shared);
}

const SIMILARITY_LIMIT=0.6;
const TAG_STOPWORDS=new Set(['the','and','of','in','for','to','a','an','with','on','at','by','from']);
// Repetition guard: reject a tag when more than half of its meaningful tokens
// overlap an already-kept tag (e.g. "Nepal Fintech" vs "Fintech Ecosystem").
function tokenOverlap(a,b){
  const clean=slug=>String(slug||'').split('-').filter(t=>t&&!TAG_STOPWORDS.has(t));
  const A=clean(a),B=clean(b);
  if(!A.length||!B.length)return 0;
  const setB=new Set(B);
  const shared=A.filter(t=>setB.has(t)).length;
  return shared/Math.min(A.length,B.length);
}

// QC validation layer — enforces section 7 of the tagging spec.
export function validateTagResult(raw){
  const parsed=extractJson(raw);
  if(!parsed.ok){
    return {ok:false,error:parsed.error,warnings:['The AI response was not valid JSON. Re-run the request or paste a corrected response — nothing was stored.'],rejected:[]};
  }
  const data=parsed.json;
  const warnings=[];
  // Strip invisible characters (soft hyphens, zero-width) the model sometimes emits.
  const visible=s=>String(s??'').replace(/[\u00AD\u200B-\u200D\uFEFF]/g,'');
  for(const w of (Array.isArray(data.warnings)?data.warnings:[])) warnings.push(visible(w));
  const summary=visible(data.episode_summary).trim();
  const primaryTopic=visible(data.primary_topic).trim();
  const candidates=Array.isArray(data.tags)?data.tags:[];
  const rejected=[];
  for(const item of (Array.isArray(data.rejected_candidates)?data.rejected_candidates:[])){
    if(item?.name)rejected.push({name:String(item.name),reason:String(item.reason||'Rejected by the model.')});
  }
  // Parse and sanity-check every candidate first, so scale detection can run
  // before the score threshold rejects anything.
  const sanitized=[];
  for(const candidate of candidates){
    const name=visible(candidate?.name).trim();
    if(!name){continue}
    const slug=slugify(candidate?.slug||name);
    const score=Number(candidate?.relevance_score);
    const type=TAG_TYPES.has(String(candidate?.type)) ? String(candidate?.type) : (String(candidate?.type)?(warnings.push(`Unknown tag type "${candidate?.type}" on "${name}" — stored as concept.`),'concept'):'concept');
    const decision=['existing','new'].includes(String(candidate?.decision))?String(candidate?.decision):'new';
    const evidence=visible(candidate?.evidence).trim();
    const reason=visible(candidate?.reason).trim();
    if(GENERIC_TAG_NAMES.has(slug)||/^(nepal|nepali|nepalese)-/.test(slug)){
      rejected.push({name,reason:'Generic tag — channel-level geo provides no episode distinction.'});continue;
    }
    if(!slug){
      rejected.push({name,reason:'Invalid or empty slug.'});continue;
    }
    if(!evidence&&!reason){
      rejected.push({name,reason:'No transcript evidence or justification provided.'});continue;
    }
    sanitized.push({name,slug,type,relevanceScore:Number.isFinite(score)?score:0,evidence,reason,decision,rawScore:score});
  }
  // Small free-tier models sometimes answer on a 0–10 scale despite the prompt;
  // if every candidate scored ≤10, interpret it as a 0–10 scale and rescale.
  if(sanitized.length&&sanitized.every(t=>t.rawScore<=10)){
    for(const tag of sanitized){tag.relevanceScore*=10}
    warnings.push('Scores appeared to be on a 0–10 scale — rescaled to 0–100 before filtering.');
  }
  const accepted=[];
  for(const tag of sanitized){
    if(tag.relevanceScore<MIN_SCORE){
      rejected.push({name:tag.name,reason:`Relevance score ${tag.relevanceScore} is below the ${MIN_SCORE} threshold.`});continue;
    }
    accepted.push({name:tag.name,slug:tag.slug,type:tag.type,relevanceScore:Math.round(tag.relevanceScore),evidence:tag.evidence,reason:tag.reason,decision:tag.decision});
  }
  // Normalize person names: keep full name, drop first-name-only duplicate.
function nameDedupe(existing, candidate){
  const e=existing.slug.split('-'), c=candidate.slug.split('-');
  if(e.length>=2 && c.length===1 && e[0]===c[0]) return true; // existing has full name, candidate is just first name
  if(c.length>=2 && e.length===1 && c[0]===e[0]) return true; // candidate has full name, existing is just first name
  return false;
}

  // Exact and semantic duplicates: keep the higher-scoring label.
  // Repetition guard also collapses near-overlapping labels within one episode.
  // Person-name deduplication: keep full name, drop first-name-only duplicate.
  const kept=[];
  for(const tag of [...accepted].sort((a,b)=>b.relevanceScore-a.relevanceScore)){
    const duplicate=kept.find(existing=>existing.slug===tag.slug||jaccard(existing.slug,tag.slug)>SIMILARITY_LIMIT||tokenOverlap(existing.slug,tag.slug)>=0.5||nameDedupe(existing,tag));
    if(duplicate){
      rejected.push({name:tag.name,reason:`Repetitive — overlaps "${duplicate.name}"; the more precise label was kept.`});continue;
    }
    kept.push(tag);
  }
  const tags=kept.slice(0,MAX_TAGS);
  if(kept.length>MAX_TAGS)warnings.push(`More than ${MAX_TAGS} strong candidates — kept the ${MAX_TAGS} highest scoring.`);
  if(tags.length&&tags.length<4)warnings.push(`Only ${tags.length} meaningful subjects found — returning fewer tags rather than inventing more.`);
  if(!tags.length&&!summary&&!warnings.length){
    return {ok:false,error:'The response contained no usable tags, summary, or warnings.',warnings,rejected};
  }
  if(!tags.length&&!warnings.length)warnings.push('No tags passed validation — review the response or regenerate rather than guessing.');
  return {ok:true,summary,primaryTopic,tags,rejected,warnings};
}

// Merge chunk-level candidates (long transcripts): best score per slug wins.
export function mergeChunkResults(results){
  const bySlug=new Map();const warnings=[];let rejected=[];
  for(const result of results){
    if(!result.ok){warnings.push(...result.warnings);rejected=rejected.concat(result.rejected||[]);continue}
    warnings.push(...result.warnings);
    rejected=rejected.concat(result.rejected||[]);
    for(const tag of result.tags){
      const existing=bySlug.get(tag.slug);
      if(!existing||tag.relevanceScore>existing.relevanceScore)bySlug.set(tag.slug,tag);
    }
  }
  const best=results.find(r=>r.ok);
  const tags=[...bySlug.values()].sort((a,b)=>b.relevanceScore-a.relevanceScore).slice(0,MAX_TAGS);
  return {ok:true,summary:best?.summary||'',primaryTopic:best?.primaryTopic||'',tags,rejected,warnings:[...new Set(warnings)]};
}

export function emptyLibrary(){
  return {version:1,generatedAt:'',canonicalTags:[],episodes:{}};
}

// Section 1 input payload: transcript is primary; title frames; channel gives context; metrics never involved.
export function composeExtractionInput({channel,episode,transcript,existingChannelTags,existingEpisodeTags}){
  return {
    channel_name:channel?.name||'',
    channel_description:channel?.description||'',
    episode_title:episode?.title||'',
    guest_name:episode?.guest||'',
    transcript:String(transcript||''),
    existing_channel_tags:(existingChannelTags||[]).slice(0,80),
    existing_episode_tags:(existingEpisodeTags||[]).slice(0,12)
  };
}

export function composeExtractionPrompt(input,extraInstruction=''){
  return `${EXTRACTION_SYSTEM_PROMPT}\n\n${extraInstruction?`${extraInstruction}\n\n`:''}Here is the episode data:\n\n${JSON.stringify(input,null,2)}\n\nReturn only the JSON object.`;
}

// Channel-level normalization pass — compact for the free tier's output budget.
export const TAXONOMY_COMPACT_SYSTEM_PROMPT=`You manage the central tag taxonomy of a podcast channel.

You receive per-episode candidate tags (with scores) and the existing canonical tags. Normalize without losing meaningful distinctions:
1. Merge semantically equivalent tags (e.g. "Nepal Fintech" and "Fintech Ecosystem" → one canonical label, the clearer one). Keep different concepts separate ("AI" vs "Machine Learning" stay apart).
2. Never merge tags merely because they share a broad category.
3. Generic labels that add no discovery value → removed_tags.
4. Do not remove a tag just because one episode uses it.

Return valid JSON only, no prose, keep descriptions under 12 words:
{"canonical_tags":[{"name":"","slug":"","aliases":[],"description":"","usage_count":0}],"episode_assignments":[{"episode_id":"","tags":["slug"]}],"merges":[{"from":"slug","to":"slug"}],"removed_tags":["slug"],"review_required":[]}`;

// Channel-level second pass payload: titles, summaries, candidates, existing canonical tags, usage counts.
export function composeTaxonomyPrompt(library,channel){
  const episodes=Object.values(library.episodes||{}).map(entry=>({
    episode_id:entry.episodeId,
    title:entry.title,
    guest:entry.guest||'',
    summary:entry.summary||'',
    primary_topic:entry.primaryTopic||'',
    candidate_tags:(entry.tags||[]).filter(t=>t.status!=='rejected').map(t=>({name:t.name,slug:t.slug,score:t.relevanceScore,evidence:t.evidence}))
  }));
  const canonical=(library.canonicalTags||[]).map(t=>({name:t.name,slug:t.slug,aliases:t.aliases,type:t.type,usage_count:t.usageCount||0,status:t.status}));
  return `${TAXONOMY_SYSTEM_PROMPT}\n\nChannel: ${channel?.name||''}\n\nEpisode data:\n${JSON.stringify(episodes,null,2)}\n\nExisting canonical tags:\n${JSON.stringify(canonical,null,2)}\n\nReturn only the JSON object.`;
}


function canonicalIndex(library){
  const index=new Map();
  for(const tag of library.canonicalTags||[]){
    index.set(tag.slug,tag);
    for(const alias of tag.aliases||[])index.set(slugify(alias),tag);
  }
  return index;
}

// Store extraction output: transcript + evidence alongside the episode (auditable, regenerable).
export function applyExtraction(library,episodeMeta,validation,transcript){
  const entry={
    episodeId:episodeMeta.id,
    title:episodeMeta.title||'',
    guest:episodeMeta.guest||'',
    transcript:String(transcript||'').trim(),
    transcriptChars:String(transcript||'').length,
    summary:validation.summary||'',
    primaryTopic:validation.primaryTopic||'',
    updatedAt:new Date().toISOString(),
    tags:(validation.tags||[]).map(tag=>({...tag,status:'proposed'})),
    rejected:validation.rejected||[],
    warnings:validation.warnings||[]
  };
  library.episodes[episodeMeta.id]=entry;
  // Propose canonical entries; reuse existing canonical tags (by slug or alias) when they match.
  const index=canonicalIndex(library);
  library.canonicalTags=library.canonicalTags||[];
  for(const tag of entry.tags){
    const existing=index.get(tag.slug);
    if(existing){
      tag.name=existing.name;tag.slug=existing.slug;tag.decision='existing';
      existing.usageCount=(existing.usageCount||0)+1;
    }else{
      const canonical={name:tag.name,slug:tag.slug,aliases:[],type:tag.type,description:'',usageCount:1,status:'proposed'};
      library.canonicalTags.push(canonical);index.set(canonical.slug,canonical);
    }
  }
  return library;
}

export function usageCounts(library){
  const counts=new Map();
  for(const entry of Object.values(library.episodes||{})){
    for(const tag of entry.tags||[]){
      if(tag.status==='approved')counts.set(tag.slug,(counts.get(tag.slug)||0)+1);
    }
  }
  return counts;
}

export function refreshUsageCounts(library){
  const counts=usageCounts(library);
  for(const tag of library.canonicalTags||[])tag.usageCount=counts.get(tag.slug)||0;
  return library;
}

// Apply a channel-level taxonomy pass: merges, aliases, assignments, removals.
export function applyTaxonomyResult(library,raw){
  const parsed=extractJson(raw);
  if(!parsed.ok)throw new Error(parsed.error);
  const data=parsed.json;
  const result={merges:0,assigned:0,removed:0,review:[],warnings:[]};
  const index=canonicalIndex(library);
  library.canonicalTags=library.canonicalTags||[];
  for(const item of (Array.isArray(data.canonical_tags)?data.canonical_tags:[])){
    if(!item?.slug&&item?.name)item.slug=slugify(item.name);
    const slug=slugify(item?.slug);if(!slug)continue;
    let canonical=index.get(slug);
    if(!canonical){
      canonical={name:String(item.name||slug),slug,aliases:[],type:TAG_TYPES.has(item.type)?item.type:'concept',description:String(item.description||''),usageCount:Number(item.usage_count)||0,status:'approved'};
      library.canonicalTags.push(canonical);index.set(slug,canonical);
    }else{
      canonical.name=String(item.name||canonical.name);
      if(item.description)canonical.description=String(item.description);
      canonical.status='approved';
    }
    for(const alias of (Array.isArray(item.aliases)?item.aliases:[])){
      const aliasSlug=slugify(alias);
      if(aliasSlug&&aliasSlug!==slug&&!canonical.aliases.some(a=>slugify(a)===aliasSlug))canonical.aliases.push(String(alias));
    }
  }
  for(const merge of (Array.isArray(data.merges)?data.merges:[])){
    const from=slugify(merge?.from),to=slugify(merge?.to);
    if(!from||!to||from===to)continue;
    const target=index.get(to);
    if(!target)continue;
    for(const entry of Object.values(library.episodes||{})){
      for(const tag of entry.tags||[]){
        if(tag.slug===from){tag.slug=to;tag.name=target.name;tag.decision='existing';result.merges++}
      }
    }
    if(!target.aliases.some(a=>slugify(a)===from))target.aliases.push(merge.from);
  }
  for(const assignment of (Array.isArray(data.episode_assignments)?data.episode_assignments:[])){
    const entry=library.episodes[assignment?.episode_id];
    if(!entry)continue;
    const assigned=new Set((Array.isArray(assignment.tags)?assignment.tags:[]).map(slugify));
    for(const tag of entry.tags||[]){
      if(assigned.has(slugify(tag.slug))){tag.status='approved';result.assigned++}
    }
  }
  for(const slug of (Array.isArray(data.removed_tags)?data.removed_tags:[])){
    const canonical=index.get(slugify(slug));
    if(canonical){canonical.status='retired';result.removed++}
  }
  for(const item of (Array.isArray(data.review_required)?data.review_required:[]))result.review.push(String(item));
  refreshUsageCounts(library);
  return result;
}

// Display resolution: approved canonical tags first, legacy YouTube tags as fallback.
export function approvedEpisodeTags(library,episodeId){
  const entry=library?.episodes?.[episodeId];
  return (entry?.tags||[]).filter(t=>t.status==='approved').sort((a,b)=>(b.relevanceScore||0)-(a.relevanceScore||0));
}
