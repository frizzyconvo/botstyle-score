// _card_sources.mjs - Read character cards from a path on disk, whatever shape it has, for scoring
// (tools/score_all.mjs --add). Yields plain card objects { id, name, createdAt, description, personality,
// scenario, first_mes, tags }; nothing is written anywhere.
//
// Accepted paths:
//   folder of Perchance characters   <name>/src/roleInstruction.txt (+ initialMessages.json, name.txt), at any depth
//                                    up to 3, e.g. .../characters/sfw or a copy of it
//   folder of card files             *.png (chara / ccv3 chunk), *.json (V1/V2/V3), *.jsonl (one card per line);
//                                    searched recursively
//   a .zip                           the same card files inside it; add an inner folder and pattern after the
//                                    .zip, e.g. C:\cards\pack.zip\books\*.png
//   a single .png / .json / .jsonl file
import { existsSync, statSync, readdirSync, readFileSync, openSync, readSync, closeSync } from 'fs';
import { join, relative, sep, basename, extname } from 'path';
import { inflateRawSync } from 'zlib';
import { parseCardPng, parseCardText } from '../js/card-import.js';

const rd = p => { try { return readFileSync(p, 'utf-8'); } catch { return ''; } };
const tagsOf = t => Array.isArray(t) ? t : typeof t === 'string' ? (t.match(/[^\[\]",']+/g) || []).map(x => x.trim()).filter(Boolean) : [];

// ---- Perchance (same reading as the perchance dataset in score_all.mjs) ----
const EX = /^[\s#*\-]*(?:---\s*)?(?:start of )?example (?:dialogue|dialog|conversation|messages?|chat)s?\b.*$|^\s*<START>\s*$/im;
const isPerchanceChar = d => existsSync(join(d, 'src', 'roleInstruction.txt'));
export function perchanceCard(dir, id) {
  const src = join(dir, 'src');
  let ri = rd(join(src, 'roleInstruction.txt')); const m = ri.match(EX); if (m) ri = ri.slice(0, m.index);
  let msgs = []; try { msgs = JSON.parse(rd(join(src, 'initialMessages.json')) || '[]'); } catch { /* */ }
  const ai = msgs.find(x => x.author === 'ai' && x.content), scene = msgs.find(x => x.author === 'system' && !(x.hiddenFrom || []).length && x.content);
  let created = null; try { created = JSON.parse(rd(join(dir, 'changelog.json')) || '{}').created || null; } catch { /* */ }
  return { id, name: rd(join(src, 'name.txt')).trim() || basename(dir), createdAt: created, description: ri.trim(), first_mes: (ai || scene || {}).content || '' };
}
function* perchanceDir(base, root = base, depth = 0) {
  for (const e of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const d = join(base, e.name);
    if (isPerchanceChar(d)) yield perchanceCard(d, 'perchance:' + relative(root, d).split(sep).join('/'));
    else if (depth < 3) yield* perchanceDir(d, root, depth + 1);
  }
}
function hasPerchance(base, depth = 0) {
  if (isPerchanceChar(base)) return true;
  if (depth > 3) return false;
  for (const e of readdirSync(base, { withFileTypes: true }).slice(0, 50)) if (e.isDirectory() && hasPerchance(join(base, e.name), depth + 1)) return true;
  return false;
}

// ---- card files ----
const CARD_EXT = new Set(['.png', '.json', '.jsonl']);
function* cardsFromBytes(buf, id) {
  const ext = extname(id).toLowerCase();
  if (ext === '.png') {
    const p = parseCardPng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    if (p && p.card) yield { id, ...p.card };
  } else if (ext === '.json') {
    const p = parseCardText(buf.toString('utf-8'));
    if (p.kind === 'json') { let created = null; try { const j = JSON.parse(buf.toString('utf-8')); const d = j.data || j; created = d.creation_date || d.create_date || j.create_date || null; } catch { /* */ } yield { id, createdAt: created, ...p.card }; }
  } else if (ext === '.jsonl') {
    let i = 0;
    for (const line of buf.toString('utf-8').split('\n')) {
      if (!line.trim()) continue; i++;
      try { const j = JSON.parse(line); const d = j.data || j; yield { id: `${id}#${d.id ?? i}`, name: d.name || d.char_name || '', createdAt: d.createdAt || d.created_at || null,
        description: d.description || d.char_persona || '', personality: d.personality || '', scenario: d.scenario || '', first_mes: d.first_mes || d.char_greeting || '', tags: tagsOf(d.tags) }; } catch { /* bad line */ }
    }
  }
}
function* cardDir(base, root = base) {
  for (const e of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(base, e.name);
    if (e.isDirectory()) yield* cardDir(p, root);
    else if (CARD_EXT.has(extname(e.name).toLowerCase())) { try { yield* cardsFromBytes(readFileSync(p), relative(root, p).split(sep).join('/')); } catch { /* unreadable */ } }
  }
}

// ---- zip (stored and deflated entries, zip64 aware; reads entries one at a time, never the whole file) ----
function zipEntries(file) {
  const fd = openSync(file, 'r'), size = statSync(file).size;
  const read = (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
  const tailLen = Math.min(size, 65557), tail = read(size - tailLen, tailLen);
  let eocd = -1; for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) { closeSync(fd); throw new Error('not a zip file (no end-of-central-directory record)'); }
  let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || count === 0xffff) {   // zip64
    const loc = eocd - 20;
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z = read(Number(tail.readBigUInt64LE(loc + 8)), 56);
      count = Number(z.readBigUInt64LE(32)); cdSize = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48));
    }
  }
  const cd = read(cdOff, cdSize), out = [];
  for (let p = 0, k = 0; k < count && p + 46 <= cd.length; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x800 ? 'utf-8' : 'latin1', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    for (let x = p + 46 + nlen; x + 4 <= p + 46 + nlen + xlen;) {   // zip64 extra field
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2); let q = x + 4;
      if (id === 1) { if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; } if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; } if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); } }
      x += 4 + len;
    }
    out.push({ name, method, csize, usize, off });
    p += 46 + nlen + xlen + clen;
  }
  const data = e => { const h = read(e.off, 30); const start = e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28); const raw = read(start, e.csize);
    if (e.method === 0) return raw; if (e.method === 8) return inflateRawSync(raw); throw new Error(`unsupported zip compression ${e.method} for ${e.name}`); };
  return { entries: out, data, close: () => closeSync(fd) };
}
const globRx = g => new RegExp('^' + g.split('/').map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')).join('/') + '$', 'i');
function* zipCards(file, inner = '') {
  const z = zipEntries(file);
  try {
    inner = inner.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const rx = !inner ? null : /[*?]/.test(inner) ? globRx(inner) : new RegExp('^' + inner.replace(/[.+^${}()|[\]\\]/g, '\\$&') + '(/|$)', 'i');
    for (const e of z.entries) {
      if (e.name.endsWith('/') || !CARD_EXT.has(extname(e.name).toLowerCase()) || (rx && !rx.test(e.name))) continue;
      try { yield* cardsFromBytes(z.data(e), e.name); } catch { /* bad entry */ }
    }
  } finally { z.close(); }
}

/** Split "C:\x\pack.zip\books\*.png" into the zip file and the part inside it. */
export function splitZipPath(p) {
  const m = String(p).match(/^(.*?\.zip)(?:[\\/](.*))?$/i);
  return m && existsSync(m[1]) && statSync(m[1]).isFile() ? { zip: m[1], inner: m[2] || '' } : null;
}
/** What kind of source a path is (for messages), or null if it can't be read. */
export function sourceKind(p) {
  const z = splitZipPath(p); if (z) return 'zip';
  if (!existsSync(p)) return null;
  if (statSync(p).isDirectory()) return hasPerchance(p) ? 'perchance' : 'cards folder';
  return CARD_EXT.has(extname(p).toLowerCase()) ? 'card file' : null;
}
/** Every card at a path. */
export function* readCards(p) {
  const z = splitZipPath(p);
  if (z) { yield* zipCards(z.zip, z.inner); return; }
  if (!existsSync(p)) throw new Error(`not found: ${p}`);
  if (statSync(p).isDirectory()) { yield* hasPerchance(p) ? perchanceDir(p) : cardDir(p); return; }
  yield* cardsFromBytes(readFileSync(p), basename(p));
}
