// _card_sources.mjs - Read character cards from a path on disk, whatever shape it has, for scoring
// (tools/score_all.mjs --add) and converting (tools/convert_cards.mjs). Yields plain card objects { id, name,
// createdAt, description, personality, scenario, first_mes, tags, ... }; nothing is written anywhere.
//
// Accepted paths:
//   folder of Perchance characters   <name>/src/roleInstruction.txt (+ initialMessages.json, name.txt), at any depth
//                                    up to 3, e.g. .../characters/sfw or a copy of it
//   folder of card files             searched recursively; files are recognized by their content, not their extension:
//                                    PNG / WebP / JPEG cards, card JSON (one card or an array), JSONL (one card per
//                                    line), .zst-compressed JSON / JSONL, and archives inside the folder
//   a .zip / .charx                  the same, inside it; add an inner folder and pattern after the .zip, e.g.
//                                    C:\cards\pack.zip\books\*.png
//   a .7z / .rar                     the same, unpacked to a temp folder by 7-Zip (7z.exe on PATH, in Program Files, or
//                                    SEVENZIP=<path to 7z>); also accepts an inner pattern like a .zip
//   a single card / .json / .jsonl / .jsonl.zst file
// Sidecar files: a details.txt (or any other .txt / .yaml / non-card .json) next to the cards that names "tags:" and
// "by <creator>" fills in tags and creator for the cards in that folder that have none (Pygmalion Discord exports).
// Pass { onSkip(id, why), onFile(id, kind) } as the second argument to see what was skipped and why.
import { existsSync, statSync, readdirSync, readFileSync, openSync, readSync, closeSync, mkdtempSync, rmSync } from 'fs';
import { join, relative, sep, basename, extname, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import zlib from 'zlib';
import { cardsFromJson, cardsFromImage, hasText, sniff, tagList, toIso } from './_card_parse.mjs';

const rd = p => { try { return readFileSync(p, 'utf-8'); } catch { return ''; } };
const posix = p => p.split(sep).join('/');

// ---- Perchance (same reading as the perchance dataset in score_all.mjs) ----
const EX = /^[\s#*\-]*(?:---\s*)?(?:start of )?example (?:dialogue|dialog|conversation|messages?|chat)s?\b.*$|^\s*<START>\s*$/im;
const isPerchanceChar = d => existsSync(join(d, 'src', 'roleInstruction.txt'));
export function perchanceCard(dir, id) {
  const src = join(dir, 'src');
  let ri = rd(join(src, 'roleInstruction.txt')); const m = ri.match(EX); if (m) ri = ri.slice(0, m.index);
  let msgs = []; try { msgs = JSON.parse(rd(join(src, 'initialMessages.json')) || '[]'); } catch { /* */ }
  const ai = msgs.find(x => x.author === 'ai' && x.content), scene = msgs.find(x => x.author === 'system' && !(x.hiddenFrom || []).length && x.content);
  let created = null; try { created = JSON.parse(rd(join(dir, 'changelog.json')) || '{}').created || null; } catch { /* */ }
  // manifest.json (perchance-character-database): author, and categories { rating: 'sfw' | 'nsfw', genre: [...], ... }
  let tags = [], creator = '', nsfwFlag = null;
  try {
    const man = JSON.parse(rd(join(dir, 'manifest.json')) || rd(join(dir, 'metadata.json')) || '{}'), cat = man.categories;
    creator = String(man.author || '').trim();
    if (cat && typeof cat === 'object' && !Array.isArray(cat)) {
      const rk = Object.keys(cat).find(k => /^(?:rating|content ?rating|nsfw)$/i.test(k)), rv = rk ? [].concat(cat[rk]).join(' ') : '';
      if (rv) nsfwFlag = /nsfw|adult|18|explicit|mature/i.test(rv) ? true : /sfw|safe|general/i.test(rv) ? false : null;
      tags = tagList(Object.entries(cat).filter(([k]) => k !== rk).flatMap(([, v]) => Array.isArray(v) ? v : [v]));
    } else tags = tagList(man.tags || cat);
  } catch { /* */ }
  return { id, name: rd(join(src, 'name.txt')).trim() || basename(dir), createdAt: created, description: ri.trim(), first_mes: (ai || scene || {}).content || '', tags, creator, nsfwFlag, tagSource: tags.length ? 'card' : nsfwFlag != null ? 'flag' : 'none', spec: 'perchance', container: 'perchance' };
}
function* perchanceDir(base, root = base, depth = 0) {
  for (const e of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const d = join(base, e.name);
    if (isPerchanceChar(d)) yield perchanceCard(d, 'perchance:' + posix(relative(root, d)));
    else if (depth < 3) yield* perchanceDir(d, root, depth + 1);
  }
}
function hasPerchance(base, depth = 0) {
  if (isPerchanceChar(base)) return true;
  if (depth > 3) return false;
  for (const e of readdirSync(base, { withFileTypes: true }).slice(0, 50)) if (e.isDirectory() && hasPerchance(join(base, e.name), depth + 1)) return true;
  return false;
}

// ---- which files to open ----
// Card-bearing extensions are opened and sniffed; sidecar text is read for tags; everything else is only counted.
const CARD_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.json', '.jsonl', '.ndjson', '.zst', '.charx', '.zip', '.7z', '.rar', '.card', '.chara']);
const SIDECAR_EXT = new Set(['.txt', '.yaml', '.yml', '.md']);
const MAX_FILE = 2 ** 31 - 1;

// ---- sidecars ("by Ares arenoso\ntags: roleplay, video game") ----
export function parseSidecar(text) {
  const out = { tags: [], creator: '' };
  for (const line of String(text).split(/\r?\n/).slice(0, 200)) {
    let m = line.match(/^\s*(?:tags?|topics|categories|genres?)\s*[:=]\s*(.+)$/i);
    if (m) { out.tags.push(...tagList(m[1])); continue; }
    m = line.match(/^\s*(?:by|creator|author|made by|created by)\s*[:=]?\s+(.{1,80})$/i);
    if (m && !out.creator) out.creator = m[1].trim();
  }
  out.tags = [...new Set(out.tags)];
  return out;
}
function sidecarFromJson(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const tags = tagList(j.tags || j.topics || j.categories), creator = String(j.creator || j.author || j.username || '').trim();
  return tags.length || creator ? { tags, creator } : null;
}

// ---- zstd ----
function unzstd(buf, file) {
  if (typeof zlib.zstdDecompressSync === 'function') return zlib.zstdDecompressSync(buf, { maxOutputLength: MAX_FILE });
  const r = file ? spawnSync('zstd', ['-dc', file], { maxBuffer: MAX_FILE }) : spawnSync('zstd', ['-dc'], { input: buf, maxBuffer: MAX_FILE });
  if (r.status === 0) return r.stdout;
  throw new Error('can\'t read .zst: needs Node 22.15+ or the zstd program');
}

// ---- JSONL: line by line over a buffer, or over a file in chunks (never one giant string) ----
function* bufferLines(buf) {
  let start = 0;
  while (start < buf.length) { let end = buf.indexOf(10, start); if (end < 0) end = buf.length; if (end > start) yield buf.toString('utf-8', start, end); start = end + 1; }
}
function* fileLines(file) {
  const fd = openSync(file, 'r'), chunk = Buffer.alloc(1 << 22); let rest = Buffer.alloc(0), n;
  try {
    while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      let buf = Buffer.concat([rest, chunk.subarray(0, n)]), start = 0, end;
      while ((end = buf.indexOf(10, start)) >= 0) { if (end > start) yield buf.toString('utf-8', start, end); start = end + 1; }
      rest = Buffer.from(buf.subarray(start));
    }
    if (rest.length) yield rest.toString('utf-8');
  } finally { closeSync(fd); }
}

// ---- 7-Zip (for .7z / .rar) ----
let SEVEN = undefined;
export function sevenZip() {
  if (SEVEN !== undefined) return SEVEN;
  const cands = [process.env.SEVENZIP, '7z', '7za', '7zz', 'C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].filter(Boolean);
  for (const c of cands) { try { const r = spawnSync(c, ['i'], { stdio: 'ignore' }); if (!r.error && r.status === 0) return (SEVEN = c); } catch { /* */ } }
  return (SEVEN = null);
}
function* sevenZipFiles(file, opts, prefix) {
  const exe = sevenZip();
  if (!exe) { opts.onSkip?.(prefix || basename(file), 'needs 7-Zip (install it, or set SEVENZIP to 7z.exe)'); return; }
  const tmp = mkdtempSync(join(tmpdir(), 'botstyle-7z-'));
  try {
    const r = spawnSync(exe, ['x', '-y', '-bd', '-bso0', '-bsp0', '-o' + tmp, file], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 24 });
    if (r.status !== 0 && r.status !== 1) opts.onSkip?.(prefix || basename(file), '7-Zip failed: ' + String(r.stderr || '').trim().slice(0, 200));
    yield* dirFiles(tmp, tmp, prefix);
  } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
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
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), dtime = cd.readUInt16LE(p + 12), ddate = cd.readUInt16LE(p + 14);
    let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x800 ? 'utf-8' : 'latin1', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    for (let x = p + 46 + nlen; x + 4 <= p + 46 + nlen + xlen;) {   // zip64 extra field
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2); let q = x + 4;
      if (id === 1) { if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; } if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; } if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); } }
      x += 4 + len;
    }
    const mtime = ddate ? new Date(Date.UTC(1980 + (ddate >> 9), ((ddate >> 5) & 15) - 1, ddate & 31, dtime >> 11, (dtime >> 5) & 63, (dtime & 31) * 2)).toISOString() : null;
    out.push({ name, method, csize, usize, off, mtime, encrypted: !!(flags & 1) });
    p += 46 + nlen + xlen + clen;
  }
  const data = e => { const h = read(e.off, 30); const start = e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28); const raw = read(start, e.csize);
    if (e.encrypted) throw new Error('encrypted zip entry');
    if (e.method === 0) return raw; if (e.method === 8) return zlib.inflateRawSync(raw); throw new Error(`unsupported zip compression ${e.method}`); };
  return { entries: out, data, close: () => closeSync(fd) };
}
const globRx = g => new RegExp('^' + g.split('/').map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')).join('/') + '$', 'i');
const innerRx = inner => { inner = String(inner || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); return !inner ? null : /[*?]/.test(inner) ? globRx(inner) : new RegExp('^' + inner.replace(/[.+^${}()|[\]\\]/g, '\\$&') + '(/|$)', 'i'); };

// ---- virtual files: { rel, ext, read(), file?, mtime } from folders, zips and 7z ----
function* dirFiles(base, root, prefix = '') {
  let ents; try { ents = readdirSync(base, { withFileTypes: true }); } catch { return; }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(base, e.name), rel = (prefix ? prefix + '/' : '') + posix(relative(root, p));
    if (e.isDirectory()) { yield* dirFiles(p, root, prefix); continue; }
    if (!e.isFile()) continue;
    let st; try { st = statSync(p); } catch { continue; }
    yield { rel, ext: extOf(e.name), file: p, size: st.size, mtime: st.mtime.toISOString(), read: () => readFileSync(p) };
  }
}
function* zipFiles(file, inner, prefix = '') {
  const z = zipEntries(file), rx = innerRx(inner);
  try {
    for (const e of z.entries) {
      if (e.name.endsWith('/') || (rx && !rx.test(e.name))) continue;
      yield { rel: (prefix ? prefix + '/' : '') + e.name, ext: extOf(e.name), size: e.usize, mtime: e.mtime, read: () => z.data(e) };
    }
  } finally { z.close(); }
}
const extOf = n => { const l = n.toLowerCase(); return l.endsWith('.jsonl.zst') ? '.jsonl.zst' : l.endsWith('.json.zst') ? '.json.zst' : extname(l); };

