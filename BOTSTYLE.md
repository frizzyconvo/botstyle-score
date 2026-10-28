# BBBScorer documentation

How BBBScorer (the BB Botstyle Scorer) works, what every number, band, tag and label on the page means, and how it
was tested. The quick start is in [README.md](README.md); version history is in [CHANGELOG.md](CHANGELOG.md).

Numbers below are from the **BBBScorer v0.8.1** scoring run.

**Contents:** [What it is](#what-it-is) · [What gets scored](#what-gets-scored) · [The score](#the-score) ·
[Bands](#bands) · [Formats](#formats) · [Greeting](#greeting) · [Tags](#tags) · [Archetypes](#archetypes) ·
[Genre and pulp read](#genre-and-pulp-read) · [Other read-outs](#other-read-outs-not-scored) ·
[Leaderboard](#leaderboard) · [Public list](#public-list) · [Known limits](#known-limits) ·
[How it was tested](#how-it-was-tested) · [Data and references](#data-and-references) · [Glossary](#glossary) · [Credits](#credits)

## What it is

BBBScorer gives a character card a 0–100 read on how much its writing leans on the stock words, phrases and
sentence habits of AI models. It is **not** an AI detector: careful AI-assisted writing can score low, and human
writing in some genres can score high. It says nothing about whether a card is good.

## What gets scored

- **Fields:** the description and the first message by default. Personality, scenario, example dialogue and
  alternate greetings can be added in the field picker (or `fields` in `scoreCard()`).
- **Prose only:** W++, PLists, key-value lines, short bullets, semicolon trait lists, headers and pasted model
  instructions ("jailbreaks") are counted and shown but left out of the score. The word lists were built from
  prose, and running them over lists distorts the rate.
- **In-character dialogue counts**, including speech after a label (`A: "I… don't know."`) or in a bullet.
  Interview questions (`Q: …`) don't.
- **Minimum length:** under 150 words of prose the result is marked low confidence. Under 40, or for non-English
  text, there's no band.

## The score

| Part | Weight | What it counts |
|---|---|---|
| AI-favored words | 60% | Words AI fiction uses much more often than human fiction, each weighted by that ratio. |
| AI-favored phrases | 25% | Two- and three-word phrases, weighted the same way. |
| Sentence structures | 15% | "Not X but Y" and the other patterns in [Sentence structures](#sentence-structures). |

Each part is a rate per 1,000 prose words, scaled so 100 matches the most AI-styled tenth of AI-written character
cards. Repeats count with diminishing weight, judged by density: an item seen k times in 700 words counts
w × (1 + ln k), and a card twice as long needs twice the hits for the same weight, so length alone doesn't move
the score.

**Description and first message** are scored separately, then blended into the card score: each counts in
proportion to its prose words, up to 400 words each, so a long description can't drown out the greeting. A part
needs 60 words of prose to count on its own.

**Extra points** on top:

- **Em-dashes:** above 6 per 1,000 words they add up to 10 points (the full 10 at 16 per 1,000). Human cards rarely
  pass 6; AI cards sit around 10.
- **Chatbot leftovers:** 40 points each, up to 80. See [Chatbot leftovers](#chatbot-leftovers).

**Range:** the "range" under the score is ±1 standard error, a rough idea of how much the number could move with
a little more or less text.

**Original slop score:** Sam Paech's original slop-score formula on the same text (description and first message
together), shown under the score for comparison. It matches EQ-Bench's slop-score page exactly. More of its
metrics are under "Stats for nerds".

**BBBScorer vs the original slop score** (a section of every result) lines the two up side by side: what text each
counts, their word, phrase and pattern rates, extras, and what 100 means on each, then the reasons they differ on
that card. Big gaps are normal, mostly for two reasons:

- **Different scales.** The original stretches each measure between the lowest and highest of 23 entries (22 models
  and a human baseline) on stories and essays, so character cards, AI-written ones included, mostly land under 30 on
  it (AI-written cards: median about 7–18). BBBScorer puts 100 at the most AI-styled tenth of AI-written cards.
- **Different lists, counted differently.** The original's list comes from essays and stories ("murmurs",
  "tapestry", "delve", "pivotal"), and every hit counts the same. A lot of card-writing AI vocabulary isn't on it,
  so an obviously AI-written card can have zero hits and land on the original's floor of 1.2. BBBScorer weights
  every word and phrase by how much more AI fiction uses it than human fiction, and adds sentence patterns.

BBBScorer also scores only prose (lists and instructions dilute the original's rate) and scores the description and
first message separately. Botbooru shows its own slop-score figure; it doesn't always match the original formula on
the description and first message (on one card it matched the formula run over every greeting instead).

**The ⓘ next to the score** says where it sits among 2023 cards (mostly human) and AI-written cards. That comparison
says more than the number on its own.

### Sentence structures

Each pattern was kept only if it separated human from AI text in both test sets (SlopReview and Gutenberg).
Weight per hit in brackets; "provisional" patterns are card-specific and backed by one AI source so far.

| Pattern | Weight | Example |
|---|---|---|
| Not-x-but-y contrast | 2.0 | "not just a warrior, but a protector" |
| "a hint / flicker / ghost of …" | 3.48 | a flicker of amusement |
| "a testament / reminder to …" | 3.31 | a testament to her resilience |
| "the air was thick / heavy / charged" | 2.89 | the air was thick with tension |
| "maybe, just maybe" | 2.64 | maybe, just maybe |
| "almost imperceptible" / "barely above a whisper" | 2.53 | an almost imperceptible shimmer |
| "seemed to sense / consider / shimmer" | 2.53 | the room seemed to hold its breath |
| Simile to an abstraction ("like a promise") | 2.42 | hung between them like a promise |
| "a mix of X and Y" | 2.19 | a mix of fear and fascination |
| "the weight of …" | 2.17 | the weight of her responsibility |
| "eyes that held / promised …" | 2.13 | eyes that held a thousand secrets |
| Stock beats (rare clichés pooled together) | 2.12 | a knowing smile; eyes glinting with mischief |
| "a low hum / thrum" | 1.82 | the low hum of the city |
| "a tapestry / symphony / dance of …" | 1.78 | a whirlwind of joyous energy |
| "the silence / words hung heavy" | 1.75 | the question hung in the air |
| "voice a low rumble / velvet caress" | 1.68 | her voice a velvet caress |
| Named emotion ("felt a surge / pang of …") | 1.62 | felt a pang of guilt |
| RP-reply tells ("conspiratorial", "voice low", "punctuating"), provisional | 1.5 | she leaned in, conspiratorial, voice low |
| "as if the world / time itself …" | 1.41 | as if the world had paused |
| "with practiced / languid ease" | 1.13 | with practiced ease |
| Card not-x-but-y ("she is not just a thief, she is a survivor") | 0.9 | Vex isn't just a rogue. She's a legend. |
| Rhetorical question answered | 0.86 | And the worst part? She liked it. |
| "found herself …ing" | 0.86 | found herself smiling |
| "unspoken words / tension" | 0.83 | thick with unspoken words |
| "every X, every Y" | 0.82 | every glance, every touch |
| "the kind of X that …", provisional | 0.75 | the kind of person who remembers birthdays |
| "equal parts X and Y", provisional | 0.75 | equal parts charm and menace |
| Banter dialogue tag (…," she teased / purred / smirked) | 0.72 | "Miss me?" she purred |
| "it was as if" | 0.7 | it was as if the world had stopped |

### Chatbot leftovers

The model talking to whoever prompted it. **Scored** (40 points each, up to 80):

| Leftover | Example |
|---|---|
| Chatbot preamble | "Certainly! Here is…", "Sure, I'd be happy to…" |
| "Here is the character description:" | |
| Chatbot sign-off | "I hope this helps!", "Let me know if you'd like changes" |
| The generator talking about itself or refusing | "As an AI language model…", "I'm sorry, but I can't…" |
| Chat or prompt template tokens | `<\|im_start\|>`, `[INST]`, `### Response:` |
| Generator commentary on its own output | "This description captures…" |

**Worth a look** (shown, not scored, because people produce these too): Human:/Assistant: transcript lines, JSON
card-field residue (`"first_mes": "…"`), unfilled placeholders ("[Insert name]", lorem ipsum), word-count or
"Option 1:" notes, text that ends mid-sentence.

## Bands

Tentative, still being calibrated.

| Score | Band | Fun tagline | 2023 cards (mostly human) | AI-written cards |
|---|---|---|---|---|
| under 40 | **Original-ish** | *Meatbag adjacent* | 94% | 39% |
| 40–60 | **Mixed** | *Mixed signals* | 4% | 34% |
| 60 and up | **Common** | *Might just be slop* | 2% | 28% |
| (too short or not English) | **Low confidence** / no band | | | |

The band names say how common the card's phrasing is in AI writing. The taglines are just for fun and shown next
to them.

The cut-offs keep false positives on human cards low, so a low score doesn't clear anyone. 2023 cards: 108,129
(Korshuk, JanitorAI, Chub), median 12. AI-written cards: 1,520, median 47.

**The 2023 set is mostly human, not all human.** It's the closest thing to a human baseline: cards written before
AI writing tools were common. But reading the cards where BBBScorer and the original score disagree most turned
up ChatGPT-, Claude- and Bing-written cards from 2023 among them. Some of its 2% in Common are real AI cards, so
the false-positive rate on human writing is somewhat lower than these numbers suggest.

**Mixed card** (flag, not a band): the description and the first message both have 150+ words of prose and land
25+ points apart, for example a hand-written description with an AI-written greeting. The card score stays a
blend; taking the higher part raised false positives on human cards, because short greetings are noisy.

## Formats

Every card's description (description + personality + scenario) gets one format. Format isn't scored. It says
how the card is laid out, and the card is compared with 2023 human cards in the same format ("vs 2023 cards in
the same format: words 83rd pct…"; ⚑ marks the 90th percentile or above). The ⓘ next to the format on the
page lists all of them, and the mix of layouts that decided it.

| Format | What it is |
|---|---|
| **Free prose** | Paragraphs of prose with no headers or lists. |
| **Formatted prose** | Prose paragraphs under section headers ("**Appearance:**" + a paragraph). |
| **Lists** | Markdown bullet lists and "Label: value" lines. |
| **Compact** | Token-saver formats: W++, PList, JSON / YAML / XML key-values. |
| **In voice** | Written in the character's own voice: a first-person monologue, Ali:Chat or an interview. |
| **Structured + prose** | Compact or list blocks alongside a real share of prose. |
| **Boilerplate + prose** | Instructions or narrator rules alongside a real share of prose. |
| **Boilerplate** | Mostly instructions, narrator rules or pasted jailbreaks, with little character prose. |

How it's decided, in order: boilerplate (60%+ instructions and under 150 prose words) → in voice (Ali:Chat lines
or first person outside dialogue) → compact or lists (half or more structured) → boilerplate + prose →
structured + prose → formatted prose (three or more header + paragraph sections) → free prose.

The same names are used for the **request styles** on the leaderboard (see [Leaderboard](#leaderboard)) and in
the scoring-run notes. Format ids, as stored with scores: `free_prose`, `formatted_prose`, `lists`, `compact`,
`in_voice`, `structured+prose`, `boilerplate+prose`, `boilerplate`.

**Card type** is shown when a card isn't a single character: *scenario / rpg* (narrator, game master, stats or
inventory), *multi / character* (two or more named characters), *tool* (assistants, card builders).

## Greeting

The first message is described by layout, point of view and tense. Not scored.

| Layout | What it is |
|---|---|
| **Asterisks + quotes** | \*Actions in asterisks\*, "speech in quotes". |
| **Asterisks** | \*Actions in asterisks\*, speech unquoted. |
| **Novel style** | Plain narration with "quoted speech", like a book. |
| **Mixed** | Some asterisk actions and some quoted speech, not paired up. |
| **Plain** | No asterisks or quotes. |

Point of view: second person ("you"), first person ("I"), third person ("she / he / they") or unclear. Tense: past,
present or mixed. "Ends on a question" is noted too.

## Tags

Just-for-fun badges for cards that stand out. Not scored. Each one fires for roughly the top 0.2–3.5% of real
cards, so a tag means "this card is unusual", not "this card is bad".

| Tag | When it appears | Share of real cards |
|---|---|---|
| **Copyedit-proof** | Lots of typos and grammar slips (6+ human tells, 25+ per 1,000 words). Bruh, autocorrect predates deep learning, ya know. | 3.4% |
| **Clichemonger** | Lots of clichés that humans and models both lean on (3+, 4+ per 1,000 words). | 1.7% |
| **A card for ants** | Mostly boilerplate and rules (30%+), with 120 words or fewer of actual character. | 0.4% |
| **User puppeteer** | Writes what {{user}} does, says or feels in 2+ places; models copy this. | 3.1% |
| **Wall of text** | At least one paragraph of 500+ words. | 1.8% |
| **No one knows you're a chatbot on the internet** | A very long card (3,000+ permanent tokens) that also scores 60+. | 0.2% |
| **{{char}} writes card** | Most description sentences (10+, over half) start with {{char}}. | 3.5% |
| **Of course that's your name** | Uses 2+ names models are famously fond of (Elara, Kael, Thorne…). | 0.2% |

## Archetypes

One experimental, just-for-fun label per card, from its format, greeting and genre: a genre adjective plus a
noun, e.g. "Gothic novelist", "Sci-fi dossier-keeper", "The minimalist" (no adjective for general cards).

| Noun | When |
|---|---|
| **minimalist** | Compact format (W++, PList, JSON): every token earns its keep. |
| **list-maker** | Lists: bullet points and key-value lines. |
| **method actor** | In voice: written in the character's own voice. |
| **dossier-keeper** | Formatted prose: sections and headers, like a character file. |
| **tinkerer** | Structured + prose: compact or list blocks mixed with prose. |
| **rules-lawyer** | Boilerplate + prose: comes with a rulebook. |
| **roleplayer** | Free prose with a second-person greeting and \*asterisk\* actions. |
| **novelist** | Free prose with a narrated, novel-style greeting (third person or quoted speech). |
| **storyteller** | Free prose all the way down, greeting and all. |

Genre adjectives: High-fantasy (fantasy), Gothic (horror / dark), Sci-fi, Romantic (romance), Slice-of-life
(modern), Swashbuckling (action / adventure).

**Size badges:** **Doorstopper** (1,500+ prose words) and **Bite-sized** (under 350 words in the scored fields, lists included; about half of 2023 JanitorAI cards). A bite-sized card's score rests on few words, so the result also says to treat it as rough.

## Genre and pulp read

**Genre** (experimental): Fantasy, Horror / dark, Sci-fi, Romance, Modern / slice of life, Action / adventure or
General, from genre keywords per 1,000 prose words plus a boost for matching card tags. A second genre is shown
when it's close.

**Pulp read** (experimental, not scored): pulpy fantasy, horror, action and romance writing shares a lot of
vocabulary with AI models ("ancient", "shadows", "crimson"). The pulp read shows how much of a card's AI-favored
word weight is genre vocabulary that human genre cards use about as often, and what the score would be without
it. When pulp vocabulary is 15%+ of the word weight and the card scores 40+, it gets one of two flags:

- **Reads as pulp, not AI-styled:** without the genre vocabulary it would drop under 40.
- **Pulpy and AI-suspect:** it stays at 40+ even without it.

## Other read-outs (not scored)

- **Human tells:** mistakes models almost never make. Lowercase "i" in narration, contractions without
  apostrophes, common misspellings, likely typos (a word the English frequency list doesn't know, or barely knows,
  that is one letter off a common word: "beutiful", "walkd"; rare real words such as "gambeson", regular derivations
  such as "tallish" or "purpleish", and sentences in another language are left out), txt-speak, word
  mix-ups ("could of", "then" for "than", "your" for "you're", "it's own", "their is", "loose" for "lose"),
  doubled words, space before punctuation, missing space after punctuation, two-dot or 4+-dot ellipses,
  repeated !!! / ???, typewriter dashes ("--"), sentences starting lowercase, unclosed \*actions\* or quotes,
  "{{char}} is <Name>", non-standard macros ({{character}}, {name}), "the {{user}}".
- **Craft notes:** card-writing issues anyone can introduce. Mixed RP format (\*She says,\* "…"), writing
  {{user}}'s actions or words, narrating what "you" do or feel, a gendered pronoun right after {{user}},
  jailbreak or permission lines in the card, runs of sentences all starting with the same name.
- **Shared clichés:** phrases humans and models both use. Counted, not scored.
- **AI-favorite names:** names models are fond of (Elara, Kael, Thorne…). Characters can have these names too.
- **Repeated wording:** inside the description, inside the first message, and shared between them. Human cards
  repeat themselves more often than AI-written ones, so it's a writing note, not an AI sign. Alternate greetings
  reusing the first message are noted as normal.
- **Texture** (experimental): paragraph evenness. AI text keeps paragraphs close to the same length (length CV
  around 0.32 vs 0.67 for 2023 human cards). Shown with an "AI-style likelihood" that combines it with the score.
  Careful human writers can be even too.
- **Stats for nerds:** the original slop-score metrics (slop words and trigrams per 1,000, not-x-but-y rate,
  Flesch-Kincaid grade, sentence and paragraph length, dialogue, MATTR), on the scored fields and on every field.
  On character cards they barely separate human from AI writing.

## Leaderboard

**AI models:** character cards each model wrote for this test from the same requests: the name, creator note and
tags of real 2023 human cards, asked for in seven **request styles**:

| Request style | What was asked for |
|---|---|
| **Lazy prompt** | "make me a character bot for X, description and first message": the format is left to the model. |
| **Free prose** | Plain paragraphs, no headers or lists. |
| **Formatted prose** | A description with sections like Appearance, Personality and Backstory. |
| **Lists** | Markdown bullet lists. |
| **Compact** | W++ or PList. |
| **In voice: first person** | The description written as the character speaking. |
| **In voice: interview** | Ali:Chat-style Q&A exchanges. |

Only these plain requests are ranked. Each model's report (click a row) also shows cards written with
"don't sound like AI" instructions and rewrites of human cards.

On each row: the bar is the middle half of that set's cards, the line is the median, the big number is the
BBBScorer median and "orig" the original slop-score median. Under each model: **styles** = the lowest to highest
median across its request styles (lazy prompt aside), and **lazy** = its lazy-prompt median. Under each card set:
its dates. **n** = cards in the set; **\*** = fewer than 20 cards, so a rough guess. Sort by BBBScorer median,
original slop-score median, or number of cards (**# cards**).

**Just for fun, not ranked:**
- UnslopNemo and its base, Mistral Nemo. UnslopNemo was tuned to strip stock phrasing from RP chat replies, not to
  write cards, so ranking it here isn't fair.
- Extra card sets of unknown origin (human, AI or both): Perchance cards (NSFW) and Someone's SillyTavern Archive
  (undated).
- **Failed** models, shown with a hatched red background: most of their cards failed the format checks, so the
  usable rest isn't a fair sample. MythoMax (ignores the output format), Hermes 3 70B (loops until cut off) and
  Aion RP (about 40% of its cards fail). The card generator skips them unless told otherwise.

**Reference card sets:** real card sets scored with the same version.

| Set | Cards | Median | Original-ish | Common |
|---|---|---|---|---|
| Korshuk cards, Feb–Apr 2023 | 360 | 7.5 | 97% | 1% |
| JanitorAI cards, May–Jun 2023 | 9,145 | 11.6 | 95% | 2% |
| JanitorAI cards, Jul 2023–Feb 2024 | 97,042 | 12.2 | 94% | 2% |
| Chub cards, before Jul 2023 | 1,582 | 18.2 | 88% | 3% |
| Chub cards, 2025 | 680 | 33.5 | 61% | 15% |
| Perchance cards (SFW), 2024–25 (human and AI-assisted) | 424 | 36.5 | 55% | 20% |
| SPB-2602 AI personas (Kimi, GLM) | 593 | 55.1 | 14% | 37% |
| Foreverse anti-slop AI cards | 6 | 21.1 | 100% | 0% |

**Yours:** the card you just scored (gold), and your saved cards together.

## Public list

Cards people chose to share. It keeps only the name, link, score, scorer version, which fields were scored, and the
self-reported "I made this card" and AI-assisted-writing boxes (honor system). **It never receives or keeps card
text.** The source tag shows where a card came from: Chub, Botbooru (BB), JSON, PNG or text. Earlier entries for
the same link sit in a fold under the newest one.

## Known limits

- **Genre vocabulary.** Dark fantasy, horror and action cards use words AI fiction also overuses ("primal",
  "abyss", "ember"). The pulp read shows how much of a score comes from them.
- **In-voice cards** and some roleplay fine-tunes score lower than their AI origin suggests: they avoid the
  third-person narration the lists were built from.
- **"Don't sound like AI" instructions work.** Cards written by a model under strict anti-slop rules score like
  human cards. The score measures house style, not authorship.
- **Repetition isn't an AI sign on cards** (see [Other read-outs](#other-read-outs-not-scored)).
- **English only.** The word lists are English; other languages get no band.

## How it was tested

| Test set | Original slop score AUC | BBBScorer AUC |
|---|---|---|
| SlopReview: 5,000 Reddit stories vs 6,405 AI stories | 0.930 | 0.977 |
| Gutenberg antislop-DPO: 2,999 book passages vs AI rewrites | 0.973 | 0.996 |
| Character cards: 108,129 from 2023 (mostly human) vs 1,520 AI-written | 0.70 | 0.89 |

On the cards, at a 2% false-positive rate on the 2023 cards, BBBScorer flags 27% of AI-written cards and the original
slop score 11%.

SlopReview's human side overlaps the human writing used to weight the lists, so treat it as optimistic.
Gutenberg is independent. The card test uses cards made before AI writing tools were common (Korshuk, JanitorAI
and Chub, 2023) against AI personas (SPB-2602) and cards generated for this project. The 2023 side includes some
AI-written cards (see [Bands](#bands)), which makes these numbers a little pessimistic.

### How BBBScorer differs from slop-score

Checked against the upstream code (`slop-score.html`, `data/leaderboard_results.json`).

| | Original slop score | BBBScorer |
|---|---|---|
| **Made for** | Ranking models on long essays and stories ("optimised for creative writing and essays") | One character card |
| **Text** | Everything it's given, as one text | Prose only (lists, W++/PLists, headers, pasted instructions set aside); description and first message scored separately, then blended by length |
| **Where the lists come from** | Words and three-word phrases over-represented in 10 models' outputs on essay **and** creative-writing prompts, against human text (wordfreq for words). So the list mixes story slop ("murmurs", "tapestry") with essay and business register ("delve", "crucial", "pivotal", "stakeholders", "holistic") and model-favorite names | Words, two- and three-word phrases from creative writing only, AI fiction against human fiction; topic words, number phrases and character names dropped (a card named Elara isn't penalized every time her name comes up) |
| **How a hit counts** | **Every list hit counts the same**: the score is hits per 1,000 words, however strongly AI favors that word | **Each word and phrase is weighted** by how much more often AI fiction uses it than human fiction |
| **Repeats** | Every repeat counts in full | Diminishing: k uses of an item count w × (1 + ln k), judged by density so length doesn't move the score |
| **Matching** | Many listed three-word phrases could never fire (lists built on stopword-free text, matched against the full token stream) | Matched the way the lists were built, contractions split the same way; a two-word phrase inside a matched three-word one isn't counted twice |
| **The three parts** | 60% list words, 25% not-x-but-y, 15% list trigrams | 60% words, 25% two/three-word phrases, 15% sentence structures (not-x-but-y plus 27 patterns) |
| **Scale** | Each measure stretched between the lowest and highest of 23 entries (22 models and a human baseline) on stories and essays, padded 10% at both ends. 0 = 2.1 list words per 1,000; 100 = 43.9, beyond Gemma 3 4B, the sloppiest model. Cards mostly land under 30, AI-written ones included, and one three-word phrase could cost a human writer about 13 points | 100 = as AI-styled as the most AI-styled tenth of AI-written character cards (each part anchored separately) |
| **Extras** | None | Em-dash overuse (up to +10), chatbot leftovers (+40 each, up to +80) |
| **Per format / per part** | One formula for everything | One set of lists, weights and calibration for every format and for both the description and the greeting. Format only picks the peer group shown in the read-out ("vs 2023 cards in the same format") |

**Results on the shared test sets** (AUC, original → BBBScorer): SlopReview 0.930 → 0.977 (humans flagged above 25:
9.9% → 2.6%); Gutenberg antislop-DPO 0.973 → 0.996 (2.5% → 0.1%); character cards 0.70 → 0.89.

## Data and references

**For building and testing the lists**
- SlopReview (DrRiceIO7): Reddit WritingPrompts stories against stories from about 22 models. The main test set, but
  optimistic (its human side overlaps the human writing used to weight the lists).
- Gutenberg antislop-DPO (sam-paech): the independent test.
- Upstream's outputs from 22 models (`upstream/results/`).
- Nitral-AI's slop-forensics profile of human Reddit writing, the human side of the weighting.

**Human and mixed cards**
- Korshuk: the cleanest human pool, mostly W++.
- AUTOMATIC/jaicards: 188k JanitorAI cards. The 2023 baseline, trends over time and by tag, and seeds for generating
  cards. Mostly human: it includes some AI-written cards from 2023.
- raincandy-u Chub cards: dated 2023–2026, so they show the change over time.
- Perchance: a modern mixed set, not treated as human.

**AI cards**
- SPB-2602 (marcodsn): Kimi and GLM personas.
- Foreverse's character-card-skills example cards: AI cards written to avoid AI flavor, used as hard cases.
- Cards generated for this project by Claude, GPT, Gemini, Gemma, DeepSeek, Kimi, GLM, Llama, Mistral, TheDrummer,
  Sao10k, Anthracite, Nous, MythoMax and others. The generator also has a rewrite mode: human cards an AI has reworded.

**Outside references**
- pixelnull's SloppySeconds list: a source for several sentence patterns.
- TheDrummer's UnslopNemo list of 65 target phrases, checked against cards (no gain, so not used).
- Foreverse's character-card-skills: their scoring rubric, card categories, and a blind test where AI judges mostly
  got human vs AI backwards. That test is part of why BBBScorer calls itself not an AI detector.
- The ARB paper (arXiv 2607.29539): its finding that detectors fail on human text an AI has reworded led to the
  generator's rewrite mode.
- From upstream: the wordfreq port and the local part-of-speech tagger.

**Tooling upstream doesn't have**: versioned scoring runs that resume where they stopped, with regression checks
between versions; builders for the reference and the card leaderboard, and the calibration script; the card
generator with cost caps, retries and a waste guard; scoring of any folder or zip of cards; the per-model report;
the pulp word-list builder and the phrase checker.

## Glossary

| Term | Meaning |
|---|---|
| **BBBScorer** | The BB Botstyle Scorer: this scoring pipeline. Its version is stored with every score; scores from different versions shouldn't be compared directly. |
| **App version** | The page and tools version (`package.json`). Moves for any change, including ones that don't touch scores. |
| **Original slop score** | Sam Paech's slop-score formula, unchanged, on the same text. |
| **Original-ish / Mixed / Common** | The three bands (under 40, 40–60, 60+). Their fun taglines: meatbag adjacent, mixed signals, might just be slop. |
| **Prose words** | Words left after lists, headers, W++/PList blocks and boilerplate are set aside. Only these are scored. |
| **Boilerplate** | Instructions to the model, narrator rules, pasted jailbreaks. |
| **W++ / PList / Ali:Chat** | Card-writing formats: W++ is `Trait("value" + "value")`; PList is `[Name's personality: a, b, c]`; Ali:Chat is example exchanges in the character's voice. |
| **Part score** | The score of the description or the first message alone. |
| **Mixed card** | Description and first message 25+ points apart (both 150+ prose words). |
| **Low confidence** | Under 150 prose words: the number is shown but can swing a lot. |
| **Percentile ("pct")** | Share of the comparison cards scoring lower. |
| **Request style** | How a leaderboard card was asked for (lazy prompt or one of the formats). |
| **Reference set** | Real cards scored with the same version, for comparison. |
| **False positive** | A human-written card scored as AI-styled (here: landing in Common). The false-positive rate is the share of human cards that do. |
| **AUC** | Chance that a random AI-written card scores higher than a random human card (0.5 = coin flip, 1 = always). |
| **Disparity** | In scoring-run notes: BBBScorer and the original slop score 30+ ("big") or 50+ ("very big") points apart on one card. |

## Credits

- [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech: the starting code, slop lists and the original
  metric.
- Human-writing profile from slop-forensics (Nitral-AI); test sets SlopReview (DrRiceIO7) and Gutenberg
  antislop-DPO (sam-paech).
- Card sets: Korshuk roleplay-characters, AUTOMATIC/jaicards (JanitorAI), raincandy-u/chub-ai-cards, Perchance
  character database, SPB-2602 (marcodsn), Foreverse character-card-skills.
- Pattern ideas from pixelnull's SloppySeconds; TheDrummer's UnslopNemo target list was checked against cards.
- [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer (word frequencies).
