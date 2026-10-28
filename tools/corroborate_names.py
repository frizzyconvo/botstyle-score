#!/usr/bin/env python3
"""Keep only AI-favourite names that independent data confirms.

build_lists.py finds candidate names in the leaderboard models' outputs (upstream's results/),
so on their own they could be quirks of those 22 models or of the prompts. A name is kept when,
in at least one set NOT used to build the lists, AI text uses it far more than human text:
  - SlopReview: 22 other models' stories vs Reddit WritingPrompts
  - SPB-2602 AI cards vs human cards from early 2023 (Korshuk + JanitorAI June 2023)
  - Gutenberg antislop-DPO: AI rewrites vs the original books
Rule: AI doc rate >= 0.5% and AI/human ratio >= 8 in one of those sets, and the name is rare
in every human set (< 0.4% of documents). EXTRA names were mined from SlopReview and kept only
if a second set agrees.

Usage: python3 tools/corroborate_names.py <slopreview.jsonl> <gutenberg.jsonl> <spb_cards.jsonl> <human_cards.jsonl>...
Writes data/botstyle_names.json: [name, {evidence}] rows (the page only reads the name).
"""
import json, re, sys, os
EXTRA = ['oakhaven', 'beatrice', 'bartholomew', 'davies', 'sharma']
here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, '..', 'data')
sr, gu, spb, *cards = sys.argv[1:]
F = ('description', 'personality', 'scenario', 'first_mes')
def docs(f, cond=lambda r: True, fields=('text',)):
    return [' '.join(str(r.get(k) or '') for k in fields) for r in map(json.loads, filter(str.strip, open(f, encoding='utf-8'))) if cond(r)]
S = {'slopreview_human': docs(sr, lambda r: r['source'] == 'Human'), 'slopreview_ai': docs(sr, lambda r: r['source'] == 'AI'),
     'gutenberg_human': docs(gu, lambda r: r['source'] == 'Human'), 'gutenberg_ai': docs(gu, lambda r: r['source'] == 'AI'),
     'cards_2023': sum((docs(f, fields=F) for f in cards), []), 'spb_ai_cards': docs(spb, fields=F)}
PAIRS = [('slopreview_ai', 'slopreview_human'), ('spb_ai_cards', 'cards_2023'), ('gutenberg_ai', 'gutenberg_human')]
cands = [r[0] for r in json.load(open(os.path.join(data, 'botstyle_name_candidates.json'), encoding='utf-8'))]
out, dropped = [], []
for n in cands + [e for e in EXTRA if e not in cands]:
    rx = re.compile(r'\b' + n.capitalize() + r'\b')
    rate = {k: sum(1 for d in v if rx.search(d)) / len(v) for k, v in S.items()}
    ratio = {a: round((rate[a] + 1e-4) / (rate[h] + 1e-4), 1) for a, h in PAIRS}
    hits = [a for a, h in PAIRS if rate[a] >= 0.005 and ratio[a] >= 8]
    human_max = max(rate[h] for _, h in PAIRS)
    need = 2 if n in EXTRA else 1
    ev = {'pct': {k: round(100 * v, 2) for k, v in rate.items()}, 'ai_human_ratio': ratio, 'confirmed_by': hits}
    (out if len(hits) >= need and human_max < 0.004 else dropped).append([n, ev])
with open(os.path.join(data, 'botstyle_names.json'), 'w', encoding='utf-8') as f:
    f.write('[\n' + ',\n'.join(json.dumps(r) for r in out) + '\n]\n')
print(f'kept {len(out)}: ' + ', '.join(r[0] for r in out))
print(f'dropped {len(dropped)}: ' + ', '.join(f"{r[0]} ({r[1]['confirmed_by'] or 'no independent support'}, human max {max(r[1]['pct'][h] for _, h in PAIRS)}%)" for r in dropped))
