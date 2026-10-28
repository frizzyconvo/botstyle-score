#!/usr/bin/env node
// doc_shortcuts.mjs - Windows shortcuts in docs/ to every doc and readme in the repository, public and local-only,
// named by group so the folder reads as an index ("Public - …", "Dev - …", "Eval - …"). Each shortcut's comment
// (the tooltip in Explorer) says what the doc is. docs/README.md is the public version of the same index.
//
//   node tools/doc_shortcuts.mjs           write the shortcuts (Windows only: uses PowerShell)
//   node tools/doc_shortcuts.mjs --list    print the shortcut list as JSON (any OS)
//   node tools/doc_shortcuts.mjs --check   list docs without a named entry in DOCS below (any OS; exit 1 if any)
//
// "Eval - Latest …" shortcuts follow SCORER_VERSION in js/score-card.js; a scoring run for another version that has
// notes gets its own "Eval - v<version> run notes (not live)". Any other .md under dev/, eval/experiments/ or
// upstream/ still gets a shortcut, named after its file, so a new doc is never left out: give it a proper name and
// description in DOCS. Every *.lnk in docs/ is replaced on each run (they're all made here, and gitignored).
// Safe during scoring or generation runs: it only reads file names. tools/organize_eval.mjs runs it too.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// [shortcut name, target relative to the repository root ({cur} = current scorer version), what it is]
export const DOCS = [
  ['Public - Readme (start here)', 'README.md', 'What the scorer is, how to run it, the repository layout and the dev commands.'],
  ['Public - Documentation and glossary (BOTSTYLE)', 'BOTSTYLE.md', 'How BBBScorer works: every part of the score, band, format, tag and label, how it was tested, data and glossary.'],
  ['Public - Changelog', 'CHANGELOG.md', 'What changed in every app and BBBScorer version.'],
  ['Public - License (MIT)', 'LICENSE', 'The MIT license for the project.'],
  ['Public - Third-party notices', 'NOTICE.md', 'Licenses of bundled third-party parts: wordfreq (Apache 2.0, CC BY-SA 4.0), word-list, vendor libraries.'],
  ['Public - Upstream leftovers readme', 'upstream/README.md', 'What is kept from slop-score in upstream/ and which tools still read it.'],
  ['Public - Upstream wordfreq port notes', 'upstream/WORDFREQ_PORT.md', "Notes on upstream's JavaScript port of wordfreq (js/wordfreq.js)."],
  ['Dev - Chat log (every request)', 'dev/CHATLOG.md', 'Every request and what was done, with UTC times. Local only.'],
  ['Dev - Findings notes', 'dev/NOTES.md', 'Findings from experiments and scoring runs, newest at the bottom. Local only.'],
  ['Dev - Rescore ideas', 'dev/RESCORE_IDEAS.md', 'Numbered scorer changes waiting for the next rescore. Local only.'],
  ['Dev - Safeguards', 'dev/SAFEGUARDS.md', 'What keeps seeds, generation, scoring and publishing from going wrong, and where each guard lives. Local only.'],
  ['Dev - Scripts readme', 'dev/README.md', 'What each local batch script and dev tool does. Local only.'],
  ['Dev - AI models report, batch 1', 'dev/ai-models-batch1.md', 'Per-model report for the first batch of generated cards (BBBScorer 0.8.1). Local only.'],
  ['Dev - Analysis - sentence pattern check', 'dev/analysis/pattern_check.md', 'Which sentence patterns separate 2023 cards from AI cards (feeds the 0.9.0 patterns-off list). Local only.'],
  ['Dev - Analysis - structure candidates', 'dev/analysis/structure_candidates.md', 'Candidate sentence structures tested as score features. Local only.'],
  ['Eval - Folder guide', 'eval/README.md', 'What is in each eval/ folder and the list of scoring runs. Local only.'],
  ['Eval - Latest scorer notes', 'eval/scores/v{cur}/notes.md', 'Notes for the live scorer\'s run: BBBScorer vs the original score, bands per dataset. Read first. Local only.'],
  ['Eval - Latest AI-model report', 'eval/scores/v{cur}/ai-models.md', "Per-model report for the live scorer's run. Local only."],
  ['Eval - Latest scorer manifest (SCORER)', 'eval/scores/v{cur}/SCORER.md', 'Exactly which scorer, settings and lists (with checksums) the live run used. Local only.'],
  ['Eval - Latest scorer comparison', 'eval/scores/v{cur}/compare', 'What moved between the previous run and the live one. Local only.'],
  ['Eval - Experiment - 0.9.0 full run vs 0.8.1', 'eval/experiments/v090_full_run.md', 'The complete 0.9.0 scoring run against 0.8.1: AUC, caught at 2%, bands by length, format and model, takeaways. Local only.'],
  ['Eval - Experiment - archetype, genre and pulp', 'eval/experiments/archetype_genre.md', 'Do the archetype inputs cluster; genre read checked against card tags; pulp and genre gaps. Local only.'],
  ['Eval - Experiment - 0.9.0 final results', 'eval/experiments/v090_final2.md', 'BBBScorer 0.9.0 against 0.8.1 with the card-mined lists, on cards the lists never saw. Local only.'],
  ['Eval - Experiment - 0.9.0 first final', 'eval/experiments/v090_final.md', 'Earlier 0.9.0 results, before the card-mined lists. Local only.'],
  ['Eval - Experiment - 0.9.0 report', 'eval/experiments/v090_report.md', 'Change-by-change 0.9.0 experiment report. Local only.'],
  ['Eval - Experiment - card list re-mine', 'eval/experiments/remine_eval.md', 'Card-mined lists tested on held-out models and characters. Local only.'],
  ['Eval - Experiment - format and model tells', 'eval/experiments/format_model_tells.md', 'Words that belong to one card format or one model. Local only.'],
];

