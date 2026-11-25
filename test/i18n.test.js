/**
 * Localisation contract: the `_locales` catalogues, every place that refers to
 * a message key, and the helpers in `src/lib/i18n.js` / `src/ui/localize.js`.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createI18nFake, loadMessages } from './helpers/chrome-fake.js';
import { CATCH_ALL_NAMES } from '../src/lib/catchall.js';
import { DEFAULT_LANGUAGE, parseRich, resolveLanguage, SUPPORTED_LANGUAGES, t, uiLanguage } from '../src/lib/i18n.js';
import { localizePage } from '../src/ui/localize.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
/** @param {string} dir @returns {string[]} Repo-relative paths of every file under `dir`. */
const walk = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`]));

const manifest = JSON.parse(read('manifest.json'));
const locales = readdirSync(new URL('_locales/', ROOT)).sort();
const catalogues = Object.fromEntries(locales.map((l) => [l, loadMessages(l)]));
const en = catalogues.en;

/** Message keys follow `<area>_<name>`; the prefix is what lets the scan below tell a key from any other string. */
const KEY = /^(?:ext|cmd|popup|status|provider|ago|err|opt|nano|bridge)_[A-Za-z0-9]+$/;
const namedPlaceholders = (message) => [...message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) => m[1].toLowerCase()).sort();
const richShape = (message) => parseRich(message).filter((tok) => tok.type !== 'text').map((tok) => (tok.type === 'slot' ? `{${tok.name}}` : tok.type));

/** Every key the shipped code refers to, with where. */
function referencedKeys() {
  /** @type {Map<string, string[]>} */
  const refs = new Map();
  const add = (key, where) => refs.set(key, [...(refs.get(key) ?? []), where]);
  for (const m of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) add(m[1], 'manifest.json');
  for (const file of walk('src/')) {
    const text = read(file);
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/\sdata-i18n(?:-title|-placeholder)?="([^"]*)"/g)) add(m[1], file);
    } else if (file.endsWith('.js')) {
      // Direct calls, whatever the key looks like…
      for (const m of text.matchAll(/\bt\(\s*'([^']*)'/g)) add(m[1], file);
      // …and keys kept in lookup tables or picked by a conditional.
      for (const m of text.matchAll(/'([^'\n]+)'/g)) if (KEY.test(m[1])) add(m[1], file);
    }
  }
  return refs;
}

describe('_locales catalogues', () => {
  it('ships English (default_locale) and Spanish, matching the supported languages', () => {
    assert.equal(manifest.default_locale, 'en');
    assert.equal(DEFAULT_LANGUAGE, manifest.default_locale);
    assert.deepEqual(locales, ['en', 'es']);
    assert.deepEqual([...SUPPORTED_LANGUAGES].sort(), locales);
    assert.deepEqual(Object.keys(CATCH_ALL_NAMES).sort(), locales, 'a catch-all title for every language');
  });

  it('every locale has exactly the same keys', () => {
    for (const locale of locales) {
      assert.deepEqual(Object.keys(catalogues[locale]).sort(), Object.keys(en).sort(), locale);
    }
  });

  it('keys follow the naming convention and are unique case-insensitively (Chrome ignores case)', () => {
    const keys = Object.keys(en);
    for (const key of keys) assert.match(key, KEY);
    assert.equal(new Set(keys.map((k) => k.toLowerCase())).size, keys.length);
  });

  it('every message is non-empty; the default locale documents each one', () => {
    for (const locale of locales) {
      for (const [key, entry] of Object.entries(catalogues[locale])) {
        assert.ok(typeof entry.message === 'string' && entry.message.trim(), `${locale}.${key}`);
      }
    }
    for (const [key, entry] of Object.entries(en)) assert.ok(entry.description, `en.${key} needs a description for translators`);
  });

  it('placeholders are consistent: declared = used, same set and same $n in every locale', () => {
    for (const [key, base] of Object.entries(en)) {
      const declared = Object.keys(base.placeholders ?? {}).map((p) => p.toLowerCase()).sort();
      for (const locale of locales) {
        const entry = catalogues[locale][key];
        assert.deepEqual(namedPlaceholders(entry.message), declared, `${locale}.${key}: placeholders used in the message`);
        assert.deepEqual(entry.placeholders ?? {}, base.placeholders ?? {}, `${locale}.${key}: placeholder definitions`);
        assert.ok(!/\$\d/.test(entry.message), `${locale}.${key}: use named placeholders, not $1`);
      }
      const positions = Object.values(base.placeholders ?? {}).map((p) => p.content).sort();
      assert.deepEqual(positions, positions.map((_, i) => `$${i + 1}`), `${key}: contents are $1…$n, each once`);
    }
  });

  it('inline markup and slots are the same in every locale', () => {
    for (const [key, base] of Object.entries(en)) {
      for (const locale of locales) {
        assert.deepEqual(richShape(catalogues[locale][key].message).sort(), richShape(base.message).sort(), `${locale}.${key}`);
      }
    }
  });

  it('store limits hold in every locale', () => {
    for (const locale of locales) {
      assert.ok(catalogues[locale].ext_name.message.length <= 75, `${locale} name`);
      assert.ok(catalogues[locale].ext_description.message.length <= 132, `${locale} description`);
    }
  });
});

describe('message references', () => {
  const refs = referencedKeys();

  it('every key referenced in the manifest, HTML and JS exists', () => {
    assert.ok(refs.size > 50, 'the scan found the references');
    for (const [key, where] of refs) assert.ok(en[key], `"${key}" (used in ${[...new Set(where)].join(', ')}) is missing from _locales`);
  });

  it('every message is used somewhere (no dead strings)', () => {
    assert.deepEqual(Object.keys(en).filter((key) => !refs.has(key)), []);
  });

  it('the manifest is localised and pages carry no hard-coded copy', () => {
    for (const value of [manifest.name, manifest.description, manifest.action.default_title, manifest.commands['group-now'].description]) {
      assert.match(value, /^__MSG_[A-Za-z0-9_@]+__$/);
    }
    for (const file of walk('src/').filter((f) => f.endsWith('.html'))) {
      const html = read(file);
      assert.match(html, /<html lang="en">/, `${file}: static lang is the default locale`);
      assert.ok(!/[áéíóúñ¿¡]/i.test(html.replace('>Español<', '')), `${file}: translatable text belongs in _locales`);
    }
  });

  it('slots named in messages exist in the page that renders them', () => {
    const html = walk('src/').filter((f) => f.endsWith('.html')).map(read).join('\n');
    for (const [key, entry] of Object.entries(en)) {
      for (const tok of parseRich(entry.message)) {
        if (tok.type !== 'slot') continue;
        assert.match(html, new RegExp(`data-i18n="${key}"[^>]*>\\s*<[^>]*data-i18n-slot="${tok.name}"`), `${key}: {${tok.name}}`);
      }
    }
  });
});

describe('i18n helpers', () => {
  const withChrome = (i18n, fn) => {
    const previous = globalThis.chrome;
    globalThis.chrome = /** @type {any} */ (i18n ? { i18n } : undefined);
    try { return fn(); } finally { globalThis.chrome = previous; }
  };

  it('t() resolves by UI language, substitutes in order and falls back to English', () => {
    withChrome(createI18nFake('en-US'), () => {
      assert.equal(t('popup_groupNow'), 'Group now');
      assert.equal(t('status_lastRun', 'Claude', 4, 2, '5s ago'), 'Claude · 4 tabs in 2 groups · 5s ago');
      assert.equal(t('opt_testOk', '$1 & $GROUPS$'), 'OK · $1 & $GROUPS$', 'substituted values are not re-expanded');
    });
    withChrome(createI18nFake('es-419'), () => {
      assert.equal(t('popup_groupNow'), 'Agrupar ahora');
      assert.equal(t('status_lastRun', 'Claude', 4, 2, 'hace 5s'), 'Claude · 4 pestañas en 2 grupos · hace 5s');
    });
    withChrome(createI18nFake('fr-FR'), () => assert.equal(t('popup_groupNow'), 'Group now'));
  });

  it('t() never returns an empty string: unknown key or no chrome.i18n → the key', () => {
    withChrome(createI18nFake('en'), () => assert.equal(t('nope_missing'), 'nope_missing'));
    withChrome(null, () => assert.equal(t('popup_groupNow'), 'popup_groupNow'));
  });

  it('uiLanguage()/resolveLanguage() reduce to a supported language', () => {
    for (const [ui, expected] of [['es', 'es'], ['es-MX', 'es'], ['es_419', 'es'], ['EN-gb', 'en'], ['pt-BR', 'en'], ['', 'en']]) {
      withChrome(createI18nFake(ui), () => {
        assert.equal(uiLanguage(), expected, ui);
        assert.equal(resolveLanguage('auto'), expected, ui);
        assert.equal(resolveLanguage(undefined), expected, ui);
        assert.equal(resolveLanguage('es'), 'es', 'explicit setting wins');
        assert.equal(resolveLanguage('en'), 'en', 'explicit setting wins');
      });
    }
    withChrome(null, () => assert.equal(resolveLanguage('auto'), 'en'));
  });

  it('parseRich() only understands <b>, <code> and {slot}; everything else is text', () => {
    assert.deepEqual(parseRich('plain'), [{ type: 'text', text: 'plain' }]);
    assert.deepEqual(parseRich('a <b>x</b> {dest}: <code>run <ID></code>!'), [
      { type: 'text', text: 'a ' }, { type: 'b', text: 'x' }, { type: 'text', text: ' ' }, { type: 'slot', name: 'dest' },
      { type: 'text', text: ': ' }, { type: 'code', text: 'run <ID>' }, { type: 'text', text: '!' },
    ]);
    assert.deepEqual(parseRich('<script>x</script> <b>open'), [{ type: 'text', text: '<script>x</script> <b>open' }]);
    assert.deepEqual(parseRich(''), []);
  });
});

describe('localizePage (DOM applier)', () => {
  /** Just enough DOM for `localizePage`: attributes, children and the three attribute selectors it uses. */
  class El {
    constructor(doc, tag, attrs = {}, children = []) {
      Object.assign(this, { ownerDocument: doc, tagName: tag, attrs: { ...attrs }, childNodes: [], lang: '' });
      this.replaceChildren(...children);
    }
    get children() { return this.childNodes.filter((n) => n instanceof El); }
    get textContent() { return this.childNodes.map((n) => (n instanceof El ? n.textContent : n.text)).join(''); }
    set textContent(text) { this.childNodes = [{ text }]; }
    hasAttribute(name) { return name in this.attrs; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    replaceChildren(...nodes) { this.childNodes = nodes; }
    all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  }
  const makeDoc = (build) => {
    const doc = {
      createTextNode: (text) => ({ text }),
      createElement: (tag) => new El(doc, tag),
      querySelectorAll: (sel) => doc.documentElement.all().filter((e) => e.hasAttribute(sel.slice(1, -1))),
    };
    doc.documentElement = new El(doc, 'html', {}, build(doc));
    return doc;
  };

  it('fills text, title, placeholder and rich content; keeps slot elements; sets <html lang>', () => {
    const previous = globalThis.chrome;
    globalThis.chrome = /** @type {any} */ ({ i18n: createI18nFake('es-ES') });
    try {
      let dest;
      const doc = makeDoc((d) => {
        dest = new El(d, 'strong', { id: 'dest', 'data-i18n-slot': 'dest' }, [{ text: 'Anthropic' }]);
        return [
          new El(d, 'button', { 'data-i18n': 'popup_regroup', 'data-i18n-title': 'popup_regroupTitle' }),
          new El(d, 'textarea', { 'data-i18n-placeholder': 'opt_excludedHostsPlaceholder' }),
          new El(d, 'p', { 'data-i18n': 'opt_disclosureBody' }, [dest]),
          new El(d, 'small', { 'data-i18n': 'opt_bridgeInstallHelp' }),
        ];
      });
      localizePage(/** @type {any} */ (doc));
      const [button, textarea, body, help] = doc.documentElement.children;
      assert.equal(doc.documentElement.lang, 'es');
      assert.equal(button.textContent, 'Reorganizar todo');
      assert.equal(button.getAttribute('title'), 'Reclasifica también las pestañas ya agrupadas');
      assert.equal(textarea.getAttribute('placeholder'), 'mibanco.com\nintranet.empresa.com');
      assert.ok(body.children.includes(dest), 'the page-owned slot element is reused, not recreated');
      assert.deepEqual(body.children.map((c) => c.tagName), ['strong', 'strong', 'strong', 'strong']);
      assert.ok(body.textContent.startsWith('Si activas Claude (API) o el puente con Claude Desktop, se envía a Anthropic —o a tu sesión'));
      assert.ok(!body.textContent.includes('<b>') && !body.textContent.includes('{dest}'));
      assert.deepEqual(help.children.map((c) => [c.tagName, c.textContent]), [
        ['code', 'bridge'], ['code', 'node install.mjs --extension-id <ID> --configure-claude'],
      ]);
    } finally {
      globalThis.chrome = previous;
    }
  });
});
