#!/usr/bin/env node
/**
 * @file Installs (or removes) the native messaging host and, optionally,
 * registers the MCP server in Claude Desktop.
 *
 * Usage:
 *   node install.mjs --extension-id <32 chars a-p> [--browser chrome|edge|chromium] [--configure-claude]
 *   node install.mjs --uninstall [--browser ...] [--configure-claude]
 *
 * Uses the absolute path of the current Node binary so Chrome/Claude Desktop do
 * not depend on PATH. Run it again after moving this folder.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bridgeDir, ensurePrivateDir } from './src/ipc.js';

export const HOST_NAME = 'com.aitabgrouper.bridge';
export const MCP_SERVER_KEY = 'ai-tab-grouper';
const HERE = dirname(fileURLToPath(import.meta.url));

/** Chrome extension ids are 32 chars in a-p. */
export const isExtensionId = (id) => /^[a-p]{32}$/.test(String(id ?? ''));

/**
 * Per-browser locations. Windows uses the registry (HKCU) pointing to a JSON file.
 *
 * `sandboxed` (home overridden via AI_TAB_GROUPER_HOME) never resolves to the
 * registry: HKCU is machine-global state that no env override can redirect, so
 * a sandboxed install (tests) would otherwise replace the user's real
 * registration with a throwaway manifest.
 * @param {'chrome'|'edge'|'chromium'} browser
 * @param {NodeJS.Platform} platform
 * @param {string} home
 * @param {{sandboxed?: boolean}} [opts]
 * @returns {{registryKey?: string, file?: string}}
 */
export function hostManifestTarget(browser, platform, home, { sandboxed = false } = {}) {
  const vendor = {
    chrome: { reg: 'Google\\Chrome', mac: 'Google/Chrome', linux: 'google-chrome' },
    edge: { reg: 'Microsoft\\Edge', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
    chromium: { reg: 'Chromium', mac: 'Chromium', linux: 'chromium' },
  }[browser];
  if (!vendor) throw new Error(`Navegador no soportado: ${browser}`);
  if (platform === 'win32' && !sandboxed) return { registryKey: `HKCU\\Software\\${vendor.reg}\\NativeMessagingHosts\\${HOST_NAME}` };
  if (platform === 'darwin') return { file: join(home, 'Library', 'Application Support', vendor.mac, 'NativeMessagingHosts', `${HOST_NAME}.json`) };
  return { file: join(home, '.config', vendor.linux, 'NativeMessagingHosts', `${HOST_NAME}.json`) };
}

/**
 * Claude Desktop config path. Override with CLAUDE_DESKTOP_CONFIG (tests).
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 */
export function claudeConfigPath(platform, env) {
  if (env.CLAUDE_DESKTOP_CONFIG) return env.CLAUDE_DESKTOP_CONFIG;
  if (platform === 'win32') return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

/**
 * Host manifest consumed by Chrome. `allowed_origins` restricts who may launch the host.
 * @param {string} launcherPath
 * @param {string} extensionId
 */
export function buildHostManifest(launcherPath, extensionId) {
  return {
    name: HOST_NAME,
    description: 'AI Tab Grouper — puente local con Claude Desktop',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

/**
 * Launcher location. Windows uses `.bat`, the form Chrome documents for native hosts.
 * @param {string} stateDir
 * @param {NodeJS.Platform} platform
 */
export function launcherPath(stateDir, platform) {
  return join(stateDir, platform === 'win32' ? 'host.bat' : 'host.sh');
}

/**
 * Launcher script with absolute node + host paths (Chrome runs it without a shell PATH).
 * @param {NodeJS.Platform} platform
 * @param {string} nodePath
 * @param {string} hostScript
 */
export function buildLauncher(platform, nodePath, hostScript) {
  if (platform === 'win32') return `@echo off\r\n"${nodePath}" "${hostScript}" %*\r\n`;
  return `#!/bin/sh\nexec "${nodePath}" "${hostScript}" "$@"\n`;
}

/**
 * Adds/removes our MCP server entry, preserving everything else. Writes a backup first.
 * @param {string} configPath
 * @param {{command: string, args: string[]}|null} entry null → remove
 * @returns {string|null} Backup path, if a config existed.
 */
export function updateClaudeConfig(configPath, entry) {
  let config = {};
  let backup = null;
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    backup = `${configPath}.bak-${Date.now()}`;
    copyFileSync(configPath, backup);
  }
  config.mcpServers = { ...(config.mcpServers ?? {}) };
  if (entry) config.mcpServers[MCP_SERVER_KEY] = entry;
  else delete config.mcpServers[MCP_SERVER_KEY];
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return backup;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { browser: 'chrome', configureClaude: false, uninstall: false, extensionId: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--extension-id') opts.extensionId = argv[++i];
    else if (a === '--browser') opts.browser = argv[++i];
    else if (a === '--configure-claude') opts.configureClaude = true;
    else if (a === '--uninstall') opts.uninstall = true;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { platform, env } = process;
  const home = env.AI_TAB_GROUPER_HOME ?? homedir();
  const target = hostManifestTarget(/** @type {any} */ (opts.browser), platform, home, { sandboxed: Boolean(env.AI_TAB_GROUPER_HOME) });
  const stateDir = bridgeDir();
  const manifestFile = target.file ?? join(stateDir, `${HOST_NAME}.json`);
  const launcher = launcherPath(stateDir, platform);

  if (opts.uninstall) {
    if (target.registryKey) execFileSync('reg', ['delete', target.registryKey, '/f'], { stdio: 'ignore' });
    rmSync(manifestFile, { force: true });
    rmSync(launcher, { force: true });
    if (opts.configureClaude) updateClaudeConfig(claudeConfigPath(platform, env), null);
    console.log('Puente desinstalado.');
    return;
  }

  if (!isExtensionId(opts.extensionId)) {
    throw new Error('--extension-id inválido. Cópialo de Configuración de la extensión o de chrome://extensions (32 letras a-p).');
  }

  ensurePrivateDir(stateDir);
  const hostScript = resolve(HERE, 'src', 'host.js');
  writeFileSync(launcher, buildLauncher(platform, process.execPath, hostScript), { mode: 0o700 });
  if (platform !== 'win32') chmodSync(launcher, 0o700);

  mkdirSync(dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, `${JSON.stringify(buildHostManifest(launcher, opts.extensionId), null, 2)}\n`);
  if (target.registryKey) {
    execFileSync('reg', ['add', target.registryKey, '/ve', '/t', 'REG_SZ', '/d', manifestFile, '/f'], { stdio: 'ignore' });
  }
  console.log(`✓ Host nativo registrado (${opts.browser}): ${target.registryKey ?? manifestFile}`);

  const mcpEntry = { command: process.execPath, args: [resolve(HERE, 'src', 'mcp-server.js')] };
  if (opts.configureClaude) {
    const cfg = claudeConfigPath(platform, env);
    const backup = updateClaudeConfig(cfg, mcpEntry);
    console.log(`✓ Claude Desktop configurado: ${cfg}${backup ? ` (backup: ${backup})` : ''}`);
    console.log('  Reinicia Claude Desktop para cargar el servidor MCP.');
  } else {
    console.log('\nAñade esto a claude_desktop_config.json → "mcpServers":');
    console.log(JSON.stringify({ [MCP_SERVER_KEY]: mcpEntry }, null, 2));
  }
  console.log('\nSiguiente: en la extensión → Configuración → activa "Puente con Claude Desktop".');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    console.error(`Error: ${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}
