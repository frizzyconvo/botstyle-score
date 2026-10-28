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

---

# How BBBScorer differs from slop-score

## Purpose and input

* What it scores: slop-score ranks models on long essays and stories. BBBScorer gives one score for one card: its description and first message by default, with other fields and alternate greetings optional.
* Getting the card in: it takes Chub and Botbooru links, V1/V2/V3 and Pygmalion JSON, and card PNGs. There’s a field picker for choosing which parts count.
* Prose only: W++, PLists, key-value blocks, bullets, headers and pasted jailbreaks are counted and shown but left out of the score. In-character dialogue counts.

## How the word and phrase lists are built

* Weighting: upstream ranks words by how often AI uses them compared with general English, and ranks phrases only by how often AI uses them. BBBScorer weights every word, two-word and three-word phrase by how often AI fiction uses it compared with human fiction.
* Source text: it uses creative-writing prompts only. Words tied to the prompt’s topic, number phrases and character names are dropped, so a card named Elara isn’t penalised every time her name comes up.
* Matching: upstream’s matching meant many three-word phrases could never fire. BBBScorer matches with contractions split the same way as when the lists were built, and doesn’t count a two-word phrase again when it sits inside a matched three-word one.
* Repeats: a phrase used k times counts w × (1 + ln k) rather than once per hit.

## How the score is put together

* Normalising: upstream stretches scores between the averages of its 23 leaderboard models, so a single three-word phrase could cost a human writer about 13 points. BBBScorer compares rates with the 90th percentile of AI-written character cards, and repeats are damped by density, so a card's length doesn't move its score.
* Third part of the score: upstream’s 15% was three-word phrases. Here it’s sentence structures: “not X but Y” plus 27 patterns (“a flicker of”, “the air was thick”, “a mix of X and Y”…). Each pattern was kept only if it separated human from AI text in both test sets.
* Extras: em-dashes add up to 10 points. Clear chatbot leftovers (preambles, sign-offs, refusals, chat-template tokens) add 40 each, up to 80.
* Read-outs: there’s an uncertainty range and a low-confidence warning under 150 words of prose. Human tells, craft notes, AI-favourite names, card format, genre, pulp score, archetype and texture are shown but not scored.
* Bands: 50 / 75, set on 5,313 human 2023 cards and 1,061 AI-written cards. Mixed cards (description and greeting far apart) are flagged.

## Results on the shared test sets

* SlopReview: AUC 0.930 → 0.977. Humans flagged above 25 dropped from 9.9% to 2.6%.
* Gutenberg antislop-DPO: AUC 0.973 → 0.996. Humans flagged above 25 dropped from 2.5% to 0.1%.

## Datasets

* For building and testing the lists:
  * SlopReview (DrRiceIO7): Reddit WritingPrompts stories against stories from about 22 models. It’s the main test set, but optimistic.
  * Gutenberg antislop-DPO (sam-paech): the independent test.
  * Upstream’s results/ outputs from 22 models.
  * Nitral-AI’s slop-forensics profile of human Reddit writing, used as the human side of the weighting.
* Human and mixed cards:
  * Korshuk: the cleanest human pool, mostly W++.
  * AUTOMATIC/jaicards: 188k JanitorAI cards. Used for the 2023 baseline, the trends over time and by tag, and as seeds for generating cards.
  * raincandy-u Chub cards: dated 2023–2026, so they show the change over time.
  * Perchance: a modern mixed set, not treated as human.
* AI cards:
  * SPB-2602 (marcodsn): Kimi and GLM personas.
  * Foreverse’s character-card-skills example cards: AI cards written to avoid AI flavour, used as hard cases.
* Generated cards
  * Claude, GPT, DeepSeek, Kimi, GLM, Llama, Mistral, TheDrummer, Sao10k, Anthracite, Nous, MythoMax. The generator has a rewrite mode for human text an AI has reworded.

## Outside references

* pixelnull’s SloppySeconds list: a source for several sentence patterns.
* TheDrummer’s UnslopNemo list of 65 target phrases, checked against cards with phrase_check.
* Foreverse’s character-card-skills: their scoring rubric, card categories, and a blind test where AI judges mostly got human vs AI backwards. That test is part of why BBBScorer calls itself not an AI detector.
* The ARB paper (arXiv 2607.29539): its finding that detectors fail on human text an AI has reworded led to the generator’s rewrite mode.
* From upstream: the wordfreq port, plus the local part-of-speech tagger, now also usable from Node scripts.

## Tooling upstream doesn’t have

* Scoring runs: versioned overnight scoring that resumes where it stopped, and regression checks between scorer versions.
* Reference and leaderboard: builders for the human-card reference and the card leaderboard, plus the calibration script.
* Generation: the card generator, with a cost cap and retries.
* Word lists: the pulp word-list builder and the phrase checker.

---

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
