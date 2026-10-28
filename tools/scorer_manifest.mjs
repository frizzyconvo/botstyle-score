#!/usr/bin/env node
// scorer_manifest.mjs - Write SCORER.md + scorer.json describing exactly which scorer produced a scoring run:
// version, git commit, card fields, component weights, scale anchor, bands, extra points, mixed-card and
// part-blend settings, structure patterns (with weights and which are off), and the word/phrase lists
// (entry counts and checksums), plus the CHANGELOG entry for that version.
//
//   node tools/scorer_manifest.mjs                       # current working tree -> eval/scores/v<version>/
//   node tools/scorer_manifest.mjs --version 0.6.0       # that version as committed (from git history)
//   node tools/scorer_manifest.mjs --all                 # every version folder in eval/scores
//
// score_all.mjs writes one for the current scorer at the start of every run. Checksums let two runs be
// compared: same checksum = same list.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { ROOT, PATHS, runDir, runDirs } from './_paths.mjs';

const args = process.argv.slice(2), opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 << 20 }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

// The last commit at which a version was current: the commit before the next version was introduced.
function refFor(version) {
  const intro = v => (tryGit('log', '--format=%h', '-S', `SCORER_VERSION = '${v}'`, '--', 'js/score-card.js') || '').split('\n').filter(Boolean).pop();
  const versions = (tryGit('log', '--format=%h', '--', 'js/score-card.js') ? (tryGit('log', '-p', '--', 'js/score-card.js') || '').match(/SCORER_VERSION = '([0-9.]+)'/g) || [] : [])
    .map(x => x.match(/'([0-9.]+)'/)[1]);
  const all = [...new Set(versions)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const next = all[all.indexOf(version) + 1];
  if (!intro(version)) return null;
  return next && intro(next) ? `${intro(next)}^` : 'HEAD';
}

function manifest(ref) {   // ref = null -> working tree
  const read = p => ref ? tryGit('show', `${ref}:${p}`) : (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf-8') : null);
  const sc = read('js/score-card.js') || '', bs = read('js/botstyle.js') || '', st = read('js/ai-structures.js') || '', ar = read('js/ai-artifacts.js') || '';
  const m = (src, rx) => { const x = src.match(rx); return x ? x[1].trim() : null; };
  const version = m(sc, /SCORER_VERSION = '([0-9.]+)'/);
  const patterns = [...st.matchAll(/P\('([a-z_]+)',\s*'(?:[^'\\]|\\.)*',\s*\/(?:[^/\\\n]|\\.)+\/[a-z]*,\s*([0-9.]+)/g)].map(x => ({ id: x[1], weight: +x[2] }));
  const disabled = (m(st, /DISABLED_STRUCTURES = new Set\(\[([^\]]*)\]/) || '').match(/'([^']+)'/g)?.map(x => x.slice(1, -1)) || [];
  const listInfo = f => { const t = read(`data/${f}`); if (!t) return null; let n = null; try { const j = JSON.parse(t); n = Array.isArray(j) ? j.length : Object.keys(j.words || j).length; } catch { /* ignore */ }
    return { file: `data/${f}`, entries: n, sha256: createHash('sha256').update(t).digest('hex').slice(0, 12) }; };
  let anchor = null; const calT = read('data/botstyle_calibration.json');
  if (calT) { const c = JSON.parse(calT); const src = c.cards ? 'cards' : 'fiction';
    anchor = { source: src === 'cards' ? 'AI-written character cards (p90 of raw rates)' : '700-word AI fiction chunks (p90 of raw rates)',
      p90: Object.fromEntries(['words', 'phrases', 'structures'].map(k => [k, +(((c.cards || c)[k] || {}).p90 || 0).toFixed(3)])) }; }
  const changelog = (() => { const t = read('CHANGELOG.md') || ''; const parts = t.split(/\n(?=## )/).filter(p => p.startsWith('## ')); const v = (version || '').replace(/\./g, '\\.');
    // the entry that introduced this scorer version: "BBBScorer x.y.z" in the heading (0.7.0 on), else the app
    // version heading from when app and scorer versions matched ("## 0.4.0 (date)")
    const hit = parts.find(p => new RegExp(`BBBScorer ${v}\\b`).test(p.split('\n')[0])) || parts.find(p => new RegExp(`^## \\[?${v}\\]?[ (]`).test(p) && !/scorer stays/i.test(p.split('\n')[0]));
    return hit ? hit.trim() : null; })();
  const commit = ref ? tryGit('log', '-1', '--format=%h %ad %s', '--date=format:%Y-%m-%d %H:%M', ref) : `${tryGit('log', '-1', '--format=%h', 'HEAD')} + working tree${tryGit('status', '--porcelain', 'js', 'data') ? ' (uncommitted changes in js/ or data/)' : ''}`;
  return {
    version, commit, sameScoresAs: m(sc, /SAME_SCORES_AS = (\[[^\]]*\])/),
    defaultFields: m(sc, /DEFAULT_FIELDS = (\[[^\]]*\])/) || "['description', 'personality', 'scenario', 'first_mes'] (always; no field option)",
    weights: m(bs, /BOTSTYLE_WEIGHTS = (\{[^}]*\})/), minProseWords: m(bs, /MIN_PROSE_WORDS = (\d+)/),
    repeats: /repeatWeight/.test(bs) ? 'density-damped: w × (1 + ln x) per 700 words (length-neutral)' : 'w × (1 + ln k) per text (long texts score lower)',
    anchor, bands: m(sc, /WRITING_STYLE_BANDS = (\{[^}]*\})/), bandLabels: m(sc, /BAND_LABELS = (\{[^}]*\})/),
    emdash: m(st, /EMDASH_POINTS = (\{[^}]*\})/), artifacts: m(ar, /ARTIFACT_POINTS = (\{[^}]*\})/), contrastWeight: m(st, /CONTRAST_WEIGHT = ([0-9.]+)/),
    cardScore: /PART_WEIGHT_CAP/.test(sc) ? `blend of separately scored description and greeting, weighted by prose words (${m(sc, /PART_MIN_WORDS = (\d+)/)}–${m(sc, /PART_WEIGHT_CAP = (\d+)/)})` : 'one text (description + greeting joined)',
    mixed: /MIXED_GAP/.test(sc) ? `flag when both parts ≥ ${m(sc, /MIXED_MIN_WORDS = (\d+)/)} prose words and ≥ ${m(sc, /MIXED_GAP = (\d+)/)} points apart` : 'none',
    dialogue: /subkind: speech \? 'dialogue'|subkind === 'dialogue'|'dialogue'/.test(read('js/card-preprocess.js') || '') ? 'in-character dialogue counted as prose' : 'labeled/bulleted dialogue lines dropped as lists',
    structures: { contrast: 'not-x-but-y', patterns: patterns.map(p => ({ ...p, off: disabled.includes(p.id) })) },
    lists: ['botstyle_words.json', 'botstyle_bigrams.json', 'botstyle_trigrams.json', 'botstyle_names.json', 'botstyle_pulp_words.json', 'botstyle_calibration.json', 'botstyle_reference.json', 'botstyle_length_bands.json'].map(listInfo).filter(Boolean),
    changelog,
  };
}

