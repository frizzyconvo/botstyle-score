# upstream/

Leftovers from [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech, kept for reference and because a
few BBBScorer tools read them. Not used by the page.

| File | What it is |
|---|---|
| `results/` | Upstream's creative-writing and essay outputs from 22 models. Read by `tools/build_lists.py`, `tools/calibrate.mjs` and `tools/botstyle_leaderboard.mjs`. |
| `bench-model.mjs` | Upstream's benchmark generator (writes to `upstream/results/`). |
| `generate-leaderboard.mjs` | Upstream's model leaderboard builder (writes `data/leaderboard_results.json`, which the original slop-score formula normalizes against). |
| `WORDFREQ_PORT.md` | Notes on upstream's JavaScript port of wordfreq (`js/wordfreq.js`). |
| `sample-text.txt` | Upstream's sample AI story, used when testing the regexes by hand. |

Run the scripts from the repository root, e.g. `node upstream/generate-leaderboard.mjs --help`.
