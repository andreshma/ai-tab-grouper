/**
 * @file Local IPC between the MCP server (launched by Claude Desktop) and the
 * native host (launched by Chrome). Two independent processes, one user.
 *
 * Transport: Windows named pipe / Unix domain socket (0600 in a 0700 dir).
 * Auth: per-session 256-bit token written by the host to a user-private file,
 * compared in constant time. The token file is deleted when the host exits.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { LineDecoder } from './protocol.js';

/** Raised when Chrome/extension side is not reachable. Message is user-facing. */
export class BridgeUnavailableError extends Error {
  constructor(detail = '') {
    super('Chrome no está abierto o el puente con Claude Desktop no está activado en la extensión AI Tab Grouper'
      + (detail ? ` (${detail})` : ''));
    this.name = 'BridgeUnavailableError';
  }
}

/**
 * Per-user state directory. Override with AI_TAB_GROUPER_DIR (tests, portable installs).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function bridgeDir(env = process.env) {
  if (env.AI_TAB_GROUPER_DIR) return env.AI_TAB_GROUPER_DIR;
  if (process.platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ai-tab-grouper');
  return join(homedir(), '.ai-tab-grouper');
}

/**
 * Pipe/socket address derived from the state dir (one bridge per user/dir).
 * @param {string} dir
 */
export function socketPath(dir) {
  if (process.platform === 'win32') {
    const id = createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\ai-tab-grouper-${id}`;
  }
  return join(dir, 'bridge.sock');
}

/** @param {string} dir */
export const tokenPath = (dir) => join(dir, 'token');

/** Creates the state dir, user-only on POSIX (Windows inherits the profile ACL). */
export function ensurePrivateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(dir, 0o700);
}

/**
 * Generates and persists a fresh session token.
 * @param {string} dir
 * @returns {string}
 */
export function issueToken(dir) {
  const token = randomBytes(32).toString('hex');
  writeFileSync(tokenPath(dir), token, { mode: 0o600 });
  return token;
}

/**
 * Constant-time token comparison.
 * @param {unknown} a
 * @param {unknown} b
 */
export function tokensEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/**
 * Sends one request to the host and resolves with its result.
 * @param {{dir?: string, method: string, params?: object, timeoutMs?: number}} req
 * @returns {Promise<any>}
 * @throws {BridgeUnavailableError} Host not running / token missing.
 * @throws {Error} Host or extension returned an error.
 */
export function ipcRequest({ dir = bridgeDir(), method, params = {}, timeoutMs = 20_000 }) {
  let token;
  try {
    token = readFileSync(tokenPath(dir), 'utf8').trim();
  } catch {
    return Promise.reject(new BridgeUnavailableError('sin sesión activa'));
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath(dir));
    const done = (fn, value) => { clearTimeout(timer); socket.destroy(); fn(value); };
    const timer = setTimeout(() => done(reject, new Error('Timeout esperando respuesta de Chrome')), timeoutMs);

    const decoder = new LineDecoder((msg) => {
      if (msg?.error) done(reject, new Error(msg.error.message ?? 'Error del puente'));
      else done(resolve, msg?.result);
    });
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, token, method, params })}\n`));
    socket.on('data', (chunk) => {
      try { decoder.push(chunk); } catch (err) { done(reject, err); }
    });
    socket.on('error', (err) => {
      const code = /** @type {any} */ (err).code;
      done(reject, ['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(code) ? new BridgeUnavailableError(code) : err);
    });
    socket.on('close', () => done(reject, new BridgeUnavailableError('conexión cerrada')));
  });
}
