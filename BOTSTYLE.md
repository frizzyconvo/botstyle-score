# How BBBScorer works

BBBScorer gives a character card a 0–100 read on how much its writing leans on the stock words, phrases and
sentence habits of AI models. It is **not** an AI detector: careful AI-assisted writing can score low, and
human writing in some genres can score high. It says nothing about whether a card is good.

Current version: see `SCORER_VERSION` in `js/score-card.js`. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## What gets scored

- **Fields:** the description and the first message by default. Personality, scenario, example dialogue and
  alternate greetings can be added in the field picker (or `fields` in `scoreCard()`).
- **Prose only:** W++, PLists, key-value lines, short bullets, headers and pasted model instructions
  ("jailbreaks") are counted and shown, but left out of the score. The slop lists were built from prose, and
  running them over lists distorts the rate.
- **In-character dialogue counts**, including speech after a label (`A: "I… don't know."`) or in a bullet.
  Interview questions (`Q: …`) don't.
- Under 150 words of prose the result is marked low confidence. Under 40, or for non-English text, there's no label.

## The score

| Part | Weight | What it counts |
|---|---|---|
| AI-favoured words | 60% | words AI fiction uses much more often than human fiction, weighted by that ratio |
| AI-favoured phrases | 25% | two- and three-word phrases, same weighting |
| Sentence structures | 15% | "not X but Y" and 27 other patterns such as "a flicker of…", "the air was thick…", "a mix of X and Y" |

The description and the first message are always scored separately, then blended into the card score: each
counts in proportion to its prose words, up to 400 words each, so a long description can't drown out the
greeting. A part needs 60 words of prose to count on its own.

Each component is a rate per 1,000 prose words, scaled so 100 matches the most AI-styled tenth of AI-written
character cards (description + first message). Repeats count with diminishing weight, judged by density: an
item seen k times in 700 words counts w × (1 + ln k), and a card twice as long needs twice the hits for the same
weight, so length alone doesn't move the score. On top of that:

- **Em-dashes:** above 6 per 1,000 words add up to 10 points.
- **Obvious chatbot leftovers** add 40 each, up to 80: "Certainly! Here is…", "I hope this helps!", a refusal
  left in the card, chat-template tokens.

The original slop-score number (Sam Paech's formula, on the description and first message together) is shown
under the score for comparison. It matches EQ-Bench's slop-score page exactly.

Every result also says where the score sits among human cards from 2023 and AI-written cards (the ⓘ next to the
score). That comparison is more meaningful than the number on its own.

## Bands (tentative)

| Score | Label |
|---|---|
| under 40 | Meatbag adjacent |
| 40–60 | Mixed signals |
| 60 and up | Might just be slop |

The cut-offs keep false alarms on human cards low. On a sample of 5,313 human cards from 2023 and 1,061
AI-written cards, human cards split 93 / 5 / 2% across the three bands and AI cards 30 / 40 / 30% (AUC 0.91).
Human cards have a median of 13 and AI cards 51.

## Known limits

- **Mixed cards.** When the description and first message both have 150+ words of prose and land 25+ points
  apart, the card is flagged as mixed (for example a hand-written description with an AI-written greeting). The
  card score stays a blend: taking the higher part instead raised false alarms on human cards, because short
  greetings are noisy.
- **Repetition isn't an AI sign on cards.** Human cards repeat their own phrasing more often than AI-written ones
  (inside the description, inside the greeting and between the two), so repeated wording is shown as a writing
  note and not scored. Alternate greetings reusing the first message are noted as normal.
- **Genre vocabulary.** Dark fantasy, horror and action cards use words AI fiction also overuses ("primal",
  "abyss", "ember"). The experimental pulp read shows how much of a score comes from them.
- **In-voice cards** (first-person monologues, interview formats) and some roleplay fine-tunes score lower than
  their AI origin suggests: they avoid the third-person narration the lists were built from.
- **"Don't sound like AI" instructions work.** Cards written by a model under strict anti-slop rules score like
  human cards. The score measures house style, not authorship.

## Read-outs that aren't scored

Human tells (typos, txt-speak, unclosed quotes, non-standard macros), repeated wording, craft notes (writing {{user}}'s actions,
mixing "you" and {{user}}), shared clichés humans and models both use, AI-favourite names, description format
and greeting voice, genre, pulp share, archetype, paragraph evenness, and the original slop-score metrics under
"Stats for nerds".

## How it was tested

| Test set | Original slop score AUC | BBBScorer AUC |
|---|---|---|
| SlopReview: 5,000 Reddit stories vs 6,405 AI stories | 0.930 | 0.977 |
| Gutenberg antislop-DPO: 2,999 book passages vs AI rewrites | 0.973 | 0.996 |
| Character cards: 5,313 human (2023) vs 1,061 AI-written | 0.60* | 0.91 |

\* From an earlier, smaller card test (2,476 human vs 860 AI cards).

SlopReview's human side overlaps the human writing used to weight the lists, so treat it as optimistic.
Gutenberg is independent. The card test uses cards made before AI writing tools were common (Korshuk,
JanitorAI and Chub, 2023) against AI personas (SPB-2602) and cards generated for this project.

## Credits

- [slop-score](https://github.com/sam-paech/slop-score) by Sam Paech: the starting code, slop lists and the original metric.
- Human-writing profile from slop-forensics (Nitral-AI); test sets SlopReview (DrRiceIO7) and Gutenberg antislop-DPO (sam-paech).
- Card sets: Korshuk roleplay-characters, AUTOMATIC/jaicards (JanitorAI), raincandy-u/chub-ai-cards, Perchance
  character database, SPB-2602 (marcodsn), Foreverse character-card-skills.
- Pattern ideas from pixelnull's SloppySeconds; TheDrummer's UnslopNemo target list was checked against cards.
- [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer (word frequencies).
