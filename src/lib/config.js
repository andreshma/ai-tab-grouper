/**
 * @file Settings model, enterprise policy overlay and credential storage.
 *
 * - User settings: `chrome.storage.sync` (no secrets).
 * - Enterprise policy: `chrome.storage.managed` (read-only, set by IT via
 *   GPO / Intune / Google Admin; schema in `managed_schema.json`).
 *   Rule: policy can only RESTRICT user settings — the single exception is
 *   `proxyEndpoint`, which moves the API key off the device into a corporate vault.
 * - Claude API key (BYOK): `chrome.storage.session` (memory, wiped on browser
 *   close) or, if the user opts in, `chrome.storage.local`. Never synced.
 */

/** @typedef {'claude'|'nano'|'heuristic'} ProviderName */

/**
 * @typedef {Object} Settings
 * @property {boolean} autoGroup        Group automatically when a tab finishes loading.
 * @property {boolean} enableClaude     Use Claude (BYOK key or corporate proxy).
 * @property {boolean} enableNano       Use Chrome built-in AI (Gemini Nano) when available.
 * @property {boolean} enableHeuristic  Fall back to grouping by registrable domain.
 * @property {boolean} preferOnDevice   Try Gemini Nano before Claude (privacy-first ordering).
 * @property {string}  claudeModel      Anthropic model id. Small tier by default: simple task, latency matters.
 * @property {'auto'|'en'|'es'} language Language for generated group names ('auto' = browser UI language).
 * @property {number}  minGroupSize     Minimum tabs to create a NEW group (existing groups accept 1).
 * @property {string[]} excludedHosts   Hosts never sent to a remote model (grouped locally instead).
 * @property {boolean} sendPath         Send a redacted URL path to the model (better accuracy, more data).
 * @property {number}  debounceMs       Quiet period after tab activity before auto-grouping.
 * @property {number}  minIntervalMs    Minimum time between auto runs per window (cost/rate control).
 * @property {number}  maxTabsPerRequest Upper bound of tabs sent per classification.
 * @property {number}  consentVersion   Version of the data disclosure the user accepted (0 = none).
 * @property {boolean} enableDesktopBridge Expose tabs to Claude Desktop via the local MCP bridge.
 * @property {boolean} catchAllGroup    Manual/Desktop runs put leftover tabs into the catch-all group (never in auto mode).
 */

/**
 * @typedef {Object} ManagedPolicy
 * @property {boolean} [allowDesktopBridge] `false` forces the Claude Desktop bridge off.
 * @property {ProviderName[]} [allowedProviders] Providers IT permits; others are forced off.
 * @property {string[]} [excludedHosts]  Merged with the user's list (user cannot remove them).
 * @property {boolean} [forbidPathSending] Forces `sendPath=false`.
 * @property {boolean} [disableAutoGroup]  Forces manual-only grouping.
 * @property {boolean} [allowUserApiKey]   `false` disables BYOK keys entirely.
 * @property {'session'|'local'} [apiKeyStorage] Forces where a BYOK key may live.
 * @property {string[]} [allowedModels]    Model allowlist; first entry is the fallback.
 * @property {string} [proxyEndpoint]      HTTPS Messages-API-compatible proxy; key stays server-side.
 */

/**
 * @typedef {Settings & {
 *   proxyEndpoint: string,
 *   allowUserApiKey: boolean,
 *   apiKeyStorage: 'user'|'session'|'local',
 *   locked: string[],
 *   managed: boolean
 * }} EffectiveSettings
 */

/**
 * Bump whenever what is sent to a remote provider changes. Users must re-consent
 * (Chrome Web Store Disclosure Requirements §3: disclose practice changes).
 */
export const CONSENT_VERSION = 2; // v2: adds Claude Desktop (MCP bridge) as a destination

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  autoGroup: true,
  enableClaude: true,
  enableNano: true,
  enableHeuristic: true,
  preferOnDevice: false,
  claudeModel: 'claude-haiku-5-5',
  language: 'auto',
  minGroupSize: 2,
  excludedHosts: [],
  sendPath: true,
  debounceMs: 2000,
  minIntervalMs: 10000,
  maxTabsPerRequest: 60,
  consentVersion: 0,
  enableDesktopBridge: false,
  catchAllGroup: true,
});

const SETTINGS_KEY = 'settings';
const API_KEY_KEY = 'claudeApiKey';

/**
 * @param {Pick<Settings,'consentVersion'>} s
 * @returns {boolean} True if the user accepted the current disclosure.
 */
export function hasRemoteConsent(s) {
  return s.consentVersion >= CONSENT_VERSION;
}

/**
 * Computes the provider chain from the enable/prefer flags.
 * Heuristic always goes last: it never fails, so it is the terminal fallback.
 * @param {Pick<Settings,'enableClaude'|'enableNano'|'enableHeuristic'|'preferOnDevice'>} s
 * @returns {ProviderName[]}
 */
