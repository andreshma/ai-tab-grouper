/**
 * @file Data minimisation before anything leaves the browser.
 *
 * Only title + host + (optionally) a redacted, truncated path are sent.
 * Query strings and fragments are always dropped: that is where session
 * tokens, emails and search terms usually live.
 */

/**
 * Bounded quantifiers on purpose: with `+` a long run of local-part characters
 * without an `@` made this quadratic, and a page controls its title and path.
 */
const EMAIL_RE = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,24}/gi;
/** Opaque ids/tokens (JWT segments, UUIDs without dashes, API keys). */
const LONG_TOKEN_RE = /[A-Za-z0-9_-]{24,}/g;
/** Long digit runs: account/order numbers, phones, card numbers. */
const DIGITS_RE = /\d[\d\s-]{3,}\d/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Upper bound on what the masking patterns ever scan. Far above anything that
 * survives the later truncation (titles 120, paths 60), so masking still sees
 * whole tokens, but small enough that page-controlled input stays cheap.
 */
const MAX_REDACT_INPUT = 2048;

/** @param {string} s @param {number} max */
const clamp = (s, max) => (s.length > max ? s.slice(0, max) : s);

/**
 * @typedef {Object} TabDescriptor
 * @property {number} id
 * @property {string} title
 * @property {string} host
 * @property {string} [path]
 */

/**
 * Masks emails, UUIDs, long tokens and long digit runs.
 * @param {string} text
 * @returns {string}
 */
export function redactText(text) {
  return clamp(String(text ?? ''), MAX_REDACT_INPUT)
    .replace(EMAIL_RE, '[email]')
    .replace(UUID_RE, '[id]')
    .replace(LONG_TOKEN_RE, '[id]')
    .replace(DIGITS_RE, '[n]');
}

/**
 * Returns the lowercase hostname without a leading `www.`, or '' if unparsable.
 * @param {string} url
 * @returns {string}
 */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Truncates by code points so surrogate pairs are never split.
 * @param {string} s
 * @param {number} max
 */
function truncate(s, max) {
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : s;
}

/**
 * True when a tab title is just its address. Chrome shows the URL as the title
 * of documents without a `<title>` (JSON, plain text, pages still loading), so
 * such a title would carry the query string and fragment that the path
 * handling drops.
 * @param {string} title
 * @param {string} host Lowercase host as returned by {@link hostOf}.
 */
export function isUrlLikeTitle(title, host) {
  if (!host) return false;
  const t = clamp(title, MAX_REDACT_INPUT).trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]{0,31}:\/\//, '')
    .replace(/^www\./, '');
  if (!t.startsWith(host)) return false;
  const next = t.charAt(host.length);
  return next === '' || next === '/' || next === '?' || next === '#' || next === ':';
}

/**
 * True when `groupId` holds at least one tab on an excluded host. Such a group
 * is usually named after that host by the local fallback, so its title must not
 * be sent anywhere either.
 * @param {{groupId?: number, url?: string, pendingUrl?: string}[]} tabs
 * @param {string[]} excluded
 * @returns {Set<number>} Ids of the groups whose titles stay on the device.
 */
export function groupsWithExcludedTabs(tabs, excluded) {
  const ids = new Set();
  if (!excluded.length) return ids;
  for (const t of tabs) {
    if (typeof t.groupId !== 'number' || t.groupId < 0) continue;
    if (isHostExcluded(hostOf(t.url || t.pendingUrl || ''), excluded)) ids.add(t.groupId);
  }
  return ids;
}

/**
 * Builds the minimal, redacted view of a tab that a model is allowed to see.
 * @param {{id:number, title?:string, url?:string, pendingUrl?:string}} tab
 * @param {{sendPath?:boolean, maxTitle?:number, maxPath?:number}} [opts]
 * @returns {TabDescriptor}
 */
export function toTabDescriptor(tab, { sendPath = true, maxTitle = 120, maxPath = 60 } = {}) {
  const url = tab.url || tab.pendingUrl || '';
  const host = hostOf(url);
  const rawTitle = String(tab.title ?? '');
  /** @type {TabDescriptor} */
  const d = {
    id: tab.id,
    title: isUrlLikeTitle(rawTitle, host) ? '' : truncate(redactText(rawTitle).trim(), maxTitle),
    host,
  };
  if (sendPath) {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean).slice(0, 4).map(redactText);
      if (segments.length) d.path = truncate(`/${segments.join('/')}`, maxPath);
    } catch {
      /* unparsable URL: host-only descriptor */
    }
  }
  return d;
}

/**
 * True when `host` equals or is a subdomain of any excluded host.
 * @param {string} host
 * @param {string[]} excluded
 */
export function isHostExcluded(host, excluded) {
  return excluded.some((e) => {
    const h = e.trim().toLowerCase().replace(/^www\./, '');
    return h && (host === h || host.endsWith(`.${h}`));
  });
}
