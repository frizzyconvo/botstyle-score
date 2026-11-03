// _card_parse.mjs - Find the character card(s) in whatever a file holds, as forgivingly as possible.
// Used by tools/_card_sources.mjs (scoring any path) and tools/convert_cards.mjs (cards -> text JSONL).
//
// Bytes are sniffed by content, not by file extension:
//   PNG    tEXt / zTXt / iTXt chunks (compressed or not) named chara, ccv3 or anything else holding card JSON, as
//          base64 or raw JSON; bad CRCs and truncated files are tolerated; data appended after IEND is searched
//   JPEG / WebP / other binary   searched for base64 or raw card JSON (old TavernAI WebP cards keep it in EXIF)
//   JSON   one card, an array of cards, or a wrapper (see cardsFromJson)
// JSON shapes: Tavern V1, V2 (chara_card_v2), V3 (chara_card_v3, RisuAI), Pygmalion / Gradio (char_persona,
// char_greeting, world_scenario), Agnai (persona.attributes), Chub API (node.definition), Character.AI dumps
// (character / info.character with greeting, definition), Perchance exports (addCharacter), CharacterHub.com
// profiles (slug + info), and anything else with a name plus description / greeting under common key names.
import { inflateSync, inflateRawSync } from 'zlib';
import { createHash } from 'crypto';

