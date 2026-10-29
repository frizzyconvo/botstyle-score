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
- **Every word and pattern list, how it's built and how it has changed:** [docs/LISTS.md](docs/LISTS.md)
- **Every other doc, and what each one is for:** [docs/README.md](docs/README.md)

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
| `tests/` | Test fixtures for `npm test` (the tests themselves are `tools/test.mjs`). |
| `docs/` | The docs index (`docs/README.md`), the list manifest (`docs/LISTS.md`), the to-do list (`docs/TODO.md`) and background notes (Foreverse's card-writing rubric). |
| `upstream/` | Leftovers from slop-score kept for reference: its model outputs, prompts, benchmark and leaderboard scripts. |
| `vendor/` | Bundled browser libraries (msgpack, part-of-speech tagger). |
| `eval/`, `dev/` | Local only, not in git: datasets, scoring runs and dev scripts. |

## Development

- **Tests:** `npm test`.
- **Doc shortcuts** (Windows): `npm run shortcuts` puts a shortcut to every doc, local-only ones included, in `docs/`.
- **Score every dataset** with the current scorer (versioned, resumable, about 45 minutes):
  `npm run score-all`. Cards already scored by that scorer version are never scored again: datasets that already have a
  file only get their new cards, and a run stopped halfway resumes from its checkpoint. `--force` (or `--rescore`) starts
  over. Results go to `eval/scores/v<version>/`; read `notes.md` there first. Then rebuild what
  the page uses with `npm run leaderboard` and `npm run reference`.
- **Next scorer version (0.9.1, prepared, not live):** `npm run score-all -- --scorer 0.9.1` scores into its own folder (tidying `eval/` leaves it alone);
  what it changes and how it tested is in [docs/TODO.md](docs/TODO.md).
- **Score only new cards** in a dataset (what the card generator runs after each round, for the live scorer and the prepared next one): `npm run score-all --
  --only generated_v2`. Cards already scored by this scorer version keep their rows.
- **Provenance set:** cards of known or suspected authorship go in `card-datasets/provenance-split-dataset/`, each
  with a row in its `provenance.csv` (provenance human / ai / mixed, confidence confirmed / suspected, AI share, which
  parts AI wrote, evidence). `npm run score-all -- --only provenance` scores them; see `tools/_provenance.mjs`.
- **Score cards at any path** (a folder of card PNG/JSON files, a Perchance characters folder, a .zip, optionally
  with a folder or pattern inside it, or one card file): `npm run score-path -- "<path>" --name <short name>`
  (`--label ai|human|mixed|unknown`). Only scores are written, to `eval/scores/v<version>/<name>.jsonl` with a section
  in that run's `notes.md`; the path is remembered so later full runs score it again (`--extras` lists them).
- **Current results at a glance** (read-only, safe during a scoring or generation run): `npm run results`
  (`--quick` skips the big JanitorAI file): what's running, every dataset's median and bands, each AI model's
  BBBScorer and original medians, residual and cost per card, and the numbers the page shows.
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

MIT (see [LICENSE](LICENSE)), except the bundled third-party parts listed in [NOTICE.md](NOTICE.md): the wordfreq
port (`js/wordfreq.js`, Apache 2.0) and its data (`data/large_en.msgpack.gz`, CC BY-SA 4.0) by Robyn Speer, the
word-list-derived `data/extra_words.txt` (MIT) and the vendor libraries.

Built on [slop-score](https://github.com/sam-paech/slop-score) by Samuel J. Paech (2025). Datasets and other
credits are listed in [BOTSTYLE.md](BOTSTYLE.md#credits).
