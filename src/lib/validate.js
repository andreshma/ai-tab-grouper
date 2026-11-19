/**
 * @file Output validation for model responses.
 *
 * Model output is untrusted (tab titles may carry prompt-injection payloads),
 * so every assignment is re-validated against the tabs we actually sent:
 * unknown ids are dropped, names are sanitised, colors are whitelisted.
 */

/** Colors accepted by `chrome.tabGroups.update`. */
export const TAB_GROUP_COLORS = Object.freeze([
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
]);

export const MAX_GROUP_NAME = 24;

/**
 * @typedef {Object} GroupAssignment
 * @property {string} name
 * @property {string} color
 * @property {number[]} tabIds
 * @property {boolean} existing  True if `name` matches a group already in the window.
 */

/**
 * Strips control chars, collapses whitespace and caps length (by code point).
 * @param {unknown} name
 * @returns {string} '' when nothing usable remains.
 */
export function sanitizeGroupName(name) {
  const clean = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(clean).slice(0, MAX_GROUP_NAME).join('').trim();
}

/**
 * Deterministic color so the same topic keeps its color across runs.
 * @param {string} name
 * @returns {string}
 */
export function colorForName(name) {
  let h = 2166136261; // FNV-1a
  for (const ch of name.toLocaleLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return TAB_GROUP_COLORS[(h >>> 0) % TAB_GROUP_COLORS.length];
}

/**
 * Validates and normalises a raw `{groups:[{name,color,tabIds}]}` payload.
 *
 * - Same name (case-insensitive) → merged; matches an existing title → canonical title reused.
 * - Each tab appears at most once (first assignment wins).
 * - New groups below `minGroupSize` are dropped; existing groups accept any size.
 *
 * @param {unknown} raw
 * @param {Set<number>} validTabIds
 * @param {{existingTitles?: string[], minGroupSize?: number}} [opts]
 * @returns {GroupAssignment[]}
 */
export function normalizeResult(raw, validTabIds, { existingTitles = [], minGroupSize = 2 } = {}) {
  const input = Array.isArray(/** @type {any} */ (raw)?.groups) ? /** @type {any} */ (raw).groups : [];
  const existingByKey = new Map(
    existingTitles.filter(Boolean).map((t) => [t.toLocaleLowerCase(), t]),
  );
  /** @type {Map<string, GroupAssignment>} */
  const merged = new Map();
  const seen = new Set();

  for (const g of input) {
    const name = sanitizeGroupName(g?.name);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const canonical = existingByKey.get(key) ?? name;
    const entry = merged.get(key) ?? {
      name: canonical,
      color: TAB_GROUP_COLORS.includes(g?.color) ? g.color : colorForName(canonical),
      tabIds: [],
      existing: existingByKey.has(key),
    };
    for (const id of Array.isArray(g?.tabIds) ? g.tabIds : []) {
      const n = Number(id);
      if (Number.isInteger(n) && validTabIds.has(n) && !seen.has(n)) {
        seen.add(n);
        entry.tabIds.push(n);
      }
    }
    merged.set(key, entry);
  }

  return [...merged.values()].filter(
    (g) => g.tabIds.length > 0 && (g.existing || g.tabIds.length >= minGroupSize),
  );
}
