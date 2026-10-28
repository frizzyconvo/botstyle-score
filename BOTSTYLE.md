# botstyle-score

Version **0.3.0** (see [CHANGELOG.md](CHANGELOG.md)). Run it locally: double-click `start-local.cmd` (Windows) or
`npm start`, open http://localhost:8787/, paste a Chub or Botbooru link and press Fetch card. Needs Node 18+.

A fork of [sam-paech/slop-score](https://github.com/sam-paech/slop-score) adapted to score **character cards**
(description + greeting) rather than long essays and stories. The page, file layout and leaderboard work as before;
user text also gets a botstyle score, a prose/list/boilerplate breakdown, and two unscored checklists.

## What changed

| | upstream | botstyle |
|---|---|---|
| Lists | words ranked by AI freq / general-English freq; bi/trigrams ranked by **raw frequency in AI output** (no human comparison), essay domain included | words, bigrams, trigrams each **weighted by AI-fiction rate ÷ human-fiction rate** (`tools/build_lists.py`; phrases use the human profile's exact character count as denominator), creative prompts only, prompt-topical items, number phrases and character names dropped |
| Matching | stopword-free trigram list matched against the full token stream (many entries could never fire); `couldn't` never matched `could help feel` | n-grams matched on stopword-free tokens with contractions split exactly as the lists were built; bigrams inside a matched trigram aren't double counted |
| Repeats | every hit counts 1 | item seen k times counts `w × (1 + ln k)` |
| Normalisation | min-max over 23 whole-corpus leaderboard averages (one trigram in 900 words ≈ worst model) | rate ÷ p90 of **~700-word AI fiction chunks** (`data/botstyle_calibration.json`, `tools/calibrate.mjs`) |
| Weights | 60 words / 25 not-x-but-y / 15 trigrams | 60 words / 25 phrases (bi+tri) / 15 **sentence structures** (not-x-but-y + AI sentence patterns), plus em-dash and obvious-tell points (`BOTSTYLE_WEIGHTS` in `js/botstyle.js`) |
| Input | one text box | description and greeting boxes; card JSON (V1/V2/V3, Pygmalion) pasted or dropped, character-card PNGs dropped (`js/card-import.js`); alternate greetings optional |
| Card input | whole text | `js/card-preprocess.js` scores prose only; W++/PList/key-value/bullets/headers and jailbreak boilerplate are tallied and excluded |
| Uncertainty | none | score ± band from hit counts; "low confidence" under 150 prose words |
| Extras | — | `js/human-tells.js`: unscored **human tells** (typos, txt-speak, unclosed `*`/quotes, `{{char}} is Alice`, `the {{user}}`…) and **craft notes** (writes {{user}}'s actions, gendered {{user}}, jailbreak lines, same-name sentence runs) |

`js/pos-tagger.js` gains `setPosTagger()` so Node scripts can use the local tagger (upstream's
`generate-leaderboard.mjs` never loads it, so its contrast rates are stage-1 only, unlike the browser).

## Sentence structures (`js/ai-structures.js`)

The third component: not-x-but-y (2.0 per match) plus 24 sentence-level patterns a word list can't express, each kept
only if it separates human from AI text on **both** SlopReview and Gutenberg (weight = log2(min AI/human doc-rate
ratio ÷ 1.5), capped at 4). Strongest: "a hint/flicker of…" (3.5), "a testament to" (3.3), "the air was thick…" (2.9),
"maybe, just maybe" (2.6), "seemed to sense/shimmer" (2.5), "almost imperceptible" (2.5), abstract similes ("like a
promise", "like a physical blow", 2.4), "a mix of X and Y" (2.2), "the weight of…" (2.2), pooled **stock beats** (2.1:
"the air crackled", "voice thick with", "a knowing smile", "eyes glinting with", "a wave of X washed over", …), banter
dialogue tags (…," she purred/teased/smirked, 0.7). "The kind of X that…" and "equal parts X and Y" are provisional
(supported by SPB only). Several came from SloppySeconds' community list (pixelnull/sillytavern-SloppySeconds).

Tested and dropped (no separation): stock banter lines ("took you long enough", "I don't bite… much"), "for a
moment", "something akin to", one-word sentence triplets, participle openers, "couldn't help but".

**Em-dashes:** above 6 per 1,000 words, up to +6 points (reached at 16/1k). 2023 human cards: p99 6.1/1k; Reddit
stories p95 5.7; SPB median 10. Classic literature uses more (Gutenberg human p95 10), which the cap keeps harmless.

## Obvious AI tells (`js/ai-artifacts.js`)

Only the unambiguous ones score (+25 each, cap +50): chatbot preamble ("Certainly! Here is…", "Sure, I'd be happy
to…"), sign-off ("I hope this helps!", "Let me know if you'd like changes"), the model talking about itself outside a
pasted jailbreak, a refusal left in the card ("I'm sorry, but I cannot assist with that request."), commentary on its own output ("This description captures…"), chat-template tokens (`<|im_start|>`).
Unfilled placeholders, text that stops mid-sentence, JSON field residue, Human:/Assistant: logs and word-count notes
are shown as unscored **"worth a look"** notes: drafts and exports produce them too. Rules run on narration only and skip
boilerplate, so in-character dialogue and pasted jailbreaks don't count.

## Results

| | upstream | botstyle |
|---|---|---|
| **SlopReview** (5,000 human / 6,405 AI stories, ~600 words) AUC | 0.930 | **0.977** |
| humans / AI flagged at > 25 | 9.9% / 81.3% | **2.6%** / 87.9% |
| **Gutenberg antislop-DPO** (2,999 / 2,999, cut to 600 words) AUC | 0.973 | **0.996** |
| humans / AI flagged at > 25 | 2.5% / 85.2% | **0.1%** / 93.0% |

Taking character names out of the scored word list cost 0.003 AUC on SlopReview (AI stories love "Elara"), but a card
named Elara would otherwise be penalised every time the name appears. Names are now tallied instead (below).
| avg points a human loses to a single phrase/trigram hit (SlopReview) | 13.1 | ~3 |

SlopReview's human side is Reddit WritingPrompts, likely overlapping the human profile the lists were weighted on, so
treat it as optimistic. Gutenberg (classic literature, `llm-aes/doc-storygen-v2` pairs excluded) is independent of it.

## Shared clichés (`js/cliches.js`, tallied, not scored)

Clichés humans and models both use, shown so creators can see them: 110 phrases ("took a deep breath", "her heart
pounding", "the door swung open", "shook her head"), 72 patterns (stock banter lines, "for a moment", "couldn't help
but", head tilts, "a playful smirk", and SloppySeconds entries that didn't separate, like "orbs" and "tresses"), and 445
common fiction words ("whispered", "gaze", "flickered"). They're the entries dropped from the scored lists because
modern human writers use them too (`tools/build_cliches.py`; nothing scored is double-listed). They still lean AI a
little: AUC 0.71 on SlopReview, against 0.98 for the scored composite. On Gutenberg it's 0.97, because 19th-century
novelists didn't write "her heart pounding".

## Writing style bands (`WRITING_STYLE_BANDS` in `js/score-card.js`)

**Original** under 20, **Mixed** 20–40, **Common** 40+. Card-length text scores lower than stories, so the 30/60 split
fits poorly: it put 42% of AI-written cards (SPB) in Original and almost none in Common. Share in each band
(reliable English cards with prose):

| | median | 20/40 split | 30/60 split |
|---|---|---|---|
| Korshuk cards, Feb–Apr 2023 | 8.5 | 87 / 11 / 2 | 96 / 4 / 0 |
| JanitorAI, Jun 2023 / H2 2023 / 2024 | 10.0 / 10.2 / 9.8 | 87 / 10 / 3, 86 / 12 / 2, 86 / 10 / 4 | 95 / 4 / 1 … |
| Chub 2023 / 2024 / 2025 | 15.5 / 15.5 / 23.6 | 65 / 29 / 6, 66 / 25 / 9, 42 / 42 / 16 | 85 / 14 / 1, 82 / 16 / 2, 64 / 33 / 2 |
| SPB (AI cards, 2026 models) | 31.5 | 4 / 77 / 19 | 42 / 58 / 0 |
| SlopReview human / AI stories | 9.1 / 44.3 | 93 / 7 / 0 vs 7 / 33 / 60 | 99 / 1 / 0 vs 20 / 59 / 21 |
| Gutenberg human / AI | 6.8 / 60.6 | 99 / 1 / 0 vs 4 / 19 / 77 | 100 / 0 / 0 vs 11 / 38 / 51 |

Cards that are all boilerplate get "not enough character writing to judge"; under 150 prose words the label says
"low confidence".

## Description formats (`js/card-style.js`)

Each card gets a **description format**: boilerplate (rules/jailbreak only), **compact** (W++, PList, Ali:Chat-style
bracket blocks, JSON: the token-saver formats), **lists** (Markdown bullets, key-value lines), formatted prose (headers +
paragraphs), free prose, in-voice/interview, and the hybrids "compact or lists + prose" and "boilerplate + prose".
The page compares the card with **2023 cards of the same format** (`data/botstyle_peers.json`, Korshuk, JanitorAI and
Chub cards created before Jul 2023, built by `tools/build_peers.py`) and flags components at the 90th percentile or
higher. Format itself isn't scored. Share of cards (median score): compact is 48% of Korshuk (7.1) but 2–5% later;
lists grow from 1% to 17% on Chub 2025 (32.1); formatted prose from 1.5% to 18% (25.8); SPB's AI cards are 99%
formatted prose.

**Archetypes** that cover most real cards (format × greeting voice): free prose + second-person greeting 29% (median
11.2), free prose + third-person 14% (14.0), structured+prose + second-person 6% (10.4), compact + second-person 4%
(8.7), formatted prose + third-person 3% (18.9), lists + third-person 1.4% (25.0). Greetings move from second person
(88% of Korshuk) to third person (57% of Chub 2025). Third-person greetings and formatted layouts score higher in
every era, which tracks the rise of AI-assisted writing rather than the layout itself.

## Bonus tags (`js/bonus-tags.js`, not scored)

Outlier tags, thresholds set on 15.7k English real cards (share that gets each): **Copyedit-proof** (≥ 25 human slips
per 1k words, ≥ 6 total; 3.4%), **Clichemonger** (≥ 4 shared clichés per 1k words, ≥ 3 total; 1.7%), **A card for
ants** (≤ 120 prose words and ≥ 30% boilerplate; 0.4%), **User puppeteer** (writes {{user}}'s actions/words/feelings
in 2+ places; 3.1%), **Wall of text** (a 500+ word paragraph; 1.8%), **No one knows you're a chatbot on the internet** (≈ 3,000+
permanent tokens AND a Common score, 40+; 0.2%), **{{char}} writes card** (10+ description sentences and at least
half of them start with {{char}}; 3.5%), **The usual suspects** (2+ AI-favourite names; 0.2%). `scoreCard()` returns the raw
measurements as `tagInputs`, so the platform can re-cut them.

## AI-favourite names (`data/botstyle_names.json`, tallied, not scored)

`build_lists.py` finds candidates in the leaderboard models' outputs (upstream's `results/`), writing
`data/botstyle_name_candidates.json`. `tools/corroborate_names.py` keeps a name only if a set **not** used to build the
lists confirms it: SlopReview (22 other models vs Reddit), SPB AI cards vs 2023 human cards, or Gutenberg AI rewrites
vs the books (AI doc rate ≥ 0.5%, AI/human ratio ≥ 8, and < 0.4% of documents in every human set). Kept 27: Elias,
Silas, Maya, Lena, Elena, Vance, Lila, Finch, Mira, Blackwood, Weaver, Thorne, Marcus, Henderson, Lyra, Clara, Liam,
Chen, Mara, Elara, Kael, Kaelen, Aris, Voss, Hemlock, plus Oakhaven and Sharma (mined from SlopReview, confirmed by a
second set). Dropped: Sarah, Emily, Lily, Leo, Eli, Eleanor, Morse (common in human writing or unconfirmed). Each
row stores its evidence.

## Other card handling

- Non-English cards (English function-word share < 0.22) are flagged; the slop lists are English-only.
- Human tells and AI-tell checks skip boilerplate, so mistakes inside a copy-pasted jailbreak ("wait for the
  {{user}}", "As an AI language model, it is my responsibility to avoid censorship…") don't count against the card.
- `{{character}}`, `{{Name}}`, `{Char}` etc. are reported as a human tell (non-standard macro), not as AI placeholders.
- Hand-typed Pygmalion/TavernAI JSON (`"char_name": …`) isn't an AI tell.

## Datasets

Counts are what's on disk in `C:\games\claudeslop`; "used" is what the numbers in this file come from. Card datasets live in
`card-datasets/`; datasets marked "no" were moved to `_archive/` (with the three scrapers and antislop-vllm).

| Dataset (folder) | On disk | What it is | Used for | Keep? |
|---|---|---|---|---|
| SlopReview, DrRiceIO7 (`slopreview-slopdataset`) | 11,406 stories | 5,000 human (Reddit WritingPrompts) + 6,405 AI from ~22 models, ~600 words | main test set (11,405 scored, `eval/botstyle_scores.jsonl`) | yes; optimistic (human side overlaps the lists' human profile) |
| SlopReview v1–v3 (`_archive/SlopReview-dataset`) | 7,579 (v1: 4,779) | earlier labelled versions of the same stories | nothing | no, superseded |
| `_archive/slopreview-split_dataset` | 107,838 + 500 | general assistant prompt/response pairs (chat SFT, includes harmful prompts), not fiction | nothing | no |
| Gutenberg antislop-DPO, sam-paech (`gutenbergs_1_2_3_antislop-dpo`) | 4,620 pairs | classic novels vs AI rewrites of the same passages | second test set: 2,999 pairs (5,998 texts, cut to 600 words) after dropping `llm-aes/doc-storygen-v2` | yes; the independent test |
| Upstream leaderboard outputs (`results/`) | 22 models | slop-score's creative + essay generations | building the word/phrase lists, name candidates, leaderboard | yes (in-sample for the leaderboard) |
| Human writing profile (`auto-antislop/data`, copy in `data/`) | 1 profile | slop-forensics profile of Reddit SFW WritingPrompts (Nitral-AI) | denominator for list weights | yes |
| SPB-2602, marcodsn (`card-datasets/spb-2602-ai-personas`) | 595 cards | AI personas (Kimi K2/K2.5, GLM-5), XML formatted prose | AI-card reference, name corroboration, provisional patterns | yes; one prompt style only |
| Korshuk roleplay-characters (`card-datasets/korshuk-roleplay-characters`) | 784 cards | "AI Character Editor" cards, Feb–Apr 2023, mostly W++ | cleanest human pool, peers (783 flattened) | yes |
| AUTOMATIC/jaicards (`card-datasets/jaicards-cards-js`) | 188,834 cards | JanitorAI, May 2023–Feb 2024, with SFW flag, tags, dates | June 2023 sample (3,991 scored), peers, bonus-tag thresholds, generation seeds (`tools/build_seeds.py`) | yes (the .7z duplicate is in `_archive/`) |
| raincandy-u/chub-ai-cards (`card-datasets/raincandy-chub-ai-cards`, flattened to `raincandy_cards.jsonl`) | 6,448 cards | Chub 2023–2026 with dates and stars (scored: 3,647 / 2,024 / 738 / 36 by year) | era trend, peers (pre-Jul-2023 part) | yes; the only dated Chub source |
| WoonaAI/ChubCards (`_archive/woonaai-chubcards`) | 3,409 cards (+925 raw files) | Chub cards wrapped as instruction/output JSON, no dates | nothing (no tool reads it) | no: undated, so it can't be split into human-era and AI-era |
| Perchance character database (`card-datasets/perchance-character-database`) | 512 SFW characters | Perchance AI Character Chat, added Sep 2024–Mar 2025 | scored once (`tools/flatten_perchance.py`, `eval/perchance_scores.jsonl`) | yes, as a modern mixed population, not as a human reference |
| ai-text-detection-pile (`_archive/`) | 1,392,522 texts | GPT-2/3/J and early ChatGPT essays + human essays | nothing | no: wrong genre and models |
| character-card-skills cards (`character-card-skills/cards/en`) | 6 English (+12 Chinese) | AI-written with a strict anti-AI-flavour discipline | adversarial AI examples | yes |
| Generated cards (`eval/ai_cards.jsonl`) | 280 (267 valid) | Claude Sonnet 4.5 + GPT-5-mini × 7 formats × 20, OpenRouter | first labelled AI-card run (below) | yes, but the next runs use `ai_cards_v2.jsonl` |

**Perchance.** Description is `roleInstruction`; the greeting is the first `ai` message, or a visible
system scene opener. In this repo example dialogue rarely sits in the description (27 of 512 have any,
mostly as hidden system messages); most cards have none, and 338 of 512 have no greeting at all.
Results (423 reliable English cards): median 27.3, Original / Mixed / Common 36 / 42 / 23%, mostly
structured+prose and formatted prose, em-dash median 0. Perchance ships an AI character generator, and its
narrator writes many greetings, so this is a mixed set like Chub 2025, not a human one. The em-dash median
shows em-dashes aren't a universal AI tell (Llama-family output uses few).

ARB (arXiv 2607.29539) isn't released yet; its finding that detectors collapse on human text *rewritten* by
an LLM is now tested directly by the `rewrite` mode of `tools/generate_ai_cards.mjs`.

## Labelled AI cards (first run, `eval/ai_cards.jsonl`)

280 cards: Claude Sonnet 4.5 and GPT-5-mini, 20 per requested format, seeds from Korshuk card names.
13 were unusable (all GPT-5-mini): 5 refusals, 5 cut off mid-card with "I'm sorry, but I cannot assist
with that request." appended, 3 with no greeting or only a clarifying question. Another 6 swapped a fandom
character for "an original character inspired by". These now score as an obvious AI tell (+25) when left in
a card, and the generator flags them (`valid`, `flags`).

Against 3,827 reliable pre-Jul-2023 human cards (Korshuk, JanitorAI June 2023, Chub 2023), on the 267 valid:

| | n | median | AUC | Original / Mixed / Common |
|---|---|---|---|---|
| Claude Sonnet 4.5 | 140 | 34.1 | 0.880 | 27 / 61 / 52 |
| GPT-5-mini | 127 | 37.1 | 0.898 | 14 / 59 / 53 |
| human 2023 cards | 3,827 | | | 78 / 18 / 4 % |

By requested format: "default" (no format named) 43.4 / AUC 0.92, formatted prose 40.3 / 0.93, free prose
35.8 / 0.90, PList 35.7 / 0.90, W++ 32.8 / 0.88, lists 31.7 / 0.87, **in-voice 25.3 / 0.81** (14 of 38 land in
Original). In-voice is the weak spot: first-person monologue and Ali:Chat interviews avoid the
third-person narration the lists were built on. Visible tells there are different ("Name's Trissian. Yeah,
*that* Trissian", "Not threatening. Just... present.", "Spoiler: it wasn't"), so they need their own mining
once there are more in-voice cards. Format compliance: Claude followed the requested format 114 of 120 times,
GPT-5-mini 62 of 108 (W++ came back as YAML, "with headers" as bullet lists). Scores vary a lot inside one
model × format cell (most cells span all three bands), so 1 card per cell can only check that prompts work,
not compare models.

**Anti-AI-written cards score as human.** The 6 English character-card-skills cards, written by a model under
a strict anti-slop discipline, score 9–18 (all Original). The scorer measures AI house style, not authorship;
the `antislop` generation mode measures how much of that style survives simple, generic and RP-specific
"don't sound like AI" instructions.

### Generator v2 (`tools/generate_ai_cards.mjs`)

- **1 card per cell by default** (`--per-style 1`) until the prompts are settled; `--dry-run` lists jobs and
  prints one prompt per mode; `--max-usd` stops on OpenRouter's reported cost; every line stores finish
  reason, token usage and cost.
- **Paired seeds:** every model gets the same seed for the same format, fresh and antislop share seeds, and the
  three rewrite kinds share one human original. Seeds come from `tools/build_seeds.py`: JanitorAI cards made
  before Jul 2023, SFW flag and no NSFW-ish tags, no characters described as children, English, 80–900-word
  description and 30–600-word greeting (`eval/seeds_jai_2023h1.jsonl`: 30 from one of the 16 folders; run it
  over all folders on a local disk for more). The concept is name + creator note + tags; the old run used the
  name alone.
- **Formats (7):** compact (W++ and PList as alternating phrasings: same family, rare after 2023), lists,
  formatted prose, free prose, first-person, interview (Ali:Chat), default. In-voice is split in two because
  that's where the scorer is weakest.
- **Modes:** `fresh` (all 7 formats); `antislop` × simple / generic / rp on free prose, formatted prose and
  default (simple = one line; generic = a humanizer-style list like avoid-ai-writing's; rp = a roleplay ban
  list like Sukino's banned tokens and character-card-skills §7); `rewrite` × polish / improve / expand on the
  whole human card. One pass per model is 19 cards.
- Trailing notes after the greeting ("---", "Notes:") go to `postscript`; text before the description goes to
  `preamble`; both stay out of the scored fields, since a creator wouldn't paste them into a card.

## Corner cases and lowest scores

`tools/test.mjs` section 9 runs the scorer on degenerate input (empty, emoji, numbers, Japanese, Spanish,
W++ only, HTML only, macros only, one short greeting, a 54,000-word wall). None crash or return NaN. Before
0.2.0 all of them got the label **Original** with a score of 0, and a 17-word human greeting with one stray
hit got 43.8 (Common). Now:

- under 40 prose words: no label ("Too little prose to judge", or "Mostly W++/lists" when the card is
  structured). Among 2023 human cards under 20 prose words, 4% would otherwise land in Common;
- non-English, including non-Latin scripts (Japanese gave 0 prose words and slipped past the old check):
  "Not English";
- an obvious chatbot tell still gets a label at any length.

**What AI text scores lowest:**

| Set | Below 20 | Pattern |
|---|---|---|
| SlopReview AI stories | 445 of 6,405 (7%) | RP fine-tunes: Gemmasutra 2B/4B (41%, 40% below 20), Impish Bloodmoon 12B (28%), Azure Starlight, Rocinante, Qwen3.5 Flash (17%), Mistral Small Creative (10%); the rest are 9–27-word fragments |
| Gutenberg AI rewrites | 111 of 2,999 (4%) | |
| SPB AI cards | 24 of 595 | one list-only card (0 prose), the rest long formatted prose with few hits |
| Generated cards (valid) | 42 of 267 | in-voice cards, list-only cards (prose excluded by design), one boilerplate-only card |
| character-card-skills | 6 of 6 | written under an anti-slop discipline |

Community RP fine-tunes are the biggest gap, and they're what many card writers use, so they belong in the
next generation runs (TheDrummer's Rocinante / Cydonia and similar are on OpenRouter) and in list mining
(SlopReview has 200 texts per fine-tune). Scoring sentence-like list items as prose was tested and didn't
help (card AUC 0.863 vs 0.867), so lists stay excluded.

## Texture (experimental, `js/texture.js`, not scored)

Following Foreverse's finding that AI cards give themselves away by texture (even detail, perfect
structure) more than vocabulary, `tools/texture_features.mjs` measured list-free features on 2,121 human
cards (Chub before Jul 2023 + Korshuk) vs 836 AI cards (generated run + SPB), and on SlopReview and
Gutenberg. AUC (above 0.5 = higher in AI; below 0.5 = higher in human):

| Feature | Cards | Gutenberg | SlopReview | Verdict |
|---|---|---|---|---|
| botstyle score | 0.867 | 0.996 | 0.978 | |
| paragraph-length CV | 0.112 | 0.144 | 0.233 | AI paragraphs are even; holds everywhere and inside each format (free prose 0.85, in-voice 0.82 as evenness AUC) |
| vocabulary spread (MATTR) | 0.945 | 0.556 | 0.819 | tracks polish, not AI: classic novels match AI |
| mean word length | 0.828 | 0.816 | 0.821 | consistent but overlaps the word lists |
| sentence-length CV | 0.384 | 0.155 | 0.525 | inconsistent |
| contractions, punctuation, triads, fragments | 0.4–0.7 | | | weak |

A two-feature logistic model (log botstyle score + paragraph CV) raises card AUC from 0.867 to **0.951**
(5-fold CV) with Gutenberg unchanged (0.997) and SlopReview slightly lower (0.973). Adding MATTR reaches
0.984 on cards but drops Gutenberg to 0.971, so it's left out. `scoreCard()` returns `texture` (paragraph
count and CV, sentence CV, MATTR, word length) and `experimental.aiStyleLikelihood` (that model, null under
150 prose words or fewer than 3 paragraphs); the page shows both under "Texture (experimental, not scored)".

Limits: Botbooru 75990 (hand-written) has even paragraphs (CV 0.40) and gets 83%; Farina 12%; Raquel 95%;
the Foreverse cards vary paragraph length on purpose (CV 1.0–2.0) and get 0%. On Chub 2025 cards 30% are
above 50%. Evenness is a cue careful humans share and anti-slop writers already avoid, so it stays out of
the score until it's checked on more hand-written cards. See `docs/FOREVERSE_NOTES.md` for what else in
character-card-skills was tested (their greeting rubric rewards AI cards, so it isn't used).

## Page, leaderboard, embedding

- **Card links:** paste a Chub or Botbooru link and press Fetch card; the description and greeting boxes fill in and
  each alternate greeting gets a checkbox (`js/card-fetch.js`). Chub uses the API SillyTavern's importer uses
  (`api.chub.ai/api/characters/<creator>/<slug>?full=true`; Chub keeps the card description in `personality`).
  Botbooru's card JSON is `botbooru.com/download/json/<id>` (the page's "Download JSON" button). Chub's API sends
  `Access-Control-Allow-Origin: *`, so a page on any site can fetch it directly; Botbooru sends no CORS header, so
  Botbooru links need a proxy: `tools/serve.mjs` (npm start / start-local.cmd) serves the page on localhost with a
  `/proxy?url=` endpoint limited to Chub and Botbooru, and the page uses it automatically there. Elsewhere set
  `CARD_SOURCES.proxy` or score server-side:
  `node tools/score_url.mjs <link | card.json | card.png>... [--alt all|2,5] [--json]` (files work too).
- `js/score-card.js` `scoreCard(card)` is the one entry point (page, tools, platform). It returns score, band, format,
  tags, tagInputs, names, hits, checks and peer percentiles.
- The leaderboard ranks the 22 models by **botstyle** median over card-length (700-word) chunks of their creative
  outputs, with grey human reference rows (`data/botstyle_leaderboard.json`, `tools/botstyle_leaderboard.mjs`). The
  outputs also built the lists, so model scores are in-sample.
- No CDN dependencies: `vendor/` holds msgpack and a browser bundle of wink-pos-tagger (`node tools/build_vendor.mjs`
  after `npm install`). Bootstrap CSS, the EQ-Bench header/nav/contact script (`js/eqbench-utils.js`), CDN fallbacks and links to
  upstream repos were removed; the page credits slop-score once. wordfreq's attribution stays (its licence needs it).
- `node tools/test.mjs`: regression checks (every pattern matches its example, tell rules, preprocessing and formats,
  JSON/PNG import, clichés, score ranges for fixture cards in `tests/fixtures/`).

## Example cards (`card-datasets/example-cards/`, outside the repo)

Description + first message only, as the earlier scorers were run (`node tools/score_url.mjs <file> --fields description,first_mes`):

| Card | Earlier scorers | Now | vs human 2023 / AI cards | Texture (experimental) |
|---|---|---|---|---|
| Botbooru 75990 Genavros (hand-written) | 35 | 31.2 Mixed | higher than 92% / 47% | paragraph CV 0.35, 84% |
| Botbooru 72660 Raquel (AI shitpost) | 18 / ~30 | 48.4 Common | 98% / 90% | CV 0.43, 90% |
| Chub Farina (your card) | ~8 | 15.6 Original | 65% / 3% | CV 0.69, 12% |

75990 is pushed up by dark-fantasy vocabulary (primal, predator, abyss, solitude, ember, maw) that AI fiction
overuses relative to the Reddit stories the lists were weighted against: a genre confound. Farina's rise is
mostly one "nearly imperceptible frown". With all fields the page gives 75990 34.2 (its personality field
alone scores 60).

## Grading: what the 0–100 means

The score is a weighted hit rate scaled so 100 = the sloppiest 10% of card-length AI fiction; it isn't a
percentage or a probability. Since 0.3.0 every result also says where it sits among reference cards
(`reference` in `scoreCard()`, from `data/botstyle_reference.json`, built by `tools/build_reference.py`):

| Score | Higher than … of human 2023 cards (3,827) | … of AI-written cards (940) |
|---|---|---|
| 5 | 15% | 0% |
| 15 | 63% | 3% |
| 31 | 91% | 46% |
| 60 | 99% | 97% |

So 20 and 40 sit at roughly the 80th and 98th percentile of human cards and the 10th and 75th of AI cards.
The 0–100 number stays for continuity (leaderboard, bands, platform), and the percentile line is the
plain-language reading. A calibrated probability from the score alone would depend on how common AI cards
are among whatever is being scored, so percentiles against both groups are the more honest framing.

## Categories vs character-card-skills

Our categories already cover theirs: card type (single character, multi-character, scenario/RPG, tool)
matches their modes (single-character, multi-NPC, scenario/RPG/simulator/narrator, helper), and
description format + greeting voice/format/tense cover what their greeting rules check. Their five opening
paradigms are authoring advice and can't be detected reliably by pattern. One contrast with their notes:
they report 70% of top Western cards use asterisk-style action (`*She looks up.*`); in our data that's
32% of 2023 human greetings but 5% of AI greetings, which write novel-style prose (25% vs 12%) and in third
person (36% vs 18%). These are shown, not scored.

## Stats for nerds (the original slop-score metrics)

On 2,476 human 2023 cards vs 860 AI cards (≥150 words), AUC: upstream slop score 0.60 (botstyle 0.87),
Flesch-Kincaid level 0.60, sentence length 0.53, paragraph length 0.38, dialogue frequency 0.46, TTR 0.50,
MATTR-500 0.77 (but it tracks polish: chance on Gutenberg). Total words 0.84 only says AI cards are longer.
They're kept in a collapsed "Stats for nerds" section. The over-represented words/trigrams lists were
removed: on cards they mostly listed character names, and they needed the 76 MB human profile, which the
page no longer downloads (load time about 1 second locally).

## Generated cards, second run (in progress, `eval/ai_cards_v2.jsonl`)

First 113 cards from 6 models (GPT-5-mini, Claude Sonnet 4.5, DeepSeek V3.2, Kimi K2, GLM-4.5, Llama 4
Maverick), 1 per cell, $0.45 so far. One invalid: GLM-4.5 spent all 6,000 tokens reasoning and returned
nothing (now retried automatically at low effort). One GPT-5-mini card finished with OpenAI's
`content_filter` but was complete (now a soft flag). Medians so far: fresh 30.5; antislop simple 35.9,
generic 23.1, RP 25.1; rewrite polish 21.1, improve 31.1, expand 53.7 (the human original scored 17).
By model: DeepSeek 43.3, GLM 34.5, Claude 29.5, GPT-5-mini 29.0, Kimi 25.2, Llama 4 Maverick 19.1.
Small samples; read as direction only.

## Hosting (GitHub Pages)

The page is static. `index.html` forwards to `slop-score.html`, `.nojekyll` stops GitHub's Jekyll step, and
both pages carry `noindex` so search engines skip a closed-beta link. Chub links work from any site (Chub sends
`Access-Control-Allow-Origin: *`). Botbooru links need a proxy on a hosted copy: deploy
`tools/cors-proxy-worker.js` as a free Cloudflare Worker and put its URL in `js/site-config.js`; without it the
page asks Botbooru users to download the card and drop it in.

## Next steps

- Run the v2 generator at 1 per cell on a cheap model first, read the outputs, then add the expensive models and
  at least one community RP fine-tune (the biggest blind spot above).
- Check paragraph evenness on more hand-written cards before deciding whether it joins the score.
- Mine in-voice tells once there are ~100 labelled in-voice cards.
- Test the genre confound above.
- `tools/eval_botstyle.mjs` still has its own copy of the pipeline; switching it to `scoreCard()` would remove
  the duplication.

## Rebuilding

```
python3 tools/build_lists.py            # needs ../auto-antislop/data/human_writing_profile.json and results/
python3 tools/corroborate_names.py <slopreview> <gutenberg> <spb_cards> <human_cards>...   # names list
node tools/calibrate.mjs                # needs wink-pos-tagger in node_modules
node tools/eval_slopreview.mjs <slopreview.jsonl> --out upstream.jsonl   # upstream baseline
node tools/eval_botstyle.mjs <slopreview.jsonl> --upstream upstream.jsonl # botstyle
node tools/score_cards.mjs <cards.jsonl> <out.jsonl>                      # card datasets (adds style + artifacts)
python3 tools/build_peers.py <scores.jsonl>... --before 2023-07            # per-style peer table
python3 tools/mine_structures.py                                          # sentence-pattern mining (edit paths)
python3 tools/build_seeds.py ../card-datasets/jaicards-cards-js/cards-js eval/seeds_jai_2023h1.jsonl --folders 0,1,2   # generation seeds
node tools/generate_ai_cards.mjs --models "a,b" --dry-run                  # check prompts, then drop --dry-run
python3 tools/flatten_perchance.py ../card-datasets/perchance-character-database eval/perchance_cards.jsonl
node tools/texture_features.mjs <cards.jsonl> <out.jsonl> --label human|ai   # texture experiment
node tools/botstyle_leaderboard.mjs --ref "Label=scores.jsonl[:human|ai|before:YYYY-MM]"  # leaderboard
node tools/build_vendor.mjs                                               # vendor/ (after npm install)
node tools/test.mjs                                                       # regression checks
```
