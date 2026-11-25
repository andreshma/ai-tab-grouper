import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { listZipEntries } from '../scripts/zip-list.mjs';

/**
 * Builds a minimal stored (uncompressed) zip: only the fields the reader uses are meaningful.
 * @param {string[]} names
 * @param {string} [comment] Archive comment (shifts the end-of-central-directory record).
 */
function buildZip(names, comment = '') {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...locals, centralDir, eocd, Buffer.from(comment)]);
}

describe('zip listing (CWS gate, no unzip binary)', () => {
  it('lists entries in order, including nested and non-ASCII names', () => {
    const names = ['manifest.json', 'src/background.js', 'src/lib/providers/claude.js', 'icons/ícono.png'];
    assert.deepEqual(listZipEntries(buildZip(names)), names);
  });

  it('finds the directory behind an archive comment and handles an empty archive', () => {
    assert.deepEqual(listZipEntries(buildZip(['a.js'], 'built by web-ext')), ['a.js']);
    assert.deepEqual(listZipEntries(buildZip([])), []);
  });

  it('normalizes backslash separators so path checks behave the same on Windows', () => {
    assert.deepEqual(listZipEntries(buildZip(['src\\popup\\popup.js'])), ['src/popup/popup.js']);
  });

  it('rejects non-zip and truncated input instead of returning a partial listing', () => {
    assert.throws(() => listZipEntries(Buffer.from('not a zip at all, just some text')), /Not a zip archive/);
    const zip = buildZip(['a.js', 'b.js']);
    zip.writeUInt32LE(0, zip.length - 22 - 46 - 4); // corrupt the second central header signature
    assert.throws(() => listZipEntries(zip), /Corrupt zip central directory/);
  });
});

describe('package script (what the store zip ships)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  /** The patterns after `--ignore-files`, unquoted. */
  const ignored = pkg.scripts.package.split('--ignore-files')[1].trim().split(/\s+/).map((p) => p.replaceAll('"', ''));

  it('ships the locale catalogues', () => {
    assert.ok(!ignored.some((p) => p.startsWith('_locales') || p === '*.json' || p === '**/*.json'), ignored.join(' '));
  });

  it('leaves repository-only files out (citation metadata, docs, tests, bridge, tooling)', () => {
    for (const p of ['CITATION.cff', '*.md', 'docs', 'test', 'bridge', 'scripts', '.github', 'package*.json']) {
      assert.ok(ignored.includes(p), `${p} must be ignored`);
    }
  });

  it('the local deploy copies the locale catalogues too', () => {
    const deploy = readFileSync(new URL('../scripts/deploy-local.mjs', import.meta.url), 'utf8');
    assert.match(deploy, /RUNTIME_PATHS = Object\.freeze\(\[[^\]]*'_locales'/);
  });
});
