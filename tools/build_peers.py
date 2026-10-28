#!/usr/bin/env python3
"""Build data/botstyle_peers.json: per style family, percentiles of each component's raw
rate on the earliest (least AI-touched) cards we have, so the page can say "for a
W++/PList card, this card's slop words are at the 95th percentile".

Usage: python3 tools/build_peers.py <scores.jsonl> [<scores.jsonl> ...] [--before 2023-07]
Inputs are tools/score_cards.mjs outputs. Cards created on/after --before are skipped
(card-writing tells rise steadily from early 2023 on, so later cards are a worse baseline).
"""
import json, sys
args = sys.argv[1:]
before = '2023-07'
if '--before' in args:
    i = args.index('--before'); before = args[i + 1]; del args[i:i + 2]
Q = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
fam = {}
for f in args:
    for l in open(f, encoding='utf-8'):
        if not l.strip(): continue
        r = json.loads(l)
        if not r.get('rates') or not r.get('reliable') or r.get('nonEnglish'): continue
        ca = str(r.get('createdAt') or '')
        if ca and ca[:4].isdigit() and ca[:7] >= before: continue
        fam.setdefault(r['family'], []).append(r['rates'])
def q(v, p): v = sorted(v); return round(v[min(len(v) - 1, int(p * len(v)))], 3)
out = {'_about': f'Percentiles of botstyle component rates per style family, on reliable English cards created before {before}. Built by tools/build_peers.py.',
       'quantiles': Q, 'families': {}}
for k, rows in sorted(fam.items()):
    if len(rows) < 40: continue
    out['families'][k] = {'n': len(rows), **{m: [q([r[m] for r in rows], p) for p in Q] for m in ('words', 'phrases', 'structures')}}
json.dump(out, open('data/botstyle_peers.json', 'w'), indent=1)
for k, v in out['families'].items(): print(f"{k:20s} n={v['n']:5d}  words p50/p90 {v['words'][2]}/{v['words'][4]}  phrases p90 {v['phrases'][4]}  structures p90 {v['structures'][4]}")
