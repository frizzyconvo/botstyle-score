# Word lists and pattern lists

Every list BBBScorer uses: what it is, whether it's scored, how it's built, and how it has changed. The lists in
`data/` are **generated** by the builders named below, so they're never edited by hand: a hand edit would be lost on
the next rebuild, and JSON can't carry a comment saying why it was made. Hand decisions (an entry dropped, a
threshold) live in the builder, next to a comment, and are recorded in the history table at the end of this file.

Each scoring run's `SCORER.md` records the entry count and a checksum of every list it used, so two runs can be
checked for "same lists or not" without diffing.

## Where each list comes from

Four kinds of source, kept apart so each can be redone or replaced on its own terms:

1. **Built by us from data** (rerunnable: same inputs + builder = same list). Rebuild commands are below.
2. **Taken from someone else's list, as published** (we don't regenerate these; we can only update to a newer copy).
3. **From papers and research** (findings we tested; nothing is copied into a list unless it passed our own test).
4. **Community lists and anecdotes** (hand-made lists, forum and Discord lore, user feedback): ideas only, used after
   they pass the same human-vs-AI test, and labeled as such.

| List or pattern set | Kind | Source | Used how |
|---|---|---|---|
| AI-favored words, two- and three-word phrases | 1 | AI side: upstream slop-score's outputs from 22 models (creative prompts). Human side: Nitral-AI's slop-forensics profile of Reddit WritingPrompts stories | Scored |
| Card-mined words and phrases (0.9.1) | 1 | Our generated character cards (37 models, every model counted equally) against half of a 2023 card sample; items tied to one character's premise filtered out | Scored in 0.9.0 (extra points) |
| Sentence patterns marked "candidate" | 1 + 4 | Regex candidates written for this project (`tools/mine_structures.py`), some suggested by CharGen's phrase examples; kept only if they separated human from AI text on SlopReview **and** Gutenberg | Scored |
| Sentence patterns marked "SloppySeconds" | 4 | pixelnull's SloppySeconds community list; kept only if they passed the same test | Scored |
| Sentence patterns marked "cards" | 1 | Written for character cards; backed by AI card sets only (provisional weights) | Scored |
| RP-reply tells | 2 | TheDrummer's UnslopNemo target list | Off |
| AI-favorite names | 1 | Candidates from the same 22-model outputs, kept only if a second, independent set confirms them (SlopReview, SPB-2602 vs 2023 cards, Gutenberg rewrites) | Unscored |
| Shared clichés | 1 + 4 | Entries our builder dropped from the scored lists because human writers use them too, plus SloppySeconds patterns that failed the test | Unscored |
| RP slop | 2 | TheDrummer's UnslopNemo target list, unchanged | Unscored |
| Pulp words | 1 | Our card sets: scored words human genre cards use as often as AI cards | Unscored read-out |
| Old-school AI items | 3 + 1 | Wikipedia's "Signs of AI writing" guide plus stock character-sheet lines, each checked against 2023 cards and our generated cards; only those older models use 2.5×+ as often as 2023 cards count | Unscored read-out |
| Mood words | 2 | Empath's emotion categories (Fast et al. 2016, MIT), as published; only the 2023-card percentiles are ours | Unscored read-out |
| Card word frequencies | 1 | How many of 22,577 cards from 2023 use each word (`tools/build_card_words.mjs`) | Signature words read-out |
| Sexual-content words | 1 | Written for this tool; checked by hand against JanitorAI cards with and without the NSFW flag | Unscored read-out |
| Scale anchor, reference, format peers, length cut-offs | 1 | Our scoring runs over the card sets (length cut-offs: provisional, from a sample) | Calibration |
| Original slop-score lists | 2 | sam-paech/slop-score, unchanged | The original score only |
| Typo dictionary | 2 | word-list (MIT) | Typo read-out |
| "Don't sound like AI" rules in the card generator | 4 | Written for this tool, modeled on humanizer lists (avoid-ai-writing), Sukino's banned tokens, character-card-skills and SloppySeconds | Generating test cards only |

Research we tested but don't copy lists from: StoryScope (discourse features of AI fiction; its surface-checkable
findings were rechecked on cards), the ARB paper (why the generator has a rewrite mode), the Antislop paper (the method
behind slop-forensics and auto-antislop), Wikipedia's "Signs of AI writing" and tropes.fyi (via the unslop skills).

### Rebuilding the lists we build

Paths are relative to the repo; the card sets and test sets sit in a folder next to it.

| List | Command |
|---|---|
| Words, phrases (and name candidates) | `python3 tools/build_lists.py` (needs `upstream/results/` and the slop-forensics human profile) |
| AI-favorite names | `python3 tools/corroborate_names.py <slopreview> <gutenberg> <spb_cards> <human_cards>...` |
| Shared clichés | `python3 tools/build_cliches.py [SloppySeconds settings.js]` |
| Pulp words | `node tools/build_pulp_words.mjs` |
| Sentence-pattern candidates | `python3 tools/mine_structures.py` (writes `mine_results.json`; weights are copied into `js/ai-structures.js` by hand) |
| Scale anchor | `node tools/calibrate_cards.mjs` |
| Reference percentiles | `npm run reference` |
| Length cut-offs (BBBScorer 0.9.0 and 0.9.1) | `node tools/build_length_bands.mjs` |
| Card-mined words and phrases (BBBScorer 0.9.1) | `node tools/mine_card_lists.mjs --human-every 2` (generated cards in `eval/ai-cards/`, human cards from the evaluation sample) |
| Format peers | `python3 tools/build_peers.py <scores.jsonl>... --before 2023-07` |

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
| Old-school AI items | `js/old-school.js` (in code) | 5 checked groups, 2 listed groups | hand-written regexes, checked on the 0.9.0 evaluation sample (see below) | Old-school AI read-out |
| Mood words | `data/botstyle_mood.json` | 22 moods | `tools/build_card_words.mjs --empath <categories.tsv>` | Mood read-out |
| Card word frequencies | `data/botstyle_card_words.json` | 31,682 words (used by 3+ cards) | `tools/build_card_words.mjs` | Signature words and unusual vocabulary |
| Sexual-content words | `js/nsfw.js` (in code) | explicit and suggestive lists, plus context filters | hand-written | Sexual-content read-out |

