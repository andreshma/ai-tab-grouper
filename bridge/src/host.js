/**
 * @file Chrome native messaging host.
 *
 * Launched by Chrome when the extension calls `connectNative` (only the
 * extension id in `allowed_origins` can launch it). Lives while that port is
 * open. Exposes a token-protected local IPC endpoint that the MCP server uses
 * to relay tool calls to the extension.
 *
 * stdout is the native messaging channel: never log to it (use stderr).
 */
import { chmodSync, rmSync } from 'node:fs';
import net from 'node:net';

import { bridgeDir, ensurePrivateDir, issueToken, socketPath, tokenPath, tokensEqual } from './ipc.js';
import { encodeNativeMessage, LineDecoder, NativeMessageDecoder } from './protocol.js';

/** Methods relayed to the extension. Anything else is rejected here (defense in depth). */
export const RELAYED_METHODS = new Set(['ping', 'list_tabs', 'apply_tab_groups', 'ungroup_tabs']);
const EXTENSION_TIMEOUT_MS = 15_000;
const MAX_CLIENTS = 8;

const log = (...args) => process.stderr.write(`[ai-tab-grouper host] ${args.join(' ')}\n`);

const dir = bridgeDir();
const address = socketPath(dir);
const isPosix = process.platform !== 'win32';

ensurePrivateDir(dir);
if (isPosix) rmSync(address, { force: true }); // stale socket from a crashed run
const token = issueToken(dir);

/** @type {Map<number, {reply: (payload: object) => void, timer: NodeJS.Timeout}>} */
const pending = new Map();
let seq = 0;

/** Extension → host: replies to relayed requests. */
const fromExtension = new NativeMessageDecoder((msg) => {
  const entry = pending.get(msg?.id);
  if (!entry) return;
  pending.delete(msg.id);
  clearTimeout(entry.timer);
  entry.reply(msg.error ? { error: { message: String(msg.error.message ?? 'Error en la extensión') } } : { result: msg.result });
});

process.stdin.on('data', (chunk) => {
  try {
    fromExtension.push(chunk);
  } catch (err) {
    log('invalid frame from Chrome:', /** @type {Error} */ (err).message);
    shutdown(1);
  }
});
process.stdin.on('end', () => shutdown(0)); // Chrome closed the port

let clients = 0;
const server = net.createServer((socket) => {
  if (clients >= MAX_CLIENTS) { socket.destroy(); return; }
  clients++;
  socket.on('close', () => { clients--; });
  socket.setTimeout(EXTENSION_TIMEOUT_MS + 5_000, () => socket.destroy());
  let authenticated = false;

  const decoder = new LineDecoder((req) => {
    const reply = (payload) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify({ id: req?.id ?? null, ...payload })}\n`);
    };
    if (!authenticated && !tokensEqual(req?.token, token)) {
      reply({ error: { message: 'unauthorized' } });
      socket.end();
      return;
    }
    authenticated = true;
    if (!RELAYED_METHODS.has(req?.method)) { reply({ error: { message: `método no permitido: ${req?.method}` } }); return; }

    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reply({ error: { message: 'La extensión no respondió a tiempo' } });
    }, EXTENSION_TIMEOUT_MS);
    pending.set(id, { reply, timer });
    try {
      process.stdout.write(encodeNativeMessage({ id, method: req.method, params: req.params ?? {} }));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reply({ error: { message: /** @type {Error} */ (err).message } });
    }
  }, { onParseError: () => socket.destroy() });

  socket.on('data', (chunk) => {
    try { decoder.push(chunk); } catch { socket.destroy(); }
  });
  socket.on('error', () => {});
});

server.on('error', (err) => {
  log('IPC server error:', err.message);
  shutdown(1);
});
// A Unix socket is created with the process umask, so a chmod after listen
// leaves a window where it is wider than 0600. Narrow the umask for the bind.
const previousUmask = isPosix ? process.umask(0o177) : 0;
server.listen(address, () => {
  if (isPosix) {
    process.umask(previousUmask);
    chmodSync(address, 0o600);
  }
  log('ready', address);
});

let shuttingDown = false;
/** @param {number} code */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  rmSync(tokenPath(dir), { force: true });
  if (isPosix) rmSync(address, { force: true });
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
