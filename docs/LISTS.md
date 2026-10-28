# Word lists and pattern lists

Every list BBBScorer uses: what it is, whether it's scored, how it's built, and how it has changed. The lists in
`data/` are **generated** by the builders named below, so they're never edited by hand: a hand edit would be lost on
the next rebuild, and JSON can't carry a comment saying why it was made. Hand decisions (an entry dropped, a
threshold) live in the builder, next to a comment, and are recorded in the history table at the end of this file.

Each scoring run's `SCORER.md` records the entry count and a checksum of every list it used, so two runs can be
checked for "same lists or not" without diffing.

## Scored

| List | File | Entries | Built by | From |
|---|---|---|---|---|
| AI-favored words | `data/botstyle_words.json` | 2,000 | `tools/build_lists.py` | Upstream slop-score's 22 model outputs, creative-writing prompts only (AI side) vs the slop-forensics profile of human Reddit WritingPrompts stories (human side) |
| AI-favored two-word phrases | `data/botstyle_bigrams.json` | 600 | `tools/build_lists.py` | Same |
| AI-favored three-word phrases | `data/botstyle_trigrams.json` | 312 | `tools/build_lists.py` | Same |
| Sentence structures | `js/ai-structures.js` (in code) | 27 patterns + not-x-but-y | `tools/mine_structures.py` (mining), hand-written regexes | SlopReview and Gutenberg antislop-DPO; several from SloppySeconds; provisional ones from SPB-2602 cards |
| Chatbot leftovers | `js/ai-artifacts.js` (in code) | | hand-written | |
| Scale anchor | `data/botstyle_calibration.json` | | `tools/calibrate_cards.mjs` | AI-written character cards (p90 of each component's raw rate) |

**How the three lists are built.** Each entry's weight is how much more often AI fiction uses it than human fiction
(rate ratio). Words need 6+ models, 40+ uses and a ratio of 5+ (top 2,000 kept); two-word phrases 6+ models, 20+
uses, ratio 5+ (top 600); three-word phrases 5+ models, 10+ uses, ratio 5+ (312 pass). Entries tied to one prompt's topic and number
phrases are dropped. Character names (capitalized mid-sentence 90%+ of the time) move to the unscored names list.
Entries of two letters or fewer ("wi" from Wi-Fi, "ai") and the junk set in `JUNK` ("formica") are dropped.

## Unscored (tallied and shown)

| List | File | Entries | Built by | Shown as |
|---|---|---|---|---|
| AI-favorite names | `data/botstyle_names.json` | 27 | `tools/build_lists.py` (candidates), `tools/corroborate_names.py` (kept only if a second, independent set confirms them) | AI-favorite names; the "Of course that's your name" tag |
| Shared clichés | `data/botstyle_cliches.json` | 110 phrases, 68 patterns, 445 words | `tools/build_cliches.py`: entries dropped from the scored lists because human writers use them too, plus SloppySeconds patterns that didn't separate | Shared clichés; the Clichemonger tag |
| RP slop | `data/unslopnemo_targets.json` | 65 (50 shown) | TheDrummer's UnslopNemo v1 target list, as published | Under Shared clichés. The 15 entries already scored or already in the shared clichés are skipped (`RP_SKIP` in `js/cliches.js`) |
| Pulp (genre) words | `data/botstyle_pulp_words.json` | 112 | `tools/build_pulp_words.mjs`: scored words that human genre cards (fantasy, horror, action, romance) use at least as often as AI cards | The pulp read and its genre-adjusted score |
| Format peers | `data/botstyle_peers.json` | | `tools/build_peers.py` | "vs 2023 cards in the same format" |
| Reference percentiles | `data/botstyle_reference.json` | | `tools/build_reference.mjs` | The ⓘ next to the score, bands in "How it works" |
| Extra dictionary (typo check) | `data/extra_words.txt` | | from the word-list package (MIT) | Rare real words the typo check shouldn't flag |
| Original slop-score lists | `data/slop_list*.json` | | upstream, unchanged | The original slop score only |

## History

Newest first. Scorer versions in brackets.

| Date | List | Change | Why |
|---|---|---|---|
| 2026-10-28 (app 0.18.0) | RP slop | UnslopNemo's list shown again, unscored, under Shared clichés | Checked against cards (no gain as a score), still useful to creators as RP chat clichés |
| 2026-10-28 [0.6.0] | Sentence structures | "RP-reply tells" (conspiratorial, voice low, punctuating, mischief) added but switched off | No AUC gain on cards (+0.000 to +0.002, in-sample) |
| 2026-10-28 [0.5.0] | Pulp words | First built: 112 words | Genre vocabulary was pushing human dark-fantasy and horror cards up |
| 2026-10-28 [0.2.0] | Words, phrases | Rebuilt with exact per-character human denominators and a stricter ratio (5) | Borderline entries were weaker than their weights said |
| 2026-10-28 [0.2.0] | Words → names | About 30 name-like words moved out of the scored list into an unscored names list (27 kept after corroboration) | A canon card named Elara or Silas paid for every mention |
| 2026-10-28 [0.2.0] | Words | "wi", "ai", "formica" and other two-letter tokens dropped | Junk (Wi-Fi, topical leftovers) |
| 2026-10-28 [0.2.0] | Shared clichés | First built from the dropped entries | Show common clichés without scoring them |
| 2026-10-28 [0.1.0] | Words, phrases | First weighted lists (AI fiction vs human fiction), essay prompts left out | Upstream's lists mix story slop with essay and business words, and count every hit the same |
