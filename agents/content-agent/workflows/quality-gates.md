# Quality Gates

Every piece of content produced by the Content Agent must pass through these 7 quality gates before delivery. No content ships without clearing all gates.

---

## Gate 1: Brand Voice Match

- **Tool:** `brand_voice_analyzer.py`
- **Pass:** >= 80% match score
- **Fail action:** Rewrite the content with explicit brand voice guidelines injected into the prompt, then re-check
- **What it checks:** Tone, vocabulary, sentence structure, and personality alignment against the client's brand voice profile

## Gate 2: AI Detection

- **Tool:** `humanizer_scorer.py`
- **Pass:** < 30% AI probability score
- **Fail action:** Run `de-ai-ify` skill to humanize the content, then re-check with `humanizer_scorer.py`
- **What it checks:** Patterns commonly associated with AI-generated text — repetitive structures, hedging language, generic phrasing, predictable transitions

## Gate 3: Platform Fit

- **Tool:** Manual rule verification
- **Pass:** Content meets all platform-specific rules
- **Fail action:** Rewrite to fit platform constraints
- **What it checks:**
  - **Character limits** — Instagram (2200), Twitter/X (280), LinkedIn (3000), TikTok (150 caption)
  - **Hashtags** — present and relevant for Instagram, minimal or absent for LinkedIn/Twitter
  - **Hooks** — first line grabs attention (Twitter: punchy hook, LinkedIn: first 2 lines compel "see more")
  - **CTA** — present where required (Instagram, LinkedIn)
  - **Format compliance** — content matches the assigned format (carousel, thread, single post, etc.)

## Gate 4: Tweet Rules (Twitter/X Only)

- **Tool:** `tweet-draft-reviewer`
- **Pass:** Score >= 7 out of 10
- **Fail action:** Auto-rewrite applying the 8 rules, then re-score
- **Applies to:** Twitter/X content only
- **The 8 Rules:**
  1. Hook in the first line — must stop the scroll
  2. One idea per tweet — no multi-topic posts
  3. No filler words — every word earns its place
  4. Active voice over passive
  5. Concrete over abstract — use specifics, numbers, examples
  6. No hashtag stuffing — max 1-2 hashtags if any
  7. Clear point of view — take a stance
  8. Conversational tone — write like you talk, not like a press release

## Gate 5: Content Quality Score

- **Tool:** `content_scorer.py`
- **Pass:** >= 80 out of 100
- **Fail action:** Run `copy-editing` skill to improve clarity, structure, and engagement, then re-score
- **What it checks:** Clarity, engagement potential, structural coherence, originality, and readability

## Gate 6: Language Check

- **Tool:** Language detection + client profile check
- **Pass:** Content language matches the client's `language` field in their profile
- **Fail action:** Regenerate the content in the correct language
- **What it checks:** The output language matches what the client expects. A Spanish-language brand must never receive English content, and vice versa. Mixed-language content is only acceptable if explicitly configured.

## Gate 7: No Cross-Post Duplication

- **Tool:** Similarity comparison across platform variants
- **Pass:** No two variants exceed 80% text similarity
- **Fail action:** Regenerate the more generic variant with stronger platform adaptation
- **What it checks:** When the same core message is adapted for multiple platforms, each variant must be sufficiently distinct. Identical or near-identical cross-posting violates platform best practices and reduces reach.

---

## Batch Processing Flow (7+ Posts)

When processing a weekly calendar or any batch of 7 or more posts, the quality gates run in an optimized parallel flow:

```
Phase 1 (Parallel)    Gates 1 + 2    Brand Voice Match + AI Detection
                       Run on ALL posts simultaneously
                            |
Phase 2 (Per Platform) Gate 3         Platform Fit
                       Group posts by platform, verify rules per group
                            |
Phase 3 (Filtered)     Gate 4         Tweet Rules
                       Twitter/X posts ONLY
                            |
Phase 4 (Parallel)     Gates 5 + 6 + 7   Content Quality + Language + Duplication
                       Run on ALL posts simultaneously
```

### Batch Reporting

After all gates complete, generate a summary report:

```
Quality Gate Results: X/Y posts passed all gates

Passed:  [list of post IDs]
Failed:  [list of post IDs with failing gate + reason]
Auto-fixed: [list of post IDs that failed, were auto-fixed, and now pass]
Flagged: [list of post IDs that failed after auto-fix attempt]
```

### Auto-Fix Policy

- Each failing gate triggers **one automatic fix attempt** using the designated fail action
- After the fix, the gate is re-run to verify the fix worked
- If the post still fails after one auto-fix attempt, it is **flagged for manual review**
- Flagged posts are not blocked — they are presented to the user with the failure reason so they can decide to approve, edit manually, or reject
- **Persistent failures** (same gate failing on 3+ posts in a batch) trigger a warning suggesting the brand voice profile, content strategy, or prompt templates may need adjustment
