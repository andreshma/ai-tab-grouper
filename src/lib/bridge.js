/**
 * @file Native-messaging link to the local bridge host (Claude Desktop ⇄ MCP).
 *
 * The open port keeps the MV3 service worker alive while the bridge is enabled.
 * Reconnects with exponential backoff; stops retrying when the host is not
 * installed (needs user action, not retries).
 */

export const NATIVE_HOST = 'com.aitabgrouper.bridge';
const MAX_BACKOFF_MS = 60_000;

/**
 * @typedef {'off'|'connected'|'not-installed'|'error'} BridgeState
 * @typedef {{state: BridgeState, error: string}} BridgeStatus
 * @typedef {Record<string, (params: any) => Promise<unknown>>} BridgeHandlers
 */

/**
 * @param {{
 *   handlers: BridgeHandlers,
 *   connectNative: (host: string) => chrome.runtime.Port,
 *   lastError?: () => string|undefined,
 *   onStatus?: (status: BridgeStatus) => void,
 *   setTimer?: typeof setTimeout,
 *   clearTimer?: typeof clearTimeout,
 * }} deps
 */
export function createBridge({
  handlers, connectNative, lastError = () => undefined, onStatus = () => {}, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  /** @type {chrome.runtime.Port|null} */
  let port = null;
  let wanted = false;
  let attempt = 0;
  let timer;
  /** @type {BridgeStatus} */
  let status = { state: 'off', error: '' };

  /** @param {BridgeState} state @param {string} [error] */
  const setState = (state, error = '') => {
    status = { state, error };
    onStatus({ ...status });
  };

  /** Dispatches one host request; always replies (result or error) with the same id. */
  const onMessage = async (msg) => {
    const handler = Object.hasOwn(handlers, msg?.method) ? handlers[msg.method] : null;
    try {
      if (!handler) throw new Error(`Método no soportado: ${msg?.method}`);
      const result = await handler(msg.params ?? {});
      port?.postMessage({ id: msg.id, result });
    } catch (err) {
      port?.postMessage({ id: msg?.id, error: { message: /** @type {Error} */ (err)?.message ?? String(err) } });
    }
  };

  const connect = () => {
    if (port || !wanted) return;
    try {
      port = connectNative(NATIVE_HOST);
    } catch (err) {
      retry(/** @type {Error} */ (err).message);
      return;
    }
    attempt = 0;
    setState('connected');
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      retry(lastError() ?? 'Host desconectado');
    });
  };

  /** @param {string} error */
  const retry = (error) => {
    if (!wanted) { setState('off'); return; }
    if (/not found|no encontrado/i.test(error)) { setState('not-installed', error); return; }
    setState('error', error);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
    timer = setTimer(connect, delay);
  };

  return {
    /** Enables the link (idempotent). */
    start() {
      wanted = true;
      clearTimer(timer);
      connect();
    },
    /** Disables the link and closes the port. */
    stop() {
      wanted = false;
      clearTimer(timer);
      const p = port;
      port = null;
      p?.disconnect();
      setState('off');
    },
    /** @returns {BridgeStatus} */
    status: () => ({ ...status }),
  };
}
