#!/usr/bin/env node
// test.mjs - Regression checks. Run: node tools/test.mjs   (exit code 1 on failure)
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync } from 'fs';
import zlib from 'zlib';
const root = new URL('../', import.meta.url);
global.fetch = async (url) => { const c = readFileSync(new URL(url.replace(/^\.\//, ''), root), 'utf-8'); return { ok: true, json: async () => JSON.parse(c) }; };
const { loadAll, scoreCard } = await import('../js/score-card.js');
const { STRUCTURE_PATTERNS } = await import('../js/ai-structures.js');
const { findArtifacts } = await import('../js/ai-artifacts.js');
const { preprocessCard } = await import('../js/card-preprocess.js');
const { descriptionFormat } = await import('../js/card-style.js');
const { parseCardText, parseCardPng } = await import('../js/card-import.js');
const { tallyCliches } = await import('../js/cliches.js');
const { parseCardUrl, chubToCard, fetchCard } = await import('../js/card-fetch.js');
await loadAll('./data/');
const fx = n => readFileSync(new URL('tests/fixtures/' + n, root), 'utf-8');

let fails = 0, passes = 0;
const check = (name, cond, info = '') => { if (cond) passes++; else { fails++; console.log(`FAIL ${name} ${info}`); } };

// 1. every sentence-structure pattern matches the example it documents
for (const p of STRUCTURE_PATTERNS) { p.rx.lastIndex = 0; check(`pattern ${p.id} matches its example`, p.rx.test(p.example), JSON.stringify(p.example)); }

// 2. obvious AI tells: only unambiguous ones score; dialogue doesn't count
const art = t => findArtifacts(t);
check('preamble+signoff scores', art('Certainly! Here is a detailed character description for Mira:\n\nMira is a tall elf.\n\nI hope this helps!').points >= 50);
check('robot dialogue is not a tell', art('As an AI, Unit-7 was built to serve. "As an AI, I do not feel," it says flatly.').points === 0);
check('maid offering tea is not a tell', art('*She curtsies.* Would you like me to prepare tea, master?').points === 0);
check('JSON residue is a note, not scored', (() => { const a = art('```json\n{"description": "Kai", "first_mes": "hi"}\n```'); return a.points === 0 && a.notes.some(n => n.id === 'code_wrapper'); })());
check('placeholder is a note, not scored', (() => { const a = art('[Insert name] is a barista.'); return a.points === 0 && a.notes.some(n => n.id === 'placeholder'); })());
check('refusal left in a card scores', art('Dingodile is a hulking hybrid who roars a lot.\n\nI\'m sorry, but I cannot assist with that request.').points >= 25);
check('in-character apology is not a tell', art('*He shrugs.* "I\'m sorry, but I can\'t help you with that, kid."').points === 0);
check('safety hedge no longer an artifact', art(fx('giallo.txt')).points === 0);

// 3. preprocessing and description format
const g = preprocessCard(fx('giallo.txt'));
check('bracketed instruction blocks are boilerplate', g.stats.boilerplateWords > 300, g.stats.boilerplateWords);
const wpp = '[Character("Vex") {Personality("sly" + "cold")} {Body("tall" + "lean")}]\nVex grew up.';
check('W++ -> compact', descriptionFormat(wpp, preprocessCard(wpp).stats).format === 'compact');
const md = '- **Name:** Vex\n- **Age:** 24\n- **Likes:** rain, knives\n- **Dislikes:** crowds\n- **Personality:** sly, cold';
check('markdown key-values -> lists', descriptionFormat(md, preprocessCard(md).stats).format === 'lists');
check('giallo -> boilerplate+prose', descriptionFormat(fx('giallo.txt'), g.stats).format === 'boilerplate+prose');

// 4. card import
check('V1/Pygmalion JSON import', parseCardText('{"char_name":"Old","char_persona":"An old card.","char_greeting":"Hello."}').card.first_mes === 'Hello.');
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = b => { let x = 0xffffffff; for (const v of b) x = crcT[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(1, 0); ih.writeUInt32BE(1, 4); ih[8] = 8;
const cardJ = { spec: 'chara_card_v2', data: { name: 'Mira', description: 'Mira — an elf.', first_mes: 'Hi.' } };
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('tEXt', Buffer.concat([Buffer.from('chara\0'), Buffer.from(Buffer.from(JSON.stringify(cardJ)).toString('base64'))])), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]);
const pc = parseCardPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.length));
check('PNG card import (UTF-8 intact)', pc && pc.card.description === 'Mira — an elf.');

// 5. clichés tally, no double listing with scored items
const cl = tallyCliches('She took a deep breath, her heart pounding. For a moment she couldn\'t help but stare. The weight of it all.');
check('cliché tally finds shared clichés', cl.phraseHits.some(h => h.item === 'took deep breath') && cl.phraseHits.some(h => h.pattern === 'for_a_moment'));
check('scored items are not listed as clichés', !cl.phraseHits.some(h => /weight of/i.test(h.item)));

// 6. score fixtures (ranges, not exact values)
const sc = (t, g2 = '') => scoreCard({ description: t, first_mes: g2 });
const rg = sc(fx('giallo.txt')), rv = sc(fx('vex.txt')), rh = sc(fx('plain_human.txt'));
check('giallo scores in 40..80', rg.score >= 40 && rg.score <= 80, rg.score.toFixed(1));
check('vex (slop-dense) scores >= 50', rv.score >= 50, rv.score.toFixed(1));
check('plain human text scores < 20', rh.score < 20, rh.score.toFixed(1));
check('plain human text band is Original', rh.band.id === 'original', rh.band.id);
check('names are tallied not scored', sc('Elara and Kael walked to the market with Thorne.').names.length === 3);

// 7. bonus tags added later
const charCard = Array.from({ length: 12 }, (_, i) => `{{char}} likes thing number ${i}.`).join(' ') + ' She lives in a town.';
check('{{char}} writes card tag', sc(charCard).tags.some(t => t.id === 'char_writes_card'));
check('no {{char}} tag on prose card', !rh.tags.some(t => t.id === 'char_writes_card'));
const longSlop = Array(16).fill(fx('vex.txt')).join('\n\n');
check('no-one-knows tag needs 3000 tokens + Common', sc(longSlop).tags.some(t => t.id === 'no_one_knows') && !sc(Array(40).fill(fx('plain_human.txt')).join('\n\n')).tags.some(t => t.id === 'no_one_knows'));
check('names list drops Sarah/Emily', !sc('Sarah and Emily went home with Elara.').names.some(n => /sarah|emily/.test(n.item)));

// 8. card links
check('chub link parsed', JSON.stringify(parseCardUrl('https://chub.ai/characters/frizzy_conversation_93532/farina-fire-emblem-37f711603592')) === '{"site":"chub","id":"frizzy_conversation_93532/farina-fire-emblem-37f711603592"}');
check('botbooru link parsed', parseCardUrl('https://botbooru.com/character/75990').id === '75990');
check('other links rejected', parseCardUrl('https://example.com/characters/a/b') === null);
const chubMeta = { node: { name: 'Farina', topics: ['Fire Emblem'], definition: { name: 'Farina', personality: 'DESC', tavern_personality: 'PERS', scenario: 'SCEN', first_message: 'HI', alternate_greetings: ['A2', 'A3'], description: 'creator notes' } } };
const cc = chubToCard(chubMeta);
check('chub fields mapped (personality field holds the description)', cc.description === 'DESC' && cc.personality === 'PERS' && cc.first_mes === 'HI' && cc.alternate_greetings.length === 2);
const fetched = await fetchCard('https://chub.ai/characters/a/b', { fetch: async u => ({ ok: /api\.chub\.ai\/api\/characters\/a\/b\?full=true/.test(u), status: 200, json: async () => chubMeta }) });
check('fetchCard hits the chub API', fetched.card.name === 'Farina');
let bbUrl = ''; const bb = await fetchCard('https://botbooru.com/character/75990', { fetch: async u => { bbUrl = u; return { ok: true, json: async () => ({ name: 'G', description: 'Desc.', first_mes: 'Hi.' }) }; } });
check('botbooru uses the download/json endpoint', bbUrl === 'https://botbooru.com/download/json/75990' && bb.card.first_mes === 'Hi.', bbUrl);

// 9. corner cases: nothing crashes or returns NaN, and unjudgeable input gets no band
const edge = {
  empty: {}, emoji: { description: '😀🔥💀✨✨' }, numbers: { description: '1 2 3 4 5 '.repeat(60) },
  japanese: { description: '彼女は勇敢な戦士です。山に住んでいます。'.repeat(20) },
  spanish: { description: 'Ella es una guerrera valiente que vive en las montañas y odia a los traidores. '.repeat(10) },
  wpp_only: { description: '[character("Vex")\n{\nMind("sly" + "cold")\nBody("tall" + "lean")\nLikes("knives" + "rain")\n}]' },
  short_greeting: { first_mes: '*She looks up from the ledger.* "You\'re late. Again. Sit, the soup is cold but it\'s soup."' },
  html_only: { description: '<div><p>Name: Vex</p><table><tr><td>Age</td><td>24</td></tr></table></div>'.repeat(10) },
  macros: { description: '{{char}} {{user}} '.repeat(80) },
  huge: { description: 'Mara argued with the baker about the price of rye, then left without the bread. '.repeat(2000) },
};
for (const [k, card] of Object.entries(edge)) {
  let r = null, err = '';
  try { r = scoreCard(card); } catch (e) { err = e.message; }
  check(`edge ${k}: no crash, finite score`, r && [r.score, r.low, r.high].every(Number.isFinite), err);
  if (k !== 'huge') check(`edge ${k}: no writing-style label`, r && r.band.id === 'na', r && r.band.label);
}
check('edge: japanese flagged non-English', scoreCard(edge.japanese).stats.nonEnglish === true);
check('edge: chatbot preamble labelled even when short', scoreCard({ description: 'Certainly! Here is a character description for Mira:\n\nMira is a baker in a small town. She wakes at four.\n\nI hope this helps!' }).band.id === 'common');
const tx = scoreCard({ description: ['She runs the night ferry and hates fog.', 'Her brother owes money to half the docks, and she pays it off one crossing at a time, mostly without telling him.', 'Cats.', 'Nobody remembers when she last slept a full night, least of all her, though the harbourmaster swears it was the winter the bridge froze and the whole town walked across to the island for a dare.'].join('\n\n') });
check('texture: paragraph CV computed', tx.texture.paragraphs === 3 || tx.texture.paragraphs === 4, JSON.stringify(tx.texture));
check('texture: likelihood null under 150 prose words', tx.experimental.aiStyleLikelihood === null);

// 10. reference grading
const r10 = scoreCard({ description: 'Her eyes sparkled with mischief, a testament to her resilience. The air was thick with tension. '.repeat(20) });
const r11 = scoreCard({ description: 'Mara runs the bakery on Elm Street and argues with everyone about rye. She owes her sister forty dollars. '.repeat(20) });
check('reference percentiles present and ordered', r10.reference && r11.reference && r10.reference.human_2023.percentile > r11.reference.human_2023.percentile, JSON.stringify([r10.reference, r11.reference]));

const { SCORER_VERSION, SAME_SCORES_AS } = await import('../js/score-card.js');
const pkgV = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;
const sv = v => v.split('.').map(Number), le = (a, b) => { a = sv(a); b = sv(b); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return true; };
check('SCORER_VERSION not ahead of package.json (app version moves for UI changes too)', le(SCORER_VERSION, pkgV), `${SCORER_VERSION} vs ${pkgV}`);
check('results carry the scorer version', r10.version === SCORER_VERSION);
check('reference built with a version that scores the same', SAME_SCORES_AS.includes(r10.reference.version), r10.reference.version);

// 11. genre, pulp, archetype read-outs
const fan = scoreCard({ description: 'The hero of the realm, a towering knight with a crimson cloak and an aura of primal fury, guards the kingdom from the dragon. '.repeat(12) + 'Her magic runes glow when the demon lords ride out of the abyss.' });
check('genre: fantasy detected', fan.genre.primary === 'fantasy', JSON.stringify(fan.genre.scores));
check('pulp score computed with genre words', fan.pulp && fan.pulp.score > 0 && fan.pulp.adjusted <= fan.score, JSON.stringify(fan.pulp));
check('archetype label present', !!(fan.archetype && fan.archetype.label), JSON.stringify(fan.archetype));
check('band labels are the tentative ones', ['Meatbag adjacent', 'Mixed signals', 'Might just be slop'].some(l => fan.band.label.startsWith(l)) && fan.band.tentative, fan.band.label);

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
