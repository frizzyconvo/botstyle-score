# Changelog

Two versions: the scorer version (`SCORER_VERSION` in js/score-card.js, carried by every score) moves only when
scores or labels can change; the app version (`package.json`) also moves for page and tool changes. Both follow
`MAJOR.MINOR.PATCH`.

## 0.6.0 (2026-10-28) - app; BBBScorer 0.5.0

Scorer 0.5.0 (scores identical to 0.4.0; bands and read-outs change)
- Bands widened and marked tentative: Original < 35, Mixed 35–50, Common 50+, labelled Meatbag adjacent /
  Mixed signals / Might just be slop. Fewer false alarms on human cards (2023 human: 96 / 3 / 1).
- Experimental, unscored: genre read, pulp score with genre-adjusted score and pulp / pulp-and-AI flags,
  archetype tag with length badge.

Page
- "BBBScorer v…" everywhere; "slop" wording kept only for the top band and the original slop-score stats.
- Result shows the tentative marker, archetype, pulp read and genre read.
- Leaderboard link at the top; leaderboard rows show sample size, a clearer * for fewer than 20 cards, band
  shares recomputed with the current cut-offs, and pulp medians. Reference set "Foreverse".
- Public list section always visible (not switched on yet) and states it never keeps card text.

Tools
- Every .mjs takes `--help`. `score_all` adds genre/pulp/archetype fields and timing logs (run-log.jsonl).
- `generate_ai_cards`: per-card timing and word counts, error log, `--failures`, `--reparse`, `--retry-invalid`,
  `--max-usd`, `--dry-run`; accepts `DESCRIPTION:` headings.
- `build_pulp_words.mjs` (new); `dev/` for local-only scripts (gitignored).

## 0.5.0 (2026-10-28) - app; scorer stays 0.4.0

Page (BB Botstyle Score)
- New page (`index.html`, `js/app.js`, `css/app.css`) in the Farina webcode look, chibi Farina icon.
- Always-visible input bar: score a link, upload card PNG/JSON (several at once), or type/paste. Links and
  files score immediately; a picker chooses which fields count (description, personality, scenario, first
  message, example dialogue, each alternate greeting), and the score updates as boxes change.
- "Your cards": every scored card is kept in this browser with its scorer version; aggregate median,
  average and band counts; "I made this card" + AI-assistance slider (honour system); export JSON.
- Optional public list (`PUBLIC_RUNS` in site-config.js + `tools/public-runs-worker.js`).
- Leaderboard below the result (no more switching views), from our own scored card runs and reference sets,
  on the absolute 0–100 scale with band zones; your card and your saved cards appear in it.
- `slop-score.html` now forwards to `index.html`.

Scorer and tools
- `scoreCard(..., { includeExampleDialogue })` (off by default, so published scores don't change).
- `score_all.mjs` rows carry `upstream`, the original slop-score formula.
- `tools/build_card_leaderboard.mjs`, `data/upstream_norm.json`.

## 0.4.0 (2026-10-28)

Scoring output (scores unchanged; the version is now part of every result)
- `SCORER_VERSION` in `js/score-card.js`; every result carries `version`; the reference records the version it
  was built with and is rebuilt from `tools/score_all.mjs` output (Korshuk + Chub before Jul 2023 for now).
- `botstyle.js` applies an optional card-calibration drop list (`data/botstyle_card_drop.json`); none ships yet.

Page
- New look (css/app.css): dark/light themes, score card with band chip, percentiles in an ⓘ popover,
  cleaner leaderboard and report sections, mobile layout. The Slop / Not slop splash is gone; the unused
  upstream style.css was removed.

Tools
- `tools/score_all.mjs` (+ `score-all.cmd`): versioned scoring of every card dataset, resumable, overnight-safe;
  `tools/compare_scores.mjs` for regression checks between versions.
- `tools/card_calibrate.mjs`: genre/card calibration experiment (see BOTSTYLE.md).
- `generate_ai_cards.mjs`: models of each run listed in the header; skips a model after 3 failed requests.

## 0.3.0 (2026-10-28)

Scoring output (the score itself is unchanged)
- Each result says where it sits among 3,827 human 2023 cards and 940 AI-written cards
  (`reference` in `scoreCard()`, `data/botstyle_reference.json`, `tools/build_reference.mjs`).

Page
- Original slop-score metrics moved into a collapsed "Stats for nerds" section; the over-represented
  words/trigrams lists and the 76 MB human-profile download were removed.
- The "Slop / Not slop" splash follows the band (Common / Original) instead of a fixed 25.
- Panel and mobile modal share one renderer; how-it-works text rewritten for cards.
- GitHub Pages ready: `index.html`, `.nojekyll`, `noindex`; `js/site-config.js` + `tools/cors-proxy-worker.js`
  for Botbooru links on a hosted copy.

Tools
- `generate_ai_cards.mjs`: retries a card once at low reasoning effort when a thinking model uses the whole
  budget reasoning; `content_filter` is a soft flag; `--retry-invalid`.
- `score_url.mjs --fields description,first_mes` to score chosen fields only.

## 0.2.0 (2026-10-28)

Scoring
- No writing-style label under 40 prose words, for non-English text (now including non-Latin scripts),
  or for cards that are only W++/lists; previously these showed "Original" with a score of 0. An
  obvious chatbot tell still gets a label at any length.
- A refusal left in a card ("I'm sorry, but I cannot assist with that request.") is an obvious AI tell (+25).
- New, unscored: `texture` (paragraph evenness, sentence-length spread, vocabulary spread, word length)
  and `experimental.aiStyleLikelihood` (botstyle score + paragraph evenness). Shown on the page.

Page and tools
- Run locally with `npm start` or `start-local.cmd`; `tools/serve.mjs` adds a localhost-only proxy so
  Botbooru links work. Botbooru's card endpoint is set (`/download/json/<id>`).
- The page's "Upstream slop-score metrics" panel showed the botstyle score as the upstream Slop Score; fixed.
- `tools/score_url.mjs` also scores local card .json/.png files.
- `tools/generate_ai_cards.mjs` v2: 1 card per cell by default, paired seeds, fresh / antislop / rewrite
  modes, validity flags, cost tracking, dry run. `tools/build_seeds.py` builds clean seed sets.
- `tools/flatten_perchance.py`, `tools/texture_features.mjs` (texture experiment).
- Corner-case tests (degenerate input, labels, texture).

Docs
- BOTSTYLE.md: dataset inventory with counts, labelled AI-card results, corner cases, texture experiment.
- docs/FOREVERSE_NOTES.md: English summary of character-card-skills and what was tested.

## 0.1.0

The character-card fork of sam-paech/slop-score: AI-vs-human weighted word/phrase lists, sentence
structures, em-dash and obvious-tell points, card preprocessing (prose only), human tells and craft notes,
shared clichés, AI-favourite names, description formats and peers, bonus tags, card import (JSON/PNG) and
links, botstyle leaderboard, writing-style bands at 20/40, no CDN dependencies.
