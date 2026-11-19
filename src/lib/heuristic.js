/**
 * @file Deterministic, offline fallback: group by registrable domain.
 * Never fails and sends nothing anywhere, so it terminates the provider chain.
 */

/** Common two-label public suffixes (subset of the PSL; enough for a fallback). */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.mx', 'gob.mx', 'org.mx', 'edu.mx',
  'com.br', 'com.ar', 'com.co', 'com.pe', 'com.au', 'co.jp', 'co.in', 'com.es',
]);

/** Friendly names for multi-product domains where the bare label is ambiguous. */
const KNOWN_LABELS = {
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'mail.google.com': 'Gmail',
  'calendar.google.com': 'Calendar',
  'console.cloud.google.com': 'GCP',
  'console.aws.amazon.com': 'AWS',
  'portal.azure.com': 'Azure',
  'dev.azure.com': 'Azure DevOps',
};

/**
 * Registrable domain (eTLD+1), e.g. `a.b.example.com.mx` → `example.com.mx`.
 * @param {string} host
 */
export function registrableDomain(host) {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  return parts.slice(MULTI_PART_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

/**
 * Human label for a host: known product name, else capitalised domain label.
 * @param {string} host
 */
export function labelForHost(host) {
  for (const [suffix, label] of Object.entries(KNOWN_LABELS)) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return label;
  }
  const label = registrableDomain(host).split('.')[0] ?? host;
  return label ? label[0].toUpperCase() + label.slice(1) : host;
}

/**
 * Groups descriptors by label. Size filtering is left to `normalizeResult`
 * so singletons can still join an existing group with the same title.
 * @param {import('./redact.js').TabDescriptor[]} tabs
 * @returns {{groups: {name:string, tabIds:number[]}[]}}
 */
export function groupByDomain(tabs) {
  /** @type {Map<string, number[]>} */
  const byLabel = new Map();
  for (const t of tabs) {
    if (!t.host) continue;
    const label = labelForHost(t.host);
    byLabel.set(label, [...(byLabel.get(label) ?? []), t.id]);
  }
  return { groups: [...byLabel].map(([name, tabIds]) => ({ name, tabIds })) };
}
