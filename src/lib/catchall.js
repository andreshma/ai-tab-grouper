/**
 * @file Catch-all group: deterministic coverage for tabs no topic claimed.
 * Coverage must not depend on the model following instructions.
 */
import { resolveLanguage } from './i18n.js';

/**
 * Catch-all title per group-name language. This table (not `_locales`) is the
 * source of truth: recognising a catch-all group created under another
 * language needs every title at once, and `chrome.i18n` only exposes the
 * current locale. Never remove or rename an entry — existing groups in users'
 * windows carry these titles.
 */
export const CATCH_ALL_NAMES = Object.freeze({ en: 'Misc', es: 'Varios' });

const sameTitle = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * Catch-all title for new groups.
 * @param {'auto'|'en'|'es'|string} language  The `language` setting ('auto' = browser UI language).
 */
export function catchAllName(language) {
  return CATCH_ALL_NAMES[resolveLanguage(language)];
}

/**
 * True when `title` is the catch-all title of any supported language (case-insensitive).
 * @param {string} title
 */
export function isCatchAllTitle(title) {
  return Object.values(CATCH_ALL_NAMES).some((name) => sameTitle(name, title));
}

/**
 * Builds the assignment for loose tabs, reusing an existing catch-all group if present.
 *
 * A window keeps a single catch-all group across language changes: the group
 * titled for the current language wins; otherwise the first existing group
 * (in window order) carrying another language's catch-all title is reused and
 * keeps its title. Only when there is none is a new group created.
 * @param {number[]} looseTabIds
 * @param {string[]} existingTitles
 * @param {string} language
 * @returns {(import('./validate.js').GroupAssignment & {collapsed: boolean})|null} null when nothing is loose.
 */
export function buildCatchAll(looseTabIds, existingTitles, language) {
  if (!looseTabIds.length) return null;
  const name = catchAllName(language);
  const existing = existingTitles.find((title) => sameTitle(title, name)) ?? existingTitles.find(isCatchAllTitle);
  return { name: existing ?? name, color: 'grey', tabIds: [...looseTabIds], existing: Boolean(existing), collapsed: true };
}
