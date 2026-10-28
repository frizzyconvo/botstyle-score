# Docs index

Every doc in the repository and what it's for.

| Doc | What it is |
|---|---|
| [README.md](../README.md) | Start here: what the scorer is, how to run it, the repository layout and the dev commands. |
| [BOTSTYLE.md](../BOTSTYLE.md) | The full documentation and glossary: every part of the score, band, format, tag and label, how it was tested, data and credits. |
| [CHANGELOG.md](../CHANGELOG.md) | What changed in every app and BBBScorer version. |
| [docs/LISTS.md](LISTS.md) | Every word and pattern list: where it comes from, whether it's scored, how to rebuild it, and its history. |
| [docs/TODO.md](TODO.md) | Open work, and where the next scorer version (0.9.0) stands. |
| [docs/FOREVERSE_NOTES.md](FOREVERSE_NOTES.md) | English summary of Foreverse's character-card-skills (card-writing rubric, blind human-vs-AI test). |
| [upstream/README.md](../upstream/README.md) | What is kept from slop-score in `upstream/` and which tools still read it. |
| [upstream/WORDFREQ_PORT.md](../upstream/WORDFREQ_PORT.md) | Notes on upstream's JavaScript port of wordfreq. |
| [LICENSE](../LICENSE) | MIT license. |
| [NOTICE.md](../NOTICE.md) | Licenses of bundled third-party parts (wordfreq, word-list, vendor libraries). |

Every tool in `tools/` documents itself: `node tools/<name> --help`.

**Local shortcuts.** On Windows, `node tools/doc_shortcuts.mjs` puts a shortcut in this folder to every doc above and
to the local-only ones (dev notes, chat log, safeguards, scoring-run notes, experiment reports), named by group
("Public - …", "Dev - …", "Eval - …"); hovering one shows what it is. The shortcuts aren't in git, and the scoring
script refreshes them.
