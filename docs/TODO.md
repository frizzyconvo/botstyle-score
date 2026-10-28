# To do

Open work that isn't about scores. Scorer ideas live with the scoring-run notes, not here.

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
