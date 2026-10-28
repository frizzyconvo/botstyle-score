#!/usr/bin/env python3
"""build_reference.py - Score distributions the page grades against (data/botstyle_reference.json).

Usage: python3 tools/build_reference.py [--invalid ids.json]
Reads the scored sets in eval/ and writes 101 quantiles (0th..100th percentile) of the botstyle score
for each reference group, using reliable English cards only (>= 150 prose words):
  human_2023  Korshuk (Feb-Apr 2023) + JanitorAI June 2023 + Chub created before Jul 2023
  ai_cards    generated cards (eval/ai_cards*_scores.jsonl, valid ones) + SPB-2602
scoreCard() turns a score into "higher than N% of human cards / M% of AI cards".
"""
import json, os, sys

def load(p):
    return [json.loads(l) for l in open(p, encoding='utf-8')] if os.path.exists(p) else []

def valid_ids(path):
    out = set()
    for r in load(path):
        if r.get('valid', True):
            out.add(r['id'])
    return out

def ok(r):
    return r.get('reliable') and not r.get('nonEnglish')

human = [r for r in load('eval/korshuk_scores.jsonl') + load('eval/jaicards_june2023_scores.jsonl')
         + [x for x in load('eval/raincandy_scores.jsonl') if str(x.get('createdAt', '')) < '2023-07'] if ok(r)]
invalid = set(json.load(open(sys.argv[sys.argv.index('--invalid') + 1]))) if '--invalid' in sys.argv else set()
ai = [r for r in load('eval/ai_cards_scores.jsonl') if ok(r) and r['id'] not in invalid]
v2ok = valid_ids('eval/ai_cards_v2.jsonl')
ai += [r for r in load('eval/ai_cards_v2_scores.jsonl') if ok(r) and r['id'] in v2ok]
ai += [r for r in load('eval/spb_scores.jsonl') if ok(r)]

def quantiles(v):
    v = sorted(v)
    return [round(v[min(len(v) - 1, int(round(q / 100 * (len(v) - 1))))], 2) for q in range(101)]

out = {
    'note': 'Botstyle score quantiles (index = percentile). Built by tools/build_reference.py.',
    'groups': {
        'human_2023': {'label': 'human-written cards (2023)', 'n': len(human), 'q': quantiles([r['botstyle'] for r in human])},
        'ai_cards': {'label': 'AI-written cards', 'n': len(ai), 'q': quantiles([r['botstyle'] for r in ai])},
    },
}
json.dump(out, open('data/botstyle_reference.json', 'w'), indent=1)
for k, g in out['groups'].items():
    print(k, g['n'], 'p10/p50/p90', g['q'][10], g['q'][50], g['q'][90])