function toMd(x) {
  const L = [`# BBBScorer ${x.version}`, '', `Scorer code: ${x.commit}`, ''];
  const row = (k, v) => v != null && L.push(`| ${k} | ${String(v).replace(/\|/g, '\\|')} |`);
  L.push('| Setting | Value |', '|---|---|');
  row('Card fields scored by default', x.defaultFields); row('Card score', x.cardScore); row('Component weights', x.weights);
  row('Scale anchor', x.anchor ? `${x.anchor.source}: words ${x.anchor.p90.words}, phrases ${x.anchor.p90.phrases}, structures ${x.anchor.p90.structures}` : null);
  row('Repeats', x.repeats); row('Bands', x.bands); row('Band labels', x.bandLabels); row('Em-dash points', x.emdash); row('Chatbot-leftover points', x.artifacts);
  row('Not-x-but-y weight', x.contrastWeight); row('Mixed cards', x.mixed); row('Dialogue', x.dialogue); row('Low confidence under', x.minProseWords ? `${x.minProseWords} prose words` : null);
  row('Scores identical to', x.profile ? null : x.sameScoresAs);
  if (x.profile) row('Rule switches (js/scorer-profile.js)', Object.entries(x.profile).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('; '));
  L.push('', '## Sentence-structure patterns', '', x.structures.patterns.map(p => `${p.id} ${p.weight}${p.off ? ' (off)' : ''}`).join(' · ') || '(none found)');
  L.push('', '## Data files', '', '| File | Entries | sha256 (first 12) |', '|---|---|---|', ...x.lists.map(l => `| ${l.file} | ${l.entries ?? '–'} | ${l.sha256} |`));
  if (x.changelog) L.push('', '## Changelog entry', '', x.changelog.replace(/^## /, '### '));
  return L.join('\n') + '\n';
}

// --scorer <v>: a version prepared in js/scorer-profile.js (working tree only): same code, different rule switches.
const PROFILE = opt('--scorer') ? (await import('../js/scorer-profile.js')).PROFILES[opt('--scorer')] : null;
function writeFor(version, ref) {
  const x = manifest(ref);
  if (PROFILE && !ref) { x.version = opt('--scorer'); x.profile = PROFILE; x.bands = PROFILE.lengthBands ? 'by prose length (data/botstyle_length_bands.json)' : x.bands; }
  if (!x.version) { console.log(`  ${version}: could not read the scorer at ${ref}`); return; }
  const dir = runDir(x.version); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SCORER.md'), toMd(x)); writeFileSync(join(dir, 'scorer.json'), JSON.stringify(x, null, 1));
  console.log(`  v${x.version}: ${join(dir, 'SCORER.md')} (${ref || 'working tree'})`);
}

if (args.includes('--all')) {
  const cur = manifest(null).version;
  for (const { version: v } of runDirs()) { if (v === cur) writeFor(v, null); else { const r = refFor(v); if (r) writeFor(v, r); else console.log(`  ${v}: no commit found`); } }
} else if (opt('--version')) { const r = refFor(opt('--version')); if (r) writeFor(opt('--version'), r); else console.log('No commit found for that version.'); }
else writeFor(null, null);