// ---- turning one virtual file into cards ----
function stamp(c, f, id, container) {
  const created = toIso(c.created) || null;
  const { created: _drop, ...rest } = c;
  return { ...rest, id, createdAt: created, fileDate: f.mtime || null, container, name: rest.name || '', description: rest.description || '', personality: rest.personality || '', scenario: rest.scenario || '', first_mes: rest.first_mes || '', tags: rest.tags || [] };
}
function* jsonlCards(lines, f, opts) {
  let i = 0, bad = 0;
  for (const line of lines) {
    const t = line.trim(); if (!t) continue; i++;
    let j; try { j = JSON.parse(t); } catch { bad++; continue; }
    const cards = cardsFromJson(j).filter(hasText);
    if (!cards.length) { opts.onSkip?.(`${f.rel}#${i}`, 'line without card text'); continue; }
    for (const [k, c] of cards.entries()) yield stamp(c, f, `${f.rel}#${c.id || j.id || i}${cards.length > 1 ? '.' + k : ''}`, 'jsonl');
  }
  if (bad) opts.onSkip?.(f.rel, `${bad} JSONL line(s) that aren't JSON`);
}
function* fileCards(f, opts, depth) {
  if (f.size > MAX_FILE) { opts.onSkip?.(f.rel, 'file over 2 GB'); return; }
  // big plain JSONL on disk: stream it
  if (f.file && (f.ext === '.jsonl' || f.ext === '.ndjson')) { opts.onFile?.(f.rel, 'jsonl'); yield* jsonlCards(fileLines(f.file), f, opts); return; }
  let buf; try { buf = f.read(); } catch (e) { opts.onSkip?.(f.rel, 'unreadable: ' + e.message); return; }
  let kind = sniff(buf);
  if (kind === 'zstd') { try { buf = unzstd(buf, f.file); } catch (e) { opts.onSkip?.(f.rel, e.message); return; } kind = sniff(buf); }
  opts.onFile?.(f.rel, kind);
  if (kind === 'png' || kind === 'jpeg' || kind === 'webp') {
    const r = cardsFromImage(buf, kind);
    if (!r.cards.length) { opts.onSkip?.(f.rel, r.why, { kind, keys: r.keys }); return; }
    for (const [k, c] of r.cards.entries()) yield stamp(c, f, r.cards.length > 1 ? `${f.rel}#${k}` : f.rel, kind);
  } else if (kind === 'json') {
    let j; try { j = JSON.parse(buf.toString('utf-8').replace(/^\uFEFF/, '')); } catch { opts.onSkip?.(f.rel, 'not valid JSON'); return; }
    const cards = cardsFromJson(j).filter(hasText);
    if (!cards.length) { opts.onSkip?.(f.rel, 'JSON without card text', { kind }); return; }
    for (const [k, c] of cards.entries()) yield stamp(c, f, cards.length > 1 ? `${f.rel}#${c.id || k}` : f.rel, 'json');
  } else if (kind === 'jsonl') {
    yield* jsonlCards(bufferLines(buf), f, opts);
  } else if (kind === 'zip' || kind === '7z' || kind === 'rar') {
    if (depth > 2) { opts.onSkip?.(f.rel, 'archive nested too deep'); return; }
    if (kind === 'zip') {
      // .charx (RisuAI): a zip holding card.json; read only that. Other zips: everything inside.
      if (f.ext === '.charx') {
        const tmpFile = f.file || null;
        const z = tmpFile ? zipEntries(tmpFile) : null;
        if (z) { try { const e = z.entries.find(x => /(^|\/)card\.json$/i.test(x.name)); if (e) { const cards = cardsFromJson(JSON.parse(z.data(e).toString('utf-8'))).filter(hasText); for (const c of cards) yield stamp({ ...c, spec: c.spec === 'v1' ? 'v3' : c.spec }, f, f.rel, 'charx'); if (!cards.length) opts.onSkip?.(f.rel, 'charx without card text'); } else opts.onSkip?.(f.rel, 'charx without card.json'); } finally { z.close(); } return; }
      }
      if (f.file) { yield* walk(zipFiles(f.file, '', f.rel), opts, depth + 1); return; }
      opts.onSkip?.(f.rel, 'zip inside an archive: unpack it first'); return;
    }
    if (f.file) { yield* walk(sevenZipFiles(f.file, opts, f.rel), opts, depth + 1); return; }
    opts.onSkip?.(f.rel, kind + ' inside an archive: unpack it first');
  } else opts.onSkip?.(f.rel, 'not a card file', { kind });
}

