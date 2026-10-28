#!/usr/bin/env python3
"""Flatten AUTOMATIC/jaicards (cards-js/<hex>/<uuid>.json, from cards-js.7z) into one JSONL.
Usage: python3 tools/flatten_jaicards.py <path/to/cards-js> <out.jsonl>
Tip: reading ~190k small files is slow over network/VM folder mounts; run it where the files live."""
import json, os, sys
root, outp = sys.argv[1], sys.argv[2]; n = bad = 0
with open(outp, 'w', encoding='utf-8') as fo:
    for d in sorted(os.listdir(root)):
        for name in os.listdir(os.path.join(root, d)):
            try:
                j = json.load(open(os.path.join(root, d, name), encoding='utf-8'))
                c = j.get('data', j); x = (c.get('extensions') or {}).get('janitorai-export') or {}; st = x.get('stats') or {}
                fo.write(json.dumps({'id': x.get('id') or name[:-5], 'createdAt': x.get('created_at'), 'creator': c.get('creator'), 'name': c.get('name'),
                    'nsfw': x.get('is_nsfw'), 'showdef': x.get('showdefinition'), 'chats': int(st.get('chat') or 0), 'messages': int(st.get('message') or 0),
                    'tags': c.get('tags') or [], 'description': c.get('description') or '', 'personality': c.get('personality') or '',
                    'scenario': c.get('scenario') or '', 'first_mes': c.get('first_mes') or '', 'mes_example': c.get('mes_example') or '',
                    'alternate_greetings': c.get('alternate_greetings') or [], 'creator_notes': c.get('creator_notes') or ''}, ensure_ascii=False) + '\n'); n += 1
            except Exception: bad += 1
print(n, 'ok', bad, 'bad')
