# Changelog

All notable changes to BB Botstyle Scorer. Two version numbers:

- **App** (`package.json`): moves for any page or tool change.
- **BBBScorer** (`SCORER_VERSION` in `js/score-card.js`, stored with every score): moves only when scores or labels
  can change. Scores from different scorer versions shouldn't be compared directly.

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
