/**
 * @file Catch-all group: deterministic coverage for tabs no topic claimed.
 * Coverage must not depend on the model following instructions.
 */

/** Localised catch-all title. */
export const CATCH_ALL_NAMES = Object.freeze({ es: 'Varios', en: 'Misc' });

/** @param {'es'|'en'|string} language */
export function catchAllName(language) {
  return CATCH_ALL_NAMES[language] ?? CATCH_ALL_NAMES.es;
}

/**
 * Builds the assignment for loose tabs, reusing an existing catch-all group if present.
 * @param {number[]} looseTabIds
 * @param {string[]} existingTitles
 * @param {string} language
 * @returns {(import('./validate.js').GroupAssignment & {collapsed: boolean})|null} null when nothing is loose.
 */
export function buildCatchAll(looseTabIds, existingTitles, language) {
  if (!looseTabIds.length) return null;
  const name = catchAllName(language);
  const existing = existingTitles.find((t) => t.toLocaleLowerCase() === name.toLocaleLowerCase());
  return { name: existing ?? name, color: 'grey', tabIds: [...looseTabIds], existing: Boolean(existing), collapsed: true };
}
