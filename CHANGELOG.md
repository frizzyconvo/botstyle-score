# Changelog

All notable changes to BB Botstyle Scorer. Two version numbers:

- **App** (`package.json`): moves for any page or tool change.
- **BBBScorer** (`SCORER_VERSION` in `js/score-card.js`, stored with every score): moves only when scores or labels
  can change. Scores from different scorer versions shouldn't be compared directly.

## [0.25.0] - 2026-10-29 · BBBScorer 0.8.1

Scores unchanged. The prepared next scorer is now **BBBScorer 0.9.1**.

### Changed
- 0.9.1 is 0.9.0 plus the words and phrases mined from AI-written cards. Those lists were added to 0.9.0 after its first
  full run had started, so two different sets of rules shared one number; adding them moves scores, so the number moves
  too. 0.9.0 stays defined, without the mined lists, to describe that first run. `--scorer 0.9.1` scores into
  `eval/scores/v0.9.1/`.

## [0.24.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- **Provenance set** (`tools/_provenance.mjs`): a scoring dataset of cards whose authorship is known or suspected,
  labeled in a `provenance.csv` manifest next to the cards: provenance (human / ai / mixed), confidence (confirmed /
  suspected), the AI share and which parts AI wrote when the creator says, the model, source and evidence. Scored like
  the other datasets, with the labels stored on each row. `node tools/_provenance.mjs --check` lists cards missing from
  the manifest.
- Scoring rows carry a **fingerprint** of the scorer's settings and scored lists. A dataset scored with other settings
  under the same version number is scored again instead of being kept (a prepared version can change between runs).
- Generated cards carry the tags of the human card they were made from, as a creator would tag them. Tags only feed the
  genre and card-type read-outs.

### Changed
- Batch scoring loads the typo dictionary like the page does, so typo-based human tells match the page.

### Removed
- `tools/card_calibrate.mjs` and the page's attempt to load the word-drop list it wrote (the list hasn't existed since
  0.5.0; the request failed on every page load).

