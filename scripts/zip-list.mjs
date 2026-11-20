/**
 * @file Lists the entry names of a zip archive by reading its central directory.
 *
 * Exists so the CWS gate does not shell out to `unzip`, which Windows does not
 * ship: the gate must run wherever the package is built.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const ZIP64_MARKER = 0xffffffff;

/**
 * @param {Buffer} buf Whole archive.
 * @returns {string[]} Entry names with forward slashes, in archive order.
 * @throws {Error} If the buffer is not a (non-zip64) zip archive.
 */
export function listZipEntries(buf) {
  // The end-of-central-directory record sits at the end, before an optional comment.
  let eocd = -1;
  for (let i = buf.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip archive: end of central directory not found');

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === ZIP64_MARKER) throw new Error('zip64 archives are not supported');

  const names = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) throw new Error('Corrupt zip central directory');
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLen).replaceAll('\\', '/'));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}
