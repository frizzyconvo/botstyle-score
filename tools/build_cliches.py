#!/usr/bin/env python3
"""Build data/botstyle_cliches.json: clichés humans and models BOTH use. They're tallied
on the page (unscored) so a creator can see them, but they aren't evidence of AI.

Sources:
  - upstream slop-score lists (tools/audit_upstream_*.json): entries dropped from the scored
    lists because humans use them about as often, but which current models still use;
  - sentence patterns tested in tools/mine_structures.py that didn't separate human from AI;
  - SloppySeconds' community list (pixelnull/sillytavern-SloppySeconds) entries that didn't separate.
Anything already scored (botstyle_* lists, js/ai-structures.js) is left out.
Usage: python3 tools/build_cliches.py [path/to/SloppySeconds/settings.js]
"""
import json, os, re, sys
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scored = set()
for n in ('words', 'bigrams', 'trigrams'):
    scored |= {r[0] for r in json.load(open(os.path.join(here, 'data', f'botstyle_{n}.json')))}

# --- n-gram clichés from the upstream lists -------------------------------------------
BEAT = re.compile(r"\b(?:heart|breath|eyes?|voice|head|shiver|smile|grin|gaze|whisper\w*|lips?|hands?|fists?|jaw|brow|spine|chest|throat|tears?|knees?|door|silence|shadows?|glance\w*|nod\w*|sigh\w*|step|stare\w*|blink\w*|swallow\w*|tremb\w*|flicker\w*|pounding|racing|wide|deep|hold|held)\b")
phrases, words = [], []
for n in ('bigrams', 'trigrams'):
    for g, ratio, ai_count, models, human, kept in json.load(open(os.path.join(here, 'tools', f'audit_upstream_{n}.json'))):
        if kept or g in scored or ai_count < 5 or models < 3 or human < 10 or ratio < 0.5: continue
        if n == 'bigrams' and not BEAT.search(g): continue      # plain narration ("could see") isn't a cliché
        phrases.append([g, 2 if n == 'bigrams' else 3, round(ratio, 2), 'upstream slop-score'])
for g, ratio, ai_count, models, human, kept in json.load(open(os.path.join(here, 'tools', 'audit_upstream_words.json'))):
    if kept or g in scored or ai_count < 15 or models < 4 or ratio < 1.5: continue
    words.append([g, round(ratio, 2)])

# --- sentence patterns that didn't separate -------------------------------------------
patterns = [
    ('banter_lines', 'Stock banter lines ("took you long enough", "I don\'t bite… much")', r"\b(?:well, well(?:, well)?|look who(?:'s| is| finally)|took you long enough|didn't (?:anyone|your mother|they) ever tell you|you're (?:cute|adorable) when you|like what you see|don't get any ideas|i don't bite|you wound me|how (?:very )?(?:bold|brave|daring) of you|playing hard to get|is that so\?|careful now|easy there)"),
    ('playful_smirk', '"a playful/knowing smirk"', r"\b(?:a|with a|her|his) (?:playful|teasing|mischievous|wry|lopsided|crooked|amused|devilish|sly) (?:smirk|grin|smile|glint|twinkle|lilt)"),
    ('for_a_moment', '"for a moment / a heartbeat"', r"\bfor (?:a|one) (?:moment|heartbeat|breath|beat|second|long moment)\b"),
    ('something_akin', '"something akin to / something like"', r"\bsomething (?:akin to|between|close to|almost like)\b"),
    ('head_tilt', 'Head tilt', r"\b(?:tilts|tilted|tilting|cocks|cocked|cocking) (?:her|his|their) head\b"),
    ('couldnt_help', '"couldn\'t help but"', r"\b(?:couldn't|could not|can't|cannot) help but\b"),
    ('first_time_in', '"for the first time in years"', r"\bfor the first time in (?:a long time|years|forever|what felt like|ages|decades|centuries)\b"),
    ('despite_herself', '"despite herself"', r"\bdespite (?:herself|himself|themselves|myself)\b"),
    ('litotes', '"not unkind / not unpleasant"', r"\bnot (?:unkind|unpleasant|unwelcome|entirely unpleasant|entirely unwelcome)\b"),
    ('a_beat', 'Beat sentence ("A beat." "Silence.")', r"(?:^|[.!?]\s+)(?:A beat|Silence|Nothing)\."),
    ('time_stopped', '"time seemed to stop"', r"\b(?:time|the world|everything|the room) (?:seemed to |itself )?(?:slowed|stopped|stood still|narrowed|fell away|tilted|held its breath|shrank)\b"),
    ('something_shifted', '"something shifted"', r"\bsomething (?:shifted|changed|cracked|broke|stirred|snapped|clicked)\b"),
]
ss_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'sillytavern-SloppySeconds', 'settings.js')
scored_rx = []
st = open(os.path.join(here, 'js', 'ai-structures.js'), encoding='utf-8').read()
for m in re.finditer(r"P\('[^']+', '(?:[^'\\]|\\.)*', /(.+?)/gi?,", st):
    try: scored_rx.append(re.compile(m.group(1).replace('\\/', '/'), re.I))
    except re.error: pass
if os.path.exists(ss_path):
    src = open(ss_path, encoding='utf-8').read()
    block = src[src.index('slopPatterns: ['):src.index('],', src.index('slopPatterns: ['))]
    for p in re.findall(r"'((?:\\'|[^'])*)'", block):
        p = p.replace("\\'", "'")
        toks = ' '.join(re.findall(r"[a-z]+", p.lower()))
        variants = [p, p + ' her', 'a ' + p, 'a ' + p + ' her', p + ' her eyes']   # scored regexes often need a following word
        if any(rx.search(v) for rx in scored_rx for v in variants) or toks in scored: continue
        if any(re.search(r, p, re.I) or re.search(r, "a " + p, re.I) for _, _, r in patterns): continue   # already a cliché pattern
        patterns.append(('ss:' + p, f'"{p}"', r"\b" + re.escape(p).replace(r"\ ", r"\s+") + r"\b"))
else:
    print('SloppySeconds settings.js not found; skipping its patterns:', ss_path)
# a bigram whose words both appear in a cliché pattern ("tilted head" vs the head-tilt pattern) is that pattern
pat_words = [set(re.findall(r"[a-z]+", r.lower())) for _, _, r in patterns]
phrases = [p for p in phrases if p[1] == 3 or not any(set(p[0].split()) <= w for w in pat_words)]
out = {'_about': 'Clichés humans and models both use: tallied, not scored. Built by tools/build_cliches.py.',
       'phrases': sorted(phrases, key=lambda x: -x[2]), 'words': sorted(words, key=lambda x: -x[1]),
       'patterns': [{'id': i, 'label': l, 'regex': r} for i, l, r in patterns]}
json.dump(out, open(os.path.join(here, 'data', 'botstyle_cliches.json'), 'w'), indent=1)
print(f"phrases {len(phrases)}, words {len(words)}, patterns {len(patterns)}")
print("phrases e.g.", [p[0] for p in phrases[:30]])
