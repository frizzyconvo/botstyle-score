# To do

Open work, and a short summary of where scoring changes stand.

## Scoring: next version and what's been tried

**BBBScorer 0.9.1 is prepared but not switched on.** (0.9.1 is 0.9.0 plus the words and phrases mined from AI-written
cards; adding them moved scores, so the number moved too.) The page and every stored score still use 0.8.2 (0.8.1's scores with four bands). The changes sit
behind switches in `js/scorer-profile.js` and are used only when a tool asks for them
(`node tools/score_all.mjs --scorer 0.9.1`). Before it goes live: a full rescore with 0.9.1, the length cut-offs
rebuilt from that run (`node tools/build_length_bands.mjs`), the scale anchor checked, and the reference and
leaderboard rebuilt.

In 0.9.1:
- **Cut-offs by length.** One 40 / 60 cut-off for every card treats short and long cards differently: a human card
  under 150 prose words almost never reaches 60, while 3–4% of very long ones do, and short AI-written cards almost all
  land in Original-ish. 0.9.1 cuts each length range at the same points of 2023 cards of that length.
- **Genre words count half.** Words that human fantasy, horror, action and romance cards use as often as AI cards
  ("realm", "crimson", "primal") count at half weight.
- **Six sentence patterns off.** They were picked on stories; on character cards they don't separate human from AI
  writing, or lean human ("found herself …ing", "it was as if").
- **PList in parentheses.** `([Name: …; personality: …])` was read as prose; now it's a PList like any other.
- **Repeats capped.** One word or phrase can count at most 2.5 times its weight per 700 words, so a topical word used
  over and over ("eternity" on a card about an eternal god) can't carry a card.
- **RP asterisks.** Asterisks are removed before the sentence patterns run, so `"Miss me?" *she purrs.*` is read like
  `"Miss me?" she purrs.`
- **Words and phrases mined from AI-written cards.** The scored lists come from stories. 0.9.1 adds a second list mined
  from about 2,250 character cards written by 37 models for this project, with every model counted equally so models
  the story lists never saw count as much as the ones they did ("fiercely loyal", "tilts her head", "leans forward",
  "leather-bound", "patient", "ancient"). Checked by mining on half the models and half the characters and testing on
  the other half: it catches 7–9 more AI cards in 100 there, and on a persona set it was never mined from 48% → 56%.
- **Paragraph evenness.** AI-written cards keep paragraphs close to the same length; 0.9.1 adds a few points for very
  even paragraphs and takes a few off for very uneven ones.

**How 0.9.1 does on a sample** ("Common" here is the old 60+ band, now Familiar and Common together) (23.5k cards from 2023, mostly human; 2.9k AI-written; half the 2023 cards set the
length cut-offs and the other half tests them):

| | 0.8.1 | 0.9.1 |
|---|---|---|
| Separation (AUC) | 0.862 | 0.885 (without the card-mined lists) |
| 2023 cards landing in Common | 1.6% | 2.0% |
| … under 150 / over 800 prose words | 0.2% / 3.9% | 2.0% / 2.0% |
| AI persona set never used for mining, in Common | 37% | 46% |
| Our generated cards in Common (the card-mined lists saw these, so read with care) | 25% | 41% |
| … short (under 250 words) / compact requests / in voice | 6% / 13% / 8% | 37% / 28% / 20% |

Two candidates were tested and left out of 0.9.1: points for phrase-length W++ / PList entries (half the 2023 compact
cards write entries that way too, so it raised human compact cards as much as AI ones), and switching UnslopNemo's
RP-reply tells back on (no gain). Down-weighting genre ("pulp") words by half and switching off six sentence patterns
that don't separate on cards (they were picked on stories) went in.

Tried and not used (each may come back with more data): scoring the higher of description and greeting instead of a
blend; separate scale anchors for description and greeting; repetition as an AI sign (on cards, people repeat
themselves more than models); personality and scenario in the default fields; AI-favorite names in the score;
UnslopNemo's RP phrases as a scored pattern (now shown as RP slop); and these sentence habits, which don't separate
human from AI writing on cards: "not X. not Y. just Z.", "as if" similes, RP body language (breath hitched, jaw
clenched), zeugma, "-ing" sentence openers, trailing "-ing" clauses, three-adjective lists, repeated sentence openers,
"quietly / deeply" adverbs (already covered by the word list) and sentence-length variety. Clipped fragments ("Not
yet." "Mostly.") show promise in first-person greetings but need speech separated from narration first.

**Band cut-offs: decide after the next data.** 0.8.2 splits the old Common band into Familiar (60–80) and Common
(80+) and stamps cards under 250 prose words "too short to tell". Whether to keep one cut-off for every length (with
the stamp as the warning) or switch to 0.9.1's cut-offs by length is decided after re-mining, more generated cards and
more supplied examples. 0.9.1's top band is placed at max(80, the length range's 60-equivalent + 10) for now; check it
on the full 0.9.1 run.

Still open: a bigger re-mining once the generated cards cover more characters (each round so far reused a few dozen
prompts), a stricter human baseline, AI-themed characters, and comparing scores by percentile instead of points in the run notes.

## Linux version (or a setup that runs on Linux)

**Where it stands (2026-10-28):** the scorer, the page and the Node tools are plain Node.js and already work on
Linux. On Linux with Node 22, `npm test` passes (107 of 107) and `npm start` serves the page. What's Windows-only is
the convenience layer around them: the double-click batch scripts, the doc shortcuts and a few setup steps.

- [ ] **One command per job on both systems.** Move the multi-step runs into `npm run` scripts (or small Node
      scripts in `tools/`) so Windows and Linux use the same command, and keep the `.cmd` files as thin wrappers.
      Jobs that are batch-only today:
  - score every dataset: tidy `eval/`, score, compare with the previous run, rebuild the leaderboard and reference,
    model report, tests;
  - score one path (folder, zip, card file) under a short name;
  - generate AI test cards in steps with per-step cost caps;
  - deploy the Cloudflare Workers (card proxy, public list);
  - manage the public list (list, delete, download, archive, clear).
- [ ] **`start-local.sh`** next to `start-local.cmd` (install on first run, then `npm start`), or point Linux users
      to `npm install && npm start` in the README.
- [ ] **Read `.env` in Node.** The deploy and public-list wrappers parse `.env` in batch. Load it with `dotenv`
      (already a dependency) inside the tools so no shell wrapper needs to.
- [ ] **Doc shortcuts.** `tools/organize_eval.mjs` writes Windows `.lnk` shortcuts in `docs/` and skips that step
      elsewhere. On Linux, write symlinks instead (and gitignore them like the `.lnk` files), or leave it skipped.
- [ ] **Line endings.** Add a `.gitattributes` before any `.sh` files: `*.sh text eol=lf`, `*.cmd text eol=crlf`,
      everything else `text=auto`.
- [ ] **Python helpers** (`tools/*.py`, list building and dataset flattening): check they run with `python3` on Linux
      and list their packages in a `requirements.txt`.
- [ ] **Case-sensitive paths.** Linux file names are case-sensitive. The tests pass, so the main paths match; check
      the less-used tools and the dataset registry too.
- [ ] **Test on a clean machine** (a fresh container or VM: clone, install, test, serve, score a folder), then
      document Linux setup in the README.
- [ ] Optional: a Dockerfile or dev container for a one-command setup.

## Read-outs and labels

- **Compare a card with the whole 2023 set:** the signature-words read compares single words, which mostly picks up
  names and topic words. A topic model (NMF or LDA over 2023 cards, a small JSON in the browser) could say how
  typical a card's mix of topics is; nearest-neighbor search (TF-IDF or MinHash) or a small embedding model would
  need a much bigger index or model download. Not started.
- **Old-school AI:** check it against cards from GPT-3.5 Turbo and GPT-4 (the models early-2023 AI cards most likely
  came from). It was tuned on 2024-era open models; Wikipedia's essay transitions ("Furthermore,", "Overall,") turned up
  only in 2023 cards, so they're listed but not counted until then.
- **Genre read:** use card tags first; the keyword reads for Romance and Modern are mostly noise (they fire on ordinary
  card vocabulary). Rebuild the other genres' words from what tagged cards use, then rebuild the pulp list from
  tag-labeled genre cards.
- **Archetypes:** being redone from the axes that carry information and don't overlap (description format, greeting
  point of view, size); hidden on the page until then.
- **Contemporary cards:** AI-written romance and modern-setting cards rarely reach Common (the scored lists lean fantasy).
- **Provenance set:** grow the set of cards with creator-stated (or confidently suspected) authorship, especially
  partly AI-written ones, and note which parts AI wrote. It's the only test of AI-assisted cards; 18 cards so far.
