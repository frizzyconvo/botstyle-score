# Changelog

Versions follow `MAJOR.MINOR.PATCH`. A change to how scores are computed (lists, weights, calibration,
bands) bumps MINOR and is noted here, so scores from different versions aren't compared by accident.
`package.json` holds the current version.

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
  (`reference` in `scoreCard()`, `data/botstyle_reference.json`, `tools/build_reference.py`).

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
