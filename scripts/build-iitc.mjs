#!/usr/bin/env node
// Build the installable IITC userscript from two source files:
//   src/lib/ingestCore.js      - single source of truth for parsing/aggregation
//   iitc/src/template.js       - plugin logic (no core code, contains /*__IGV_CORE__*/)
// Output: iitc/gdpr-visualizer.user.js (committed artifact, installable by URL)
//
// ingestCore has zero imports, so a plain string transform is enough:
// strip "export " prefixes, wrap the whole thing in an IIFE and return the
// exported names as IGV_CORE. No bundler / no network / reproducible.
//
// Usage:
//   node scripts/build-iitc.mjs            # regenerate the artifact
//   node scripts/build-iitc.mjs --check   # fail if the artifact is stale

import { readFileSync, writeFileSync } from 'node:fs';

const CORE_PATH = 'src/lib/ingestCore.js';
const TEMPLATE_PATH = 'iitc/src/template.js';
const OUT_PATH = 'iitc/gdpr-visualizer.user.js';
const PLACEHOLDER = '/*__IGV_CORE__*/';

const core = readFileSync(CORE_PATH, 'utf8').replace(/\r\n/g, '\n');
const template = readFileSync(TEMPLATE_PATH, 'utf8').replace(/\r\n/g, '\n');

if (!template.includes(PLACEHOLDER)) {
  console.error(`Template is missing the ${PLACEHOLDER} placeholder`);
  process.exit(1);
}
if (/^import\s/m.test(core)) {
  console.error('ingestCore.js has imports; a real bundler would be required');
  process.exit(1);
}

const names = [...core.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
if (names.length === 0) {
  console.error('No exports found in ingestCore.js');
  process.exit(1);
}

const stripped = core.replace(/^export\s+/gm, '');
const iife = [
  '/* ---- BEGIN bundled src/lib/ingestCore.js (generated, do not edit here) ---- */',
  'var IGV_CORE = (function () {',
  stripped.trimEnd(),
  `  return { ${names.join(', ')} };`,
  '})();',
  '/* ---- END bundled core ---- */',
].join('\n');

const output = template.replace(PLACEHOLDER, iife);

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT_PATH, 'utf8').replace(/\r\n/g, '\n');
  if (current !== output) {
    console.error(`${OUT_PATH} is stale - run: npm run build:iitc`);
    process.exit(1);
  }
  console.log(`OK: ${OUT_PATH} is up to date (${names.length} core exports)`);
} else {
  writeFileSync(OUT_PATH, output);
  console.log(`Wrote ${OUT_PATH} (${output.length} bytes, ${names.length} core exports)`);
}
