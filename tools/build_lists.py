#!/usr/bin/env python3
"""
Rebuild botstyle-score's word / bigram / trigram slop lists with per-entry weights.

AI side:    creative-writing outputs (prompt_index < 150) from results/*.json
            -- 22 current models answering Reddit WritingPrompts.
Human side: human_writing_profile.json from slop-forensics
            -- n-gram counts from human Reddit WritingPrompts stories.

Both corpora answer the same kind of prompt, so the ratio isolates *style*
rather than topic. Essay outputs are excluded entirely, which drops the
bizspeak that the upstream lists picked up from the essay domain.

Weight = log2(ratio / 2), capped at 6, where ratio = AI rate / human rate, calibrated so the median of the most
common shared n-grams scores ratio 1.0 (the human corpus total is unknown,
so we anchor on ordinary narration instead).

Usage:  python3 tools/build_lists.py [--human PATH] [--out data/]
"""
import argparse, glob, json, math, os, re, statistics
from collections import Counter, defaultdict

STOPWORDS = set("""i me my myself we our ours ourselves you your yours yourself yourselves
he him his himself she her hers herself it its itself they them their theirs themselves what
which who whom this that these those am is are was were be been being have has had having do
does did doing a an the and but if or because as until while of at by for with about against
between into through during before after above below to from up down in out on off over under
again further then once here there when where why how all any both each few more most other
some such no nor not only own same so than too very s t can will just don should now""".split())

# Topic filter: an n-gram must appear across this many distinct prompts,
# and no single prompt may account for more than this share of its hits.
MIN_PROMPTS = {1: 25, 2: 15, 3: 10}
MAX_TOP_PROMPT_SHARE = 0.25

# Fragments left by contractions/abbreviations under some tokenisers ("i'm" -> "m").
FRAGMENTS = set("m re ve ll d won didn wasn couldn wouldn shouldn isn aren hasn haven hadn weren doesn ain".split())

TOK = re.compile(r"[a-z']+")
ALPHA = re.compile(r"^[a-z]+(?:'[a-z]+)?$")
QUOTES = str.maketrans({c: "'" for c in "‘’‚‛′ʼ＇`"})

NUMBERS = set("""one two three four five six seven eight nine ten eleven twelve thirteen fourteen
fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety
hundred thousand million billion""".split())

def split_clitic(t):
    """Mirror how the human profile was tokenised: couldn't -> could, i'm -> i, it's -> it.
    Must stay in sync with ngramTokens() in js/botstyle.js."""
    if t.endswith("n't"):
        return t[:-3]
    i = t.find("'")
    return t[:i] if i > 0 else t

def content_tokens(text):
    toks = [split_clitic(t.strip("'")) for t in TOK.findall(text.lower().translate(QUOTES))]
    return [t for t in toks if t and ALPHA.match(t) and t not in STOPWORDS]

def ngrams(toks, n):
    return (" ".join(toks[i:i+n]) for i in range(len(toks) - n + 1))

CAP_TOKEN = re.compile(r"[A-Za-z]+")

