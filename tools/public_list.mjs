#!/usr/bin/env node
// public_list.mjs - List, delete from, download, archive or clear the public list (Cloudflare KV namespace "bb-runs").
// Runs wrangler on your computer, so you need to be logged in to Cloudflare (dev\deploy-workers.cmd
// does the login). The namespace id is read from tools/wrangler-runs.toml.
//
//   node tools/public_list.mjs status            # how many entries, oldest and newest date
//   node tools/public_list.mjs list [--find text] # every entry, numbered, with its id, date, origin and link
//   node tools/public_list.mjs delete 12 a1b2c3d4 # delete entries by number (from list) or id; asks first
//   node tools/public_list.mjs delete --link https://chub.ai/characters/x/y   # every entry for that link
//   node tools/public_list.mjs download          # save a copy to public-list-archive/ (list unchanged)
//   node tools/public_list.mjs archive           # save a copy, keep it in KV as archive:<date>, then empty the list
//   node tools/public_list.mjs archive --before 2026-12-01   # only move entries older than that date
//   node tools/public_list.mjs clear             # empty the list (asks first; a local copy is still saved)
//   node tools/public_list.mjs archives          # list the archive:<date> keys kept in KV
//   add --dry-run to print the wrangler commands instead of running them
//
// Every change first saves a copy of the whole list to public-list-archive/ next to the repo (outside git),
// so a mistaken delete can be undone by putting that file back (wrangler kv:key put runs --path=<file>). The page only ever reads the
// "runs" key, so archived entries disappear from the page but stay recoverable.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline/promises';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, '..', 'public-list-archive');
const args = process.argv.slice(2), cmd = args.find(a => !a.startsWith('--')) || 'status';
const DRY = args.includes('--dry-run');
const before = args.includes('--before') ? args[args.indexOf('--before') + 1] : null;
const toml = readFileSync(join(ROOT, 'tools', 'wrangler-runs.toml'), 'utf-8');
const NS = (toml.match(/^\s*id\s*=\s*"([0-9a-f]{32})"/m) || [])[1];
if (!NS) { console.error('No KV namespace id found in tools/wrangler-runs.toml'); process.exit(2); }

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function wrangler(...a) {
  const full = ['--yes', 'wrangler@3', ...a, `--namespace-id=${NS}`];
  if (DRY) { console.log('[dry-run] npx ' + full.join(' ')); return ''; }
  return execFileSync(npx, full, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' });
}
const getRuns = () => { const t = wrangler('kv:key', 'get', 'runs'); if (DRY) return []; try { return JSON.parse(t.trim() || '[]'); } catch { return []; } };
function putJson(key, value) {
  // write through a temp file: Windows command lines are too short for a big list
  const dir = mkdtempSync(join(tmpdir(), 'bbruns-')), f = join(dir, 'value.json');
  writeFileSync(f, JSON.stringify(value));
  wrangler('kv:key', 'put', key, `--path=${f}`);
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function saveLocal(runs, tag) {
  mkdirSync(OUT, { recursive: true });
  const f = join(OUT, `runs-${tag}-${stamp()}.json`);
  if (!DRY) writeFileSync(f, JSON.stringify(runs, null, 1));
  console.log(`${DRY ? '[dry-run] would save' : 'Saved'} ${runs.length} entries to ${f}`);
}
const span = runs => runs.length ? `${runs[0].at?.slice(0, 10)} to ${runs[runs.length - 1].at?.slice(0, 10)}` : 'empty';

if (cmd === 'status') {
  const runs = getRuns(); console.log(`${runs.length} entries (${span(runs)})`);
} else if (cmd === 'download') {
  saveLocal(getRuns(), 'copy');
} else if (cmd === 'archive') {
  const runs = getRuns();
  const move = before ? runs.filter(r => String(r.at || '') < before) : runs, keep = before ? runs.filter(r => String(r.at || '') >= before) : [];
  if (!move.length && !DRY) { console.log('Nothing to archive.'); process.exit(0); }
  saveLocal(move, 'archive');
  const key = `archive:${new Date().toISOString().slice(0, 10)}`;
  putJson(key, move); console.log(`Kept ${move.length} entries in KV as ${key}`);
  putJson('runs', keep); console.log(`Public list now has ${keep.length} entries.`);
} else if (cmd === 'clear') {
  if (!DRY && !args.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question('Empty the public list without keeping a copy? Type "clear" to confirm: '); rl.close();
    if (a.trim() !== 'clear') { console.log('Cancelled.'); process.exit(0); }
  }
  saveLocal(getRuns(), 'before-clear'); putJson('runs', []); console.log('Public list emptied (a copy was saved first).');
} else if (cmd === 'list') {
  const runs = getRuns(), find = args.includes('--find') ? String(args[args.indexOf('--find') + 1]).toLowerCase() : null;
  runs.forEach((r, i) => { const line = `${String(i + 1).padStart(4)}  ${(r.id || '-').padEnd(8)}  ${String(r.at || '').slice(0, 10)}  ${(r.origin || '?').padEnd(5)} ${String(r.score).padStart(5)}  ${r.name}${r.link ? '  ' + r.link : ''}`;
    if (!find || line.toLowerCase().includes(find)) console.log(line); });
  console.log(`${runs.length} entries`);
} else if (cmd === 'delete') {
  const runs = getRuns(), link = args.includes('--link') ? args[args.indexOf('--link') + 1] : null;
  const keys = args.filter((a, i) => !a.startsWith('--') && a !== 'delete' && args[i - 1] !== '--link');
  const norm = u => String(u || '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const hit = runs.map((r, i) => keys.includes(String(i + 1)) || (r.id && keys.includes(r.id)) || (link && norm(r.link) === norm(link)));
  const gone = runs.filter((_, i) => hit[i]);
  if (!gone.length) { console.log('Nothing matched. Use "list" to see numbers and ids.'); process.exit(0); }
  for (const r of gone) console.log(`  delete: ${r.id || '-'}  ${String(r.at || '').slice(0, 10)}  ${r.name}  ${r.score}${r.link ? '  ' + r.link : ''}`);
  if (!DRY && !args.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question(`Delete ${gone.length} entr${gone.length > 1 ? 'ies' : 'y'}? Type "yes": `); rl.close();
    if (a.trim().toLowerCase() !== 'yes') { console.log('Cancelled.'); process.exit(0); }
  }
  saveLocal(runs, 'before-delete');
  putJson('runs', runs.filter((_, i) => !hit[i])); console.log(`Deleted ${gone.length}. ${runs.length - gone.length} left.`);
} else if (cmd === 'archives') {
  const t = wrangler('kv:key', 'list', '--prefix=archive:'); if (!DRY) for (const k of JSON.parse(t || '[]')) console.log(k.name);
} else { console.error(`Unknown command "${cmd}". See --help.`); process.exit(2); }
