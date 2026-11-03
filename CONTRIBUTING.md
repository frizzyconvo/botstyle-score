# Contributing

Thanks for helping. The most useful contribution is a **card the scorer got wrong**, with what you know about how it
was written: open a [score report](https://github.com/frizzyconvo/botstyle-score/issues/new?template=score_report.yml).
Cards whose creators say how they were made (by hand, AI-written, AI-edited, AI greeting only) are what the scorer is
checked against, so the "how was it written" field matters more than the score.

## Running it

```sh
npm ci          # Node 18 or newer
npm start       # the page at http://localhost:8080
npm test        # all tests; run before every commit
```

Every tool in `tools/` documents itself: `node tools/<name> --help`. The repository layout is in the
[README](README.md#repository-layout).

## Changes

- **Changelog and versions.** Every change gets a [CHANGELOG.md](CHANGELOG.md) entry (Added / Changed / Fixed) and an
  app version bump in `package.json`. Bump the scorer version (`SCORER_VERSION` in `js/score-card.js` and the page
  title in `index.html`) only when scores or labels can change; a prepared scorer profile that changes gets a new
  number.
- **Docs.** [README.md](README.md) stays the plain readme; [BOTSTYLE.md](BOTSTYLE.md) is the full documentation, with
  numbers from the current scoring run. Lists are described in [docs/LISTS.md](docs/LISTS.md).
- **Wording.** American spelling. Format names come from `js/card-style.js`; use the same names everywhere.
- **Layout changes.** Check the page at phone (390 px) and desktop (1280 px) widths, and update How It Works.
- **Data.** Datasets, scoring runs and local scripts live in `eval/` and `dev/`, which are not in git. Never commit
  card text from datasets, tokens or `.env`.

## Pull requests

Keep them small and say what changed and why. The [pull request template](.github/pull_request_template.md) has the
checklist.
