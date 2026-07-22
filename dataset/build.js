/**
 * Build the distributable dataset artifacts from gateways/*.json.
 *   node dataset/build.js
 * Produces dist/: merged JSON, JSONL, pain-points.csv, methods-matrix.csv.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GW_DIR = path.join(ROOT, 'gateways');
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

const files = fs.readdirSync(GW_DIR).filter((f) => f.endsWith('.json')).sort();
const records = files.map((f) => JSON.parse(fs.readFileSync(path.join(GW_DIR, f), 'utf8')));

// Basic sanity: required top-level keys present.
const REQUIRED = ['id', 'name', 'regions', 'currencies', 'methods', 'auth', 'capabilities', 'credentials_required', 'sources', 'verification'];
const problems = [];
for (const r of records) {
  for (const k of REQUIRED) if (!(k in r)) problems.push(`${r.id || '?'}: missing ${k}`);
}
if (problems.length) { console.error('SCHEMA PROBLEMS:\n' + problems.join('\n')); process.exit(1); }

// 1) merged JSON
fs.writeFileSync(path.join(DIST, 'noby-payments-v1.json'), JSON.stringify(records, null, 2));
// 2) JSONL (one record per line)
fs.writeFileSync(path.join(DIST, 'noby-payments-v1.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

// 3) pain-points.csv
const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const ppRows = [['gateway', 'severity', 'problem', 'cause', 'mitigation', 'source']];
for (const r of records) for (const p of r.pain_points || []) {
  ppRows.push([r.id, p.severity || '', p.problem || '', p.cause || '', p.mitigation || '', p.source || '']);
}
fs.writeFileSync(path.join(DIST, 'pain-points.csv'), ppRows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n');

// 4) methods-matrix.csv (methods x gateways)
const methods = [...new Set(records.flatMap((r) => r.methods || []))].sort();
const header = ['method', ...records.map((r) => r.id)];
const matrix = [header];
for (const m of methods) matrix.push([m, ...records.map((r) => ((r.methods || []).includes(m) ? 'yes' : ''))]);
fs.writeFileSync(path.join(DIST, 'methods-matrix.csv'), matrix.map((row) => row.map(csvCell).join(',')).join('\n') + '\n');

console.log(`Built ${records.length} gateway records → dist/`);
console.log('  noby-payments-v1.json, noby-payments-v1.jsonl, pain-points.csv, methods-matrix.csv');
console.log(`  ${methods.length} distinct methods, ${ppRows.length - 1} pain-point rows`);
