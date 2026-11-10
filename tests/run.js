#!/usr/bin/env node
'use strict';
// tests/run.js — loads all logic files (ARCHITECTURE §9 order), then every tests/*.test.js, runs them.
// Usage: node tests/run.js [filter] [--verbose]
const path = require('path');
const fs = require('fs');

globalThis.G = globalThis.G || {};
require(path.join(__dirname, 'harness.js'));
const Test = globalThis.G.Test;

const args = process.argv.slice(2);
const verbose = args.indexOf('--verbose') >= 0 || args.indexOf('-v') >= 0;
const filter = args.filter(function (a) { return a[0] !== '-'; })[0] || null;

const loaded = Test.loadAll();
if (verbose) {
  console.log('loaded ' + loaded.loaded.length + ' logic files' + (loaded.missing.length ? ', missing: ' + loaded.missing.join(', ') : ''));
}

const files = fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort();
files.forEach(function (f) {
  Test.currentFile = f;
  require(path.join(__dirname, f));
});
Test.currentFile = null;

(async function main() {
  const started = Date.now();
  const res = await Test.run({ filter: filter, verbose: verbose });
  const ms = Date.now() - started;
  console.log('\n' + files.length + ' test files, ' + (res.passed + res.failed) + ' tests: ' + res.passed + ' passed, ' + res.failed + ' failed (' + ms + 'ms)');
  if (loaded.missing.length && !verbose) console.log('(missing data files tolerated: ' + loaded.missing.length + ')');
  process.exit(res.failed ? 1 : 0);
})().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
