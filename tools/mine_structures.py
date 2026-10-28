#!/usr/bin/env python3
"""Mine candidate AI sentence structures (see js/ai-structures.js).
Compares document-hit rates of each regex in human vs AI text on three sets:
SlopReview stories, Gutenberg antislop-DPO pairs (600 words), and cards (2023 JanitorAI/Chub vs SPB-2602).
Paths below point at the eval copies; edit them to your layout. Writes mine_results.json."""
random.seed(3)
W = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
def first(t, n=700):
    ws = list(W.finditer(t)); return t[:ws[n-1].end()] if len(ws) >= n else t
sets = {}
sr = [json.loads(l) for l in open('/home/claude/work/data/slop_dataset_ensemble_predictions.jsonl')]
sets['SlopReview'] = ([first(r['text']) for r in sr if r['source'] != 'AI'], [first(r['text']) for r in sr if r['source'] == 'AI'])
gu = [json.loads(l) for l in open('/home/claude/work/data/gutenberg_eval.jsonl')]
sets['Gutenberg'] = ([r['text'] for r in gu if r['source'] == 'Human'], [r['text'] for r in gu if r['source'] == 'AI'])
hc = []
for l in open('/home/claude/work/jai/jaicards.jsonl'):
    r = json.loads(l)
    if (r['createdAt'] or '') < '2023-07-15': hc.append(r['description'] + '\n\n' + r['first_mes'])
hc = random.sample(hc, 3000)
for l in open('/home/claude/work/data/raincandy_cards.jsonl'):
    r = json.loads(l)
    if str(r['createdAt']) < '2023-07': hc.append((r['description'] or '') + '\n\n' + (r['first_mes'] or ''))
