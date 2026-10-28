#!/usr/bin/env python3
"""build_reference.py - Score distributions the page grades against (data/botstyle_reference.json).

Usage:
  python3 tools/build_reference.py --scores eval/scores/v0.4.0 [--human-before 2023-07] [--jai-before 2024-03]
Reads tools/score_all.mjs output for one scorer version and writes 101 quantiles (0th..100th
percentile) of the botstyle score per reference group, reliable English cards only:
  human_2023  Korshuk + Chub (raincandy) created before --human-before + JanitorAI created before
              --jai-before (JanitorAI's dump runs May 2023-Feb 2024; its scores match early 2023)
  ai_cards    generated runs (valid cards) + SPB-2602. character-card-skills cards are left out:
              they were written to evade exactly this kind of scoring.
scoreCard() turns a score into "higher than N% of human cards / M% of AI cards". Rebuild whenever
the scorer version changes, or the percentiles describe a different scorer.
"""
import json, os, sys

args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
SC = opt('--scores', None)
if not SC: sys.exit('need --scores eval/scores/v<version>')
HB, JB = opt('--human-before', '2023-07'), opt('--jai-before', '2024-03')

def load(name):
    p = os.path.join(SC, name + '.jsonl')
    return [json.loads(l) for l in open(p, encoding='utf-8')] if os.path.exists(p) else []

ok = lambda r: not r.get('error') and r.get('reliable') and not r.get('nonEnglish')
early = lambda r, b: bool(r.get('createdAt')) and str(r['createdAt'])[:7] < b
human = [r for r in load('korshuk') if ok(r)] + [r for r in load('raincandy_chub') if ok(r) and early(r, HB)] + [r for r in load('jaicards') if ok(r) and early(r, JB)]
ai = [r for n in ('generated_v1', 'generated_v2', 'spb_ai') for r in load(n) if ok(r)]
versions = {r['version'] for r in human + ai}
if len(versions) != 1: sys.exit(f'mixed scorer versions in {SC}: {versions}')

def quantiles(v):
    v = sorted(v)
    return [round(v[min(len(v) - 1, int(round(q / 100 * (len(v) - 1))))], 2) for q in range(101)]

parts = {'korshuk': len([r for r in load('korshuk') if ok(r)]), 'chub_before_' + HB: len([r for r in load('raincandy_chub') if ok(r) and early(r, HB)]),
         'janitorai_before_' + JB: len([r for r in load('jaicards') if ok(r) and early(r, JB)])}
out = {'note': 'Botstyle score quantiles (index = percentile). Built by tools/build_reference.py.', 'version': versions.pop(),
       'groups': {'human_2023': {'label': 'human-written cards (2023)', 'n': len(human), 'parts': parts, 'q': quantiles([r['score'] for r in human])},
                  'ai_cards': {'label': 'AI-written cards', 'n': len(ai), 'q': quantiles([r['score'] for r in ai])}}}
json.dump(out, open('data/botstyle_reference.json', 'w'), indent=1)
for k, g in out['groups'].items():
    print(k, g['n'], g.get('parts', ''), 'p10/p50/p80/p90/p98', g['q'][10], g['q'][50], g['q'][80], g['q'][90], g['q'][98])
