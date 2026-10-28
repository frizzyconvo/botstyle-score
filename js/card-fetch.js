// card-fetch.js - Score a card from its page link (Chub, Botbooru).
//
//   import { parseCardUrl, fetchCard } from './js/card-fetch.js';
//   const { card, source } = await fetchCard('https://chub.ai/characters/creator/slug');
//   scoreCard(card, { includeAltGreetings: true });
//
// In a browser the site's API must allow cross-origin requests. If it doesn't, set
// CARD_SOURCES.proxy to an endpoint of your own that forwards the request (the platform
// can also call fetchCard server-side from Node, where CORS doesn't apply).

export const CARD_SOURCES = {
  // Optional prefix for CORS: request goes to proxy + encodeURIComponent(apiUrl).
  proxy: '',
  chub: {
    // Same endpoint SillyTavern's importer uses (src/endpoints/content-manager.js).
    api: path => `https://api.chub.ai/api/characters/${path}?full=true`,
  },
  botbooru: {
    // The card's "Download JSON" button (found 2026-10-28 in botbooru.com/js/ui.js).
    // Returns a Tavern V1 flat object or a V2 {spec, data} card. It sends no
    // Access-Control-Allow-Origin header, so a browser page on another site can't read
    // it: use CARD_SOURCES.proxy or score server-side (tools/score_url.mjs).
    api: id => `https://botbooru.com/download/json/${id}`,
  },
};

/** URL -> { site, id } or null. */
export function parseCardUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'chub.ai' || host === 'characterhub.org' || host === 'venus.chub.ai') {
    const i = parts.indexOf('characters');
    if (i >= 0 && parts.length >= i + 3) return { site: 'chub', id: `${parts[i + 1]}/${parts[i + 2]}` };
    return null;
  }
  if (host === 'botbooru.com') {
    const i = parts.findIndex(p => p === 'character' || p === 'characters' || p === 'post' || p === 'posts');
    if (i >= 0 && parts[i + 1]) return { site: 'botbooru', id: parts[i + 1] };
    return null;
  }
  return null;
}

const asArray = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];

/** Chub's metadata response -> card fields (Chub stores the card description as `personality`). */
export function chubToCard(meta) {
  const node = meta && (meta.node || meta);
  const d = node && node.definition;
  if (!d) throw new Error('Chub returned no card definition (private or removed card?)');
  return {
    name: d.name || node.name || '',
    description: d.personality || '',
    personality: d.tavern_personality || '',
    scenario: d.scenario || '',
    first_mes: d.first_message || '',
    mes_example: d.example_dialogs || '',
    alternate_greetings: asArray(d.alternate_greetings),
    tags: asArray(node.topics),
    creator_notes: d.description || '',
  };
}

/** Generic card JSON (Tavern V1/V2/V3 or flat) -> card fields. */
export function jsonToCard(o) {
  const d = o && o.data && typeof o.data === 'object' ? o.data : (o || {});
  return {
    name: d.name || d.char_name || '',
    description: d.description || d.char_persona || '',
    personality: d.personality || '',
    scenario: d.scenario || d.world_scenario || '',
    first_mes: d.first_mes || d.char_greeting || d.first_message || '',
    mes_example: d.mes_example || '',
    alternate_greetings: asArray(d.alternate_greetings),
    tags: asArray(d.tags),
  };
}

async function getJson(apiUrl, fetchImpl) {
  const url = CARD_SOURCES.proxy ? CARD_SOURCES.proxy + encodeURIComponent(apiUrl) : apiUrl;
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new Error('Could not reach the site from this page (it may block cross-site requests). Download the card PNG/JSON and drop it here instead.');
  }
  if (!res.ok) throw new Error(`The site answered ${res.status}${res.status === 404 ? ' (card not found or private)' : ''}`);
  return res.json();
}

/**
 * @param {string} url  card page link
 * @param {object} opts { fetch }  (defaults to global fetch)
 * @returns {Promise<{card, source: {site, id, url}}>}
 */
export async function fetchCard(url, opts = {}) {
  const f = opts.fetch || globalThis.fetch;
  const p = parseCardUrl(url);
  if (!p) throw new Error('Not a Chub or Botbooru character link');
  if (p.site === 'chub') {
    const card = chubToCard(await getJson(CARD_SOURCES.chub.api(p.id), f));
    return { card, source: { ...p, url } };
  }
  if (!CARD_SOURCES.botbooru.api) throw new Error('Botbooru links need CARD_SOURCES.botbooru.api set (see js/card-fetch.js). For now, download the card and drop it here.');
  const card = jsonToCard(await getJson(CARD_SOURCES.botbooru.api(p.id), f));
  return { card, source: { ...p, url } };
}
