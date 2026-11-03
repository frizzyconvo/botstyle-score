# Roadmap

Planned work and the status of scoring changes. The live scorer is **BBBScorer 0.8.2**; the next version is
prepared behind switches in `js/scorer-profile.js` and used only when a tool asks for it.

## Next scorer version: 0.9.3 (prepared, not live)

0.9.3 is 0.9.1 (below) plus points for bold used as labels or headings (`**Appearance:**`, `- **Likes:** …`, a line
that is only `**Backstory**`): from 2 such labels on, 4 points plus 1 for each one after, at most 10. Two or more
appear on about 1% of early-2023 human cards and on about a third of AI-written cards.

Score with it: `node tools/score_all.mjs --scorer 0.9.3`.

**Test results.** Human side: early-2023 card collections. AI side: cards from model families that were never used
to build the lists. At the score that 2% of the human cards reach:

| AI test set | 0.8.2 | 0.9.1 | 0.9.3 |
|---|---|---|---|
| Generated cards from 10 unmined model families (about 1,500) | 18% | 30% | 33% |
| A creator's cards written with AI from a public prompt template (109) | 41% | 55% | – |

**Before release:**
- [ ] Full rescore with the release candidate.
- [ ] Length cut-offs rebuilt from that run, leaving out the test sets (`node tools/build_length_bands.mjs`).
- [ ] Reference and leaderboard rebuilt.
- [ ] New band names: Original, Fresh, Mixed, Common (Familiar merges into Common), with the page, How It Works,
      docs, title test and public-list worker updated.

### What 0.9.x changes compared with 0.8.2

- **Cut-offs by length.** Each length range is cut at the same points of 2023 cards of that length, so short and
  long cards are judged against cards like them.
- **Genre words count half.** Words that human fantasy, horror, action and romance cards use as often as AI cards
  ("realm", "crimson", "primal") count at half weight.
- **Six sentence patterns off.** Patterns picked on stories that don't separate human from AI writing on character
  cards, or lean human ("found herself …ing", "it was as if").
- **PList in parentheses.** `([Name: …; personality: …])` is read as a PList, not prose.
- **Repeats capped.** One word or phrase counts at most 2.5 times its weight per 700 words.
- **RP asterisks.** Asterisks are removed before the sentence patterns run.
- **Words and phrases mined from AI-written cards.** A second list mined from about 2,250 cards by 37 models, every
  model counted equally ("fiercely loyal", "tilts her head", "leather-bound").
- **Paragraph evenness.** A few points for very even paragraph lengths, a few off for very uneven ones.
- **Bold labels and headings** (0.9.3).

## Tested and not adopted

- **Re-mined card lists (0.9.2).** Lists re-mined from 3,836 cards by 38 models caught fewer AI cards than the 0.9.1
  lists on every test set (about 2 in 100 fewer on cards from unmined model families). A longer list raises the
  value list points are scaled against, so cards from other models get fewer points. Any re-mine waits for a fix
  to that scaling.
- **Points for phrase-length W++ / PList entries:** raised human compact cards as much as AI ones.
- **Scoring the higher of description and greeting** instead of a blend; separate scale anchors for each part.
- **Repetition as an AI sign:** on cards, people repeat themselves more than models do.
- **Personality and scenario in the default fields; AI-favorite names in the score.**
- **UnslopNemo's RP phrases as a scored pattern** (shown as RP slop instead).
- **Sentence habits that don't separate on cards:** "not X. not Y. just Z.", "as if" similes, RP body language,
  zeugma, "-ing" openers and trailing clauses, three-adjective lists, repeated openers, "quietly / deeply" adverbs,
  sentence-length variety.

## Planned

### Scoring
- [ ] Scale card-list points so a longer list doesn't lower everyone else's points.
- [ ] Em dashes: start the points at 3 per 1,000 words instead of 6.
- [ ] AI-written greetings score low compared with AI-written descriptions; look for greeting-specific signals
      (share of dialogue, sentence length).
- [ ] Long human cards and dark-fantasy vocabulary are the main sources of false positives; check a length-aware cap.
- [ ] Cards from recent models (for example Claude 4.5 and later) often score low.
- [ ] Short cards: a note suggesting scoring with the alternate greetings, scenario or example dialogue.
- [ ] Leave-one-family-out mining, to measure how well mined lists carry to unseen model families.

### Read-outs and labels
- **Compare a card with the whole 2023 set.** A topic model or nearest-neighbor search over 2023 cards could say how
  typical a card's mix of topics is. Not started.
- **Old-school AI.** Check it against GPT-3.5 Turbo and GPT-4 cards (the models early-2023 AI cards most likely came
  from). Essay transitions ("Furthermore,", "Overall,") are listed but not counted until then.
- **Genre read.** Use card tags first; rebuild the genre words, then the pulp list, from tag-labeled cards.
- **Archetypes.** Being redone from the axes that carry information (description format, greeting point of view,
  size); hidden on the page until then.
- **Provenance set.** Grow the set of cards with creator-stated authorship, especially partly AI-written ones.

### Linux support
The scorer, the page and the Node tools already run on Linux (`npm test`, `npm start`). The convenience layer is
Windows-only.

- [ ] One command per job on both systems: move the multi-step batch runs (score every dataset, score one path,
      generate test cards with cost caps, deploy the Workers, manage the public list) into `npm run` scripts or small
      Node scripts, with the `.cmd` files as thin wrappers.
- [ ] `start-local.sh` next to `start-local.cmd`, or point Linux users to `npm install && npm start`.
- [ ] Load `.env` inside the tools with `dotenv`, so no shell wrapper has to parse it.
- [ ] Doc shortcuts: write symlinks on Linux instead of Windows `.lnk` files, or skip the step.
- [x] `.gitattributes` for line endings (`*.cmd` CRLF, everything else `text=auto`); add `*.sh text eol=lf` with the
      first shell script.
- [ ] Check the Python helpers (`tools/*.py`) on Linux and list their packages in `requirements.txt`.
- [ ] Check case-sensitive paths in the less-used tools and the dataset registry.
- [ ] Test on a clean machine (clone, install, test, serve, score a folder), then document Linux setup in the README.
- [ ] Optional: a Dockerfile or dev container.
