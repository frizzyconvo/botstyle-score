# BBBScorer documentation

How BBBScorer (the BB Botstyle Scorer) works, what every number, band, tag and label on the page means, and how it
was tested. The quick start is in [README.md](README.md); version history is in [CHANGELOG.md](CHANGELOG.md).

Numbers below are from the **BBBScorer v0.9.1** scoring run (card-mined lists, cut-offs by length, paragraph evenness and
half-weight genre words on top of 0.8.2), unless a figure says otherwise.

**Contents:** [What it is](#what-it-is) · [What gets scored](#what-gets-scored) · [The score](#the-score) ·
[Bands](#bands) · [Formats](#formats) · [Greeting](#greeting) · [Tags](#tags) · [Archetypes](#archetypes) ·
[Genre and pulp read](#genre-and-pulp-read) · [Other read-outs](#other-read-outs-unscored) ·
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
- **Card-mined words and phrases** (0.9.1): a second list mined from about 2,250 AI-written cards by 37 models, every
  model counted equally ("fiercely loyal", "tilts her head", "leather-bound", "practical"). Up to 30 points: 30 ×
  the card's rate of list items (summed weights per 1,000 prose words) relative to the 90th percentile of the AI cards
  it was mined from, capped at 1. The page lists the items a card hit under *Card-style points*.
- **Paragraph evenness** (0.9.1): AI text keeps paragraphs close to the same length. For cards with 3+ paragraphs and
  150+ prose words, 30 points per unit below a paragraph-length CV of 0.6, from −12 (very uneven) to +20 (very even).

**Genre words count half** (0.9.1): words that human fantasy, horror, action and romance cards use about as often as
AI cards ("realm", "crimson", "primal") count at half weight. Six sentence patterns picked on stories that don't
separate on cards are off ("found herself …ing", "it was as if" and four more), W++ / PList inside parentheses is
read as a PList, one word or phrase counts at most 2.5 times its weight per 700 words, and roleplay asterisks are
removed before the sentence patterns run.

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

Switched off (in the code, unscored): RP-reply tells ("conspiratorial", "voice low", "punctuating", "mischief") from
the UnslopNemo list, which added nothing on cards. The full list of lists and how each was built is in
[docs/LISTS.md](docs/LISTS.md).

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

**Worth a look** (shown, unscored, because people produce these too): Human:/Assistant: transcript lines, JSON
card-field residue (`"first_mes": "…"`), unfilled placeholders ("[Insert name]", lorem ipsum), word-count or
"Option 1:" notes, text that ends mid-sentence.

## Bands

| Band | Fun tagline | 2023 cards (mostly human) | AI-written cards |
|---|---|---|---|
| **Original-ish** | *Meatbag adjacent* | 94.6% | 26.0% |
| **Mixed** | *Mixed signals* | 3.5% | 32.2% |
| **Familiar** | *Rings a bell* | 1.0% | 16.7% |
| **Common** | *Might just be slop* | 0.9% | 25.1% |
| (too short or not English) | **Low confidence** / no band | | |

The band names say how common the card's phrasing is in AI writing. The taglines are just for fun and shown next
to them.

**Cut-offs by length** (0.9.1). Short cards have few chances to hit anything, so one set of cut-offs for every length
flagged long human cards far more often than short ones. Each length range is cut at the same points of 2023 cards
of that length: Mixed from their 94th percentile, Familiar from the 98th, Common from 80 or 10 points above Familiar,
whichever is higher. Cut-offs never fall as length grows.

| Prose words | Mixed from | Familiar from | Common from |
|---|---|---|---|
| under 150 | 21.7 | 33.4 | 80 |
| 150–250 | 32.5 | 47.9 | 80 |
| 250–350 | 41.1 | 70.9 | 80.9 |
| 350–500 | 45 | 70.9 | 80.9 |
| 500–800 | 49.7 | 71.5 | 81.5 |
| 800 and up | 49.7 | 72.5 | 82.5 |

These were built from half of a 23,500-card sample of 2023 cards scored with the 0.9.0 rules. On the full run, 1.1–2.1%
of 2023 cards reach Familiar at every length (under 150 prose words: 1.6%; 800 and up: 2.1%).

**"Too short to tell" stamp:** a card with under 250 prose words gets a small stamp on the corner of its band
tag. Short cards give few chances for a hit, so their low scores say little (see [Limits](#known-limits)).

The cut-offs keep false positives on human cards low, so a low score doesn't clear anyone. 2023 cards: 106,968
(Korshuk, JanitorAI, Chub), median 11.6. AI-written cards generated for this project: 3,582, median 56.4.

**The 2023 set is mostly human, not all human.** It's the closest thing to a human baseline: cards written before
AI writing tools were common. But reading the cards where BBBScorer and the original score disagree most turned
up ChatGPT-, Claude- and Bing-written cards from 2023 among them. The obvious ones are left out of the human side
(about 1,160, 1.1%): cards whose creator says they are AI-written, cards with chatbot leftovers ("Certainly! Here
is…"), and, among the top tenth of scores, cards with a strong old-school AI read (in a blind read, 17 of 20 such cards
read as AI-written). Subtler ones remain: in a blind read of early-2023 cards sampled across all score levels, about 1 in
8 read as AI-written, and most cards in Familiar or Common did, so the false-positive rate on human writing is lower
than these numbers suggest.

**Hybrid card** (flag, not a band; called a "mixed card" before app 0.35.0): the description and the first message
both have 150+ words of prose and land 25+ points apart, for example a hand-written description with an AI-written
greeting. The card score stays a blend; taking the higher part raised false positives on human cards, because short
greetings are noisy. Hybrid is about the two parts; Mixed is a band.

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

Hidden on the page for now while the list is redone (it's still stored with scores). One experimental, just-for-fun label per card, from its format, greeting and genre: a genre adjective plus a
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

**Pulp read** (experimental, unscored): pulpy fantasy, horror, action and romance writing shares a lot of
vocabulary with AI models ("ancient", "shadows", "crimson"). The pulp read shows how much of a card's AI-favored
word weight is genre vocabulary that human genre cards use about as often, and what the score would be without
it. Since 0.9.1 those genre words already count half in the score; the read shows what is left of them. When pulp
vocabulary is 15%+ of the word weight and the card scores 40+, it gets one of two flags:

- **Reads as pulp, not AI-styled:** without the genre vocabulary it would drop under 40.
- **Pulpy and AI-suspect:** it stays at 40+ even without it.

## Other read-outs (unscored)

On the page, each read-out section carries an **Unscored** tag (shown to help, never counted in the score), and the ones
still being tuned an **Experimental** tag. Words with a dotted underline (greeting layout, point of view, tense, genre)
explain themselves on hover or tap.


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
- **Shared clichés:** phrases humans and models both use. Counted, unscored.
- **RP slop:** TheDrummer's UnslopNemo list of RP chat clichés ("hips swaying", "a shiver down", "...for now"),
  shown under the shared clichés. Not scored: tested against cards, human card writers use most of them as much as
  models do. Entries already scored or already among the shared clichés aren't listed twice.
- **AI-favorite names:** names models are fond of (Elara, Kael, Thorne…). Characters can have these names too.
- **Repeated wording:** inside the description, inside the first message, and shared between them. Human cards
  repeat themselves more often than AI-written ones, so it's a writing note, not an AI sign. Alternate greetings
  reusing the first message are noted as normal.
- **Texture:** paragraph evenness. AI text keeps paragraphs close to the same length (length CV around 0.32 vs 0.67
  for 2023 human cards). Since 0.9.1 it counts in the score (see [Extra points](#the-score)); the "AI-style likelihood"
  that combines it with the score stays an experimental read-out. Careful human writers can be even too.
- **Old-school AI** (experimental): the essay and character-sheet register of older models, ChatGPT-era GPT-3.5 / GPT-4
  and 2024-era open models such as Phi-4, Mistral Small, Gemma 3 and Llama 3 ("a testament to", "meticulously",
  "intricacies", "a force to be reckoned with", "her sharp wit", ", reflecting the…"). The scored lists come from fiction,
  so they miss this register. It counts different items, not repeats: two make "a few older-model habits", three at 4+
  per 1,000 words "reads like an older model". Newer models almost never write this way (0.5% of their cards, against
  16% for older models and 3–6% of 2023 cards), so it points at older bots, and people use some of it too. Items from
  Wikipedia's "Signs of AI writing" guide that are as common in 2023 cards as in any model tested ("Furthermore,",
  "Overall,", "plays a crucial role") are listed greyed and don't count. Checks in [docs/LISTS.md](docs/LISTS.md).
- **Mood** (experimental, just for fun): the one or two feelings a card's wording leans on more than 2023 cards do, from
  Empath's emotion word lists (Wattpad-built, MIT): Melancholy, Tender, Uneasy, Hopeful, Sultry, Shy and 16 more. A mood
  shows when its rate is at the 80th percentile of 2023 cards or above, with 2+ words; otherwise "Even-keeled". It reads
  words, not scenes.
- **Signature words** (experimental): the card's six rarest real words compared with 22,577 cards from 2023 (a word must
  be lowercase in the card at least once and known to the English frequency list, so names and typos are left out), and
  **unusual vocabulary**: the share of its words that fewer than 1 in 200 of those cards use, as a percentile. Unusual is
  not original: AI-written cards score higher on it than human cards (AUC 0.71), because models reach for rarer words.
- **Sexual content:** explicit or suggestive wording and NSFW-type tags, read from every field and greeting whatever is
  ticked for scoring. A word list: it can miss implied content, and it filters the usual false alarms ("Sex: Female",
  "sexual orientation", "Dick" as a name, "naked blade", "no NSFW" rules).
- **Stats for nerds:** the original slop-score metrics (slop words and trigrams per 1,000, not-x-but-y rate,
  Flesch-Kincaid grade, sentence and paragraph length, dialogue, MATTR), on the scored fields and on every field.
  On character cards they barely separate human from AI writing.

## Leaderboard

**AI models:** character cards each model wrote for this test from the same requests: the name, creator note and
tags of real 2023 human cards, asked for in seven **request styles**. Each model carries a family tag (Llama,
Mistral, Qwen, GPT, Claude, Gemini, Gemma, DeepSeek, Kimi, GLM and so on); fine-tunes are tagged with their base model's
family, so l3.1-euryale-70b is tagged Llama, unslopnemo-12b and cydonia-24b-v4.1 Mistral, and magnum-v4-72b Qwen.

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

**Read it as a ranking.** Every model wrote its cards from the same requests, and the scorer was tuned on cards like
these, so model medians run higher than the same models' cards in the wild (often edited, and written from other
prompts). The order is the useful part, not a forecast of what a real card will score. Scorer changes are judged on
real-world card sets with known provenance, not on how far the leaderboard moves.

On each row: the bar is the middle half of that set's cards, the line is the median, the big number is the
BBBScorer median and "orig" the original slop-score median. Under each model: **styles** = the lowest to highest
median across its request styles (lazy prompt aside), and **lazy** = its lazy-prompt median. Under each card set:
its dates. **n** = cards in the set; **\*** = fewer than 20 cards, so a rough guess (**Hide models with under 20
cards** leaves those models out; card sets always show). Sort by BBBScorer median,
original slop-score median, or number of cards (**# cards**). The heading names the BBBScorer version the
leaderboard was built from.

Models and card sets are ranked together in one list; each card set carries a **human**, **mixed** or **AI** tag.
Two toggles shorten it:
- **Key picks only** (on by default): the models most bot creators write or chat with (Claude, GPT, Gemini,
  DeepSeek, Kimi, GLM, Grok, MiniMax, Mistral Nemo and the common RP fine-tunes Magnum, Cydonia and Euryale) and two
  human yardsticks (JanitorAI cards, Jul 2023–Feb 2024, and Chub cards, 2025). Untick it for every model and set.
  The "just for fun" section below always shows.
- **Card sets**: untick to show models only.

**Hold-out models** are ranked with the rest and carry a **hold-out** tag: models from families the word lists were
never built from (Qwen 3.x, MiniMax, Nemotron, MiMo, Grok and others), so their numbers aren't flattered by the lists.

**Just for fun, not ranked:**
- An extra card set of unknown origin (human, AI or both): Someone's SillyTavern Archive (undated).
- **Failed** models, shown with a hatched red background: most of their cards failed the format checks, so the
  usable rest isn't a fair sample. MythoMax (ignores the output format), Hermes 3 70B (loops until cut off) and
  Aion RP (about 40% of its cards fail). The card generator skips them unless told otherwise.

**Card sets:** real card sets scored with the same version. Cards found in an earlier set (same text, or
nearly) are counted once. Perchance and 2025 Chub cards are a mix of human and AI-assisted writing (tagged
**mixed**).

| Set | Cards | Median | Original-ish | Familiar or Common |
|---|---|---|---|---|
| Korshuk cards, Feb–Apr 2023 | 360 | 12.4 | 94% | 1% |
| JanitorAI cards, May–Jun 2023 | 9,145 | 12.5 | 95% | 2% |
| JanitorAI cards, Jul 2023–Feb 2024 | 97,040 | 11.5 | 93% | 2% |
| Chub cards, before Jul 2023 | 1,582 | 20.3 | 89% | 3% |
| Chub cards, 2025 | 680 | 39.1 | 64% | 11% |
| Pygmalion Discord cards, to Apr 2023 | 412 | 12.0 | 94% | 1% |
| Roko's Basilisk Archive, Feb–Jul 2023 | 229 | 9.7 | 99% | 0% |
| VenusAI Discord cards, 2023 | 1,452 | 15.4 | 91% | 2% |
| Chub archive (mega.nz), to Jul 2023 | 3,071 | 16.2 | 92% | 2% |
| Perchance cards (SFW), 2024–25 (human and AI-assisted) | 424 | 37.7 | 57% | 17% |
| Perchance cards (NSFW), 2024–25 (human and AI-assisted) | 253 | 31.7 | 60% | 19% |
| SPB-2602 AI personas (Kimi, GLM), Feb 2026 | 593 | 70.8 | 7% | 46% |
| Foreverse anti-slop AI cards, Jul 2026 | 6 | 19.5 | 100% | 0% |

**Yours:** the card you just scored (gold), and your saved cards together.

## Public list

Cards people chose to share. It keeps only the name, link, score, original slop score, scorer version, which fields were scored, and the
self-reported "I made this card" and AI-assisted-writing boxes (honor system). **It never receives or keeps card
text.** The source tag shows where a card came from: Chub, Botbooru (BB), JSON, PNG or text. Earlier entries for
the same link sit in a fold under the newest one; scores the same card got from other scorer versions are listed on
the newest row ("also v0.8.2: 47.0"). A dashed version tag before the name marks a score from an older scorer, which
isn't directly comparable with the current one. Each row also gives the score's percentile among 2023 human cards
and AI-written cards ("p96 human · p37 AI": higher than 96% of the human cards and 37% of the AI ones), and the
original slop score under the score for entries shared from app 0.40.0 on.

**Your cards** (this browser only) shows the same source tag, the old-version tag, the original slop score under each
score, the same human / AI percentiles, and earlier scores of a card rescored after an update ("was v0.8.2: 47.0").
The ⓘ on the band split gives each band's count and share; a summary box gives the median card's percentiles. The
original slop score is only stored for cards saved since app 0.39.0 (card text is never kept, so older entries can't
get it until the card is scored again).

## Known limits

- **Genre vocabulary.** Dark fantasy, horror and action cards use words AI fiction also overuses ("primal",
  "abyss", "ember"). Since 0.9.1 the ones human genre cards use as often count half; the pulp read shows how much
  of a score still comes from them.
- **In-voice cards** and some roleplay fine-tunes score lower than their AI origin suggests: they avoid the
  third-person narration the lists were built from.
- **"Don't sound like AI" instructions work.** Cards written by a model under strict anti-slop rules score like
  human cards. The score measures house style, not authorship.
- **Short and compact cards read low.** W++, PLists and lists are set aside, so a compact card is scored mostly on
  its greeting, and short prose gives few chances for a hit. AI-written cards with under 150 prose words have a
  median of about 27 (4 in 10 land in Original-ish); with 150–250 words, about 40. The band cut-offs are lower for
  short cards (see [Bands](#bands)), but treat a low score on a bite-sized card as "not enough to go on".
- **Repetition isn't an AI sign on cards** (see [Other read-outs](#other-read-outs-unscored)).
- **English only.** The word lists are English; other languages get no band.

## How it was tested

| Test set | Original slop score AUC | BBBScorer AUC |
|---|---|---|
| SlopReview: 5,000 Reddit stories vs 6,405 AI stories | 0.930 | 0.977 |
| Gutenberg antislop-DPO: 2,999 book passages vs AI rewrites | 0.973 | 0.996 |
| Character cards: 106,968 from 2023 (mostly human) vs 3,582 AI-written | 0.80 | 0.93 |

SlopReview and Gutenberg were last run with BBBScorer 0.8.2. On the cards, at a 2% false-positive rate on the 2023
cards, BBBScorer 0.9.1 flags 47% of AI-written cards and the original slop score 28%. Part of that gain is in-sample:
the card-mined list was mined from these AI cards' models; on cards from 18 model families never used to build the lists,
0.9.1 flags 35% (0.8.2: 21%). The AI side now includes many hard cards on purpose: short requests, "don't sound like AI" rules and
light rewrites of human cards.

**Early-2023 card collections as a second human side** (Pygmalion Discord to April 2023, Roko's Basilisk Archive,
VenusAI Discord, a Chub archive to July 2023; 5,164 cards with enough prose, copies of other sets left out): AUC 0.91
against the same AI cards, and 1.6% of them reach Familiar (JanitorAI 2023: 1.7%). By length: 1.4% under 400 prose
words, 2.0% at 400–800 and 1.7% over 800 (231 cards).

**Cards of known provenance** (82 so far: creator-stated, plus some suspected; 37 of them found through creators' own
notes in the card collections), and two creator sets: 100 cards from one creator who states that all of their cards are
written by AI, and 66 cards whose notes say "All content is AI-generated and edited by" their creator (2025-2026).
The figures below were measured on the first 45 provenance cards. Four of the 5 hand-written cards land
in Original-ish (0–28); the fifth, a dark-fantasy card whose creator says long roleplay with AI has shaped their
writing, scores 54 (Mixed). The 11 whole cards their creators say were written with ChatGPT, DeepSeek or another chat
model score 55–94 and all land in Mixed or above. Recent Claude models are harder: a whole card by Claude Opus 4.6
scores 28 (Original-ish), and one by Claude Sonnet 4.5 scores 68 (Mixed), with its AI-written greeting (27) far below
its description (76), so it is flagged as a hybrid card. Of the 4 partly AI-written cards, the AI-edited one scores 51
(Mixed), but the two whose creators give 60% AI score 32 and 19 and the 30% one 2: much of their AI-written profiles is
lists and key-value lines, which aren't scored, and their hand-written greetings score low. All 100 public cards from one
creator who says every card is written by AI from their idea, outline and writing direction score a median of 57,
but the newer the card, the lower: 3 of 38 cards from 2024 land in Original-ish, 10 of 30 from 2025 and 27 of 32 from
2026. Their prose is plain and modern, with little of the stock vocabulary the lists look for: a model steered away from house style scores like a person, the same as the anti-slop cards above.
Five cards from another creator who says how AI helped on each (AI-written greetings on a hand-written card, a W++ card
converted to prose with Claude and then corrected, an AI draft edited heavily) score 16–50: four land in Original-ish,
and the one with an AI-written greeting and light AI editing in Mixed (50). Eleven cards from a creator who writes his
cards with AI from his own notes, using a prompt template he shares publicly (the template asks for paragraphs under
headings and no em dashes), score 42–81 (median 55), while the original slop score gives them 3–30. The template
creator's other 109 cards, kept as a separate test set, have a median of 66 and 57% of them reach the score that 2% of
the early-2023 cards reach; the original slop score's median for them is 18. Where AI wrote only the greeting, the
greetings alone score 4–45, so an AI greeting on an otherwise hand-written card usually isn't flagged; the exception
is a Claude 3 Opus greeting (44) on a hand-written description (13), which is flagged as a hybrid card. Too few cards
for rates yet; the set is growing.

**Human writing from before AI tools** (a check on false positives outside the card sets the lists were built on):
- Fanfiction excerpts (first 600 words), scored as a description-only card. FicWad stories from 2005 to 2021: 0% of
  G to PG-13 stories and 0.2% of R / NC-17 stories reach 60 (BBBScorer 0.9.1). PaperDemon (mostly 2000s): 0.5%.
  FicWad stories from 2023 on: 7.0%. (0.8.2: 0% / 0.1% / 0.2%, and 5.6% for 2023 on.)
- CharacterHub.com character profiles (a site where writers keep profiles of their characters; no greetings), with
  enough prose to score: 0.3% of 2022 profiles reach Familiar, then 1.3% in 2023, 4.2% in 2024 and 5.5% in 2025.
  Profiles from 2022, before ChatGPT, rarely use the scored words: the median word of the main list appears about a seventh as
  often per 1,000 words as in AI-written cards.
The rise after 2022 in both is about the size you'd expect as AI-assisted writing spreads; the scores don't say which
pieces those are.

**Next scorer version (0.10.1, prepared, not live)** is 0.10.0 plus up to 25 points for rhetorical constructions newer
chat models use on cards ("He is not X. He is not Y.", "not X, just Y", "*A beat.*"; on 0.13% of early-2023 human
cards). 0.10.0 adds a few points for bold labels and headings (0.9.3), new
length cut-offs and new bands: **Original**, **Fresh**, **Mixed** and **Common** (Familiar merges into Common). Its
cut-offs come from the early-2023 collections with ChatGPT-era cards left out: Fresh from the 65th percentile of human
cards of the same length (about 20 for cards with 350+ prose words), Mixed from the 94th, Common from the 98th, with
their own cut-offs under 350 prose words and one shared set from 350 up. On about 4,000 cards by 30 models from 18
families never used to build the lists, it catches 33% of AI cards at the score 2% of the human cards reach (0.8.2:
18%), and 44% land in Common against 2.5% of human cards. See the [roadmap](docs/TODO.md).

SlopReview's human side overlaps the human writing used to weight the lists, so treat it as optimistic.
Gutenberg is independent. The card test uses cards made before AI writing tools were common (Korshuk, JanitorAI
and Chub, 2023) against cards generated for this project. AI personas from SPB-2602 (one prompt style, two models)
were on the AI side until app 0.37.0; they made the numbers look better than on other AI cards, so they are now a
separate comparison set. The 2023 side includes some
AI-written cards (see [Bands](#bands)), which makes these numbers a little pessimistic.

### How BBBScorer differs from slop-score

Checked against the upstream code (upstream's `slop-score.html` page and `data/leaderboard_results.json`).

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
9.9% → 2.6%); Gutenberg antislop-DPO 0.973 → 0.996 (2.5% → 0.1%); character cards 0.77 → 0.86.

## Data and references

**For building and testing the lists**
- SlopReview (DrRiceIO7): Reddit WritingPrompts stories against stories from about 22 models. The main test set, but
  optimistic (its human side overlaps the human writing used to weight the lists).
- Gutenberg antislop-DPO (sam-paech): the independent test.
- FicWad and PaperDemon fanfiction archives (dated 2005-2024 and mostly 2000s): pre-AI human narrative for false-positive
  checks and for checking which scored words human fanfiction uses.
- CharacterHub.com profiles (2022-2025, about 174,000): human character descriptions from before and after ChatGPT.
- Upstream's outputs from 22 models (`upstream/results/`).
- Nitral-AI's slop-forensics profile of human Reddit writing, the human side of the weighting.

**Human cards, and sets of mixed origin**
- Korshuk: the cleanest human pool, mostly W++.
- AUTOMATIC/jaicards: 188k JanitorAI cards. The 2023 baseline, trends over time and by tag, and seeds for generating
  cards. Mostly human: it includes some AI-written cards from 2023.
- raincandy-u Chub cards: dated 2023–2026, so they show the change over time. The 2023 ones are also generation
  seeds.
- Perchance: a modern mixed set, not treated as human.
- Early-2023 collections gathered by the project owner, converted to text and screened before use: the Pygmalion
  Discord server's cards (to April 2023), Roko's Basilisk Archive (February and July 2023), the VenusAI Discord
  server's cards, and a Chub archive sorted by creator (July 2023). The second human side for testing; none of their
  cards were used to build or weight any list.
- CharacterHub.com profiles: no greetings, so they're compared with card descriptions only.

**AI cards**
- SPB-2602 (marcodsn): Kimi and GLM personas.
- Foreverse's character-card-skills example cards: AI cards written to avoid AI flavor, used as hard cases.
- Cards generated for this project by Claude, GPT, Gemini, Gemma, DeepSeek, Kimi, GLM, Llama, Mistral, TheDrummer,
  Sao10k, Anthracite, Nous, MythoMax and others. The generator also has a rewrite mode (human cards an AI has reworded)
  and a short mode (the plain request plus a length limit, for AI cards at the lengths most human cards have).
  Requests are built from SFW 2023 cards (no characters described as children, no real people); later rounds rotate
  through about 750 of them so no single character dominates.

**Outside references**
- pixelnull's SloppySeconds list: a source for several sentence patterns.
- TheDrummer's UnslopNemo list of 65 target phrases, checked against cards (no gain as a score), shown as the
  unscored RP slop read-out.
- Foreverse's character-card-skills: their scoring rubric, card categories, and a blind test where AI judges mostly
  got human vs AI backwards. That test is part of why BBBScorer calls itself not an AI detector.
- The ARB paper (arXiv 2607.29539): its finding that detectors fail on human text an AI has reworded led to the
  generator's rewrite mode.
- AIStoryHub's Corpus of AI Clichés (MIT): 758 words, phrases, names and patterns, with the studies behind them
  (Kobak et al., GPTZero's vocabulary study, Liang et al., Juzek & Ward, Wikipedia's "Signs of AI writing", Paech's
  EQ-Bench lists). Checked against cards; most entries are essay and marketing tells that cards don't use, and a dozen
  are candidates for the next word lists. Its sentence patterns come as descriptions; 52 of them were written up as regexes. Its formatting entries led to the
  strongest find: AI-written cards use `**bold**` labels and headings far more than 2023 cards in the same layout.
  Details and the full source list: [docs/LISTS.md](docs/LISTS.md#outside-lists-checked-against-cards-not-used-in-scoring).
- conorbronsdon/avoid-ai-writing (MIT): its detector, run on cards as a comparison (AUC 0.75 against BBBScorer's 0.86).
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
| **Original-ish / Mixed / Familiar / Common** | The four bands (cut-offs by length; see [Bands](#bands)). Their fun taglines: meatbag adjacent, mixed signals, rings a bell, might just be slop. |
| **Original / Fresh / Mixed / Common** | The bands of the prepared 0.10.0 and 0.10.1 (Familiar merges into Common). Taglines: meatbag adjacent, certified flesh?, big cyborg energy, might just be slop. |
| **Prose words** | Words left after lists, headers, W++/PList blocks and boilerplate are set aside. Only these are scored. |
| **Boilerplate** | Instructions to the model, narrator rules, pasted jailbreaks. |
| **W++ / PList / Ali:Chat** | Card-writing formats: W++ is `Trait("value" + "value")`; PList is `[Name's personality: a, b, c]`; Ali:Chat is example exchanges in the character's voice. |
| **Part score** | The score of the description or the first message alone. |
| **Hybrid card** | Description and first message 25+ points apart (both 150+ prose words), for example a hand-written description with an AI-written greeting. Called a "mixed card" before app 0.35.0. Not the Mixed band. |
| **Low confidence** | Under 150 prose words: the number is shown but can swing a lot. |
| **Percentile ("pct")** | Share of the comparison cards scoring lower. |
| **Request style** | How a leaderboard card was asked for (lazy prompt or one of the formats). |
| **Reference set** | Real cards scored with the same version, for comparison. |
| **False positive** | A human-written card scored as AI-styled (here: landing in Familiar or Common). The false-positive rate is the share of human cards that do. |
| **AUC** | Chance that a random AI-written card scores higher than a random human card (0.5 = coin flip, 1 = always). |
| **Disparity** | In scoring-run notes: BBBScorer and the original slop score 30+ ("big") or 50+ ("very big") points apart on one card. |

## Credits

- [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech: the starting code, slop lists and the original
  metric.
- Human-writing profile from slop-forensics (Nitral-AI); test sets SlopReview (DrRiceIO7) and Gutenberg
  antislop-DPO (sam-paech).
- Card sets: Korshuk roleplay-characters, AUTOMATIC/jaicards (JanitorAI), raincandy-u/chub-ai-cards, Perchance
  character database, SPB-2602 (marcodsn), Foreverse character-card-skills.
- Pattern ideas from pixelnull's SloppySeconds; TheDrummer's UnslopNemo target list (the RP slop read-out).
- [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer (word frequencies).
