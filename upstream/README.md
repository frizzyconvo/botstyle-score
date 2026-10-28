# upstream/

Leftovers from [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech, kept for reference and because a
few BBBScorer tools read them. Not used by the page.

| File | What it is |
|---|---|
| `results/` | Upstream's creative-writing and essay outputs from 22 models. Read by `tools/build_lists.py` and `tools/calibrate.mjs`. |
| `bench-model.mjs` | Upstream's benchmark generator (writes to `upstream/results/`). |
| `prompts.json` | The writing prompts `bench-model.mjs` sends (moved here from `data/`, since nothing else uses them). |
| `generate-leaderboard.mjs` | Upstream's model leaderboard builder (writes `data/leaderboard_results.json`, which the original slop-score formula normalizes against). It needs slop-forensics' `human_writing_profile.json`, which isn't kept in `data/` (75 MB, nothing else uses it): copy it to `data/` before running. |
| `WORDFREQ_PORT.md` | Notes on upstream's JavaScript port of wordfreq (`js/wordfreq.js`). |
| `sample-text.txt` | Upstream's sample AI story, used when testing the regexes by hand. |

Run the scripts from the repository root, e.g. `node upstream/generate-leaderboard.mjs --help`.
