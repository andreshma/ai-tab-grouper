/**
 * @file Pure status → message mapping for the popup (unit-testable, no DOM).
 * Messages must state the actual cause and the fix, never a guess.
 */
import { t } from '../lib/i18n.js';

/** Brand names are not translated; the other labels are message keys. */
const PROVIDER_BRAND = { claude: 'Claude', 'claude-desktop': 'Claude Desktop' };
const PROVIDER_LABEL_KEY = { nano: 'provider_nano', heuristic: 'provider_heuristic' };
const BRIDGE_LABEL = {
  connected: ['status_bridgeConnected', 'ok'],
  'not-installed': ['status_bridgeNotInstalled', 'warn'],
  error: ['status_bridgeReconnecting', 'warn'],
};
/** Provider-chain reasons reported as codes (see `classifier.js`) → message keys. */
const ERROR_CODE_KEY = { 'breaker-open': 'err_breakerOpen' };

/** @param {string} provider */
function providerLabel(provider) {
  return PROVIDER_BRAND[provider] ?? (PROVIDER_LABEL_KEY[provider] ? t(PROVIDER_LABEL_KEY[provider]) : provider);
}

/** @typedef {{text: string, cls: ''|'ok'|'warn'|'err'|'muted'}} StatusLine */

/** @param {number} ts @param {number} now */
export function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('ago_seconds', s);
  if (s < 3600) return t('ago_minutes', Math.round(s / 60));
  return t('ago_hours', Math.round(s / 3600));
}

/**
 * Builds the popup status lines from the service worker's `status` response.
 * @param {any} st
 * @param {number} [now]
 * @returns {StatusLine[]}
 */
export function describeStatus(st, now = Date.now()) {
  if (!st?.ok) return [{ text: st?.error ?? t('status_noResponse'), cls: 'err' }];
  /** @type {StatusLine[]} */
  const lines = [];
  const r = st.lastRun;

  if (!r) {
    lines.push({ text: t('status_noRuns'), cls: 'muted' });
  } else if (r.provider === 'none') {
    lines.push({ text: t('status_noProvider', r.candidates, ago(r.at, now)), cls: 'err' });
  } else if (r.provider === '-') {
    lines.push({ text: t('status_nothingToGroup', ago(r.at, now)), cls: 'muted' });
  } else {
    lines.push({ text: t('status_lastRun', providerLabel(r.provider), r.grouped, r.groups, ago(r.at, now)), cls: '' });
    // "unavailable" (not configured / not present) is the normal case, not a failure worth showing.
    const real = (r.errors ?? []).filter((e) => e.code !== 'unavailable');
    if (real.length) {
      const reason = ERROR_CODE_KEY[real[0].code] ? t(ERROR_CODE_KEY[real[0].code]) : real[0].message;
      lines.push({ text: t('status_fallback', real[0].provider, reason).slice(0, 140), cls: 'warn' });
    }
  }

  const bridge = BRIDGE_LABEL[st.bridge?.state];
  if (bridge) lines.push({ text: t(bridge[0]), cls: /** @type {any} */ (bridge[1]) });
  if (st.managed) lines.push({ text: t(st.proxy ? 'status_managedProxy' : 'status_managed'), cls: 'muted' });

  // What will the in-Chrome grouping (auto / "Group now") actually use?
  // No `providers` field = service worker older than this popup (extension not
  // reloaded after an update): say so instead of guessing "no engine".
  if (!Array.isArray(st.providers)) {
    lines.push({ text: t('status_halfUpdated'), cls: 'warn' });
    return lines;
  }
  const providers = st.providers;
  const usable = providers.filter((p) => (p === 'claude' ? st.hasKey && st.consent : p === 'nano' ? st.nano === 'available' : p === 'heuristic'));
  const desktopHint = st.bridge?.state === 'connected' ? ` ${t('status_desktopHint')}` : '';

  if (st.hasKey && !st.consent) {
    lines.push({ text: t('status_claudeNoConsent'), cls: 'warn' });
  } else if (usable.length === 0) {
    lines.push({ text: t('status_noEngine'), cls: 'err' });
  } else if (usable.length === 1 && usable[0] === 'heuristic') {
    lines.push({ text: `${t('status_heuristicOnly')}${desktopHint}`, cls: 'muted' });
  }
  if (st.claudeOpen) lines.push({ text: t('status_claudePaused'), cls: 'warn' });
  return lines;
}
