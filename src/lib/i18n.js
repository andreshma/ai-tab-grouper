/**
 * @file Localisation helpers shared by the service worker and the extension pages.
 *
 * UI strings live in `_locales/<locale>/messages.json` and are resolved by
 * Chrome (`chrome.i18n`) from the browser UI language, falling back to the
 * manifest's `default_locale` (English). Everything here degrades to a
 * deterministic value when `chrome.i18n` is absent (unit tests, tooling).
 */

/** Languages with a `_locales` catalogue; also the languages group names can be generated in. */
export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'es']);

/** Mirrors `default_locale` in `manifest.json`. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * Localised message for `key`.
 * @param {string} key  Message name in `_locales/<locale>/messages.json`.
 * @param {...(string|number)} substitutions  Values for `$1`…`$9`, in order.
 * @returns {string} The message, or `key` itself when it cannot be resolved (never '').
 */
export function t(key, ...substitutions) {
  return globalThis.chrome?.i18n?.getMessage?.(key, substitutions.map(String)) || key;
}

/**
 * Browser UI language reduced to a supported one (`es-419` → `es`, `fr` → `en`).
 * @returns {'en'|'es'}
 */
export function uiLanguage() {
  const base = String(globalThis.chrome?.i18n?.getUILanguage?.() ?? '').toLowerCase().split(/[-_]/)[0];
  return /** @type {'en'|'es'} */ (SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE);
}

/**
 * Resolves the `language` setting: an explicit supported language wins;
 * anything else (`'auto'`, unknown, missing) follows the browser UI language.
 * @param {unknown} setting
 * @returns {'en'|'es'}
 */
export function resolveLanguage(setting) {
  return /** @type {'en'|'es'} */ (SUPPORTED_LANGUAGES.includes(/** @type {any} */ (setting)) ? setting : uiLanguage());
}

/**
 * @typedef {{type: 'text', text: string} | {type: 'b'|'code', text: string} | {type: 'slot', name: string}} RichToken
 */

/**
 * Tokenises a message that carries the tiny inline markup translators may use:
 * `<b>…</b>`, `<code>…</code>` and `{slot}` (an element supplied by the page).
 * Anything else, including other tags, stays literal text, so a message can
 * never inject markup: the page builds DOM nodes from these tokens.
 * @param {string} message
 * @returns {RichToken[]}
 */
export function parseRich(message) {
  /** @type {RichToken[]} */
  const tokens = [];
  const re = /<(b|code)>(.*?)<\/\1>|\{([a-z][a-zA-Z0-9]*)\}/gs;
  let last = 0;
  for (const m of message.matchAll(re)) {
    if (m.index > last) tokens.push({ type: 'text', text: message.slice(last, m.index) });
    if (m[1]) tokens.push({ type: /** @type {'b'|'code'} */ (m[1]), text: m[2] });
    else tokens.push({ type: 'slot', name: m[3] });
    last = m.index + m[0].length;
  }
  if (last < message.length) tokens.push({ type: 'text', text: message.slice(last) });
  return tokens;
}
