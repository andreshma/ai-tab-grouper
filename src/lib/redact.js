/**
 * @file Data minimisation before anything leaves the browser.
 *
 * Only title + host + (optionally) a redacted, truncated path are sent.
 * Query strings and fragments are always dropped: that is where session
 * tokens, emails and search terms usually live.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Opaque ids/tokens (JWT segments, UUIDs without dashes, API keys). */
const LONG_TOKEN_RE = /[A-Za-z0-9_-]{24,}/g;
/** Long digit runs: account/order numbers, phones, card numbers. */
const DIGITS_RE = /\d[\d\s-]{3,}\d/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

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
  return String(text ?? '')
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
 * Builds the minimal, redacted view of a tab that a model is allowed to see.
 * @param {{id:number, title?:string, url?:string, pendingUrl?:string}} tab
 * @param {{sendPath?:boolean, maxTitle?:number, maxPath?:number}} [opts]
 * @returns {TabDescriptor}
 */
export function toTabDescriptor(tab, { sendPath = true, maxTitle = 120, maxPath = 60 } = {}) {
  const url = tab.url || tab.pendingUrl || '';
  /** @type {TabDescriptor} */
  const d = {
    id: tab.id,
    title: truncate(redactText(tab.title ?? '').trim(), maxTitle),
    host: hostOf(url),
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