// Folders first gather their sidecars, then read their cards, so details.txt fills in tags whatever the file order.
function* walk(files, opts, depth = 0) {
  const byDir = new Map();
  const flush = function* (dir) {
    const g = byDir.get(dir); if (!g) return; byDir.delete(dir);
    const side = { tags: [], creator: '' };
    for (const s of g.side) { if (s.tags.length) side.tags.push(...s.tags); if (!side.creator && s.creator) side.creator = s.creator; }
    side.tags = [...new Set(side.tags)];
    for (const c of g.cards) {
      const out = { ...c, tagSource: c.tags.length ? 'card' : c.nsfwFlag != null ? 'flag' : 'none' };
      if (!c.tags.length && side.tags.length) { out.tags = side.tags; out.tagSource = 'sidecar'; }
      if (!c.creator && side.creator) out.creator = side.creator;
      yield out;
    }
  };
  let current = null;
  for (const f of files) {
    const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '';
    if (current !== null && dir !== current) yield* flush(current);
    current = dir;
    if (!byDir.has(dir)) byDir.set(dir, { side: [], cards: [] });
    const g = byDir.get(dir);
    if (SIDECAR_EXT.has(f.ext)) { try { const s = parseSidecar(f.read().toString('utf-8')); if (s.tags.length || s.creator) g.side.push(s); opts.onFile?.(f.rel, 'sidecar'); } catch { /* */ } continue; }
    if (!CARD_EXT.has(f.ext) && !f.ext.endsWith('.zst')) { opts.onFile?.(f.rel, 'ignored'); continue; }
    let got = 0;
    for (const c of fileCards(f, opts, depth)) {
      g.cards.push(c); got++;
      // stream big JSONL files instead of holding every card (their own tags apply; folder sidecars don't)
      if (g.cards.length > 5000) for (const x of g.cards.splice(0)) yield { ...x, tagSource: x.tags.length ? 'card' : x.nsfwFlag != null ? 'flag' : 'none' };
    }
    // a JSON file that isn't a card can still be a sidecar (tags / creator)
    if (f.ext === '.json' && !got) {
      try { const s = sidecarFromJson(JSON.parse(f.read().toString('utf-8'))); if (s) g.side.push(s); } catch { /* */ }
    }
  }
  for (const dir of [...byDir.keys()]) yield* flush(dir);
}

