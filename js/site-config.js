// site-config.js - settings for a hosted copy of the page (e.g. GitHub Pages).
//
// CARD_PROXY: Botbooru doesn't allow cross-site requests, so on a hosted page Botbooru links only
// work through a proxy you control. Deploy tools/cors-proxy-worker.js as a Cloudflare Worker and
// put its URL here with "?url=" on the end, e.g.
//   export const CARD_PROXY = 'https://botstyle-proxy.yourname.workers.dev/?url=';
// Leave it empty and Botbooru users are asked to download the card and drop it in instead.
// Chub links work without it. Running locally (npm start) uses the built-in proxy regardless.
export const CARD_PROXY = 'https://bb-card-proxy.frizzyconvo.workers.dev/?url=';

// PUBLIC_RUNS: optional public list of scored cards (opt-in per card, honour system). Deploy
// tools/public-runs-worker.js as a Cloudflare Worker with a KV namespace bound as RUNS and put its
// URL here, e.g. 'https://bb-runs.yourname.workers.dev'. Empty = no public list, nothing leaves
// the browser.
export const PUBLIC_RUNS = 'https://bb-runs.frizzyconvo.workers.dev';