export function resolveProviderOrder(s) {
  const ai = s.preferOnDevice ? ['nano', 'claude'] : ['claude', 'nano'];
  /** @type {ProviderName[]} */
  const order = /** @type {ProviderName[]} */ (ai.filter((p) => (p === 'claude' ? s.enableClaude : s.enableNano)));
  if (s.enableHeuristic) order.push('heuristic');
  return order;
}

/**
 * HTTPS only, no embedded credentials. Plain HTTP would expose tab data in transit.
 * @param {unknown} url
 */
export function isValidProxyEndpoint(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Overlays enterprise policy on user settings. Pure — unit-testable.
 * @param {Settings} settings
 * @param {ManagedPolicy} [policy]
 * @returns {EffectiveSettings}
 */
export function applyPolicy(settings, policy = {}) {
  const locked = new Set();
  /** @type {EffectiveSettings} */
  const out = {
    ...settings, proxyEndpoint: '', allowUserApiKey: true, apiKeyStorage: 'user', locked: [], managed: false,
  };

  if (Array.isArray(policy.allowedProviders)) {
    const allow = new Set(policy.allowedProviders);
    for (const [provider, key] of /** @type {const} */ ([['claude', 'enableClaude'], ['nano', 'enableNano'], ['heuristic', 'enableHeuristic']])) {
      if (!allow.has(provider)) { out[key] = false; locked.add(key); }
    }
  }
  if (Array.isArray(policy.excludedHosts)) {
    out.excludedHosts = [...new Set([...settings.excludedHosts, ...policy.excludedHosts.map(String)])];
  }
  if (policy.forbidPathSending === true) { out.sendPath = false; locked.add('sendPath'); }
  if (policy.disableAutoGroup === true) { out.autoGroup = false; locked.add('autoGroup'); }
  if (policy.allowDesktopBridge === false) { out.enableDesktopBridge = false; locked.add('enableDesktopBridge'); }
  if (Array.isArray(policy.allowedModels) && policy.allowedModels.length) {
    if (!policy.allowedModels.includes(out.claudeModel)) out.claudeModel = String(policy.allowedModels[0]);
    if (policy.allowedModels.length === 1) locked.add('claudeModel');
  }
  if (policy.allowUserApiKey === false) { out.allowUserApiKey = false; locked.add('apiKey'); }
  if (policy.apiKeyStorage === 'session' || policy.apiKeyStorage === 'local') {
    out.apiKeyStorage = policy.apiKeyStorage;
    locked.add('rememberApiKey');
  }
  if (isValidProxyEndpoint(policy.proxyEndpoint)) {
    out.proxyEndpoint = /** @type {string} */ (policy.proxyEndpoint);
    locked.add('apiKey');
  }

  out.locked = [...locked];
  out.managed = Object.keys(policy).length > 0;
  return out;
}

/** @returns {Promise<Settings>} User settings merged over defaults (forward-compatible). */
export async function loadSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] ?? {}) };
}

/** @returns {Promise<ManagedPolicy>} Enterprise policy, or `{}` if unmanaged. */
export async function loadPolicy() {
  try {
    return (await chrome.storage.managed?.get(null)) ?? {};
  } catch {
    return {}; // unmanaged browsers may reject when no schema/policy is present
  }
}

/** @returns {Promise<EffectiveSettings>} What the extension must actually obey. */
export async function loadEffectiveSettings() {
  const [settings, policy] = await Promise.all([loadSettings(), loadPolicy()]);
  return applyPolicy(settings, policy);
}

/**
 * Persists a partial settings update.
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>} The merged settings.
 */
export async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/** @returns {Promise<string>} Stored BYOK key (session first), or ''. */
export async function getApiKey() {
  const s = await chrome.storage.session.get(API_KEY_KEY);
  if (s[API_KEY_KEY]) return s[API_KEY_KEY];
  const l = await chrome.storage.local.get(API_KEY_KEY);
  return l[API_KEY_KEY] ?? '';
}

/** @returns {Promise<boolean>} True if the key persists across browser restarts. */
export async function isApiKeyRemembered() {
  return Boolean((await chrome.storage.local.get(API_KEY_KEY))[API_KEY_KEY]);
}

/**
 * Stores (or clears, with '') the BYOK key in exactly one area.
 * @param {string} key
 * @param {{remember?: boolean}} [opts] remember=false → memory only (wiped on browser close).
 */
export async function setApiKey(key, { remember = false } = {}) {
  await Promise.all([chrome.storage.local.remove(API_KEY_KEY), chrome.storage.session.remove(API_KEY_KEY)]);
  if (!key) return;
  await (remember ? chrome.storage.local : chrome.storage.session).set({ [API_KEY_KEY]: key.trim() });
}

/**
 * Key the extension may use under the current policy. Enforces `apiKeyStorage=session`
 * by purging any persisted copy.
 * @param {EffectiveSettings} eff
 * @returns {Promise<string>}
 */
export async function getUsableApiKey(eff) {
  if (!eff.allowUserApiKey || eff.proxyEndpoint) return '';
  if (eff.apiKeyStorage === 'session') await chrome.storage.local.remove(API_KEY_KEY);
  return getApiKey();
}
