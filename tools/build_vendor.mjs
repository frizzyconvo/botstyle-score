#!/usr/bin/env node
// build_vendor.mjs - Make the page independent of CDNs: copies a browser build of
// @msgpack/msgpack and bundles wink-pos-tagger (CommonJS + its dependencies) into one
// script that sets window.winkPOS. Run after `npm install`:
//     node tools/build_vendor.mjs
// Output: vendor/msgpack.min.js, vendor/wink-pos-tagger.bundle.js

import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'fs';
import { dirname, join, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
mkdirSync(join(root, 'vendor'), { recursive: true });

// 1. msgpack: ships a UMD build (window.MessagePack)
copyFileSync(join(nm, '@msgpack/msgpack/dist.umd/msgpack.min.js'), join(root, 'vendor/msgpack.min.js'));

// 2. wink-pos-tagger: tiny CommonJS bundler (relative + package requires, .js/.json)
const modules = new Map();   // absPath -> id
const order = [];
function resolveFile(p) {
  for (const c of [p, p + '.js', p + '.json', join(p, 'index.js')]) if (existsSync(c) && statSync(c).isFile()) return c;
  throw new Error('cannot resolve ' + p);
}
function resolvePkg(spec, fromDir) {
  // "pkg", "@scope/pkg", or a file inside a package: "pkg/src/file.js"
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const sub = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
  for (let d = fromDir; ; d = dirname(d)) {
    const pdir = join(d, 'node_modules', name);
    if (existsSync(pdir) && sub) return resolveFile(join(pdir, sub));
    if (existsSync(pdir)) {
      const pj = JSON.parse(readFileSync(join(pdir, 'package.json'), 'utf-8'));
      const main = (typeof pj.browser === 'string' && pj.browser) || pj.main || 'index.js';
      return resolveFile(join(pdir, main));
    }
    if (d === dirname(d)) throw new Error('package not found: ' + name);
  }
}
function add(abs) {
  if (modules.has(abs)) return modules.get(abs);
  const id = modules.size; modules.set(abs, id);
  let src = readFileSync(abs, 'utf-8');
  const deps = {};
  if (abs.endsWith('.json')) src = 'module.exports = ' + src + ';';
  else src.replace(/require\(\s*['"]([^'"]+)['"]\s*\)/g, (m, spec) => {
    if (spec in deps) return m;
    const target = spec.startsWith('.') ? resolveFile(resolve(dirname(abs), spec)) : resolvePkg(spec, dirname(abs));
    deps[spec] = add(target);
    return m;
  });
  order.push({ id, abs, src, deps });
  return id;
}
const entry = add(resolvePkg('wink-pos-tagger', root));
let out = '/* wink-pos-tagger browser bundle, built by tools/build_vendor.mjs */\n(function(){\nvar defs = {}, cache = {};\n';
for (const m of order.sort((a, b) => a.id - b.id)) {
  out += `defs[${m.id}] = [function(require, module, exports){\n${m.src}\n}, ${JSON.stringify(m.deps)}]; // ${relative(root, m.abs)}\n`;
}
out += `function load(id){ if (cache[id]) return cache[id].exports; var d = defs[id], module = cache[id] = { exports: {} };
  d[0](function(spec){ if (!(spec in d[1])) throw new Error('missing module ' + spec); return load(d[1][spec]); }, module, module.exports); return module.exports; }
var api = load(${entry});
if (typeof window !== 'undefined') window.winkPOS = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();\n`;
writeFileSync(join(root, 'vendor/wink-pos-tagger.bundle.js'), out);
console.log(`vendor/wink-pos-tagger.bundle.js: ${order.length} modules, ${(out.length / 1e6).toFixed(1)} MB`);
console.log('vendor/msgpack.min.js copied');
