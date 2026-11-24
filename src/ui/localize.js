/**
 * @file Applies `_locales` messages to a static extension page.
 *
 * The CSP forbids inline script, and `__MSG_*__` placeholders are not expanded
 * in HTML, so pages mark their text with attributes and this module fills it in:
 *
 * - `data-i18n="key"`              → element content (supports the markup of `parseRich`)
 * - `data-i18n-title="key"`        → `title` attribute
 * - `data-i18n-placeholder="key"`  → `placeholder` attribute
 * - `data-i18n-slot="name"`        → child element kept and placed where the message says `{name}`
 */
import { parseRich, t, uiLanguage } from '../lib/i18n.js';

const TAG = { b: 'strong', code: 'code' };

/**
 * Builds the element content from a message. Nodes are created one by one
 * (never parsed from a string), so message text cannot become markup.
 * @param {Element} el
 * @param {string} message
 */
function render(el, message) {
  const doc = el.ownerDocument;
  const slots = new Map([...el.children].filter((c) => c.hasAttribute('data-i18n-slot'))
    .map((c) => [c.getAttribute('data-i18n-slot'), c]));
  el.replaceChildren(...parseRich(message).map((tok) => {
    if (tok.type === 'text') return doc.createTextNode(tok.text);
    if (tok.type === 'slot') return slots.get(tok.name) ?? doc.createTextNode('');
    const node = doc.createElement(TAG[tok.type]);
    node.textContent = tok.text;
    return node;
  }));
}

/**
 * Localises every marked element under `root` and sets `<html lang>`.
 * @param {Document} [root]
 */
export function localizePage(root = document) {
  root.documentElement.lang = uiLanguage();
  for (const el of root.querySelectorAll('[data-i18n]')) render(el, t(el.getAttribute('data-i18n') ?? ''));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.getAttribute('data-i18n-title') ?? ''));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder') ?? ''));
  }
}