export function currentScorer() {
  try { return readFileSync(join(ROOT, 'js', 'score-card.js'), 'utf-8').match(/SCORER_VERSION = '([0-9.]+)'/)[1]; } catch { return null; }
}
const exists = rel => existsSync(join(ROOT, ...rel.split('/')));
const ls = rel => exists(rel) ? readdirSync(join(ROOT, ...rel.split('/'))) : [];

// The shortcuts that would be written now: [{ name, target, about }], targets that exist only.
export function docShortcuts(cur = currentScorer()) {
  const out = [];
  for (const [name, target, about] of DOCS) {
    let t = target.replace('{cur}', cur);
    if (t.endsWith('/compare')) {
      const dir = t.slice(0, -'/compare'.length);
      const f = ls(dir).filter(x => /^compare-v.*\.txt$/.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
      if (!f) continue; t = `${dir}/${f}`;
    }
    if (exists(t)) out.push({ name, target: t, about });
  }
  for (const v of ls('eval/scores').filter(d => /^v\d/.test(d) && d.slice(1) !== cur)) {
    if (exists(`eval/scores/${v}/notes.md`)) out.push({ name: `Eval - ${v} run notes (not live)`, target: `eval/scores/${v}/notes.md`, about: `Notes for the ${v} scoring run, which the page doesn't use. Local only.` });
  }
  const named = new Set(out.map(d => d.target));
  for (const [dir, group] of [['dev', 'Dev'], ['dev/analysis', 'Dev - Analysis'], ['eval/experiments', 'Eval - Experiment'], ['upstream', 'Public - Upstream']]) {
    for (const f of ls(dir).filter(f => f.endsWith('.md')).sort()) {
      const t = `${dir}/${f}`;
      if (!named.has(t)) out.push({ name: `${group} - ${f.replace(/\.md$/, '')}`, target: t, about: `${t} (no description yet: add it to DOCS in tools/doc_shortcuts.mjs).`, unnamed: true });
    }
  }
  return out;
}

export function writeShortcuts(cur = currentScorer(), { quiet = false } = {}) {
  if (process.platform !== 'win32') { if (!quiet) console.log('docs/ shortcuts: Windows only (use --list elsewhere).'); return 0; }
  const docs = join(ROOT, 'docs');
  for (const f of readdirSync(docs).filter(f => f.toLowerCase().endsWith('.lnk'))) { try { unlinkSync(join(docs, f)); } catch { /* ignore */ } }
  const q = s => String(s).replace(/'/g, "''");
  const ps = docShortcuts(cur).map(({ name, target, about }) =>
    `$s = $w.CreateShortcut('${q(join(docs, name + '.lnk'))}'); $s.TargetPath = '${q(join(ROOT, ...target.split('/')))}'; $s.Description = '${q(about)}'; $s.Save()`);
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$w = New-Object -ComObject WScript.Shell; ' + ps.join('; ')], { stdio: 'ignore' });
  if (!quiet) console.log(`docs/: ${ps.length} shortcuts (latest scorer files -> eval/scores/v${cur}/)`);
  return ps.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const list = docShortcuts();
  if (process.argv.includes('--list')) console.log(JSON.stringify(list, null, 2));
  else if (process.argv.includes('--check')) {
    const missing = list.filter(d => d.unnamed);
    console.log(missing.length ? `Docs without a named shortcut entry:\n${missing.map(d => '  ' + d.target).join('\n')}` : `All ${list.length} docs have a named shortcut.`);
    process.exit(missing.length ? 1 : 0);
  } else {
    try { writeShortcuts(); } catch (e) { console.log(`couldn't write the docs shortcuts: ${e.message}`); process.exit(1); }
  }
}