def load_ai(results_dir, creative_max_index=150):
    """Per-model counters of content uni/bi/tri-grams plus token and character totals.
    Also counts, per lowercase word, how often it appears capitalised mid-sentence
    (to spot names like Elara or Thorne)."""
    per_model = {}
    global CAPS
    CAPS = defaultdict(lambda: [0, 0])   # word -> [capitalised mid-sentence, lowercase]
    for f in sorted(glob.glob(os.path.join(results_dir, "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        v = next(iter(d.values()))
        c = {1: Counter(), 2: Counter(), 3: Counter()}
        total = 0; chars = 0
        for s in v.get("samples", []):
            if s.get("prompt_index", 999) >= creative_max_index or not s.get("output"):
                continue
            out = s["output"]
            for m in CAP_TOKEN.finditer(out):
                j = m.start(); prev = out[max(0, j - 3):j]
                if j == 0 or re.search(r'[.!?"“”*\n]\s*$', prev): continue   # sentence/dialogue start: case says nothing
                w = m.group(0)
                CAPS[w.lower()][0 if w[0].isupper() else 1] += 1
            chars += len(out)
            toks = content_tokens(out)
            total += len(toks)
            for n in (1, 2, 3):
                c[n].update(ngrams(toks, n))
        if total:
            per_model[os.path.basename(f)[:-5]] = (c, total, chars)
    return per_model

def ai_stats(per_model, n):
    """Mean per-model rate (per token) and number of models using each n-gram."""
    rate_sum, models, count = defaultdict(float), Counter(), Counter()
    for c, total, chars in per_model.values():
        denom = chars if PER_CHAR else total
        for g, k in c[n].items():
            rate_sum[g] += k / denom
            models[g] += 1
            count[g] += k
    m = len(per_model)
    return {g: rate_sum[g] / m for g in rate_sum}, models, count

def load_human(path):
    hp = json.load(open(path, encoding="utf-8"))
    hp = hp.get("human-authored", hp)
    bi = {e["ngram"]: e["frequency"] for e in hp["top_bigrams"]}
    tri = {e["ngram"]: e["frequency"] for e in hp["top_trigrams"]}
    global HUMAN_CHARS
    HUMAN_CHARS = hp.get("total_chars")
    # Unigram estimate from bigram marginals (each token sits in ~2 bigrams).
    uni = Counter()
    for g, f in bi.items():
        a, b = g.split(" ", 1)
        uni[a] += f / 2
        uni[b] += f / 2
    return {1: uni, 2: bi, 3: tri}

def calibrate(ai_rate, human_counts, top=3000):
    """Scale so the median AI/human ratio over the commonest human n-grams is 1."""
    common = sorted(human_counts.items(), key=lambda kv: -kv[1])[:top]
    ratios = [ai_rate[g] / f for g, f in common if ai_rate.get(g)]
    return statistics.median(ratios)  # multiply human count by this -> comparable rate

def prompt_spread(results_dir, candidates, n, creative_max_index=150):
    """For each candidate n-gram: (#distinct prompts, share of hits from its top prompt)."""
    by_prompt = defaultdict(Counter)
    for f in sorted(glob.glob(os.path.join(results_dir, "*.json"))):
        v = next(iter(json.load(open(f, encoding="utf-8")).values()))
        for s in v.get("samples", []):
            pi = s.get("prompt_index", 999)
            if pi >= creative_max_index or not s.get("output"):
                continue
            for g in ngrams(content_tokens(s["output"]), n):
                if g in candidates:
                    by_prompt[g][pi] += 1
    out = {}
    for g, c in by_prompt.items():
        tot = sum(c.values())
        out[g] = (len(c), max(c.values()) / tot)
    return out

def build(ai_rate, models, count, human, k, min_models, min_count, min_ratio, cap, unseen_cap=None):
    floor = min(human.values()) / 2  # unseen in human top-N: at most the cutoff count
    rows = []
    for g, r in ai_rate.items():
        toks = g.split()
        if "'" in g or any(t in FRAGMENTS or len(t) < 2 for t in toks) or (len(toks) > 1 and any(t in NUMBERS for t in toks)):
            continue  # human profile tokenised contractions differently; not comparable
        if models[g] < min_models or count[g] < min_count:
            continue
        h = human.get(g)
        ratio = r / ((h if h else floor) * k)
        if ratio < min_ratio:
            continue
        w = min(cap, math.log2(ratio / 2))  # ratio 4 -> 1.0, ratio 16 -> 3.0
        if not h and unseen_cap is not None:
            w = min(w, unseen_cap)  # human count is only an upper bound here
        rows.append([g, round(w, 3), round(ratio, 2), int(count[g]), models[g], int(h or 0)])
    rows.sort(key=lambda x: (-x[1], -x[3]))
    return rows

PER_CHAR = False
HUMAN_CHARS = None
CAPS = None
NAME_CAP_SHARE = 0.9      # capitalised mid-sentence this often -> treat as a name
JUNK = {"formica"}        # brand / topical leftovers not caught by the prompt-spread filter
NOT_NAMES = set("monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december".split())

def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=os.path.join(here, "results"))
    # auto-antislop's copy of the human profile carries total_chars, which lets phrase
    # ratios use exact denominators instead of a median anchor.
    default_human = os.path.join(here, "..", "auto-antislop", "data", "human_writing_profile.json")
    if not os.path.exists(default_human):
        default_human = os.path.join(here, "..", "slop-forensics", "results_by_domain", "human_writing", "human_writing_profile.json")
    ap.add_argument("--human", default=default_human)
    ap.add_argument("--out", default=os.path.join(here, "data"))
    a = ap.parse_args()

    print("loading AI creative outputs...")
    pm = load_ai(a.results)
    print(f"  {len(pm)} models, {sum(v[1] for v in pm.values()):,} content tokens")
    print("loading human profile...", a.human)
    human = load_human(a.human)
    print("  total_chars:", HUMAN_CHARS)

    # (n, name, min_models, min_count, min_ratio, keep)
    # (n, name, min_models, min_count, min_ratio, keep, cap, unseen_cap)
    # Word human counts come from bigram marginals, so a word missing from the
    # human top-500k bigrams gets an estimate, not a count: cap its weight lower.
    # Phrase ratios are exact (AI count per char / human count per char) when the human
    # profile has total_chars; min_ratio 5 there is stricter than the old anchored 8,
    # which worked out to ~3.3 (bigrams) / ~4.8 (trigrams) exact.
    cfg = [(1, "words", 6, 40, 5.0, 2000, 5.0, 3.0),
           (2, "bigrams", 6, 20, 5.0, 600, 6.0, None),
           (3, "trigrams", 5, 10, 5.0, 800, 6.0, None)]
    report = {}
    global PER_CHAR
    names_out = []
    for n, name, mm, mc, mr, keep, cap, ucap in cfg:
        # Words: human counts are bigram-marginal estimates, so keep the median anchor.
        # Phrases: exact per-character denominators when available.
        PER_CHAR = n > 1 and bool(HUMAN_CHARS)
        rate, models, count = ai_stats(pm, n)
        k = (1.0 / HUMAN_CHARS) if PER_CHAR else calibrate(rate, human[n])
        rows = build(rate, models, count, human[n], k, mm, mc, mr, cap=cap, unseen_cap=ucap)
        # Drop prompt-topical items: must recur across many prompts, not one story idea.
        spread = prompt_spread(a.results, {r[0] for r in rows}, n)
        rows = [r for r in rows
                if spread.get(r[0], (0, 1))[0] >= MIN_PROMPTS[n] and spread[r[0]][1] <= MAX_TOP_PROMPT_SHARE]
        for r in rows:
            r.append(spread[r[0]][0])
        if n == 1:
            # Names (Elara, Thorne, Silas…) and junk go to their own unscored list: canon
            # cards about a character with that name shouldn't pay for every mention.
            keep_rows = []
            for r in rows:
                cap_n, low_n = CAPS.get(r[0], (0, 0)) if CAPS else (0, 0)
                if len(r[0]) <= 2 or r[0] in JUNK:
                    continue
                if r[0] not in NOT_NAMES and cap_n + low_n >= 10 and cap_n / (cap_n + low_n) > NAME_CAP_SHARE:
                    names_out.append(r)
                else:
                    keep_rows.append(r)
            rows = keep_rows
        rows = rows[:keep]
        out = os.path.join(a.out, f"botstyle_{name}.json")
        with open(out, "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(json.dumps(r) for r in rows) + "\n]\n")
        report[name] = (len(rows), k)
        print(f"  {name}: {len(rows)} entries -> {os.path.relpath(out, here)}  ({'exact per-char' if PER_CHAR else f'anchored k={k:.3g}'})")
        if n == 1:
            with open(os.path.join(a.out, "botstyle_name_candidates.json"), "w", encoding="utf-8") as f:
                f.write("[\n" + ",\n".join(json.dumps(r) for r in names_out) + "\n]\n")
            print(f"  names: {len(names_out)} entries -> data/botstyle_name_candidates.json (run tools/corroborate_names.py next)")

        # Audit the upstream list against the new weights.
        up = os.path.join(a.out, "slop_list.json" if n == 1 else f"slop_list_{name}.json")
        if os.path.exists(up):
            old = [x[0] for x in json.load(open(up, encoding="utf-8"))]
            kept = {r[0] for r in rows}
            audit = []
            for g in old:
                r = rate.get(g, 0.0)
                h = human[n].get(g)
                ratio = r / ((h if h else min(human[n].values()) / 2) * k) if r else 0.0
                audit.append([g, round(ratio, 2), int(count.get(g, 0)), models.get(g, 0), int(h or 0), g in kept])
            with open(os.path.join(here, "tools", f"audit_upstream_{name}.json"), "w", encoding="utf-8") as f:
                f.write("[\n" + ",\n".join(json.dumps(r) for r in audit) + "\n]\n")
            print(f"    upstream {name}: {len(old)} entries, {sum(1 for x in audit if x[5])} survive")

if __name__ == "__main__":
    main()