const s = v => typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '';
const first = (...v) => { for (const x of v) { const t = s(x); if (t.trim()) return t; } return ''; };
export const tagList = t => {
  if (Array.isArray(t)) return [...new Set(t.map(x => typeof x === 'string' ? x : x && (x.name || x.label || x.title) || '').map(x => String(x).trim()).filter(Boolean))];
  if (typeof t === 'string') return [...new Set(t.split(/[,;\n]|\s#/).map(x => x.replace(/^[\s\[\]"'#]+|[\s\[\]"']+$/g, '')).filter(Boolean))];
  return [];
};
const strList = a => Array.isArray(a) ? a.map(x => typeof x === 'string' ? x : x && (x.content || x.text) || '').filter(x => x.trim()) : [];

// ---------------------------------------------------------------- dates
/** Unix seconds / ms, ISO strings and TavernAI's "2023-5-1 @14h 30m 12s 345ms" -> ISO string, or null. */
export function toIso(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) { const n = Number(v); const d = new Date(n < 1e11 ? n * 1000 : n); return isNaN(d) || d.getFullYear() < 2015 || d.getFullYear() > 2100 ? null : d.toISOString(); }
  const t = String(v).trim();
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString();
  const d = new Date(t); return isNaN(d) || d.getFullYear() < 2015 || d.getFullYear() > 2100 ? null : d.toISOString();
}

// ---------------------------------------------------------------- JSON shapes
function lorebook(b) {
  const e = b && (Array.isArray(b.entries) ? b.entries : b.entries && typeof b.entries === 'object' ? Object.values(b.entries) : null);
  if (!e || !e.length) return null;
  const texts = e.map(x => s(x && x.content)).filter(Boolean);
  return { name: s(b.name), entries: e.length, words: texts.join(' ').split(/\s+/).filter(Boolean).length, texts };
}
function agnaiPersona(p, name) {
  if (!p || typeof p !== 'object') return s(p);
  const a = p.attributes || {};
  if (Array.isArray(a.text)) return a.text.join('\n');
  const lines = Object.entries(a).map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : [v]).join(', ')}`);
  return lines.length ? (p.kind === 'wpp' ? `[${name || 'character'}]\n` : '') + lines.join('\n') : '';
}
const EXAMPLE_START = /^[\s#*\-]*(?:---\s*)?(?:start of )?example (?:dialogue|dialog|conversation|messages?|chat)s?\b.*$|^\s*<START>\s*$/im;
function perchance(c) {
  let ri = s(c.roleInstruction); const m = ri.match(EXAMPLE_START); if (m) ri = ri.slice(0, m.index);
  const msgs = Array.isArray(c.initialMessages) ? c.initialMessages : [];
  const ai = msgs.find(x => x && x.author === 'ai' && x.content), scene = msgs.find(x => x && x.author === 'system' && !(x.hiddenFrom || []).length && x.content);
  return { spec: 'perchance', name: s(c.name), description: ri.trim(), first_mes: s((ai || scene || {}).content), scenario: '', tags: tagList(c.tags || c.categories) };
}

/** One JSON value -> zero or more raw card objects { spec, name, description, ... } (not yet checked for content). */
export function cardsFromJson(j, depth = 0) {
  if (depth > 4 || j == null) return [];
  if (Array.isArray(j)) return j.slice(0, 100000).flatMap(x => cardsFromJson(x, depth + 1));
  if (typeof j !== 'object') return [];
  // wrappers
  if (j.addCharacter && typeof j.addCharacter === 'object') return [perchance(j.addCharacter)];
  if (Array.isArray(j.characters) && !j.name) return cardsFromJson(j.characters, depth + 1);
  if (j.node && typeof j.node === 'object' && (j.node.definition || j.node.name)) return cardsFromJson({ ...j.node, _chubNode: true }, depth + 1);
  if (j.info && typeof j.info === 'object' && j.info.character) return cardsFromJson(j.info.character, depth + 1);
  if (j.character && typeof j.character === 'object' && !j.description && !j.data) return cardsFromJson({ ...j.character, _cai: true, _outer: j }, depth + 1);
  if (j.slug && j.info && typeof j.info === 'object') {   // CharacterHub.com profile (a writers' character wiki, no greeting)
    const i = j.info, about = i.about && typeof i.about === 'object' ? Object.entries(i.about).map(([k, v]) => `${k}: ${s(v)}`).join('\n') : '';
    return [{ spec: 'characterhub_profile', id: s(j.slug), name: s(i.name), description: [s(i.description), s(i.backstory)].filter(x => x.trim()).join('\n\n'),
      personality: about, first_mes: '', scenario: '', creator_notes: [s(i.quote), ...strList(i.trivia)].filter(Boolean).join('\n'),
      tags: tagList([...(Array.isArray(j.tags) ? j.tags : []), ...(Array.isArray(i.tags) ? i.tags : [])]), nsfwFlag: typeof j.is_nsfw === 'boolean' ? j.is_nsfw : null, created: j.created }];
  }
  const v3 = j.spec === 'chara_card_v3', v2 = j.spec === 'chara_card_v2';
  const d = j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? { ...j, ...j.data } : j;
  const def = d.definition && typeof d.definition === 'object' ? d.definition : null;   // Chub API
  const agnai = d.kind === 'character' || (d.persona && typeof d.persona === 'object' && d.persona.attributes);
  const name = first(d.name, d.char_name, def && def.name, d.display_name, d.characterName);
  const card = {
    spec: v3 ? 'v3' : v2 ? 'v2' : def ? 'chub_api' : agnai ? 'agnai' : d._cai ? 'character_ai' : (d.char_persona != null || d.char_greeting != null) ? 'pygmalion' : 'v1',
    id: s(d.id || d.external_id || (def && def.id) || ''),
    name,
    description: def ? first(def.personality, def.description) : agnai ? agnaiPersona(d.persona, name) : d._cai ? first(d.definition, d.description, d.title) : first(d.description, d.char_persona, d.persona, d.desc),
    personality: def ? s(def.tavern_personality) : s(typeof d.personality === 'string' ? d.personality : ''),
    scenario: first(def && def.scenario, d.scenario, d.world_scenario),
    first_mes: first(def && def.first_message, d.first_mes, d.char_greeting, d.greeting, d.first_message, d.firstMessage, d.intro),
    mes_example: first(def && def.example_dialogs, d.mes_example, d.example_dialogue, d.example_dialogs, d.sampleChat, d.exampleDialogue),
    alternate_greetings: strList(def && def.alternate_greetings || d.alternate_greetings || d.alternateGreetings || d.greetings),
    creator_notes: first(def && def.description !== (def && def.personality) ? def && def.description : '', d.creator_notes, d.creatorcomment, d.creator_comment, d.tagline, d._cai ? d.description : '', d.title),
    system_prompt: first(def && def.system_prompt, d.system_prompt, d.systemPrompt),
    post_history_instructions: first(def && def.post_history_instructions, d.post_history_instructions, d.ujb),
    creator: first(d.creator, d.author, d.creator_name, d._outer && d._outer.user__username, d.user__username, d.fullPath && String(d.fullPath).split('/')[0]),
    character_version: s(d.character_version),
    tags: tagList(d.tags || d.topics || d.categories || (j.data && j.tags)),
    nsfwFlag: typeof d.nsfw === 'boolean' ? d.nsfw : typeof d.is_nsfw === 'boolean' ? d.is_nsfw : null,
    created: d.creation_date ?? d.create_date ?? d.createdAt ?? d.created_at ?? d.created ?? d.createdDate ?? null,
    lorebook: lorebook(d.character_book || d.characterBook || (def && def.embedded_lorebook) || null),
  };
  if (!card.description.trim() && !card.first_mes.trim() && !card.personality.trim()) {
    // maybe the card sits one level down under an unusual key
    for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object' && !['tags', 'extensions', 'character_book', 'about'].includes(k)) {
      const inner = cardsFromJson(v, depth + 1); if (inner.length) return inner;
    }
  }
  return [card];
}
export const hasText = c => !!(c && (s(c.description).trim() || s(c.first_mes).trim() || s(c.personality).trim()));

// ---------------------------------------------------------------- text payloads (base64 or raw JSON)
function tryJson(t) { try { return JSON.parse(t); } catch { return undefined; } }
/** A chunk value -> parsed JSON or undefined. Raw JSON, base64 (standard or URL-safe, with stray whitespace), and
 *  base64 of base64 (a few old exporters). */
export function decodePayload(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').trim();
  for (let round = 0; round < 3 && t; round++) {
    if (t[0] === '{' || t[0] === '[') { const j = tryJson(t) ?? tryJson(t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')); return j; }
    const b = t.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]+=*$/.test(b) || b.length < 8) return undefined;
    t = Buffer.from(b, 'base64').toString('utf-8').replace(/^\uFEFF/, '').trim();
  }
  return undefined;
}

// ---------------------------------------------------------------- PNG
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** Every text chunk of a PNG: [{ type, key, text }]. Tolerates bad CRCs, odd chunk orders and truncation. */
export function pngTextChunks(buf) {
  const out = []; let pos = 8, iend = -1;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || pos + 12 + len > buf.length + 4) break;
    const data = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + len));
    try {
      if (type === 'tEXt') { const z = data.indexOf(0); out.push({ type, key: data.toString('latin1', 0, z), text: data.toString('latin1', z + 1) }); }
      else if (type === 'zTXt') { const z = data.indexOf(0); out.push({ type, key: data.toString('latin1', 0, z), text: inflateSync(data.subarray(z + 2)).toString('latin1') }); }
      else if (type === 'iTXt') {
        const z = data.indexOf(0), comp = data[z + 1]; let p = z + 3; p = data.indexOf(0, p) + 1; p = data.indexOf(0, p) + 1;
        const body = data.subarray(p);
        out.push({ type, key: data.toString('latin1', 0, z), text: (comp ? inflateSync(body) : body).toString('utf-8') });
      }
    } catch { out.push({ type, key: '(unreadable ' + type + ')', text: '' }); }
    if (type === 'IEND') { iend = pos + 12 + len; break; }
    pos += 12 + len;
  }
  return { chunks: out, trailing: iend > 0 && iend < buf.length ? buf.subarray(iend) : pos < buf.length && iend < 0 ? buf.subarray(pos) : null };
}

// Last resort for any binary: base64 runs that start like JSON ("ey" = '{"'), or raw JSON objects near card keys.
function scanBinary(buf) {
  const t = buf.toString('latin1'), found = [];
  for (const m of t.matchAll(/ey[A-Za-z0-9+/]{60,}={0,2}/g)) { const j = decodePayload(m[0]); if (j !== undefined) found.push(j); if (found.length > 3) break; }
  if (!found.length) {
    const u = buf.toString('utf-8');
    for (const m of u.matchAll(/\{\s*"(?:spec|name|char_name|data|description|char_persona)"/g)) {
      let depth = 0, inStr = false, esc = false, i = m.index;
      for (; i < u.length && i < m.index + 5e6; i++) { const ch = u[i]; if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; } else if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break; }
      const j = tryJson(u.slice(m.index, i + 1)); if (j !== undefined) { found.push(j); break; }
    }
  }
  return found;
}

export function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 0, 4) === 'PK\u0003\u0004') return 'zip';
  if (buf.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return '7z';
  if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) return 'zstd';
  if (buf.toString('latin1', 0, 4) === 'Rar!') return 'rar';
  const head = buf.subarray(0, 4096).toString('utf-8').replace(/^\uFEFF/, '').trimStart();
  if (head[0] === '{' || head[0] === '[') return /^\{[^\n]*\}\s*\n\s*\{/.test(buf.subarray(0, 1 << 20).toString('utf-8').trimStart()) ? 'jsonl' : 'json';
  return 'other';
}

/** Image bytes -> { cards: [raw card objects], spec, keys: [text chunk keys seen], why } */
export function cardsFromImage(buf, kind = sniff(buf)) {
  const keys = []; let payloads = [];
  if (kind === 'png') {
    const { chunks, trailing } = pngTextChunks(buf);
    const rank = k => k === 'ccv3' ? 0 : k === 'chara' ? 1 : 2;
    for (const c of chunks.sort((a, b) => rank(a.key) - rank(b.key))) {
      keys.push(c.key);
      const j = decodePayload(c.text);
      if (j !== undefined && typeof j === 'object') payloads.push({ key: c.key, j });
    }
    if (!payloads.length && trailing && trailing.length > 20) for (const j of scanBinary(trailing)) payloads.push({ key: '(after IEND)', j });
  }
  if (!payloads.length && kind !== 'png') for (const j of scanBinary(buf)) payloads.push({ key: '(embedded)', j });
  for (const { key, j } of payloads) {
    const cards = cardsFromJson(j).filter(hasText);
    if (cards.length) return { cards: key === 'ccv3' ? cards.map(c => ({ ...c, spec: 'v3' })) : cards, key, keys };
  }
  return { cards: [], keys, why: payloads.length ? 'card JSON without text' : keys.length ? 'no card data (text chunks: ' + [...new Set(keys)].join(', ') + ')' : 'no card data (image only)' };
}

// ---------------------------------------------------------------- hashing (duplicate finding)
// Description + greeting + personality + scenario. Short texts (under 30 words, e.g. "WIP" or an empty profile) also
// include the name, so different characters with the same placeholder text aren't called duplicates.
export function normalizeText(c) {
  let t = [c.description, c.first_mes, c.personality, c.scenario].filter(Boolean).join('\n');
  const n = String(c.name || '').trim();
  if (n.length > 1) t = t.split(n).join('{{char}}');
  t = t.toLowerCase().replace(/\{\{\s*char\s*\}\}|<bot>/g, ' charname ').replace(/\{\{\s*user\s*\}\}|<user>/g, ' username ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return t.split(' ').length < 30 ? n.toLowerCase() + ' | ' + t : t;
}
export const textHash = norm => createHash('sha1').update(norm).digest('hex').slice(0, 16);
export function simhash(norm) {
  const w = norm.split(' ').filter(Boolean), v = new Int32Array(64);
  if (w.length < 3) return null;
  for (let i = 0; i + 2 < w.length; i++) {
    const sh = w[i] + ' ' + w[i + 1] + ' ' + w[i + 2];
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;   // two FNV-1a variants = 64 bits, much faster than md5
    for (let k = 0; k < sh.length; k++) { const ch = sh.charCodeAt(k); h1 = Math.imul(h1 ^ ch, 0x01000193); h2 = Math.imul(h2 ^ ch, 0x5bd1e995) ^ (h2 >>> 13); }
    for (let b = 0; b < 32; b++) { v[b] += (h1 >>> b) & 1 ? 1 : -1; v[b + 32] += (h2 >>> b) & 1 ? 1 : -1; }
  }
  let hex = ''; for (let n = 0; n < 16; n++) { let x = 0; for (let b = 0; b < 4; b++) if (v[n * 4 + b] > 0) x |= 1 << b; hex += x.toString(16); }
  return hex;
}
export const hamming = (a, b) => { let d = 0; for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };


/** zip inflate helper re-exported for callers that read raw deflate */
export { inflateRawSync };
