# BB Botstyle Scorer

A rough automated read on how much a character card's description and greeting(s) lean on the stock words,
phrases and sentence habits of AI models, scored 0–100 by **BBBScorer**. It is not an AI detector, and it doesn't
measure whether you used AI or how good a card is.

Made by [frizzy_conversation_93532](https://botbooru.com/profile/78685). A pseudo-fork of
[slop-score](https://github.com/sam-paech/slop-score) by Sam Paech: it started from that code and keeps its MIT
license, but no longer tracks upstream (word lists, scoring, card handling and the leaderboard are rebuilt for
character cards).

**How it differs from slop-score:** slop-score counts every hit on its word and phrase lists the same, and its
lists come from 10 models' essays and stories (so they include essay and business words). BBBScorer weights each
word and phrase by how much more AI fiction uses it than human fiction, adds sentence patterns, scores only the
prose, scores the description and first message separately, and puts 100 at the most AI-styled tenth of AI-written
cards instead of stretching each measure between 22 models and a human baseline. Details:
[BOTSTYLE.md](BOTSTYLE.md#how-bbbscorer-differs-from-slop-score).

- **How it works, and what every band, tag, format and label means:** [BOTSTYLE.md](BOTSTYLE.md)
- **What changed in each version:** [CHANGELOG.md](CHANGELOG.md)

## Use it

**In the browser:** paste a Chub or Botbooru link, upload card PNG or JSON files (several at once is fine), or type
or paste text. Everything is scored in your browser; nothing is sent anywhere unless you share a card to the
public list, which never receives card text.

**Locally:** install Node 18+, then double-click `start-local.cmd` (Windows) or run `npm install` once and
`npm start`, and open http://localhost:8787/. The page can't run from a file path.

**Command line:** `node tools/score_url.mjs <link | card.json | card.png>`.

**In your own code** (browser or Node):

```js
import { loadAll, scoreCard } from './js/score-card.js';
await loadAll('./data/');
const r = scoreCard({ description, first_mes, alternate_greetings });
r.score; r.band.label; r.format.label; r.tags; r.version;
```

## Versions

Two version numbers, both in [CHANGELOG.md](CHANGELOG.md):

- **BBBScorer** (`SCORER_VERSION` in `js/score-card.js`): moves only when scores or labels can change. It's in the
  page title and stored with every score. Scores from different scorer versions shouldn't be compared directly.
- **App** (`package.json`): moves for any page or tool change.

## Repository layout

| Path | What's there |
|---|---|
| `index.html`, `css/`, `assets/` | The page. |
| `js/` | The scorer and the page script. `score-card.js` is the entry point; `card-style.js` holds format names; `app.js` is the page. |
| `data/` | Word and phrase lists, calibration, the leaderboard and the reference distributions the page grades against. |
| `tools/` | Building lists, scoring datasets, building the leaderboard and reference, generating AI test cards, tests, the local server and the Cloudflare Workers (card proxy, public list). Every tool takes `--help`. |
| `tests/` | Test fixtures for `npm test`. |
| `docs/` | Background notes (e.g. Foreverse's card-writing rubric) and the to-do list (`docs/TODO.md`). |
| `upstream/` | Leftovers from slop-score kept for reference: its model outputs, benchmark and leaderboard scripts. |
| `vendor/` | Bundled browser libraries (msgpack, part-of-speech tagger). |
| `eval/`, `dev/` | Local only, not in git: datasets, scoring runs and dev scripts. |

## Development

- **Tests:** `npm test`.
- **Score every dataset** with the current scorer (versioned, resumable, about 45 minutes):
  `npm run score-all`. Results go to `eval/scores/v<version>/`; read `notes.md` there first. Then rebuild what
  the page uses with `npm run leaderboard` and `npm run reference`.
- **Score cards at any path** (a folder of card PNG/JSON files, a Perchance characters folder, a .zip, optionally
  with a folder or pattern inside it, or one card file): `npm run score-path -- "<path>" --name <short name>`
  (`--label ai|human|mixed|unknown`). Only scores are written, to `eval/scores/v<version>/<name>.jsonl` with a section
  in that run's `notes.md`; the path is remembered so later full runs score it again (`--extras` lists them).
- **Per-model report** for the generated AI cards (BBBScorer vs the original score, regression, residuals, cost):
  `node tools/model_report.mjs`.
- **Compare with the previous run:** `node tools/compare_scores.mjs --previous`.
- **Tidy `eval/`:** `node tools/organize_eval.mjs` (the current run stays in `eval/scores/`, older ones move to
  `eval/old/`).
- **Linux:** the scorer, tools, tests and local server run on Linux; the multi-step batch scripts are Windows-only
  for now (see `docs/TODO.md`).
- **Hosting:** see `js/site-config.js` for the card proxy and the optional public list (Cloudflare Workers in
  `tools/`).

## License and credits

MIT (see [LICENSE](LICENSE)), except the wordfreq port: `js/wordfreq.js` is Apache 2.0 and
`data/large_en.msgpack.gz` is CC BY-SA 4.0 ([wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer;
Speer, R. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437).

`data/extra_words.txt` (rare real words for the typo check) is derived from
[word-list](https://github.com/sindresorhus/word-list) by Sindre Sorhus (MIT).

Built on [slop-score](https://github.com/sam-paech/slop-score) by Samuel J. Paech (2025). Datasets and other
credits are listed in [BOTSTYLE.md](BOTSTYLE.md#credits).
