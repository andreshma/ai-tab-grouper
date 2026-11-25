#!/usr/bin/env node
/**
 * @file End-to-end diagnostic for the Claude Desktop bridge. Run it on the
 * user's machine after installing; each check prints PASS / WARN / FAIL with
 * the fix. Never prints tab titles or URLs (only counts).
 *
 * Usage: node doctor.mjs [--browser chrome|edge|chromium]
 * Exit code: 0 if no FAIL, 1 otherwise.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { claudeConfigPath, hostManifestTarget, HOST_NAME, isExtensionId, MCP_SERVER_KEY } from './install.mjs';
import { bridgeDir, ipcRequest, tokenPath } from './src/ipc.js';
import { LineDecoder } from './src/protocol.js';

/** @typedef {{level: 'PASS'|'WARN'|'FAIL', name: string, detail: string}} Result */

/**
 * Reads the host manifest path (registry on Windows, file elsewhere).
 * @param {{registryKey?: string, file?: string}} target
 * @returns {string|null}
 */
function resolveManifestFile(target) {
  if (target.file) return existsSync(target.file) ? target.file : null;
  try {
    const out = execFileSync('reg', ['query', target.registryKey, '/ve'], { encoding: 'utf8' });
    return out.match(/REG_SZ\s+(.+)\s*$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Starts mcp-server.js like Claude Desktop would and checks the handshake.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<string[]>} Tool names.
 */
function mcpSmoke(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 8000);
    const dec = new LineDecoder((msg) => {
      if (msg.id === 2) { clearTimeout(timer); child.kill(); resolve(msg.result.tools.map((t) => t.name)); }
    });
    child.stdout.on('data', (c) => dec.push(c));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'doctor', version: '1' } } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  });
}

/**
 * Runs all checks.
 * @param {{browser?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform}} [opts]
 * @returns {Promise<Result[]>}
 */
export async function runDoctor({ browser = 'chrome', env = process.env, platform = process.platform } = {}) {
  /** @type {Result[]} */
  const results = [];
  const add = (level, name, detail = '') => results.push({ level, name, detail });

  // 1. Node
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20 ? 'PASS' : 'FAIL', 'Node.js >= 20', process.version);

  // 2. Native host registration
  const home = env.AI_TAB_GROUPER_HOME ?? homedir();
  const target = hostManifestTarget(/** @type {any} */ (browser), platform, home, { sandboxed: Boolean(env.AI_TAB_GROUPER_HOME) });
  const manifestFile = resolveManifestFile(target);
  if (!manifestFile || !existsSync(manifestFile)) {
    add('FAIL', `Host nativo registrado (${browser})`, `No encontrado (${target.registryKey ?? target.file}). Ejecuta: node install.mjs --extension-id <ID> --configure-claude`);
  } else {
    const m = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const extensionId = String(m.allowed_origins?.[0] ?? '').replace(/^chrome-extension:\/\/|\/$/g, '');
    const okShape = m.name === HOST_NAME && m.type === 'stdio' && isExtensionId(extensionId);
    add(okShape ? 'PASS' : 'FAIL', 'Manifest del host válido', okShape ? `ID permitido: ${extensionId}` : manifestFile);
    const launcherOk = existsSync(m.path);
    add(launcherOk ? 'PASS' : 'FAIL', 'Launcher existe', m.path);
    if (launcherOk) {
      const paths = [...readFileSync(m.path, 'utf8').matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((p) => !p.startsWith('$'));
      const missing = paths.filter((p) => !existsSync(p));
      add(missing.length ? 'FAIL' : 'PASS', 'Launcher apunta a node y host.js existentes', missing.length ? `Faltan: ${missing.join(', ')} → reinstala` : '');
    }
  }

  // 3. Claude Desktop config + MCP handshake
  const cfgPath = claudeConfigPath(platform, env);
  let entry;
  try {
    entry = JSON.parse(readFileSync(cfgPath, 'utf8')).mcpServers?.[MCP_SERVER_KEY];
  } catch { /* handled below */ }
  if (!entry) {
    add('FAIL', 'Claude Desktop configurado', `Sin "${MCP_SERVER_KEY}" en ${cfgPath}. Usa --configure-claude o Claude Desktop → Settings → Developer → Edit Config`);
  } else {
    add('PASS', 'Claude Desktop configurado', cfgPath);
    try {
      const tools = await mcpSmoke(entry.command, entry.args ?? []);
      const expected = ['list_tabs', 'apply_tab_groups', 'ungroup_tabs'];
      const ok = expected.every((t) => tools.includes(t));
      add(ok ? 'PASS' : 'FAIL', 'Servidor MCP arranca y expone tools', tools.join(', '));
    } catch (e) {
      add('FAIL', 'Servidor MCP arranca y expone tools', /** @type {Error} */ (e).message);
    }
  }

  // 4. Runtime: Chrome ⇄ host ⇄ extension
  const dir = bridgeDir(env);
  if (!existsSync(tokenPath(dir))) {
    add('WARN', 'Chrome conectado al host', 'Host no activo: abre Chrome, acepta el aviso de datos y activa "Puente con Claude Desktop" en la extensión');
  } else {
    try {
      const pong = await ipcRequest({ dir, method: 'ping', timeoutMs: 5000 });
      add('PASS', 'Extensión responde (ping)', `v${pong?.version}`);
      try {
        const res = await ipcRequest({ dir, method: 'list_tabs', params: { scope: 'all', onlyUngrouped: false }, timeoutMs: 8000 });
        const tabs = (res?.windows ?? []).flatMap((w) => w.tabs ?? []);
        const loose = tabs.filter((t) => t.group === null).length;
        add('PASS', 'list_tabs end-to-end', `${tabs.length} pestañas agrupables (${loose} sin grupo) en ${(res?.windows ?? []).length} ventana(s); `
          + `${res?.notGroupable ?? '?'} no agrupables (fijadas/chrome://), ${res?.excludedByPolicy ?? 0} excluidas`);
      } catch (e) {
        add('FAIL', 'list_tabs end-to-end', /** @type {Error} */ (e).message);
      }
    } catch (e) {
      add('FAIL', 'Extensión responde (ping)', /** @type {Error} */ (e).message);
    }
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const browser = process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser') + 1] : 'chrome';
  const results = await runDoctor({ browser });
  const icon = { PASS: '✔', WARN: '!', FAIL: '✘' };
  for (const r of results) console.log(`${icon[r.level]} ${r.level.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  const fails = results.filter((r) => r.level === 'FAIL').length;
  console.log(fails ? `\n${fails} fallo(s). Corrige en orden y vuelve a ejecutar.` : '\nTodo listo. En Claude Desktop: "Organiza mis pestañas de Chrome por tema".');
  process.exitCode = fails ? 1 : 0;
}

