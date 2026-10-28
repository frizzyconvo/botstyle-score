# Notes on Foreverse's character-card-skills (English summary)

Source: `../character-card-skills` (github.com/foreverse-app/character-card-skills, MIT code /
CC BY 4.0 content). Much of it is in Chinese; this is what matters for botstyle-score.

## What's in it

- **Two authoring skills** (Chinese and English) with a method: positioning on four axes, 47 genre
  guides, five opening paradigms, nine "liveliness" techniques, lorebook patterns, anti-AI-flavor rules.
- **Two rule-based scorers** (`tools/score_card.py` zh, `tools/score_card_en.py` en) for their own
  `card.md` format. They grade craft and completeness, not authorship.
- **18 example cards** (6 English) written by a model following the skill.
- **A blind-review experiment:** LLM judges told human from AI cards correctly 12% of the time
  (systematically backwards); only Claude with an anti-bias prompt reached 83%.

## The English rubric (`score_card_en.py`, 100 points)

| Dimension | Points | Checks |
|---|---|---|
| Fields | 13 | name, description ≥120 words, personality ≥60, scenario, first message ≥80, system prompt, creator notes, image prompt; bonus for an alternate greeting |
| Greeting | 18 | length 150–350 words (550 for RPG); scene word, an event in progress, a line of character dialogue, a hook to {{user}}; "private life" evidence; no fishing ending ("What will you do?") |
| Liveliness | 24 | nine keyword checks: micro-flaws, say/do gap, refusal, private life, verbal fingerprint, physical anchor, unfinished business, misreading, emotional inertia; example dialogue |
| Tags | 10 | audience, POV (anypov/fempov/malepov), genre, trope, mode tags |
| Format | 12 | no HTML, consistent tense, 2–4 alternate greetings, example dialogue with a refusal turn |
| Lorebook | 8 | entry count, keyed and constant entries, voice/director/NPC/secret entries |
| Image prompt | 10 | their cover-art conventions |
| Anti-slop | 5 | a 95-phrase list, "not X but Y", fishing endings; em-dash is a lint, not an AI signal |

Red lines (automatic fail): writing {{user}}'s actions or words in the greeting, NSFW vocabulary on
SFW cards, slop names (Elara, Kael, Lyra…), over ~2,000 permanent tokens, therapy claims.

## Opening paradigms (how they classify greetings)

A event scene (default: something happening now, answerable), B undercurrent (caught having just done
something they'd deny), C confrontation (mid-standoff), D world broadcast (RPG: second-person situation
report, one line per NPC), E console (simulators/helpers: instructions with sample inputs). Every greeting
should do three jobs: scene, character entry mid-action with dialogue, an answerable hook, with no
{{user}} actions. Alternate greetings should change the situation, not the wording.

## Tested against our data

Their greeting checks on 2,254 human 2023 greetings vs 242 AI greetings (first generated run):

| Check | Human | AI |
|---|---|---|
| fishing ending | 0.3% | 0.4% |
| ends on a question | 17.8% | 35.1% |
| "you feel / think / know" | 12.3% | 4.1% |
| private-life evidence | 11.4% | 9.5% |
| scene word near the start | 38.2% | 48.3% |
| event verb | 43.5% | 53.3% |
| 150–350 words | 28.3% | 54.5% |

AI greetings pass their "good greeting" checks more often than 2023 human greetings do. The rubric
measures craft against their house style, so it isn't usable as an AI-style score and would reward
AI cards. Only "ends on a question" leans AI (botstyle already reports it as `greeting.endsWithQuestion`).

## What we took

- **Texture over vocabulary.** Their own finding: modern AI cards avoid slop words, and what gives them
  away is "evenly distributed detail, zero idle details, perfect structure". We tested texture measures
  and kept paragraph evenness (`js/texture.js`), shown as experimental and unscored.
- **Their 6 English cards as an adversarial AI set.** All score 9–18 (Original), and their paragraph
  CVs (1.0–2.0) are deliberately uneven, so they defeat the texture signal too.
- **The roleplay ban list idea** for the `antislop:rp` generation prompt.

## What we didn't take

- The 100-point rubric (house-style craft checks; AI passes them).
- Per-model symptom profiles (`chat-quality-doctor/models/`): community opinion about chat quality in
  Chinese RP, no measurements for English cards.
- The Chinese detectors (`ai_flavor_check.py`, `fragment_census.py`): Chinese-only regexes. The English
  idea behind the fragment census ("Not threatening. Just... present.") is worth mining once there are
  enough in-voice AI cards.