## [0.23.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- **Old-school AI** read-out (experimental, unscored, `js/old-school.js`): the essay and character-sheet register of older
  models, ChatGPT-era GPT-3.5 / GPT-4 and 2024-era open models ("a testament to", "meticulously", "a force to be reckoned
  with", "her sharp wit"). Counts different items, not repeats. Items from Wikipedia's "Signs of AI writing" guide that
  are as common in 2023 cards as in any model tested are listed greyed and don't count. Checks in `docs/LISTS.md`.
- **Sexual content** read-out (unscored, `js/nsfw.js`): explicit or suggestive wording and NSFW-type tags, read from
  every field and greeting, with filters for "Sex: Female", "sexual orientation", names and "no NSFW" rules.
- Result header with the card's name, where it came from, and exactly which fields were scored (with word counts) and
  which were left out.
- **Experimental** and **Unscored** tags on result sections, in place of "not scored" / "not part of the score" text.
- Dotted-underline explanations for the greeting layout, point of view, tense and genre in Card details.
- Tests for both read-outs (126 pass).

### Changed
- Scoring runs never rescore: a dataset that already has a file for that scorer version only gets its new cards scored,
  and a big dataset stopped halfway resumes from a checkpoint written every 15 s. `--force` (or `--rescore`) starts over;
  `--new` is now the default.
- The card generator scores new cards with the live scorer and the prepared next one (when it has a run).
- "Card" is now **Card details**, with the format, greeting, genre and type labels in their own column.
- The BBBScorer-vs-original numbers sit on their own line under the heading.
- The archetype label is hidden on the page while the list is redone (it's still stored with scores); the size badge
  stays.
- The "tentative" tag next to the band is gone, here and in "How it works".

### Fixed
- `tools/organize_eval.mjs` (run first by the overnight scoring script) moved a prepared newer scorer's run (0.9.0) to
  `eval/old/`, so the next run for that version started from nothing. It now only moves runs for older scorer versions.
- Popups (ⓘ and the new explanations) were cut off at the bottom of the result and could sit under the next panel. They
  now open above or below to stay on screen.

## [0.22.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged. Housekeeping: docs, licenses and unused files.

### Added
- `docs/README.md`: an index of every doc and what it's for, linked from the readme.
- `tools/doc_shortcuts.mjs` (`npm run shortcuts`): Windows shortcuts in `docs/` to every doc, local-only ones included,
  grouped as "Public", "Dev" and "Eval" and each with a tooltip saying what it is. `--check` lists any doc without a
  named entry; `--list` works on any OS. It runs on its own at any time, including during a scoring run, and
  `tools/organize_eval.mjs` uses it.
- `NOTICE.md`: licenses of the bundled third-party parts (wordfreq, word-list, msgpack, wink-pos-tagger).
- `.gitattributes`: text files are stored with LF line endings, batch files check out with CRLF, data files are binary.
- `package.json`: Node version (18+), homepage and repository fields.

### Changed
- `LICENSE` is now the plain MIT text with both copyright holders, so GitHub recognizes it; the wordfreq and other
  third-party license notes moved to `NOTICE.md`.
- `data/prompts.json` moved to `upstream/prompts.json`: only upstream's benchmark script uses it.
- The readme's layout table and license section point to the new docs index and notices.

### Removed
- `data/human_writing_profile.json` (75 MB): nothing loads it. The list builder reads the human profile from the
  slop-forensics and auto-antislop folders it came from.
- `tools/botstyle_leaderboard.mjs` and `data/botstyle_leaderboard.json`: the story-model leaderboard from 0.2.0,
  replaced by the card leaderboard.
- `js/debug.js`: an unused upstream logging helper.

## [0.21.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- `tools/build_seeds_wide.mjs`: a wider pool of 752 seed cards (SFW JanitorAI and Chub cards from before July 2023) for
  the card generator, so later rounds bring new characters instead of reusing the same 30.
- Card generator: rotated rounds (rewrites from round 2 on, and fresh / antislop rounds with `--rotate-seeds`) draw from
  the wide pool, chosen by round rather than by model so every model gets the same characters in a round. A skip list
  leaves out names by hand.

### Changed
- Seed filters also skip characters whose age is written out in words ("at the age of four", "a six-year-old"); the
  wide pool also skips real people, school settings and kink-coded tags.

## [0.20.1] - 2026-10-28 · BBBScorer 0.8.1

### Fixed
- The leaderboard was empty: it had been rebuilt from a 0.9.0 scoring run that had only just started (the builder took
  the newest scoring folder). The leaderboard and reference builders now default to the scorer version the page uses.

## [0.20.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged. BBBScorer 0.9.0 (prepared, opt-in) gains a card-mined list.

### Added
- `tools/mine_card_lists.mjs`: mines words and two-word phrases AI-written character cards use far more than 2023 cards,
  from the cards generated for this project, counting every model equally and filtering out words tied to one
  character's premise. First list: 217 words and 31 phrases (`data/botstyle_card_lists.json`), 189 of them not in the
  story-built lists.
- BBBScorer 0.9.0 (opt-in): up to 30 extra points from that list. Mined on half the models and half the characters and
  tested on the other half, it catches 7–9 more AI-written cards in 100 at the same false-positive rate; on an AI
  persona set it never saw, 48% → 56%.

### Changed
- Leaderboard: Phi-4 moved to **Just for fun** (a small general model people don't write cards with).
- Provisional 0.9.0 length cut-offs rebuilt with the card-mined list, from the half of the 2023 sample the list never
  saw.

## [0.19.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged. BBBScorer 0.9.0 is prepared but not switched on.

### Added
- **Clear result** button: empties the result, the loaded card and the text boxes.
- Leaderboard: **Hide models with under 20 cards** (remembered in the browser; card sets always show).
- BBBScorer 0.9.0, opt-in only (`js/scorer-profile.js`, `score_all.mjs --scorer 0.9.0`): band cut-offs by prose length,
  PLists wrapped in parentheses read as PLists, a cap on how much one repeated word or phrase can count, RP asterisks
  removed before the sentence patterns, paragraph evenness, genre ("pulp") words at half weight, and six sentence
  patterns that don't separate on cards switched off. Points for phrase-length W++ / PList entries were built and
  tested but left off. `tools/build_length_bands.mjs` builds the length cut-offs from a scoring run;
  `data/botstyle_length_bands.json` holds provisional ones from a sample. On that sample: AUC 0.862 → 0.885, short
  AI-written cards in Common 6% → 20%, 2023 cards in Common 2% at every length (was 0.2% short, 3.9% long).
- `docs/LISTS.md`: where every list and pattern comes from (built by us, taken from others, research, community), and
  how to rebuild the ones we build. Each sentence pattern records its source in the code.
- `docs/TODO.md`: a short summary of the next scorer version and what has been tried.
- `tools/probe_names.mjs`: cheap probes for the names, places and titles models reach for, by genre (candidates
  only, unscored).
- Card generator: rewrites use a new human card each round (all rounds reused one card per slot before), and
  `--rotate-seeds` does the same for plain and "don't sound like AI" requests; `--reparse --only-invalid` re-checks
  failed cards without touching valid ones.

### Changed
- "Type or paste" reads **Hide text boxes** and is highlighted while the boxes are open.
- Card generator accepts misspelled or renamed section headings from small models ("### DESRIPTION", "### Greeting",
  "**Description:**" with text on the same line); such cards carry a `loose_headers` note.

## [0.18.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- **RP slop** read-out under Shared clichés: TheDrummer's UnslopNemo list of RP chat clichés ("hips swaying",
  "...for now", "a shiver down"), shown but not scored. Entries already scored or already among the shared clichés
  aren't listed twice, and RP slop doesn't count toward the Clichemonger tag.
- `docs/LISTS.md`: every word and pattern list, whether it's scored, how it's built, and a history of changes.
- "How it works" explains why short and compact cards read low, and lists the unscored read-outs.
- Card generator: `--min-p`, and cards made at a non-default temperature or min_p get it in their id (`|t1.2`) and
  record; they're left out of the leaderboard and the model report.
- Scoring: `--new` scores only the cards a scoring run doesn't have yet and keeps the rest.

### Changed
- Tag names on the page match the docs: **Of course that's your name** (was The usual suspects; the tag id is
  still `usual_suspects`), and a new line for Copyedit-proof.
- The card generator scores only its new cards after a round (`--new`) instead of rescoring the whole set.
- 963 more AI-written cards behind the leaderboard and the page's reference (2,483 in all), including Gemini 2.5
  Flash Lite, Llama 3.1 8B and Llama 3.2 1B / 3B, and more rounds for most models. Headline numbers: AI-written
  cards median 46, bands 41 / 29 / 30%, AUC 0.87, 30% flagged at a 2% false-positive rate (original slop score:
  AUC 0.75, 20%).

### Fixed
- BOTSTYLE.md listed the switched-off "RP-reply tells" pattern among the scored sentence structures.

## [0.17.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- Leaderboard: a **Just for fun** group (not ranked) replaces "Pending". It holds UnslopNemo and Mistral Nemo, two
  extra card sets of unknown origin (Perchance cards (NSFW) and Someone's SillyTavern Archive), and **failed** models,
  shown on a hatched red background with a "failed" mark and the share of their cards that failed the format checks:
  MythoMax, Hermes 3 70B and Aion RP.
- `npm run results` (`tools/results.mjs`): current results at a glance, read-only, so it's safe to run during a
  scoring run or card generation.
- Card generator: models marked failed (`tools/_model_groups.mjs`) are skipped unless `--include-failed`.

### Changed
- Leaderboard: card-set dates moved to a second line under the name; on phones, card-set names wrap instead of being
  cut off. The other Perchance set is now "Perchance cards (SFW)".
- Leaderboard: the card-count sort button reads "# cards".
- "How it works" describes the Just for fun group and the failed models.

## [0.16.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- 230 more AI-written cards behind the leaderboard and the page's reference (1,520 in all): seven new models
  (DeepSeek V4.1 Flash, DeepSeek V3 0324, GLM 5.3 Flash, GPT-6 Luna, Gemini 3.8 Flash, Hy4 preview, GPT-4o),
  Claude Opus 5.5, and two more rounds for eight models whose medians rested on 10–14 cards.
- `docs/TODO.md`, starting with what a Linux setup needs. The scorer, tools, tests and local server already run on
  Linux; the multi-step batch scripts don't yet.

### Changed
- Headline numbers updated from the larger AI set: AI-written cards median 47, bands 39 / 34 / 28%, AUC 0.89, 27% of
  AI cards flagged at a 2% false-positive rate (original slop score on the same cards: AUC 0.70, 11%).

## [0.15.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- The BBBScorer-vs-original section shows the description and first message on their own for both scorers, and how
  their lists differ (the original counts every list hit the same; BBBScorer weights each item).
- An asterisk on bite-sized scores (under 350 scored words), on the result and in Your cards.
- Card generator: a waste guard. A model that wastes 3 cards in a row (failed requests, reasoning that uses the whole
  budget, invalid cards) is skipped for the rest of that run; after one card whose reasoning used the whole budget,
  that model's remaining cards start at low reasoning effort; `--max-usd-model` caps one model's cost per run.

### Changed
- BOTSTYLE.md: "How BBBScorer differs from slop-score" rewritten as a side-by-side table checked against the upstream
  code (its 0–100 stretches each measure between the lowest and highest of 23 entries, 22 models and a human
  baseline, padded 10%); data sets, outside references and tooling are back in their own section.

## [0.14.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- **BBBScorer vs the original slop score** section on every result: what text each counts, their word, phrase and
  pattern rates, extras and scales side by side, the original's slop-list words found, and the reasons the two
  differ on that card (shared with the scoring-run notes, `js/compare-original.js`).
- Extra dictionary for the typo check (`data/extra_words.txt`, rare real words from the word-list package), so words
  like "gambeson" aren't flagged.

### Changed
- Typo check: a word now counts as a likely typo only when it's one letter off a common word ("beutiful",
  "walkd"). Rare real words, regular derivations ("tallish", "purpleish", "unbothered"), contractions, words with
  accents and sentences in another language (in-character Spanish and the like) are left out. On a sample, 12% of
  2023 JanitorAI cards get a likely typo and 0.3% of AI-written cards (before: most cards, either way).
- Phrase hits show as written in the card ("something she can't") instead of their list form ("something ca":
  stopwords left out, contractions cut); the list form is in the tooltip.
- **Bite-sized** badge for cards under 350 words in the scored fields (was under 200 prose words), with a note that
  the score rests on few words.
- The pulp read is hidden when none of the card's AI-favored word weight is genre vocabulary.

## [0.13.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- Score cards at any path as an extra dataset: `npm run score-path -- "<path>" --name <name>` (`score_all.mjs --add`).
  Reads folders of card PNG / JSON / JSONL files, Perchance character folders, .zip files (optionally a folder or
  pattern inside, e.g. `pack.zip\books\*.png`) and single card files (`tools/_card_sources.mjs`). Writes scores only,
  never card text, and remembers the path so later full runs score it again.
- `tools/model_report.mjs`: per-model report for the generated AI cards: BBBScorer and original medians, regression
  of one on the other with each model's residual, within-model agreement, cost per card, and the upstream story
  scores for comparison. Written to the run folder as `ai-models.md`.

### Changed
- "False positive" instead of "false alarm" throughout.
- The 2023 reference is described as mostly human, not human: it includes some AI-written cards from 2023.
- Leaderboard request styles from the first generation run have readable names.

## [0.12.0] - 2026-10-28 · BBBScorer 0.8.1

Scores and cut-offs unchanged.

### Changed
- Band names are back to **Original-ish / Mixed / Common** (under 40 / 40–60 / 60+). The fun labels stay as
  taglines next to them: *meatbag adjacent*, *mixed signals*, *might just be slop*. `scoreCard()` returns the
  tagline as `band.tagline`.
- Leaderboard and reference rebuilt with the new Gemini 2.5 Flash and Aion RP 8B cards (1,290 AI-written cards).
- `tools/organize_eval.mjs` keeps Windows shortcuts to every doc (readme, documentation, changelog, dev notes and
  log, the current run's notes, comparison and scorer manifest) in `docs/` on the local machine.

## [0.11.0] - 2026-10-28 · BBBScorer 0.8.1

Scores unchanged.

### Added
- ⓘ next to a scored card's format: every format a description can be read as, what each means, which one the card
  got and its mix of prose, lists, compact blocks and boilerplate.
- BOTSTYLE.md is now the full documentation: every band, format, greeting layout, tag, archetype, read-out,
  leaderboard term and sentence pattern, plus a glossary. README.md is a plain readme.
- Footer credit: made by frizzy_conversation_93532 (Botbooru profile).
- `compare_scores.mjs --previous`: the current scoring run against the one before it, saved in the run's folder.

### Changed
- Title reads "BB Botstyle Scorer v0.8.1" in the heading and the tab ("BBBScorer v0.8.1" on phones). The heading
  didn't show the version before.
- One set of format names everywhere (page, leaderboard, scoring-run notes, docs): Free prose, Formatted prose,
  Lists, Compact, In voice, Structured + prose, Boilerplate + prose, Boilerplate. The leaderboard's request styles
  use the same names plus the Lazy prompt ("sections" and "plain prose" are gone).
- Leaderboard: each model's style range and lazy-prompt median sit on a second line under its name. The
  lazy-prompt sort is gone: most models have only one or two lazy-prompt cards, so it ranked noise.
- Leaderboard, reference and "How it works" numbers rebuilt from the BBBScorer 0.8.1 run over every dataset
  (108,129 human cards from 2023, 1,237 AI-written cards). "How it works" now reads its numbers from the reference
  file, so they follow each rebuild.
- American spelling throughout (favored, honor, normalize…).
- Upstream slop-score leftovers (model outputs, benchmark and leaderboard scripts) moved to `upstream/`.
- Local `eval/` layout: `ai-cards/`, `inputs/`, `experiments/`, `scores/` (current run only) and `old/` (earlier runs,
  pre-versioning scores, stale backups).

### Fixed
- Phones: the header buttons no longer overflow the panel, and the leaderboard axis labels no longer overlap.
- Info popovers used a serif font.

## [0.10.1] - 2026-10-28 · BBBScorer 0.8.1

### Fixed
- Trait lists joined with semicolons ("Enjoys noodles; 176cm tall; Stubborn; Loyal; …") were read as prose, so trait
  words counted as AI vocabulary (a 2023 Chub card scored 63 on its trait list alone; now 4.6). They now count as
  lists, like W++ and PLists. Affects about 1% of human cards and 0.6% of AI cards.

## [0.10.0] - 2026-10-28 · BBBScorer 0.8.0

Scores unchanged.

### Added
- Page title includes the scorer version ("BB Botstyle Scorer · BBBScorer v…"); a test checks it on every bump.
- Leaderboard: original slop-score median on every row; sort by BBBScorer, the lazy "make me a bot" prompt,
  original score or card count (remembered in the browser); each model shows its lazy-prompt score and the
  lowest-to-highest range across the other request styles.
- `SCORER.md` / `scorer.json` in every scoring-run folder: weights, anchor, bands, extra points, card-score method,
  patterns, list sizes and checksums, and the changelog entry (`tools/scorer_manifest.mjs`, also for past versions).
- `tools/organize_eval.mjs`: sorts eval/ into generated/, inputs/, experiments/, scores/ and legacy/ and writes a
  README listing every run and whether it's current, superseded, complete or partial. Run by the overnight script.

### Changed
- Leaderboard band zones follow the scorer's cut-offs (they were fixed at the old 35 / 50).
- Leaderboard and ⓘ percentiles say when they were built with an older scorer version.
- Wrangler 4 for deploying and the public-list tool; no sign-in prompt when already signed in, or none at all
  with `CLOUDFLARE_API_TOKEN` in `.env`.

## [0.9.0] - 2026-10-28 · BBBScorer 0.8.0

### Changed
- **Description and first message scored separately**, then blended by length (each counts up to 400 prose words).
  At a 2% false-positive rate on human cards this catches 29% of AI cards instead of 15% (AUC 0.91, was 0.90).
- **Bands re-cut:** under 40 / 40–60 / 60+ (human 2023 cards 93 / 5 / 2%, AI cards 30 / 40 / 30%).
- Overnight scoring prints progress (dataset, cards done, %, time left) every 15 seconds and keeps a progress log;
  a lock file stops two scoring runs at once.

### Added
- Warning when the description or first message is empty.
- Repeated-wording read-out (inside the description, inside the greeting, between them; alternate greetings reusing
  the first message are noted as normal). Not scored: human cards repeat themselves more than AI-written ones.
- `generate_ai_cards.mjs` scores the new cards when it finishes (`--no-score` to skip), unless another scoring run
  is active.

## [0.8.0] - 2026-10-28 · BBBScorer 0.7.0

### Changed
- **Scale anchored to AI-written cards.** 100 now means "as AI-styled as the most AI-styled tenth of AI-written
  character cards" instead of 700-word AI fiction chunks, which card descriptions rarely approach. Scores use the
  whole 0–100 range: human 2023 cards median 16, AI-written cards median 52 (previously about 11 and 32).
- **Length no longer lowers scores.** Repeats are damped by density instead of raw count, so the same text pasted
  twice scores the same. Long descriptions were being pushed down.
- **Bands re-cut for the new scale:** under 50 / 50–75 / 75+ (human 2023 cards 93 / 5 / 2%, AI cards 46 / 42 / 12%).
- Em-dash points up to 10 (was 6) and chatbot leftovers 40 each, up to 80 (was 25 / 50), to match the wider scale.

### Added
- **Mixed-card flag:** description and first message are scored on their own; when both have 150+ prose words and
  land 25+ points apart, the card is flagged (e.g. hand-written description, AI-written greeting).
- Original slop score shown under the score range.
- Public list: an origin tag on each entry (Chub, Botbooru, JSON, PNG, text); earlier entries for the same link fold
  under the newest; each new entry gets an id. `public_list.mjs list` and `delete` (by number, id or link; saves a
  copy first). Needs the public-list worker redeployed.
- `generate_ai_cards.mjs --more` (next round on top of existing cards) and `--round N`.
- Overnight scoring writes both scores per card, per-part scores, the mixed flag, and a disparity mark (30+ points
  "big", 50+ "very big") with likely reasons; `notes.md` summarizes each dataset.
- `tools/calibrate_cards.mjs` (card anchor).

### Fixed
- `mine_structures.py` read data from fixed absolute paths.

## [0.7.0] - 2026-10-28 · BBBScorer 0.6.0

### Changed
- **Scored fields:** description and first message by default, everywhere (page, tools, `scoreCard()`). Personality
  and scenario were previously always included by the scorer. Other fields are opt-in via the field picker or
  `fields`.
- **In-character dialogue counts as prose:** speech after a label (`A: "…"`) or in a bullet is scored. Interview
  questions (`Q: …`) still aren't.
- Field picker starts with only Description and First message ticked, for links, uploads and pasted JSON.

### Added
- Each part's own score (description, first message, alternate greetings) shown next to the card score, so an
  AI-styled greeting isn't hidden by a long description. Read-out only.
- "Stats for nerds" shows the original slop score for every field and every greeting, as well as for the scored
  fields.
- Footer link to the GitHub repo.
- `tools/public_list.mjs`: status, download, archive (optionally before a date) or clear the public list.
- `tools/eval_cards.mjs`: compares scoring variants on human vs AI-written cards.

### Fixed
- Copyedit-proof tag: commas inside W++ / PList braces (`{muscular,blue eyes}`) were counted as missing spaces.
- Leaderboard data tagged the JanitorAI reference rows as AI ("JanitorAI" contains "AI").

## [0.6.0] - 2026-10-28 · BBBScorer 0.5.0

Scores identical to 0.4.0; bands and labels changed.

### Changed
- Bands widened and marked tentative: under 35 *Meatbag adjacent*, 35–50 *Mixed signals*, 50+ *Might just be slop*
  (previously 20 / 40).
- "BBBScorer v…" shown everywhere.
- Leaderboard: sample size on every row, a star under 20 cards, band shares at the current cut-offs; UnslopNemo
  and Mistral Nemo in an unranked "Pending" group.

### Added
- Experimental, unscored read-outs: genre, pulp share with a genre-adjusted score, archetype with a length badge.
- Public list of scored cards (never stores card text) and a Botbooru proxy, both on Cloudflare Workers.
- Leaderboard link at the top of the page.
- Tools: `phrase_check.mjs`, `build_pulp_words.mjs`; `--help` on every tool; generation retries and failure reports.

## [0.5.0] - 2026-10-28 · BBBScorer 0.4.0

### Added
- New page: link / upload / paste bar, field picker with per-field and per-greeting checkboxes, live rescoring.
- "Your cards" saved in the browser, with an "I made this card" box and AI-assistance slider; JSON export.
- Leaderboard of models by the cards they wrote, with real card sets as references.
- `scoreCard()` option to include example dialogue.

## [0.4.0] - 2026-10-28 · BBBScorer 0.4.0

### Added
- Scorer version carried by every result; versioned overnight scoring (`score_all.mjs`) and regression reports
  between versions (`compare_scores.mjs`).
- Dark and light themes, mobile layout, percentiles in an ⓘ popover.

### Removed
- The "Slop / Not slop" splash.

## [0.3.0] - 2026-10-28

### Added
- Percentile of each score among human 2023 cards and AI-written cards.
- GitHub Pages support; Botbooru links through a proxy.
- `score_url.mjs --fields` to score chosen fields.

### Changed
- Original slop-score metrics moved into a collapsed "Stats for nerds" section; the 76 MB human-profile download
  is gone.

## [0.2.0] - 2026-10-28

### Changed
- No label under 40 prose words, for non-English text, or for list-only cards (these used to read "Original" with
  a score of 0). An obvious chatbot tell still gets a label at any length.
- A refusal left in a card counts as an obvious chatbot tell.

### Added
- Unscored texture read-outs (paragraph evenness and others).
- Local server with a Botbooru proxy (`npm start`); scoring of local card files from the command line.

### Fixed
- The upstream metrics panel showed the botstyle score as the original slop score.

## [0.1.0]

First character-card version of slop-score: word and phrase lists weighted by AI vs human fiction, sentence
structures, em-dash and chatbot-leftover points, prose-only card preprocessing, human tells and craft notes,
shared clichés, AI-favorite names, description formats, bonus tags, card import (JSON / PNG / links).
