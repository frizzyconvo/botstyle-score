// _help.mjs - shared --help for the tools: prints the script's leading // comment block and exits.
//   import { helpIfAsked } from './_help.mjs'; helpIfAsked(import.meta.url);
import { readFileSync } from 'fs';
export function helpIfAsked(url, argv = process.argv.slice(2)) {
  if (!argv.includes('--help') && !argv.includes('-h')) return;
  const lines = readFileSync(new URL(url), 'utf-8').split('\n');
  const out = [];
  for (const l of lines) {
    if (l.startsWith('#!')) continue;
    if (l.startsWith('//')) { out.push(l.replace(/^\/\/ ?/, '')); continue; }
    if (out.length) break;
  }
  console.log(out.join('\n') || 'No usage notes in this script.');
  process.exit(0);
}
