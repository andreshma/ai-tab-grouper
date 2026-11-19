/**
 * @file Wire formats.
 *
 * - Chrome native messaging: 32-bit length prefix (native byte order — little-endian
 *   on every platform Chrome supports) + UTF-8 JSON. Host→Chrome is capped at 1 MB.
 * - Local IPC and MCP stdio: newline-delimited JSON.
 */

/** Chrome rejects host→extension messages above 1 MB. */
export const MAX_FROM_HOST = 1024 * 1024;
/** Our own cap for extension→host (Chrome allows 4 GB; we never need more than this). */
export const MAX_TO_HOST = 8 * 1024 * 1024;
/** Cap for a single IPC/MCP line, to bound memory on malformed input. */
export const MAX_LINE = 4 * 1024 * 1024;

/**
 * Encodes a message for Chrome (host → extension).
 * @param {unknown} message
 * @returns {Buffer}
 * @throws {RangeError} If the encoded message exceeds Chrome's 1 MB limit.
 */
export function encodeNativeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FROM_HOST) throw new RangeError(`Native message ${body.length} B exceeds 1 MB limit`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Incremental decoder for length-prefixed native messages (handles split/merged chunks). */
export class NativeMessageDecoder {
  /**
   * @param {(message: any) => void} onMessage
   * @param {{maxBytes?: number}} [opts]
   */
  constructor(onMessage, { maxBytes = MAX_TO_HOST } = {}) {
    this.onMessage = onMessage;
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
  }

  /**
   * @param {Buffer} chunk
   * @throws {RangeError|SyntaxError} On oversize frame or invalid JSON (caller should close the stream).
   */
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxBytes) throw new RangeError(`Native message ${length} B exceeds cap`);
      if (this.buffer.length < 4 + length) return;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      this.onMessage(JSON.parse(body.toString('utf8')));
    }
  }
}

/** Incremental newline-delimited JSON decoder. */
export class LineDecoder {
  /**
   * @param {(message: any) => void} onMessage
   * @param {{maxLine?: number, onParseError?: (err: Error, line: string) => void}} [opts]
   */
  constructor(onMessage, { maxLine = MAX_LINE, onParseError } = {}) {
    this.onMessage = onMessage;
    this.maxLine = maxLine;
    this.onParseError = onParseError;
    this.pending = '';
  }

  /**
   * @param {Buffer|string} chunk
   * @throws {RangeError} If a line exceeds `maxLine`.
   */
  push(chunk) {
    this.pending += chunk.toString();
    let nl;
    while ((nl = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, nl).trim();
      this.pending = this.pending.slice(nl + 1);
      if (!line) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch (err) {
        if (this.onParseError) this.onParseError(/** @type {Error} */ (err), line);
        else throw err;
      }
    }
    if (this.pending.length > this.maxLine) throw new RangeError('Line exceeds cap');
  }
}