**Old-school AI check** (2026-10-28, cards with 150+ words; in-sample, since the items were picked on the same cards).
Share of cards reading "some" or "strong":

| Set | Cards | some or strong | strong |
|---|---|---|---|
| Korshuk, Feb–Apr 2023 | 695 | 0.6% | 0.0% |
| Chub, before Jul 2023 | 1,683 | 5.7% | 2.7% |
| JanitorAI, May 2023–Feb 2024 | 17,675 | 3.1% | 1.0% |
| SPB-2602 (Kimi, GLM) | 594 | 0.3% | 0.0% |
| Our cards from older models (Phi-4, Mistral Small, Gemma 3, Llama 3.x, Euryale, Hermes, Maverick, GPT-4o, Gemini 2.5) | 911 | 15.9% | 5.2% |
| Our cards from newer models (GPT-5/6, Claude 4.5+, GLM 5, Kimi K2, Gemini 3, DeepSeek V4) | 427 | 0.5% | 0.0% |

Wikipedia's essay transitions ("Furthermore,", "Moreover,", "Overall,", "Additionally,") and items such as "plays a
crucial role", "fostering" and "showcased" turned up in 2023 cards but in none of the models we could test, so they're
listed, not counted. They may be GPT-3.5's own habits (we have no GPT-3.5 cards yet) or simply human essay style.

**Sexual-content check** (all 188,834 JanitorAI cards with 60+ words). JanitorAI's NSFW flag means "NSFW allowed", not
"has sexual content", so it isn't a label: flagged cards read 44% explicit, 16% suggestive, 40% none; unflagged cards 21%
explicit, 13% suggestive, 66% none. Read by hand, nearly all unflagged "explicit" cards do have explicit wording; the
misses left are rules that only say "sex" and "sexual" ("no sexual content").

## History

Newest first. Scorer versions in brackets.

| Date | List | Change | Why |
|---|---|---|---|
| 2026-10-29 (app 0.26.0) | Mood words, card word frequencies | First added, as unscored read-outs. Empath's topic words were also tried in the genre read and left out: better ranking inside one genre, worse at picking the single genre | Requested: fun read-outs in place of archetypes |
| 2026-10-28 (app 0.23.0) | Old-school AI items, sexual-content words | First added, as unscored read-outs | Requested: a read for older (ChatGPT-era) bots the fiction-built lists miss, and a sexual-content read |
| 2026-10-28 (0.9.1, prepared) | Card-mined lists | First built: 217 words, 31 two-word phrases from 2,258 generated cards (162 and 27 not in the story lists) | The story lists come from 22 models' stories; card writing has its own habits ("fiercely loyal", "tilts her head", "leather-bound") |
| 2026-10-28 (0.9.0, prepared) | Sentence structures | found_herself, it_was_as_if, hung_heavy, felt_a_surge, unspoken, not_just_shes off | Rechecked on cards: no separation, or they lean human |
| 2026-10-28 (0.9.0, prepared) | Pulp words | Count at half weight in the score (were read-out only) | Raised AUC on cards (0.862 → 0.866 on its own) |
| 2026-10-28 (0.9.0, prepared) | Length cut-offs | First built, provisional, from a sample | Same false-positive rate at every card length |
| 2026-10-28 (app 0.18.0) | RP slop | UnslopNemo's list shown again, unscored, under Shared clichés | Checked against cards (no gain as a score), still useful to creators as RP chat clichés |
| 2026-10-28 [0.6.0] | Sentence structures | "RP-reply tells" (conspiratorial, voice low, punctuating, mischief) added but switched off | No AUC gain on cards (+0.000 to +0.002, in-sample) |
| 2026-10-28 [0.5.0] | Pulp words | First built: 112 words | Genre vocabulary was pushing human dark-fantasy and horror cards up |
| 2026-10-28 [0.2.0] | Words, phrases | Rebuilt with exact per-character human denominators and a stricter ratio (5) | Borderline entries were weaker than their weights said |
| 2026-10-28 [0.2.0] | Words → names | About 30 name-like words moved out of the scored list into an unscored names list (27 kept after corroboration) | A canon card named Elara or Silas paid for every mention |
| 2026-10-28 [0.2.0] | Words | "wi", "ai", "formica" and other two-letter tokens dropped | Junk (Wi-Fi, topical leftovers) |
| 2026-10-28 [0.2.0] | Shared clichés | First built from the dropped entries | Show common clichés without scoring them |
| 2026-10-28 [0.1.0] | Words, phrases | First weighted lists (AI fiction vs human fiction), essay prompts left out | Upstream's lists mix story slop with essay and business words, and count every hit the same |
