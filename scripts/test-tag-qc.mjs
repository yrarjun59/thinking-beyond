// Acceptance tests for the QC layer and library operations (run: node scripts/test-tag-qc.mjs)
import {
  applyExtraction,applyTaxonomyResult,composeExtractionInput,composeExtractionPrompt,
  emptyLibrary,extractJson,mergeChunkResults,slugify,
  splitTranscriptChunks,validateTagResult,cleanTranscript

} from '../src/tagWorkflow.js';

let passed=0,failed=0;
function test(name,condition){
  if(condition){passed++;console.log('  ✓',name)}
  else{failed++;console.error('  ✗',name)}
}

console.log('1 · JSON extraction');
test('fenced JSON parses', extractJson('```json\n{"a":1}\n```').ok===true);
test('trailing comma repaired', extractJson('{"a":[1,2,],}').json?.a?.length===2);
test('prose-wrapped JSON finds object', extractJson('Sure! Here you go:\n{"a":2}\nHope that helps.').json?.a===2);
test('garbage rejected', extractJson('no json here at all').ok===false);

console.log('2 · QC validation');
const good=JSON.stringify({episode_summary:'Discussion about fintech growth in Nepal.',primary_topic:'Fintech',
  tags:[
    {name:'Digital Wallets',slug:'digital-wallets',type:'technology',relevance_score:92,evidence:'we talk about the wallet boom',reason:'Main subject.',decision:'new'},
    {name:'Fintech Regulation',slug:'fintech-regulation',type:'problem',relevance_score:85,evidence:'regulation came up again and again',reason:'Secondary thread.',decision:'new'},
    {name:'Sanjib Subba',slug:'sanjib-subba',type:'entity',relevance_score:80,evidence:'our guest sanjib subba',reason:'Named guest.',decision:'new'}
  ],rejected_candidates:[],warnings:[]});
const goodResult=validateTagResult(good);
test('valid response accepted', goodResult.ok===true&&goodResult.tags.length===3);
test('summary + primary topic preserved', goodResult.summary.includes('fintech')&&goodResult.primaryTopic==='Fintech');

const bloated=JSON.stringify({episode_summary:'s',primary_topic:'t',tags:[
  {name:'Motivation',slug:'motivation',type:'concept',relevance_score:90,evidence:'x',reason:'y',decision:'new'},
  {name:'Low Score',slug:'low-score',type:'concept',relevance_score:40,evidence:'x',reason:'y',decision:'new'},
  {name:'No Evidence',slug:'no-evidence',type:'concept',relevance_score:95,evidence:'',reason:'',decision:'new'},
  {name:'AI Agents',slug:'ai-agents',type:'technology',relevance_score:88,evidence:'e1',reason:'r',decision:'new'},
  {name:'AI Agent Systems',slug:'ai-agent-systems',type:'technology',relevance_score:82,evidence:'e2',reason:'r',decision:'new'}
]});
const bloatedResult=validateTagResult(bloated);
test('generic tag rejected', bloatedResult.rejected.some(r=>r.name==='Motivation'));
test('score below 75 rejected', bloatedResult.rejected.some(r=>r.name==='Low Score'));
test('no-evidence tag rejected', bloatedResult.rejected.some(r=>r.name==='No Evidence'));
test('semantic duplicate collapsed', bloatedResult.tags.length===1&&bloatedResult.tags[0].name==='AI Agents');
test('duplicate reason recorded', bloatedResult.rejected.some(r=>r.name==='AI Agent Systems'&&r.reason.includes('Semantic duplicate')));

console.log('3 · fewer than four subjects is valid');
const three=JSON.stringify({episode_summary:'s',primary_topic:'t',tags:[
  {name:'A',slug:'a',type:'topic',relevance_score:90,evidence:'e',reason:'r',decision:'new'},
  {name:'B',slug:'b',type:'concept',relevance_score:85,evidence:'e',reason:'r',decision:'new'},
  {name:'C',slug:'c',type:'entity',relevance_score:80,evidence:'e',reason:'r',decision:'new'}
]});
const threeResult=validateTagResult(three);
test('three tags returned, warning added', threeResult.tags.length===3&&threeResult.warnings.some(w=>w.includes('3 meaningful subjects')));

console.log('4 · poor transcript flagged, not guessed');
const poor=JSON.stringify({episode_summary:'',primary_topic:'',tags:[],rejected_candidates:[],warnings:['Transcript is mostly silence markers; insufficient substance.']});
const poorResult=validateTagResult(poor);
test('warning passthrough, zero tags ok', poorResult.ok===true&&poorResult.tags.length===0&&poorResult.warnings.length===1);

console.log('5 · transcript utilities');
const noisy='hello\nhello\n\n\n\n\nworld\nhello';
test('duplicate + blank lines cleaned', cleanTranscript(noisy)==='hello\n\nworld\nhello');
const long='x'.repeat(150000);
const chunks=splitTranscriptChunks(long);
test('long transcript chunked with overlap', chunks.length===3&&chunks[0].text.length===60000);

console.log('6 · library storage');
let library=emptyLibrary();
const meta={id:'ep-1',title:'Fintech talk',guest:'Sanjib Subba'};
applyExtraction(library,meta,goodResult,'transcript text here');
test('episode entry stores transcript + evidence', library.episodes['ep-1'].transcript==='transcript text here'&&library.episodes['ep-1'].tags[0].evidence.includes('wallet'));
test('canonical tags proposed', library.canonicalTags.length===3&&library.canonicalTags.every(t=>t.status==='proposed'));
// re-tag same subject on a second episode reuses the canonical tag
const second=JSON.stringify({episode_summary:'s2',primary_topic:'Fintech',tags:[{name:'Digital wallets',slug:'digital-wallets',type:'technology',relevance_score:88,evidence:'again wallets',reason:'r',decision:'new'}],rejected_candidates:[],warnings:[]});
applyExtraction(library,{id:'ep-2',title:'Wallets again',guest:''},validateTagResult(second),'t2');
test('canonical reuse across episodes (decision=existing)', library.episodes['ep-2'].tags[0].decision==='existing');
test('canonical not duplicated', library.canonicalTags.length===3);

console.log('7 · taxonomy normalization');
const taxonomy=JSON.stringify({
  canonical_tags:[{name:'Digital Wallets',slug:'digital-wallets',aliases:['Digital wallets'],description:'Wallet adoption and payments.',usage_count:2}],
  episode_assignments:[{episode_id:'ep-1',tags:['digital-wallets','fintech-regulation']},{episode_id:'ep-2',tags:['digital-wallets']}],
  merges:[],removed_tags:['motivation'],review_required:['verify fintech-regulation evidence']
});
const taxResult=applyTaxonomyResult(library,taxonomy);
test('assignments approved', library.episodes['ep-1'].tags.find(t=>t.slug==='digital-wallets').status==='approved');
test('unassigned stays proposed', library.episodes['ep-1'].tags.find(t=>t.slug==='sanjib-subba').status==='proposed');
test('canonical approved by taxonomy pass', library.canonicalTags.find(t=>t.slug==='digital-wallets').status==='approved');
test('usage counts refreshed', library.canonicalTags.find(t=>t.slug==='digital-wallets').usageCount===2);
test('review items surfaced', taxResult.review.length===1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
