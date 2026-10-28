# Changelog

All notable changes to BB Botstyle Score. Two version numbers:

- **App** (`package.json`): moves for any page or tool change.
- **BBBScorer** (`SCORER_VERSION` in `js/score-card.js`, stored with every score): moves only when scores or labels
  can change. Scores from different scorer versions shouldn't be compared directly.

## [0.7.0] - 2026-10-28 · BBBScorer 0.6.0

### Changed
- **Scored fields:** description and first message by default, everywhere (page, tools, `scoreCard()`). Personality
  and scenario were previously always included by the scorer. Other fields are opt-in via the field picker or
  `fields`.
- **In-character dialogue counts as prose:** speech after a label (`A: "…"`) or in a bullet is scored. Interview
  questions (`Q: …`) still aren't.
- Field picker starts with only Description and First message ticked, for links, uploads and pasted JSON.
- Reference percentiles, band shares and the leaderboard need rebuilding with 0.6.0 scores (overnight rescore).

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
shared clichés, AI-favourite names, description formats, bonus tags, card import (JSON / PNG / links).
