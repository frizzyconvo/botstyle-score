# Security

## Reporting a problem

Please report security problems privately through GitHub: the repository's **Security** tab, then **Report a
vulnerability**. Don't open a public issue for them.

## What's in scope

- The page (`index.html`, `js/`): it scores cards in your browser. Card text you paste or upload is not sent anywhere
  except through the card proxy when you score a link.
- The Cloudflare Workers in `tools/`: the card proxy (`cors-proxy-worker.js`) and the optional public list
  (`public-runs-worker.js`), which stores scores and links but never card text.
- The Node tools, when run on someone's own machine.

The repository holds no secrets: API keys live in a local `.env` (see `.env.example`) that is never committed.
