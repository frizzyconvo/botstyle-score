# Third-party notices

The project is MIT-licensed (see [LICENSE](LICENSE)). These bundled parts keep their own licenses.

| Part | From | License |
|---|---|---|
| Starting code, slop lists, `upstream/` (model outputs, benchmark and leaderboard scripts), `data/leaderboard_results.json`, `data/slop_list*.json` | [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech | MIT (the first copyright line in [LICENSE](LICENSE)) |
| `js/wordfreq.js` (JavaScript port of wordfreq) | [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer | [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `data/large_en.msgpack.gz` (word frequencies) | wordfreq | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `data/extra_words.txt` (rare real words for the typo check) | derived from [word-list](https://github.com/sindresorhus/word-list) by Sindre Sorhus | MIT |
| `vendor/msgpack.min.js` | [@msgpack/msgpack](https://github.com/msgpack/msgpack-javascript) | ISC |
| `vendor/wink-pos-tagger.bundle.js` (part-of-speech tagger and its lexicon) | [wink-pos-tagger](https://github.com/winkjs/wink-pos-tagger) by GRAYPE Systems | MIT |

## wordfreq

Citation: Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437

wordfreq's data comes from Google Books Ngrams and Google Books Syntactic Ngrams; the Leeds Internet Corpus
(University of Leeds Centre for Translation Studies); Wikipedia; ParaCrawl; OPUS OpenSubtitles 2018 (from
OpenSubtitles); and the SUBTLEX word lists (SUBTLEX-US, -UK, -CH, -DE and -NL) by Marc Brysbaert et al. Full
license details: https://github.com/rspeer/wordfreq

Datasets used to build and test the lists are credited in [BOTSTYLE.md](BOTSTYLE.md#credits).
