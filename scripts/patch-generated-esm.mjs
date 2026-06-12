#!/usr/bin/env node
/**
 * patch-generated-esm.mjs — post-process the hey-api generated tree so its
 * relative imports carry explicit extensions, as Node strict ESM requires.
 *
 * Bug class: @hey-api/openapi-ts emits extensionless relative imports
 * (`from './sdk.gen'`, `from './client'`) because its default target is a
 * bundler. This SDK ships dual ESM/CJS via plain `tsc` (matching the sibling
 * packages), and TS ESM emit does NOT add extensions — so the emitted
 * dist/esm/**.js would be rejected at `npm install`-time by external consumers
 * (the exact failure `scripts/verify-esm-extensions.sh` guards, caught on
 * 0.1.1). This patch is part of the `generate` pipeline — re-run on every
 * regeneration so the generated tree is always publish-correct.
 *
 * File specifiers (`./sdk.gen` → `./sdk.gen.js`) get `.js`; directory
 * specifiers (`./client` → `./client/index.js`) get `/index.js`. The
 * distinction is resolved against the filesystem, not guessed.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'generated');

/** Recursively list every .ts file under dir. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const FROM_RE = /(\bfrom\s+['"])(\.\.?\/[^'"]+)(['"])/g;

let patched = 0;
for (const file of walk(GEN_DIR)) {
  const src = readFileSync(file, 'utf8');
  const next = src.replace(FROM_RE, (match, pre, spec, post) => {
    if (spec.endsWith('.js') || spec.endsWith('.json')) return match;
    const abs = resolve(dirname(file), spec);
    // Directory import (e.g. './client') → './client/index.js'; else file → '.js'.
    const suffix = existsSync(abs) && statSync(abs).isDirectory() ? '/index.js' : '.js';
    return `${pre}${spec}${suffix}${post}`;
  });
  if (next !== src) {
    writeFileSync(file, next);
    patched += 1;
  }
}

console.log(`patch-generated-esm: extensions added in ${patched} generated file(s)`);