/** Split "C:\x\pack.zip\books\*.png" into the archive file and the part inside it. */
export function splitZipPath(p) {
  const m = String(p).match(/^(.*?\.(?:zip|charx|7z|rar))(?:[\\/](.*))?$/i);
  return m && existsSync(m[1]) && statSync(m[1]).isFile() ? { zip: m[1], inner: m[2] || '', kind: extname(m[1]).toLowerCase().slice(1) } : null;
}
/** "C:\x\historical-2023\chub_mega.*.jsonl": a folder and a file pattern (no subfolders) -> { dir, rx }, or null. */
export function splitDirGlob(p) {
  const m = String(p).match(/^(.*)[\\/]([^\\/]*[*?][^\\/]*)$/);
  if (!m || /[*?]/.test(m[1]) || !existsSync(m[1]) || !statSync(m[1]).isDirectory()) return null;
  return { dir: m[1], rx: globRx(m[2]) };
}
/** What kind of source a path is (for messages), or null if it can't be read. */
export function sourceKind(p) {
  const z = splitZipPath(p); if (z) return z.kind === 'charx' ? 'card file' : z.kind;
  if (splitDirGlob(p)) return 'files matching a pattern';
  if (!existsSync(p)) return null;
  if (statSync(p).isDirectory()) return hasPerchance(p) ? 'perchance' : 'cards folder';
  return CARD_EXT.has(extOf(p)) || extOf(p).endsWith('.zst') ? 'card file' : null;
}
/** Every card at a path. opts: { onSkip(id, why, info), onFile(id, kind) } */
export function* readCards(p, opts = {}) {
  const z = splitZipPath(p);
  if (z && z.kind === 'zip') { yield* walk(zipFiles(z.zip, z.inner), opts, 1); return; }
  if (z && (z.kind === '7z' || z.kind === 'rar')) {
    const rx = innerRx(z.inner);
    const files = (function* () { for (const f of sevenZipFiles(z.zip, opts, '')) { const rel = f.rel.replace(/^\/+/, ''); if (!rx || rx.test(rel)) yield { ...f, rel }; } })();
    yield* walk(files, opts, 1); return;
  }
  const g = splitDirGlob(p);
  if (g) {
    const files = (function* () { for (const f of dirFiles(g.dir, g.dir)) if (!f.rel.includes('/') && g.rx.test(f.rel)) yield f; })();
    yield* walk(files, opts); return;
  }
  if (!existsSync(p)) throw new Error(`not found: ${p}`);
  if (statSync(p).isDirectory()) { if (hasPerchance(p)) yield* perchanceDir(p); else yield* walk(dirFiles(p, p), opts); return; }
  const st = statSync(p);
  yield* walk([{ rel: basename(p), ext: extOf(p), file: p, size: st.size, mtime: st.mtime.toISOString(), read: () => readFileSync(p) }], opts);
}
