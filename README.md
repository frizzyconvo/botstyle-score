# BB Botstyle Score

A rough automated read on how much a character card's description and greeting(s) lean on stock phrasings and words of
AI models. It is not an AI detector, and it does not measure whether you used AI or how good a card is.

A **pseudo-fork** of [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech: it started from that code and
keeps its MIT licence, but no longer tracks upstream and has moved well away from its intent (word lists, scoring,
card handling and the leaderboard are rebuilt for character cards). Version in `package.json` (app) and
`js/score-card.js` (`SCORER_VERSION`), history in [CHANGELOG.md](CHANGELOG.md), method and results in
[BOTSTYLE.md](BOTSTYLE.md).

**Run it locally:** install Node 18+, then double-click `start-local.cmd` (Windows) or run `npm start`, and open
http://localhost:8787/. Paste a Chub or Botbooru link, upload card PNG/JSON files, or type text. Command line:
`node tools/score_url.mjs <link | card.json | card.png>`. Tests: `npm test`. Score every dataset (overnight,
versioned, for regression checks): `npm run score-all`, then `npm run leaderboard` and `npm run reference`.
Every tool takes `--help`. Local-only helper scripts go in `dev/` (not committed).

The original slop-score README follows for reference.

---

# Slop-Score: Writing Metrics Analyzer

An in-browser text analysis tool that detects AI-generated "slop" patterns, repetitive language, and "Not X, but Y" constructions in writing.

Try it at: https://eqbench.com/slop-score.html

## Implementation Details

### Slop List Matches
First, the evaluated model generates 150 creative writing outputs and 150 essay outputs. Next, its writing is matched to a precomputed list of words and trigrams which are overused in AI text compared to human baselines.

### Not-X-But-Y Pattern Detection

The not-x-but-y detector implements a 2-stage regex pipeline:

**Stage 1: Surface Patterns**
- Runs 10 regex patterns on normalized text
- Patterns include: "not X, but Y", dash forms, cross-sentence contrasts
- Maps matches to sentence spans

**Stage 2: POS-Tagged Patterns**
- Tags text with wink-pos-tagger (maps Penn Treebank tags to simplified VERB/NOUN/ADJ/ADV)
- Runs 35 regex patterns on tagged stream
- Maintains character offset mapping between tagged stream and raw text
- Uses binary search for efficient offset lookups

### Slop Score Calculation
The Slop Score is a weighted composite metric designed to detect AI-generated text patterns:

- 60% - Slop Words: Frequency of individual words that appear unnaturally often in LLM outputs
- 25% - Not-x-but-y Patterns: Frequency of contrast patterns like "not just X, but Y" which are overused by AI
- 15% - Slop Trigrams: Frequency of 3-word phrases that appear unnaturally often in LLM outputs

## Usage

### Analysing Your Text
To compute a slop score on your own text, visit https://eqbench.com/slop-score.html and click "Analyse text". A slop score and related metrics will be computed locally, in browser.

Alternatively, serve this directory with:
`python -m http.server`
and browse to:
http://localhost:8000

### Benchmarking Models
A benchmarking script is also included. It generates 300 outputs from the same set of standardised prompts (Creative writing and essays) used for the leaderboard.

Use `bench-model.mjs` to generate text completions from any OpenAI-compatible API:

```bash
# Setup: Create .env file with your API credentials
cp .env.example .env
# Edit .env and set BASE_URL and API_KEY

# Basic usage (uses .env)
./bench-model.mjs --model "openai/gpt-4o"

# Or override with command-line args
./bench-model.mjs \
  --model "openai/gpt-4o" \
  --base-url "https://openrouter.ai/api/v1/chat/completions" \
  --api-key "your-key"

# Custom settings
./bench-model.mjs \
  --model "meta-llama/llama-3.1-70b-instruct" \
  --workers 16 \
  --max-tokens 4096 \
  --n-prompts 300
```

**Features:**
- Parallel generation with configurable worker count
- Resume support (skips already-generated prompts)
- Atomic file writes for safe concurrent operations
- Progress tracking and error reporting
- Saves to `results/[model-id].json` by default

**Parameters:**
- `--model` (required): Model identifier
- `--base-url`: API endpoint (default: from .env BASE_URL or OPENAI_BASE_URL)
- `--api-key`: API key (default: from .env API_KEY or OPENAI_API_KEY)
- `--workers`: Number of parallel requests (default: 8)
- `--max-tokens`: Max tokens per generation (default: 8096)
- `--n-prompts`: Number of prompts to use (default: 300)
- `--max-retries`: Max retries per request (default: 3)
- `--prompts`: Path to prompts file (default: data/prompts.json)
- `--results`: Custom output path

**Environment variables (.env file):**
- `BASE_URL`: API endpoint (e.g., `https://openrouter.ai/api/v1/chat/completions`)
- `API_KEY`: Your API key

### Generating the Leaderboard

Use `generate-leaderboard.mjs` to analyze all results and create the leaderboard:

```bash
# Generate leaderboard from all results/*.json files, skipping ones already computed
./generate-leaderboard.mjs

# Force recalculation of all models
./generate-leaderboard.mjs --force

# Force recalculation of human baseline (BYO human writing samples)
./generate-leaderboard.mjs --force-recalc-human
```

**Metrics calculated:**
- Slop list matches (word and trigram)
- N-gram repetition score
- Not-x-but-y contrast patterns
- Lexical diversity (MATTR-500)
- Flesch-Kincaid grade level
- Average sentence/paragraph length
- Dialogue frequency
- Top over-represented words, bigrams, and trigrams

## License

This project uses a dual-license structure:

### MIT License (Primary Components)

The following components are licensed under the MIT License:
- Slop Score computation and dependencies (human writing profile, slop lists in `data/`)
- Results datasets in `results/`
- JavaScript code in `js/` (excluding `wordfreq.js`)
- All code in project root (`./`) including leaderboard generation and website
- `slop-score.html` and related HTML files

See [LICENSE](LICENSE) for full MIT license text.

### Apache 2.0 & CC-BY-SA 4.0 (wordfreq Components)

The following components retain their original wordfreq licensing:
- `js/wordfreq.js` - Apache License 2.0
- `data/large_en.msgpack.gz` - Creative Commons Attribution-ShareAlike 4.0

This project includes a JavaScript port of [wordfreq](https://github.com/rspeer/wordfreq), used for baseline frequency analysis.

**Citation:**

Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437

```bibtex
@software{robyn_speer_2022_7199437,
  author       = {Robyn Speer},
  title        = {rspeer/wordfreq: v3.0},
  month        = sep,
  year         = 2022,
  publisher    = {Zenodo},
  version      = {v3.0.2},
  doi          = {10.5281/zenodo.7199437},
  url          = {https://doi.org/10.5281/zenodo.7199437}
}
```

**wordfreq data sources:**
- [Google Books Ngrams](http://books.google.com/ngrams) and [Google Books Syntactic Ngrams](http://commondatastorage.googleapis.com/books/syntactic-ngrams/index.html)
- [The Leeds Internet Corpus](http://corpus.leeds.ac.uk/list.html) from the University of Leeds Centre for Translation Studies
- [Wikipedia](http://www.wikipedia.org)
- [ParaCrawl](https://paracrawl.eu), a multilingual Web crawl
- [OPUS OpenSubtitles 2018](http://opus.nlpl.eu/OpenSubtitles.php), originating from [OpenSubtitles](http://www.opensubtitles.org/)
- SUBTLEX word lists (SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE, and SUBTLEX-NL) created by Marc Brysbaert et al., available at http://crr.ugent.be/programs-data/subtitle-frequencies

## How to Cite

If you use slop-score in your research, please cite it as:

```bibtex
@misc{paech2025slopScore,
      title={slop-score},
      author={Samuel J. Paech},
      year={2025},
      howpublished={\url{https://github.com/sam-paech/slop-score}},
      note={GitHub repository}
}
```
