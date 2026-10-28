// card-import.js - Turn whatever the user pastes or drops into card fields.
//   - Tavern V2/V3 JSON ({spec, data: {...}}), V1 JSON ({name, description, first_mes}),
//     Pygmalion/old TavernAI JSON ({char_persona, char_greeting, world_scenario})
//   - character-card PNGs (the card JSON is base64 in a tEXt/iTXt chunk named "chara" or "ccv3")
//   - anything else is plain text (description, greeting left empty)

function fromObject(o) {
  if (!o || typeof o !== 'object') return null;
  const d = o.data && typeof o.data === 'object' ? o.data : o;
  const card = {
    name: d.name || d.char_name || '',
    description: d.description || d.char_persona || '',
    personality: d.personality || '',
    scenario: d.scenario || d.world_scenario || '',
    first_mes: d.first_mes || d.char_greeting || '',
    mes_example: d.mes_example || d.example_dialogue || '',
    alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.filter(x => typeof x === 'string') : [],
    tags: Array.isArray(d.tags) ? d.tags : [],
  };
  return card.description || card.first_mes || card.personality ? card : null;
}

/** Plain text, or card JSON pasted as text. Returns { card, kind }. */
export function parseCardText(text) {
  const t = String(text || '').trim();
  if (t.startsWith('{')) {
    try { const c = fromObject(JSON.parse(t)); if (c) return { card: c, kind: 'json' }; } catch { /* not JSON */ }
  }
  return { card: { description: t }, kind: 'text' };
}

function latin1(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; }
function b64ToUtf8(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** Character-card PNG -> { card, kind } or null. */
export function parseCardPng(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (u8.length < 16 || sig.some((v, i) => u8[i] !== v)) return null;
  const dv = new DataView(arrayBuffer);
  let pos = 8; const found = {};
  while (pos + 8 <= u8.length) {
    const len = dv.getUint32(pos); const type = latin1(u8.subarray(pos + 4, pos + 8));
    const data = u8.subarray(pos + 8, pos + 8 + len);
    if (type === 'tEXt' || type === 'iTXt') {
      const z = data.indexOf(0);
      const key = latin1(data.subarray(0, z));
      if (key === 'chara' || key === 'ccv3') {
        let body = data.subarray(z + 1);
        if (type === 'iTXt') {           // compression flag, method, language\0, translated keyword\0
          let p = 2; p = body.indexOf(0, p) + 1; p = body.indexOf(0, p) + 1; body = body.subarray(p);
        }
        found[key] = latin1(body);
      }
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = found.ccv3 || found.chara;
  if (!raw) return null;
  try { const c = fromObject(JSON.parse(b64ToUtf8(raw.trim()))); return c ? { card: c, kind: 'png' } : null; } catch { return null; }
}
