#!/usr/bin/env node
/**
 * @file Copies the runtime files from the repo to the folder Chrome loads
 * unpacked. Keeping that folder fixed keeps the extension ID (and therefore the
 * native-messaging registration) stable, and keeps node_modules out of it
 * (Chrome reserves file names starting with "_").
 *
 * Usage: npm run deploy:local   (target: ATG_DEPLOY_DIR or ~/ai-tab-grouper)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything Chrome and the installed bridge need at runtime. */
export const RUNTIME_PATHS = Object.freeze([
  'manifest.json', 'managed_schema.json', '_locales', 'icons', 'src',
  'bridge/src', 'bridge/install.mjs', 'bridge/doctor.mjs', 'bridge/package.json',
]);

const target = resolve(process.env.ATG_DEPLOY_DIR ?? join(homedir(), 'ai-tab-grouper'));
if (target.toLowerCase() === ROOT.toLowerCase()) {
  console.error('The target is the repository itself. Set ATG_DEPLOY_DIR to the folder Chrome loads.');
  process.exit(1);
}

for (const rel of RUNTIME_PATHS) {
  const from = join(ROOT, rel);
  const to = join(target, rel);
  if (!existsSync(from)) throw new Error(`${rel} is missing from the repository`);
  mkdirSync(dirname(to), { recursive: true });
  // Replace directories wholesale so files deleted in the repo disappear at runtime too.
  if (statSync(from).isDirectory()) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

const version = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8')).version;
console.log(`✓ Runtime v${version} copied to ${target}`);
console.log('  1. chrome://extensions → ↻ on AI Tab Grouper');
console.log('  2. If bridge/src changed: fully quit Claude Desktop and reopen it; then start a new chat');
console.log('  3. node bridge/doctor.mjs');
