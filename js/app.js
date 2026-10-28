// app.js - BB Botstyle Score page. Scores cards in the browser with js/score-card.js; nothing is
// sent anywhere except card fetches (Chub/Botbooru) and, if switched on and chosen per card, the
// public list (js/site-config.js PUBLIC_RUNS).
import { scoreCard, loadAll, SCORER_VERSION, WRITING_STYLE_BANDS as WB, BAND_LABELS } from './score-card.js';
import { parseCardText, parseCardPng } from './card-import.js';
import { fetchCard, CARD_SOURCES } from './card-fetch.js';
import { initPosTagger } from './pos-tagger.js';
import { loadWordfreq, lookupZipf, loadSlopSets, computeSlopIndex } from './metrics.js';
import { wordsOnlyLower, alphaTokens } from './utils.js';
import { scoreText as scoreContrast } from './contrast-detector.js';
import { BOTSTYLE_WEIGHTS, MIN_PROSE_WORDS } from './botstyle.js';
import { DESCRIPTION_FORMATS } from './card-style.js';
import { EMDASH_POINTS } from './ai-structures.js';
import { CARD_PROXY, PUBLIC_RUNS } from './site-config.js';

// Botbooru sends no CORS header: local server proxy on localhost, CARD_PROXY on a hosted copy.
if (/^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) CARD_SOURCES.proxy = '/proxy?url=';
else if (CARD_PROXY) CARD_SOURCES.proxy = CARD_PROXY;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = t => (String(t || '').match(/[A-Za-z']+/g) || []).length;
const FIELDS = [['description', 'Description'], ['personality', 'Personality'], ['scenario', 'Scenario'], ['first_mes', 'First message'], ['mes_example', 'Example dialogue']];
// Ticked by default: what the page says it scores (description + first message). Personality, scenario and
// example dialogue can be ticked in the field picker.
const DEFAULT_ON = { description: true, personality: false, scenario: false, first_mes: true, mes_example: false };
const defaultFields = () => ({ ...DEFAULT_ON });
const STORE = 'bb-botstyle-runs';

const state = { ready: false, card: null, meta: null, fields: { ...DEFAULT_ON }, alts: new Set(), result: null, board: null, norm: null };

// ---------------------------------------------------------------- storage (per browser, optional)
const store = {
  all() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } },
  save(list) { try { localStorage.setItem(STORE, JSON.stringify(list.slice(-500))); return true; } catch { return false; } },
  upsert(entry) { const l = store.all().filter(x => x.key !== entry.key); l.push(entry); store.save(l); },
  patch(key, p) { const l = store.all(); const e = l.find(x => x.key === key); if (e) { Object.assign(e, p); store.save(l); } },
  remove(key) { store.save(store.all().filter(x => x.key !== key)); },
};

// ---------------------------------------------------------------- loading
function status(msg, busy = false) { $('status').innerHTML = (busy ? '<span class="spin"></span>' : '') + msg; }
function error(msg) { $('errors').textContent = msg || ''; }

async function init() {
  $('verLine').textContent = `BBBScorer v${SCORER_VERSION}.`;
  setupUi();
  renderMine();
  try {
    const [board, norm] = await Promise.all([getJson('data/botstyle_card_leaderboard.json'), getJson('data/upstream_norm.json')]);
    state.board = board; state.norm = norm; renderBoard();
  } catch (e) { $('boardNote').textContent = 'Leaderboard data missing.'; }
  try {
    status('Loading word lists…', true);
    await initPosTagger().catch(() => {});
    await Promise.all([loadWordfreq(), loadSlopSets(), loadAll('./data/')]);
    state.ready = true; status('Ready. Paste a link, upload a card, or type text.');
  } catch (e) { status(''); error('Could not load the scoring data: ' + (e.message || e)); }
  loadPublic();
}
async function getJson(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

// ---------------------------------------------------------------- input bar
function setupUi() {
  $('fetchBtn').addEventListener('click', fromLink);
  $('cardUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fromLink(); } });
  $('fileInput').addEventListener('change', e => { fromFiles([...e.target.files]); e.target.value = ''; });
  $('manualBtn').addEventListener('click', () => { const m = $('manual'); m.hidden = !m.hidden; $('manualBtn').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) $('descInput').focus(); });
  $('scoreTextBtn').addEventListener('click', fromText);
  const bar = $('inputBar');
  ['dragenter', 'dragover'].forEach(t => bar.addEventListener(t, e => { e.preventDefault(); bar.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(t => bar.addEventListener(t, e => { e.preventDefault(); bar.classList.remove('dragover'); }));
  bar.addEventListener('drop', e => { const f = [...(e.dataTransfer.files || [])]; if (f.length) fromFiles(f); });
  $('howBtn').addEventListener('click', () => $('howDlg').showModal());
  $('howDlg').addEventListener('click', e => { if (e.target.hasAttribute('data-close') || e.target === $('howDlg')) $('howDlg').close(); });
  $('themeBtn').addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('bb-theme', t); } catch {}
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.all(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bb-botstyle-runs.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('clearBtn').addEventListener('click', () => { if (confirm('Remove all saved cards from this browser?')) { store.save([]); renderMine(); renderBoard(); } });
}

async function waitReady() { for (let i = 0; i < 300 && !state.ready; i++) await new Promise(r => setTimeout(r, 100)); if (!state.ready) throw new Error('Scoring data is still loading.'); }

async function fromLink() {
  const url = $('cardUrl').value.trim(); if (!url) return;
  error(''); $('fetchBtn').disabled = true; status('Fetching card…', true);
  try {
    await waitReady();
    const { card } = await fetchCard(url);
    setCard(card, { source: 'link', link: url, key: 'link:' + url.replace(/[?#].*$/, '') });
  } catch (e) { status(''); error(e.message || String(e)); }
  finally { $('fetchBtn').disabled = false; }
}

async function fromFiles(files) {
  error(''); if (!files.length) return;
  try { await waitReady(); } catch (e) { error(e.message); return; }
  let last = null, n = 0;
  for (const f of files) {
    status(`Reading ${esc(f.name)}…`, true);
    try {
      let parsed;
      if (/\.png$/i.test(f.name) || f.type === 'image/png') parsed = parseCardPng(await f.arrayBuffer());
      else parsed = parseCardText(await f.text());
      if (!parsed || !parsed.card) throw new Error('no card data found');
      const card = { name: f.name.replace(/\.[^.]+$/, ''), ...parsed.card }; if (parsed.card.name) card.name = parsed.card.name;
      const meta = { source: 'file', file: f.name, key: 'file:' + f.name + ':' + (card.name || '') };
      if (files.length > 1) { scoreAndSave(card, meta, { ...DEFAULT_ON }, new Set()); n++; }
      last = [card, meta];
    } catch (e) { error(`${f.name}: ${e.message || e}`); }
  }
  if (last) setCard(last[0], last[1]);
  if (files.length > 1) status(`Scored ${n} cards. They're in "Your cards" below; the last one is shown.`);
}

function fromText() {
  error('');
  const raw = $('descInput').value.trim(), greet = $('greetInput').value.trim();
  if (!raw && !greet) { error('Type or paste some text first.'); return; }
  const parsed = parseCardText(raw);
  const card = parsed.kind === 'json' ? parsed.card : { name: 'Pasted text', description: raw, first_mes: greet };
  if (parsed.kind === 'json' && greet && !card.first_mes) card.first_mes = greet;
  setCard(card, { source: 'text', key: 'text:' + hash(raw + '\u0000' + greet) });
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// ---------------------------------------------------------------- field picker
function setCard(card, meta) {
  card.alternate_greetings = Array.isArray(card.alternate_greetings) ? card.alternate_greetings.filter(g => typeof g === 'string' && g.trim()) : [];
  state.card = card; state.meta = meta; state.fields = defaultFields(); state.alts = new Set();
  renderPicker(); rescore(true);
}

function renderPicker() {
  const c = state.card; $('picker').hidden = false;
  $('cardName').textContent = c.name || 'Card';
  $('fieldChecks').innerHTML = FIELDS.filter(([k]) => String(c[k] || '').trim()).map(([k, label]) =>
    `<label class="check"><input type="checkbox" data-field="${k}"${state.fields[k] ? ' checked' : ''}> ${label} <span class="wc">${words(c[k])}w</span></label>`).join('')
    || '<span class="faint small">No text fields found in this card.</span>';
  const alts = c.alternate_greetings;
  $('altChecks').innerHTML = alts.length ? `<label class="check"><input type="checkbox" id="altAll"> All ${alts.length} alternate greetings</label>` +
    alts.map((g, i) => `<label class="check alt-item"><input type="checkbox" data-alt="${i}"${state.alts.has(i) ? ' checked' : ''}> #${i + 2} <span class="wc">${words(g)}w</span> <span class="txt">${esc(g.replace(/\s+/g, ' ').slice(0, 140))}</span></label>`).join('') : '';
  $('picker').querySelectorAll('input[data-field]').forEach(el => el.addEventListener('change', () => { state.fields[el.dataset.field] = el.checked; rescore(); }));
  $('picker').querySelectorAll('input[data-alt]').forEach(el => el.addEventListener('change', () => { el.checked ? state.alts.add(+el.dataset.alt) : state.alts.delete(+el.dataset.alt); syncAltAll(); rescore(); }));
  const all = $('altAll');
  if (all) { syncAltAll(); all.addEventListener('change', () => { state.alts = all.checked ? new Set(alts.map((_, i) => i)) : new Set(); $('picker').querySelectorAll('input[data-alt]').forEach(el => { el.checked = all.checked; }); rescore(); }); }
}
function syncAltAll() { const all = $('altAll'); if (!all) return; const n = state.card.alternate_greetings.length; all.checked = state.alts.size === n; all.indeterminate = state.alts.size > 0 && state.alts.size < n; }

// ---------------------------------------------------------------- scoring
function buildCard(card, fields, alts) {
  const c = {};
  for (const [k] of FIELDS) c[k] = fields[k] ? (card[k] || '') : '';
  c.alternate_greetings = [...alts].sort((a, b) => a - b).map(i => card.alternate_greetings[i]).filter(Boolean);
  c.tags = card.tags || [];
  return c;
}
function runScore(card, fields, alts) {
  const c = buildCard(card, fields, alts);
  return scoreCard(c, { lookupZipf, includeAltGreetings: c.alternate_greetings.length > 0, includeExampleDialogue: !!fields.mes_example });
}
function fieldList(fields, alts) { return FIELDS.filter(([k]) => fields[k] && (!state.card || String(state.card[k] || '').trim())).map(([, l]) => l).concat(alts.size ? [`${alts.size} alt greeting${alts.size > 1 ? 's' : ''}`] : []); }

function entryFor(card, meta, r, fields, alts) {
  const prev = store.all().find(x => x.key === meta.key) || {};
  return { key: meta.key, name: card.name || meta.file || 'Card', link: meta.link || null, source: meta.source, score: +r.score.toFixed(1), band: r.band.id,
    reliable: r.reliable, proseWords: r.stats.proseWords, version: r.version, fields: fieldList(fields, alts), at: new Date().toISOString(),
    creator: prev.creator || false, aiUse: prev.aiUse ?? null, shared: prev.shared || false };
}
function scoreAndSave(card, meta, fields, alts) {
  const r = runScore(card, fields, alts);
  if (r.band.id !== 'na') store.upsert(entryFor(card, meta, r, fields, alts));
  return r;
}

function rescore(first = false) {
  if (!state.card) return;
  const r = scoreAndSave(state.card, state.meta, state.fields, state.alts);
  state.result = r;
  renderResult(r);
  renderMine(); renderBoard();
  status(`${esc(state.card.name || 'Card')}: ${r.score.toFixed(1)} · ${esc(r.band.label || '')}${r.band.id === 'na' ? '' : ' (saved to Your cards)'}`);
  if (first) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// the original slop-score numbers, for the "stats for nerds" section
function nerdStats(text) {
  const toks = alphaTokens(wordsOnlyLower(text)); const n = toks.length;
  if (!n) return null;
  const s = computeSlopIndex(toks, false); const c = scoreContrast(text);
  const N = state.norm, nz = (v, r) => r ? Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min))) : 0;
  const sents = text.split(/[.!?]+/).filter(x => x.trim()), ws = text.match(/\b\w+\b/g) || [], paras = text.split(/\n\s*\n/).filter(p => p.trim());
  const syl = w => { w = w.toLowerCase(); if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1; };
  const fk = Math.max(0, 0.39 * ws.length / Math.max(1, sents.length) + 11.8 * ws.reduce((a, w) => a + syl(w), 0) / Math.max(1, ws.length) - 15.59);
  let mattr = new Set(toks).size / n;
  if (n >= 500) { let sum = 0, k = 0; for (let i = 0; i + 500 <= n; i += 10) { sum += new Set(toks.slice(i, i + 500)).size / 500; k++; } mattr = sum / k; }
  return { upstream: (nz(s.wordScore, N && N.words) * .6 + nz(c.rate_per_1k, N && N.contrast) * .25 + nz(s.trigramScore, N && N.trigrams) * .15) * 100,
    words: s.wordScore, trigrams: s.trigramScore, contrast: c.rate_per_1k, fk, sentLen: ws.length / Math.max(1, sents.length), paraLen: ws.length / Math.max(1, paras.length),
    dialogue: (text.match(/["“”]/g) || []).length / 2 / Math.max(1, text.length) * 1000, mattr, n };
}

// ---------------------------------------------------------------- result
const pct = x => Math.round(x * 100);
function renderResult(r) {
  const el = $('result'); el.hidden = false;
  const W = BOTSTYLE_WEIGHTS, st = r.stats, band = r.band, ref = r.reference;
  const meter = (label, v, tip) => `<div class="meter"><div class="fill" style="width:${Math.min(100, v * 100)}%"></div><span>${label}</span><b>${(v * 100).toFixed(0)}</b><div class="tip">${tip}</div></div>`;
  const pop = `<span class="pop" tabindex="0" aria-label="What this number means">i<span class="pop-body">`
    + (ref && ref.human_2023 && band.id !== 'na' ? `Higher than <b>${Math.round(ref.human_2023.percentile)}%</b> of ${esc(ref.human_2023.label)} (${ref.human_2023.n.toLocaleString()}) and <b>${Math.round(ref.ai_cards.percentile)}%</b> of ${esc(ref.ai_cards.label)} (${ref.ai_cards.n.toLocaleString()}).<br><br>` : '')
    + `100 = as AI-styled as the most AI-styled tenth of card-length AI fiction. ${pct(W.words)}% AI-favoured words, ${pct(W.phrases)}% phrases, ${pct(W.structures)}% sentence structures, prose only; em-dash overuse adds up to ${EMDASH_POINTS.max}, obvious chatbot leftovers 25 each. Range = ±1 standard error.<br><br><b>Tentative bands</b> (still calibrating): ${BAND_LABELS.original} under ${WB.original} · ${BAND_LABELS.mixed} ${WB.original}–${WB.common} · ${BAND_LABELS.common} ${WB.common}+</span></span>`;
  const used = fieldList(state.fields, state.alts);
  let L = `<div class="score-hero"><div><div class="score-num">${r.score.toFixed(1)}</div><div class="score-sub">range ${r.low.toFixed(0)}–${r.high.toFixed(0)}</div></div>
    <div class="score-meta"><span class="band ${band.id}">${esc(band.label || 'Low confidence')}</span>${band.id !== 'na' ? '<span class="tent" title="Band names and cut-offs are tentative while the scorer is calibrated">tentative</span>' : ''}${pop}
      <div class="score-cap">${esc(state.card.name || 'This card')} · ${esc(used.join(', ') || 'nothing selected')}</div>
      ${r.archetype ? `<div class="arch" title="${esc(r.archetype.blurb || '')}"><span class="arch-tag">${esc(r.archetype.label)}</span>${r.archetype.size ? `<span class="arch-size" title="${esc(r.archetype.size.note)}">${esc(r.archetype.size.label)}</span>` : ''}<span class="faint small"> archetype · experimental</span></div>` : ''}</div></div>
    ${meter('AI-favoured words', r.components.words, `${r.rates.words.toFixed(0)} weighted hits per 1k prose words`)}
    ${meter('AI-favoured phrases', r.components.phrases, `${r.rates.phrases.toFixed(1)} weighted bigram/trigram hits per 1k prose words`)}
    ${meter('Sentence structures', r.components.structures, `${r.rates.structures.toFixed(1)} weighted hits per 1k prose words: not-x-but-y, "a hint of…", abstract similes, banter tags…`)}
    ${r.emdash && r.emdash.points > 0 ? `<div class="note">Em-dashes: ${r.emdash.count} (${r.emdash.rate.toFixed(1)} per 1k words) → +${r.emdash.points.toFixed(1)}</div>` : ''}
    <div class="note">Scored ${st.proseWords} prose words of ${st.totalWords} (${st.structuredWords} in lists/W++/key-value lines, ${st.boilerplateWords} in boilerplate).
      ${st.proseWords < MIN_PROSE_WORDS && band.id !== 'na' ? ' <b>Short: low confidence.</b>' : ''}${st.nonEnglish ? ' <b>Doesn\'t look like English; the word lists are English-only.</b>' : ''}</div>`;
  if (r.pulp && band.id !== 'na') {
    const P = r.pulp;
    L += `<div class="sec pulp${P.flag ? ' ' + P.flag : ''}"><h3>Pulp read · experimental</h3>${P.flag ? `<div class="pulp-flag">${esc(P.flagLabel)}</div>` : ''}
      <div class="small">${Math.round(P.score)}% of the AI-favoured word weight is genre vocabulary that human ${esc((r.genre && r.genre.label) || 'genre')} cards use a lot too. Without it: <b>${P.adjusted.toFixed(1)}</b>${P.delta > 0.05 ? ` (−${P.delta.toFixed(1)})` : ''}.</div>
      ${P.words && P.words.length ? `<div>${P.words.slice(0, 12).map(w => `<span class="tag">${esc(w.item || w)}</span>`).join('')}</div>` : ''}
      <div class="faint small">Not part of the score. The pulp list is small and still being tuned.</div></div>`;
  }
  if (r.tags.length) L += `<div class="sec"><h3>Tags</h3>${r.tags.map(t => `<span class="tag" title="${esc(t.note)}">${esc(t.label)}</span>`).join('')}</div>`;
  if (r.artifacts && r.artifacts.hits.length) L += `<div class="alert"><b>Obvious AI tells</b> (+${r.artifacts.points}): the chatbot talking to whoever prompted it.<ul>${r.artifacts.hits.map(x => `<li>${esc(x.label)} ×${x.count}<span class="ex">${x.examples.slice(0, 2).map(esc).join('<br>')}</span></li>`).join('')}</ul></div>`;
  L += saveBox(r);

  const chips = (hits, n = 24) => hits.slice(0, n).map(x => `<span class="tag hot">${esc(x.item)}${x.count > 1 ? ' ×' + x.count : ''}<span class="w">${x.weight.toFixed(1)}</span></span>`).join('');
  let R = '';
  if (r.hits.phrases.length || r.hits.words.length || r.hits.structures.length) {
    R += `<div class="sec"><h3>What scored</h3>${r.hits.phrases.length ? `<div class="dim small">Phrases</div>${chips(r.hits.phrases)}` : ''}${r.hits.words.length ? `<div class="dim small" style="margin-top:6px">Words</div>${chips(r.hits.words)}` : ''}`
      + (r.hits.structures.length ? `<div class="dim small" style="margin-top:6px">Sentence structures</div><ul>${r.hits.structures.slice(0, 12).map(x => `<li>${esc(x.label)}${x.count > 1 ? ' ×' + x.count : ''} <span class="faint">(${x.weight.toFixed(1)})</span>${x.examples && x.examples[0] ? `<span class="ex">“${esc(String(x.examples[0]).slice(0, 100))}”</span>` : ''}</li>`).join('')}</ul>` : '') + '</div>';
  }
  const f = r.format.format, g = r.greeting;
  R += `<div class="sec"><h3>Card</h3>${esc(r.format.label || DESCRIPTION_FORMATS[f] || f)}${f === 'boilerplate' ? ' <span class="faint">(mostly instructions)</span>' : ''}`
    + (r.peers ? `<div class="faint small">vs 2023 cards in the same format: ${Object.entries(r.peers).filter(([, p]) => p !== null && p !== undefined).map(([k, p]) => `${k} ${p}th pct${p >= 90 ? ' ⚑' : ''}`).join(', ')}</div>` : '')
    + (g && g.primary !== 'none' ? `<div class="small">Greeting: ${esc(g.pov.replace('_', ' '))}, ${esc(g.rp)} format, ${esc(g.tense)} tense${g.endsWithQuestion ? ', ends on a question' : ''}</div>` : '')
    + (r.genre ? `<div class="small">Genre read: ${esc(r.genre.label)}${r.genre.secondary ? ` + ${esc(r.genre.secondaryLabel)}` : ''} <span class="faint">(keywords and tags, experimental)</span></div>` : '')
    + (r.type && r.type !== 'single_character' ? `<div class="small">Type: ${esc(r.type.replace('_', ' / '))}</div>` : '') + '</div>';
  const group = (title, items, blurb) => !items.length ? '' : `<div class="sec"><h3>${title}</h3><span class="faint small">Not scored. ${blurb}</span><ul>${items.map(x => `<li>${esc(x.label)} ×${x.count}${x.examples && x.examples.length ? `<span class="ex">${x.examples.slice(0, 2).map(esc).join('<br>')}</span>` : ''}</li>`).join('')}</ul></div>`;
  if (r.artifacts && r.artifacts.notes && r.artifacts.notes.length) R += group('Worth a look', r.artifacts.notes, 'Drafts and exports produce these too.');
  if (r.cliches && r.cliches.phraseHits.length) R += `<div class="sec"><h3>Shared clichés</h3><span class="faint small">Not scored: humans and models both use these.</span><div>${r.cliches.phraseHits.slice(0, 20).map(x => `<span class="tag">${esc(x.item)}${x.count > 1 ? ' ×' + x.count : ''}</span>`).join('')}</div></div>`;
  if (r.names.length) R += `<div class="sec"><h3>AI-favourite names</h3><span class="faint small">Not scored: characters can have these names too.</span><div>${r.names.map(x => `<span class="tag">${esc(x.item)}</span>`).join('')}</div></div>`;
  R += group('Human tells', r.checks.humanTells || [], 'Mistakes models almost never make.');
  R += group('Craft notes', r.checks.craftNotes || [], 'Card-writing issues anyone can introduce.');
  if (r.texture && r.texture.paraCv !== null) {
    const lk = r.experimental.aiStyleLikelihood;
    R += `<div class="sec"><h3>Texture · experimental</h3><span class="small">Paragraph evenness: length CV ${r.texture.paraCv.toFixed(2)} over ${r.texture.paragraphs} paragraphs (2023 human cards ~0.67, AI-written ~0.32; lower = more even).${lk !== null ? ` AI-style likelihood (score + evenness): <b>${Math.round(lk * 100)}%</b>.` : ''} Not scored: careful writers can be even too.</span></div>`;
  }
  const nn = nerdStats(r.text);
  if (nn) R += `<details class="nerd"><summary>Stats for nerds: original slop-score metrics (Sam Paech)</summary><div class="kv">
    <span>Original slop score (whole text)</span><b>${nn.upstream.toFixed(1)}</b><span>Slop words per 1k</span><b>${nn.words.toFixed(2)}</b><span>Slop trigrams per 1k</span><b>${nn.trigrams.toFixed(2)}</b>
    <span>Not-x-but-y per 1k chars</span><b>${nn.contrast.toFixed(2)}</b><span>Flesch-Kincaid grade</span><b>${nn.fk.toFixed(1)}</b><span>Words per sentence</span><b>${nn.sentLen.toFixed(1)}</b>
    <span>Words per paragraph</span><b>${nn.paraLen.toFixed(0)}</b><span>Dialogue (quote pairs per 1k chars)</span><b>${nn.dialogue.toFixed(2)}</b><span>MATTR${nn.n >= 500 ? '-500' : ' (TTR, short text)'}</span><b>${nn.mattr.toFixed(3)}</b>
    </div><p class="faint small">On character cards these barely separate human from AI writing (BOTSTYLE.md); here for curiosity.</p></details>`;
  el.innerHTML = `<h2 class="section">Result</h2><div class="res-grid"><div>${L}</div><div>${R}</div></div>`;
  bindSaveBox();
}

function saveBox(r) {
  if (r.band.id === 'na') return '';
  const e = store.all().find(x => x.key === state.meta.key) || {};
  const ai = e.aiUse ?? 0;
  return `<div class="save-box"><label><input type="checkbox" id="creatorChk"${e.creator ? ' checked' : ''}> I made this card</label>
    <div id="creatorMore"${e.creator ? '' : ' hidden'}><div class="slider"><span class="small dim">AI-assisted writing</span><input type="range" id="aiUse" min="0" max="100" step="10" value="${ai}"><output id="aiOut">${aiLabel(ai)}</output></div>
    <div class="faint small">Honour system, for your own comparison. Stored with the card in this browser.</div></div>
    ${PUBLIC_RUNS ? `<div class="row-end"><span class="faint small">Shares name, link, score, version and the boxes above. Never the card text.</span><button id="shareBtn" class="ghost" type="button"${e.shared ? ' disabled' : ''}>${e.shared ? 'Shared' : 'Share to public list'}</button></div>` : ''}</div>`;
}
const aiLabel = v => v == null ? '–' : +v === 0 ? 'none (0%)' : +v === 100 ? 'all (100%)' : `about ${v}%`;
function bindSaveBox() {
  const chk = $('creatorChk'); if (!chk) return;
  const key = state.meta.key;
  chk.addEventListener('change', () => { $('creatorMore').hidden = !chk.checked; store.patch(key, { creator: chk.checked, aiUse: chk.checked ? +$('aiUse').value : null }); renderMine(); });
  $('aiUse').addEventListener('input', e => { $('aiOut').textContent = aiLabel(e.target.value); store.patch(key, { aiUse: +e.target.value }); renderMine(); });
  const sb = $('shareBtn'); if (sb) sb.addEventListener('click', () => share(key, sb));
}

// ---------------------------------------------------------------- your cards
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
function renderMine() {
  const list = store.all();
  $('mine').hidden = !list.length; if (!list.length) return;
  const sc = list.map(x => x.score), bandOf = v => v < WB.original ? 'original' : v >= WB.common ? 'common' : 'mixed', bands = b => list.filter(x => bandOf(x.score) === b).length;
  const mineByCreator = list.filter(x => x.creator);
  const vers = [...new Set(list.map(x => x.version))];
  $('mineSummary').innerHTML = `<div class="stat"><b>${list.length}</b><span>cards</span></div><div class="stat"><b>${median(sc).toFixed(1)}</b><span>median score</span></div>`
    + `<div class="stat"><b>${(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1)}</b><span>average</span></div>`
    + `<div class="stat"><b>${bands('original')} · ${bands('mixed')} · ${bands('common')}</b><span>${esc(BAND_LABELS.original)} · mixed · ${esc(BAND_LABELS.common.toLowerCase())}</span></div>`
    + (mineByCreator.length ? `<div class="stat"><b>${median(mineByCreator.map(x => x.score)).toFixed(1)}</b><span>median, cards you made (${mineByCreator.length})</span></div>` : '')
    + (vers.length > 1 ? `<div class="stat"><b>${vers.length}</b><span>BBBScorer versions mixed</span></div>` : '');
  $('mineList').innerHTML = [...list].reverse().map(x => `<div class="item"><span class="nm">${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</span>
    <span class="sc">${x.score.toFixed(1)}</span><span class="meta"><span class="band ${x.band}" style="font-size:10px;padding:1px 6px">${esc(BAND_LABELS[x.band] || x.band)}</span> BBBScorer v${esc(x.version)}${x.creator ? ` · mine, AI ${aiLabel(x.aiUse)}` : ''}</span>
    <button class="x" type="button" data-key="${esc(x.key)}" title="Remove">✕</button></div>`).join('');
  $('mineList').querySelectorAll('button.x').forEach(b => b.addEventListener('click', () => { store.remove(b.dataset.key); renderMine(); renderBoard(); }));
}

// ---------------------------------------------------------------- leaderboard
function renderBoard() {
  const B = state.board; if (!B) return;
  const row = (cls, label, n, p25, med, p75, val, detail) => `<div class="brow ${cls}"><div class="bl" title="${esc(label)}">${esc(label)}<span class="n${n && n < 20 ? ' low' : ''}"${n && n < 20 ? ' title="Fewer than 20 cards: treat as a rough guess"' : ''}>${n ? (n < 20 ? '<span class="star">*</span>' : '') + 'n=' + n.toLocaleString() : ''}</span></div>
    <div class="track"><div class="iqr" style="left:${Math.min(100, p25)}%;width:${Math.max(1, Math.min(100, p75) - Math.min(100, p25))}%"></div><div class="med" style="left:${Math.min(100, med)}%"></div></div>
    <div class="bv">${val}</div>${detail ? `<div class="bdetail" hidden>${detail}</div>` : ''}</div>`;
  let h = '';
  const mine = store.all();
  if (state.result && state.result.band.id !== 'na') { const r = state.result; h += `<div class="group-label">Yours</div>` + row('you', state.card.name || 'This card', 0, r.low, r.score, r.high, r.score.toFixed(1), ''); }
  if (mine.length >= 2) { const s = mine.map(x => x.score).sort((a, b) => a - b); const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    h += (h ? '' : '<div class="group-label">Yours</div>') + row('you', 'Your saved cards', s.length, q(.25), median(s), q(.75), median(s).toFixed(1), ''); }
  const modeTxt = m => Object.entries(m.byMode || {}).map(([k, v]) => `${{ fresh: 'plain requests', antislop: '"don\'t sound like AI" requests', rewrite: 'rewrites of human cards' }[k] || k}: median ${v.median} (n=${v.n})`).join(' · ');
  h += `<div class="group-label">AI models · cards written for this test</div>` + B.models.map(m => row('', m.model.replace(/^[^/]+\//, ''), m.n, m.p25, m.median, m.p75, m.median.toFixed(1),
    `${esc(m.model)} · ${modeTxt(m)} · ${m.n} cards · ${m.original}% ${BAND_LABELS.original}, ${m.common}% ${BAND_LABELS.common}${m.pulp != null ? ` · pulp median ${m.pulp}%` : ''} · original slop-score median ${m.upstream ?? '–'}`)).join('');
  h += `<div class="group-label">Reference card sets</div>` + B.references.map(r => row('ref', r.label, r.n, r.p25, r.median, r.p75, (+r.median).toFixed(1),
    `${r.n.toLocaleString()} cards · ${r.original}% ${BAND_LABELS.original}, ${r.common}% ${BAND_LABELS.common} · middle half ${r.p25}–${r.p75}${r.pulp != null ? ` · pulp median ${r.pulp}%` : ''} · original slop-score median ${r.upstream ?? '–'}`)).join('');
  if ((B.pending || []).length) h += `<div class="group-label">Pending, not ranked · tuned for RP chat, not card writing</div>` + B.pending.map(m => row('pending', m.model.replace(/^[^/]+\//, ''), m.n, m.p25, m.median, m.p75, m.median.toFixed(1),
    `${esc(m.model)} · ${esc(m.why || '')} · ${modeTxt(m)} · ${m.n} cards · ${m.original}% ${BAND_LABELS.original}, ${m.common}% ${BAND_LABELS.common}`)).join('');
  $('boardRows').innerHTML = h;
  $('boardNote').innerHTML = `BBBScorer v${esc(B.scorer || B.version)}${B.scorer && B.version && B.scorer !== B.version ? ` (scores from the v${esc(B.version)} run; same numbers)` : ''}. Bars: middle half of each set's cards; line: median; n = cards in the set. <span class="star">*</span> fewer than 20 cards, so a rough guess. Click a row for details.`;
  $('boardRows').querySelectorAll('.brow').forEach(el => el.addEventListener('click', () => { const d = el.querySelector('.bdetail'); if (d) d.hidden = !d.hidden; }));
}

// ---------------------------------------------------------------- public list (optional)
async function loadPublic() {
  $('public').hidden = false;
  if (!PUBLIC_RUNS) { $('publicList').innerHTML = '<span class="faint small">Not switched on yet. Once it is, a "Share to public list" button appears under your result.</span>'; return; }
  try {
    const list = await getJson(PUBLIC_RUNS.replace(/\/$/, '') + '/runs');
    $('public').hidden = false;
    $('publicList').innerHTML = (list.runs || []).slice(-300).reverse().map(x => `<div class="item"><span class="nm">${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</span>
      <span class="sc">${(+x.score).toFixed(1)}</span><span class="meta"><span class="band ${esc(x.band)}" style="font-size:10px;padding:1px 6px">${esc(BAND_LABELS[x.band] || x.band)}</span> BBBScorer v${esc(x.version)}${x.creator ? ` · by creator, AI ${aiLabel(x.aiUse)}` : ''}</span><span></span></div>`).join('') || '<span class="faint small">Nothing shared yet.</span>';
  } catch { $('publicList').innerHTML = '<span class="faint small">The public list is unreachable right now.</span>'; }
}
async function share(key, btn) {
  const e = store.all().find(x => x.key === key); if (!e) return;
  btn.disabled = true; btn.textContent = 'Sharing…';
  try {
    const r = await fetch(PUBLIC_RUNS.replace(/\/$/, '') + '/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: e.name, link: e.link, score: e.score, band: e.band, version: e.version, fields: e.fields, creator: !!e.creator, aiUse: e.creator ? e.aiUse : null }) });
    if (!r.ok) throw new Error(await r.text());
    store.patch(key, { shared: true }); btn.textContent = 'Shared'; loadPublic();
  } catch (err) { btn.disabled = false; btn.textContent = 'Share to public list'; error('Could not share: ' + (err.message || err)); }
}

init();
