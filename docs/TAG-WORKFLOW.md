# Tag Workflow — Precision-First Editorial Tagging

The site ships with a full editorial tagging pipeline in the **Tag Studio** (`/admin/tags`):

```
transcript → AI extraction (evidence-grounded) → QC validation → human review → channel taxonomy pass → tag-library.json → live site
```

## Why the old tags were generic

The display previously fell back to the raw YouTube channel tags scraped per video
(`thinking`, `biggest`, `letsgrowtogether`, …). Those are engagement keywords, not content labels.
The site now shows **approved tags from `src/tag-library.json`** first, and only falls back to the
curated raw tags for episodes that have not been tagged yet.

## Workflow

1. **Get the transcript** — extract it from YouTube with any no-login tool
   (YouTube2Text, LinkTranscript, TranscriptNote, TheYouTubeTranscript…).
   Videos without captions need an audio-based transcriber (e.g. Transcribe.so, 1 free/day).
2. **Open `/admin/tags`** (local dev, or any deployed preview — everything saves in your browser).
3. **Paste the transcript** for the chosen episode and save it. It is stored alongside the episode,
   so tags can be regenerated, audited, and improved later without re-extracting.
4. **Generate candidates** — two options:
   - *Run AI request*: configure any OpenAI-compatible endpoint (base URL, model, API key — the key
     never leaves your browser). Long transcripts are split into overlapping chunks and the findings
     are merged before validation.
   - *Copy prompt → any LLM → paste JSON reply → Validate & stage*.
5. **Review** — every proposed tag shows its relevance score, a verbatim transcript quote, and a
   reason. Accept, reject, or rename. Fewer than 4 strong subjects is a valid outcome.
6. **Channel taxonomy pass** — copy the taxonomy prompt (contains all episode summaries, candidate
   tags, existing canonical tags and usage counts), run it in your LLM, paste the JSON back, and
   apply. Equivalent labels merge into one canonical tag with aliases; assignments become approved.
7. **Publish** — Export `tag-library.json`, replace `src/tag-library.json` in the repo, commit,
   deploy. Approved tags appear on cards, carousels, the detail page, tag filtering, and SEO keywords.

## Input contract (what the AI receives)

```json
{
  "channel_name": "…",
  "channel_description": "…",
  "episode_title": "…",
  "guest_name": "…",
  "transcript": "…",
  "existing_channel_tags": ["…"],
  "existing_episode_tags": ["…"]
}
```

The transcript is the primary source. Titles must never override what the transcript establishes.
Views, subscribers, likes, and other engagement metrics are never part of the input.

## QC layer (enforced in code, not just prompted)

- JSON repair/extraction — fenced replies and trailing commas are tolerated; invalid JSON is rejected with a warning, never guessed around.
- Relevance score < 75 → rejected.
- Generic labels (`business`, `technology`, `motivation`, `success`, `life`, `education`,
  `entrepreneurship`, `personal development`, `innovation`, `mindset`, `interview`, `podcast`, …) → rejected automatically.
- Exact duplicates and semantic duplicates (token similarity > 0.6) → the more precise label is kept.
- Missing slug → repaired; missing evidence *and* reason → rejected.
- More than 8 strong candidates → top 8 kept; fewer than 4 → returned as-is with a warning.
- Poor/insufficient transcript → surfaced as a warning instead of speculative tags.

## Where things live

| Thing | Location |
| --- | --- |
| System prompts + QC + library ops | `src/tagWorkflow.js` |
| Tag Studio UI | `src/TagStudio.jsx` (route `/admin/tags`) |
| Published library | `src/tag-library.json` |
| Display resolution (approved → fallback) | `resolveEpisodeTags()` in `src/main.jsx` |
| Draft (browser) | localStorage `thinking-beyond-tag-library` |
| AI endpoint config (browser only) | localStorage `thinking-beyond-ai-config` |

## Full prompts

The verbatim extraction and taxonomy system prompts are embedded in `src/tagWorkflow.js`
(`EXTRACTION_SYSTEM_PROMPT`, `TAXONOMY_SYSTEM_PROMPT`) and reproduced in
`docs/YOUTUBE-SEO-MASTER-PROMPT.md` context. The Tag Studio composes the complete prompt —
including channel context, existing tags, and the cleaned transcript — for you.

## Quality rules recap

- Tags describe *this* conversation, not the channel.
- Recurring subjects may legitimately repeat across episodes; artificial uniqueness is not a goal.
- A tag used by one episode is not a bad tag.
- Titles, thumbnails and descriptions matter more for discovery than tags — tags support.
