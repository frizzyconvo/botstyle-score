# Changelog

Versions follow `MAJOR.MINOR.PATCH`. A change to how scores are computed (lists, weights, calibration,
bands) bumps MINOR and is noted here, so scores from different versions aren't compared by accident.
`package.json` holds the current version.

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
