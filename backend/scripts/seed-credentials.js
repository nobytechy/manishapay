#!/usr/bin/env node
/**
 * One-shot CLI: seed PayNow credentials for a project.
 *
 * Useful for local dev before the dashboard's "Add credentials" form is
 * wired in. Reads inputs from CLI args or interactively, encrypts via the
 * crypto helper, and inserts into manishapay_paynow_credentials.
 *
 * Usage:
 *   node scripts/seed-credentials.js \
 *     --project <project_uuid> \
 *     --mode test \
 *     --integration-id 11627 \
 *     --integration-key 838c7e4e-d9d5-4fc8-a7bb-52e85b2d95d5
 *
 * Or interactively:
 *   node scripts/seed-credentials.js
 *
 * Requirements:
 *   • backend/.env or backend/.env.local with SUPABASE_URL,
 *     SUPABASE_SERVICE_ROLE, MANISHAPAY_MASTER_KEY
 *   • The project must already exist in manishapay_projects
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const readline = require('readline');
const credentials = require('../src/services/credentials');
const { supabase } = require('../src/config/supabase');

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  let projectId = getArg('project');
  let mode = getArg('mode') || 'test';
  let integrationId = getArg('integration-id');
  let integrationKey = getArg('integration-key');

  if (!projectId) {
    console.log('\nNo --project given. Listing existing projects:\n');
    const { data, error } = await supabase
      .from('manishapay_projects')
      .select('id, name, developer_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!data || data.length === 0) {
      console.error('No projects found. Sign up a developer through the dashboard first, then create a project.');
      process.exit(1);
    }
    data.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}  (${p.id})`);
    });
    const pick = await ask('\nProject id: ');
    projectId = pick;
  }
  if (!mode) mode = await ask("Mode (test|live) [test]: ") || 'test';
  if (!integrationId) integrationId = await ask('Integration ID: ');
  if (!integrationKey) integrationKey = await ask('Integration Key: ');

  if (!projectId || !integrationId || !integrationKey) {
    console.error('Missing required input. Use --project, --integration-id, --integration-key.');
    process.exit(1);
  }
  if (mode !== 'test' && mode !== 'live') {
    console.error(`Invalid mode '${mode}'. Use 'test' or 'live'.`);
    process.exit(1);
  }

  // Verify the project exists.
  const { data: proj, error: projErr } = await supabase
    .from('manishapay_projects')
    .select('id, name')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr) throw projErr;
  if (!proj) {
    console.error(`Project ${projectId} not found.`);
    process.exit(1);
  }

  const result = await credentials.save({
    projectId,
    mode,
    integrationId,
    integrationKey,
  });

  console.log('\n✓ Credential saved:');
  console.log(`    project:      ${proj.name} (${projectId})`);
  console.log(`    mode:         ${mode}`);
  console.log(`    cred id:      ${result.id}`);
  console.log(`    integ. id:    ****${result.integrationIdLast4}`);
  console.log('\n  Any prior active credential for this (project, mode) was revoked.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message || err);
  process.exit(1);
});