spb = [json.loads(l)['description'] for l in open('/home/claude/work/data/spb_cards.jsonl')]
sets['Cards(2023 vs SPB)'] = ([first(t) for t in hc if len(W.findall(t)) >= 150], [first(t) for t in spb])
I = re.I
C = {
 # banter
 'banter_lines': (r"\b(?:well, well(?:, well)?|look who(?:'s| is| finally)|took you long enough|didn't (?:anyone|your mother|they) ever tell you|you're (?:cute|adorable) when you|like what you see|don't get any ideas|i don't bite|you wound me|how (?:very )?(?:bold|brave|daring) of you|playing hard to get|is that so\?|careful now|easy there)", I),
 'banter_tag': (r"[\"”]\s*,?\s*(?:she|he|they|[A-Z]\w+) (?:\w+ly )?(?:teased|smirked|purred|quipped|drawled|chuckled|grinned|teases|smirks|purrs|quips|drawls|chuckles|grins)\b", 0),
 'playful_smirk': (r"\b(?:a|with a|her|his) (?:playful|teasing|mischievous|knowing|wry|lopsided|crooked|amused|devilish|sly) (?:smirk|grin|smile|glint|twinkle|lilt)", I),
 'amusement_dancing': (r"\b(?:amusement|mischief|mirth|humor|laughter) (?:dancing|glinting|twinkling|sparkling|flickering|glittering) in\b", I),
 'hint_of': (r"\b(?:a hint|a trace|a touch|a flicker|a glimmer|a ghost|a whisper) of (?:a )?\w+", I),
 # similes / metaphors
 'abstract_simile': (r"\blike (?:a|an) (?:promise|secret|prayer|confession|memory|challenge|threat|question|benediction|lifeline|accusation|caress|warning|invitation|vow|heartbeat|living thing|second skin|physical (?:blow|thing|weight)|tangible (?:thing|weight)|balm|brand)\b", I),
 'as_if_world': (r"\bas (?:if|though) (?:the (?:world|universe|very|air|room|night|house)|time itself|reality)\b", I),
 'noun_of_abstract': (r"\b(?:a|the) (?:tapestry|symphony|dance|kaleidoscope|cacophony|mosaic|maelstrom|whirlwind|torrent|chorus) of\b", I),
 'something_akin': (r"\bsomething (?:akin to|like|between|close to|almost like)\b", I),
 'kind_of_that': (r"\bthe (?:kind|sort|type) of \w+(?: \w+)? (?:that|which|you|only)\b", I),
 'mix_of': (r"\b(?:a|the) (?:mix|mixture|blend|cocktail|combination) of \w+(?: \w+)? and \w+", I),
 'time_stopped': (r"\b(?:time|the world|everything|the room) (?:seemed to |itself )?(?:slowed|stopped|stood still|narrowed|fell away|tilted|held its breath|shrank)\b", I),
 'air_thick': (r"\bthe air (?:was |is |grew |hung |felt )?(?:thick|heavy|charged|electric|crackl\w+|hum\w+|alive)\b", I),
 'eyes_that_held': (r"\b(?:eyes|gaze|voice|smile) (?:that|which) (?:held|carried|promised|spoke of|seemed to|hinted)\b", I),
 'practiced_ease': (r"\bwith (?:a |an )?(?:practiced|deliberate|languid|effortless|predatory|feline|fluid|unhurried) (?:ease|grace|precision|movement|motion|confidence)\b", I),
 'imperceptible': (r"\b(?:almost|nearly) (?:imperceptibl\w+|inaudibl\w+)|\bbarely (?:audible|perceptible|above a whisper)\b", I),
 'voice_texture': (r"\b(?:voice|tone|words) (?:was |is )?(?:a )?(?:low|soft|warm|velvet\w*|honeyed|silken|gravelly|smoky|husky) (?:rumble|caress|murmur|purr|melody|drawl)\b", I),
 # rhythm / structure
 'one_word_triplet': (r"(?:^|[.!?]\s+)[A-Z]\w*\.\s+[A-Z]\w*\.\s+[A-Z]\w*\.", 0),
 'rhetorical_qa': (r"[.!?]\s+(?:And|But|So) (?:the |her |his |that |this |what )?\w+\?\s+[A-Z]", 0),
 'for_a_moment': (r"\bfor (?:a|one) (?:moment|heartbeat|breath|beat|second|long moment)\b", I),
 'somewhere_a_dog': (r"\b(?:somewhere|outside|in the distance),? (?:a|an|the) \w+ (?:barked|howled|hooted|cried|called|chimed|rang|honked|wailed)\b", I),
 'maybe_just_maybe': (r"\b(?:maybe|perhaps),? just (?:maybe|perhaps)\b", I),
 'litotes': (r"\bnot (?:unkind|unpleasant|unwelcome|entirely unpleasant|entirely unwelcome)\b|\bnot quite (?:a|an)? ?\w+,? (?:but|not quite)\b", I),
 'low_hum': (r"\b(?:a|the) (?:low|soft|quiet|faint|steady|constant) (?:hum|thrum|buzz|whir|drone)\b", I),
 'every_every': (r"\b(?:every|each) \w+, (?:every|each) \w+", I),
 'participle_open': (r"(?:^|[.!?*]\s+)[A-Z][a-z]+ing (?:her|his|their|the|a|my) \w+(?: \w+)?, (?:she|he|they|I|[A-Z]\w+)\b", 0),
 'head_tilt': (r"\b(?:tilts|tilted|tilting|cocks|cocked|cocking) (?:her|his|their) head\b", I),
 'breath_didnt_know': (r"\bbreath (?:she|he|they|I) (?:didn't|hadn't|did not) (?:know|realize)\b", I),
 'something_shifted': (r"\bsomething (?:shifted|changed|cracked|broke|stirred|snapped|clicked)\b", I),
 'first_time_in': (r"\bfor the first time in (?:a long time|years|forever|what felt like|ages|decades|centuries)\b", I),
 'testament_reminder': (r"\b(?:a|the) (?:testament|reminder|stark reminder) (?:to|of|that)\b", I),
 'equal_measure': (r"\bin (?:equal|perfect) measure\b|\bequal parts \w+ and \w+", I),
 'safety_hedge': (r"\([^()\n]{0,40}\b(?:safely|responsibly|legally|consensually|in (?:a |an )?(?:safe|controlled|consensual|legal|private|supervised|responsible)\b|with (?:full |enthusiastic )?consent)[^()\n]{0,40}\)", I),
 'despite_herself': (r"\bdespite (?:herself|himself|themselves|myself)\b", I),
 'didnt_so_much': (r"\b\w+n't (?:so much )?\w+ so much as\b|\bless (?:a|an) \w+ (?:and|than) more (?:a|an|of)\b", I),
 'a_beat': (r"(?:^|[.!?]\s+)(?:A beat|Then|Silence|Nothing)\.", 0),
 'whisper_secret': (r"\b(?:like|as if) (?:sharing|telling|confessing|whispering) (?:a|an) (?:secret|confession)\b", I),
 'unspoken': (r"\bunspoken (?:\w+ )?(?:words|question|promise|tension|understanding|truth|challenge)\b|\bsomething unspoken\b", I),
 'weight_of': (r"\bthe weight of (?:her|his|their|it|the|a|years|everything|centuries|the world)\b", I),
 'ozone': (r"\b(?:ozone|petrichor)\b", I),
}
for k, (rx, fl) in C.items(): C[k] = re.compile(rx, fl)
EM = re.compile(r"—|–| -- ")
def stats(H, A):
    out = {}
    nH = [max(1, len(W.findall(t))) for t in H]; nA = [max(1, len(W.findall(t))) for t in A]
    for k, rx in C.items():
        hH = [len(rx.findall(t)) for t in H]; hA = [len(rx.findall(t)) for t in A]
        pH = sum(1 for x in hH if x) / len(H); pA = sum(1 for x in hA if x) / len(A)
        rH = sum(hH) / sum(nH) * 1000; rA = sum(hA) / sum(nA) * 1000
        out[k] = (pH, pA, rH, rA)
    eH = sorted(len(EM.findall(t)) * 1000 / n for t, n in zip(H, nH)); eA = sorted(len(EM.findall(t)) * 1000 / n for t, n in zip(A, nA))
    q = lambda a, p: a[min(len(a) - 1, int(p * len(a)))]
    out['_emdash'] = ([q(eH, p) for p in (.5, .75, .9, .95, .99)], [q(eA, p) for p in (.25, .5, .75, .9)])
    return out
res = {name: stats(H, A) for name, (H, A) in sets.items()}
print('sizes', {k: (len(h), len(a)) for k, (h, a) in sets.items()})
print(f"{'pattern':20s}" + ''.join(f" | {n[:18]:>18s}: %docs H/AI  ratio" for n in res))
for k in C:
    row = f"{k:20s}"
    for n in res:
        pH, pA, rH, rA = res[n][k]
        row += f" | {100*pH:5.1f}/{100*pA:5.1f}%  {('%5.1f' % (rA/rH)) if rH else '  inf' if rA else '    -'}" + ' ' * 9
    print(row)
for n in res:
    h, a = res[n]['_emdash']; print(f"em-dash/1k words {n}: human p50/p75/p90/p95/p99 {[round(x,1) for x in h]}   AI p25/p50/p75/p90 {[round(x,1) for x in a]}")
json.dump({n: {k: v for k, v in r.items()} for n, r in res.items()}, open('mine_results.json', 'w'))
