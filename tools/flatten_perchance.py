#!/usr/bin/env python3
"""flatten_perchance.py - Perchance AI Character Chat database -> card JSONL (score_cards.mjs input).

Usage: python3 tools/flatten_perchance.py <perchance-character-database> <out.jsonl>

Each character folder has src/roleInstruction.txt (the description), src/initialMessages.json
(messages with author ai/user/system and hiddenFrom) and changelog.json (date it was added to
the database, Sep 2024 onward; NOT the date the character was written).

Field mapping:
  description  roleInstruction, minus any "Example dialogue" section (moved to mes_example)
  first_mes    the first 'ai' message; if none, the first visible system message (a scene opener)
  mes_example  example-dialogue sections from roleInstruction + system messages hidden from the user
  System messages hidden from the AI are UI tips ("tap the Narrator button") and are dropped.
"""
import json, os, re, sys

EX_START = re.compile(r'(?im)^[\s#*\-]*(?:---\s*)?(?:start of )?example (?:dialogue|dialog|conversation|messages?|chat)s?\b.*$|^\s*<START>\s*$')

def split_examples(ri):
    m = EX_START.search(ri)
    if not m:
        return ri.strip(), ''
    return ri[:m.start()].strip(), ri[m.start():].strip()

def read(p):
    try:
        with open(p, encoding='utf-8', errors='replace') as f: return f.read()
    except FileNotFoundError: return ''

def main(root, out):
    base = os.path.join(root, 'ai-character-chat', 'characters')
    rows = []
    for rating in ('sfw', 'nsfw'):
        d = os.path.join(base, rating)
        if not os.path.isdir(d): continue
        for name in sorted(os.listdir(d)):
            src = os.path.join(d, name, 'src')
            if not os.path.isdir(src): continue
            ri = read(os.path.join(src, 'roleInstruction.txt'))
            desc, ex = split_examples(ri)
            try: msgs = json.loads(read(os.path.join(src, 'initialMessages.json')) or '[]')
            except json.JSONDecodeError: msgs = []
            hidden = lambda m: m.get('hiddenFrom') or []
            ai = [m['content'] for m in msgs if m.get('author') == 'ai' and m.get('content')]
            scene = [m['content'] for m in msgs if m.get('author') == 'system' and not hidden(m) and m.get('content')]
            exs = [m['content'] for m in msgs if m.get('author') == 'system' and 'user' in hidden(m) and 'ai' not in hidden(m)]
            try: manifest = json.loads(read(os.path.join(d, name, 'manifest.json')) or '{}')
            except json.JSONDecodeError: manifest = {}
            try: created = json.loads(read(os.path.join(d, name, 'changelog.json')) or '{}').get('created', '')
            except json.JSONDecodeError: created = ''
            cats = manifest.get('categories', {})
            tags = sorted({t for k, v in cats.items() if isinstance(v, list) for t in v})
            rows.append({
                'id': f'perchance/{rating}/{name}', 'name': read(os.path.join(src, 'name.txt')).strip() or manifest.get('name', name),
                'createdAt': created, 'rating': rating, 'author': manifest.get('author', ''),
                'description': desc, 'first_mes': (ai or scene or [''])[0],
                'first_mes_source': 'ai' if ai else ('scene' if scene else 'none'),
                'mes_example': '\n\n'.join(x for x in [ex] + exs if x), 'tags': tags,
                'tagline': manifest.get('description', ''), 'source': 'perchance',
            })
    with open(out, 'w', encoding='utf-8') as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{len(rows)} characters -> {out}; greeting from ai msg {sum(r["first_mes_source"]=="ai" for r in rows)}, '
          f'scene {sum(r["first_mes_source"]=="scene" for r in rows)}, none {sum(r["first_mes_source"]=="none" for r in rows)}; '
          f'example dialogue found {sum(bool(r["mes_example"]) for r in rows)}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
