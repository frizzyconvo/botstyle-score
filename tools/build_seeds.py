#!/usr/bin/env python3
"""build_seeds.py - Pick seed cards for tools/generate_ai_cards.mjs from AUTOMATIC/jaicards.

Usage: python3 tools/build_seeds.py <cards-js dir> <out.jsonl> [--folders 0,1] [--before 2023-07] [--n 300]

Keeps cards that are: created before --before (default 2023-07, i.e. before AI-written cards
were common), marked SFW on JanitorAI and without NSFW-ish tags, English, with a 80-900 word
description and a 30-600 word greeting, and not a pasted jailbreak. Sorted by a stable hash
so the order is reproducible. The generator uses the whole card for --modes rewrite and only
name + creator note + tags for fresh / antislop modes.
"""
import hashlib, json, os, re, sys

args = sys.argv[1:]
root, outp = args[0], args[1]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
folders = opt('--folders', '0,1').split(',')
before, N = opt('--before', '2023-07'), int(opt('--n', '300'))
NSFW = re.compile(r'\b(?:nsfw|r18|r-18|18\+|lewd|smut|hentai|futa|breeding|fetish|kink|bdsm|incest|yandere|non-?con|rape)\b', re.I)
# characters described as children are skipped too (generation prompts stay unambiguous)
MINOR = re.compile(r'\b(?:loli|shota|child|kid|toddler|preteen|middle school|elementary)\b|\b(?:[1-9]|1[0-7])\s*(?:-\s*\d+\s*)?(?:years?[ -]old|yrs?\b|y/o|yo\b)', re.I)
FUNC = set('the a an and of to in is was he she they her his it that with for on as at but you'.split())
rows = []
for d in folders:
    for name in os.listdir(os.path.join(root, d)):
        try:
            j = json.load(open(os.path.join(root, d, name), encoding='utf-8'))
        except Exception:
            continue
        c = j.get('data', j); x = (c.get('extensions') or {}).get('janitorai-export') or {}
        created = str(x.get('created_at') or '')
        if not created or created[:7] >= before or x.get('is_nsfw'):
            continue
        tags = c.get('tags') or []
        if isinstance(tags, str):
            tags = re.findall(r"'([^']+)'", tags) or [tags]
        desc, greet = (c.get('description') or '').strip(), (c.get('first_mes') or '').strip()
        blob = ' '.join([c.get('name') or '', ' '.join(tags), c.get('creator_notes') or '', desc, greet])
        if NSFW.search(blob) or MINOR.search(blob):
            continue
        dw, gw = len(desc.split()), len(greet.split())
        if not (80 <= dw <= 900 and 30 <= gw <= 600):
            continue
        toks = re.findall(r"[a-z']+", (desc + ' ' + greet).lower())
        if not toks or sum(t in FUNC for t in toks) / len(toks) < 0.22:
            continue
        rows.append({'id': x.get('id') or name[:-5], 'createdAt': created, 'name': c.get('name') or '', 'tags': tags,
                     'tagline': (c.get('creator_notes') or '').strip()[:300], 'description': desc,
                     'personality': c.get('personality') or '', 'scenario': c.get('scenario') or '', 'first_mes': greet,
                     'source': 'jaicards'})
rows.sort(key=lambda r: hashlib.sha1(str(r['id']).encode()).hexdigest())
with open(outp, 'w', encoding='utf-8') as f:
    for r in rows[:N]:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'{len(rows)} eligible, wrote {min(N, len(rows))} -> {outp}')
