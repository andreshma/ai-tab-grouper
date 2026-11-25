/**
 * @file Options page controller. Renders user settings, locks fields enforced
 * by enterprise policy, and captures the data-disclosure consent.
 */
import {
  applyPolicy, CONSENT_VERSION, getApiKey, hasRemoteConsent, isApiKeyRemembered,
  loadPolicy, loadSettings, saveSettings, setApiKey,
} from '../lib/config.js';
import { catchAllName } from '../lib/catchall.js';
import { t } from '../lib/i18n.js';
import { classifyWithClaude } from '../lib/providers/claude.js';
import { downloadNanoModel, nanoAvailability } from '../lib/providers/nano.js';
import { normalizeResult } from '../lib/validate.js';
import { localizePage } from '../ui/localize.js';

localizePage();

const form = /** @type {HTMLFormElement} */ (document.getElementById('form'));
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const NANO_LABEL = {
  available: ['nano_available', 'ok'],
  downloadable: ['nano_downloadable', 'warn'],
  downloading: ['nano_downloading', 'warn'],
  unavailable: ['nano_unavailable', 'muted'],
};
const BRIDGE_LABEL = {
  off: ['bridge_off', 'muted'],
  connected: ['bridge_connected', 'ok'],
  'not-installed': ['bridge_notInstalled', 'warn'],
  error: ['bridge_reconnecting', 'warn'],
};

/** Shows the bridge status reported by the service worker. */
async function refreshBridge() {
  const st = await chrome.runtime.sendMessage({ type: 'status' });
  const [key, cls] = BRIDGE_LABEL[st?.bridge?.state] ?? ['', 'muted'];
  const label = key ? t(key) : '—';
  setText($('bridgeState'), st?.bridge?.error && st.bridge.state !== 'connected' ? `${label} (${st.bridge.error})` : label, cls);
}

/** @type {import('../lib/config.js').EffectiveSettings} */
let eff;
/** @type {import('../lib/config.js').ManagedPolicy} */
let policy = {};

/** @param {HTMLElement} el @param {string} text @param {string} [cls] */
function setText(el, text, cls = '') {
  el.textContent = text;
  el.className = cls;
}

/** @param {HTMLElement} el */
function lock(el) {
  el.setAttribute('disabled', '');
  el.title = t('opt_locked');
}

/** The catch-all checkbox names the group title the selected language will produce. */
function refreshCatchAllLabel() {
  $('catchAllLabel').textContent = t('opt_catchAll', catchAllName($('language').value));
}

/** Populates the form from stored settings and applies policy locks. */
async function fill() {
  const [settings, pol] = await Promise.all([loadSettings(), loadPolicy()]);
  policy = pol;
  eff = applyPolicy(settings, policy);
  const locked = new Set(eff.locked);

  for (const el of form.elements) {
    const input = /** @type {HTMLInputElement} */ (el);
    if (!input.name || !(input.name in settings)) continue;
    // Show the effective value for locked fields, the user's own value otherwise.
    const v = locked.has(input.name) ? eff[input.name] : settings[input.name];
    if (input.type === 'checkbox') input.checked = Boolean(v);
    else if (input.name === 'excludedHosts') input.value = settings.excludedHosts.join('\n');
    else input.value = input.dataset.scale ? String(v / Number(input.dataset.scale)) : String(v);
    if (locked.has(input.name)) lock(input);
  }

  $('managedBanner').hidden = !eff.managed;
  if (policy.excludedHosts?.length) {
    $('policyHosts').textContent = t('opt_policyHosts', policy.excludedHosts.join(', '));
  }

  const proxy = Boolean(eff.proxyEndpoint);
  $('proxyInfo').hidden = !proxy;
  $('byok').hidden = proxy;
  $('clearKey').hidden = proxy;
  $('dest').textContent = proxy ? t('opt_destProxy', new URL(eff.proxyEndpoint).host) : t('opt_destAnthropic');
  if (locked.has('apiKey') && !proxy) { lock($('apiKey')); lock($('clearKey')); }

  $('rememberApiKey').checked = eff.apiKeyStorage === 'user' ? await isApiKeyRemembered() : eff.apiKeyStorage === 'local';
  if (locked.has('rememberApiKey')) lock($('rememberApiKey'));

  $('consent').checked = hasRemoteConsent(settings);
  const key = proxy ? '' : await getApiKey();
  $('apiKey').placeholder = key ? t('opt_apiKeySaved', key.slice(-4)) : 'sk-ant-…';
  $('extId').value = chrome.runtime.id;
  refreshCatchAllLabel();
  await refreshNano(settings.language);
  await refreshBridge();
}

/** Reads unlocked fields into a settings patch (locked fields are never written). */
function readForm() {
  /** @type {Record<string, any>} */
  const patch = {};
  for (const el of form.elements) {
    const input = /** @type {HTMLInputElement} */ (el);
    if (!input.name || input.disabled) continue;
    if (input.type === 'checkbox') patch[input.name] = input.checked;
    else if (input.type === 'number') patch[input.name] = Number(input.value) * Number(input.dataset.scale ?? 1);
    else if (input.name === 'excludedHosts') patch[input.name] = input.value.split(/\s+/).map((h) => h.trim()).filter(Boolean);
    else patch[input.name] = input.value.trim();
  }
  return patch;
}

/** Resolves the remember flag honoring policy. */
function rememberKey() {
  if (eff.apiKeyStorage === 'session') return false;
  if (eff.apiKeyStorage === 'local') return true;
  return $('rememberApiKey').checked;
}

/** @param {'auto'|'en'|'es'} language */
async function refreshNano(language) {
  const state = await nanoAvailability(language);
  const [key, cls] = NANO_LABEL[state] ?? ['', ''];
  setText($('nanoState'), key ? t(key) : state, cls);
  $('downloadNano').hidden = state !== 'downloadable';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (eff.allowUserApiKey && !eff.proxyEndpoint) {
    // Re-store even without a new key so a change of the "remember" toggle moves it.
    const key = $('apiKey').value.trim() || (await getApiKey());
    await setApiKey(key, { remember: rememberKey() });
  }
  $('apiKey').value = '';
  await saveSettings({ ...readForm(), consentVersion: $('consent').checked ? CONSENT_VERSION : 0 });
  await fill();
  setText($('saved'), t('opt_saved'), 'ok');
  setTimeout(() => setText($('saved'), ''), 2000);
  setTimeout(refreshBridge, 800); // let the SW (re)connect before showing state
});

// The optional permission must be requested synchronously inside the user gesture.
$('enableDesktopBridge').addEventListener('change', (e) => {
  const box = /** @type {HTMLInputElement} */ (e.target);
  if (!box.checked) return;
  chrome.permissions.request({ permissions: ['nativeMessaging'] }).then((granted) => {
    if (!granted) {
      box.checked = false;
      setText($('bridgeState'), t('opt_permissionDenied'), 'warn');
    }
  });
});

$('language').addEventListener('change', refreshCatchAllLabel);

$('copyId').addEventListener('click', async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  setText($('copyId'), t('opt_copied'));
  setTimeout(() => setText($('copyId'), t('opt_copy')), 1500);
});

$('clearKey').addEventListener('click', async () => {
  await setApiKey('');
  await fill();
  setText($('claudeResult'), t('opt_keyDeleted'), 'muted');
});

$('testClaude').addEventListener('click', async () => {
  const endpoint = eff.proxyEndpoint || undefined;
  const apiKey = endpoint ? '' : ($('apiKey').value.trim() || (await getApiKey()));
  if (!endpoint && !apiKey) { setText($('claudeResult'), t('opt_enterKey'), 'warn'); return; }
  if (!$('consent').checked) { setText($('claudeResult'), t('opt_acceptNoticeFirst'), 'warn'); return; }
  setText($('claudeResult'), t('opt_testing'), 'muted');
  // Synthetic tabs only: the connectivity test never sends real browsing data.
  const sample = {
    existingGroups: [],
    tabs: [
      { id: 1, title: 'Flights to Lisbon - Compare prices', host: 'skyscanner.com' },
      { id: 2, title: 'Hotels in Lisbon', host: 'booking.com' },
      { id: 3, title: 'aws_s3_bucket | Terraform Registry', host: 'registry.terraform.io' },
      { id: 4, title: 'S3 pricing', host: 'aws.amazon.com' },
    ],
  };
  try {
    const raw = await classifyWithClaude(sample, {
      apiKey, endpoint, model: $('claudeModel').value.trim(), language: $('language').value, retries: 0,
    });
    const groups = normalizeResult(raw, new Set([1, 2, 3, 4]));
    setText($('claudeResult'), t('opt_testOk', groups.map((g) => g.name).join(', ') || t('opt_noGroups')), 'ok');
    await chrome.runtime.sendMessage({ type: 'reset-breakers' });
  } catch (err) {
    setText($('claudeResult'), String(err?.message ?? err).slice(0, 160), 'err');
  }
});

$('downloadNano').addEventListener('click', async () => {
  const lang = $('language').value;
  $('downloadNano').disabled = true;
  try {
    await downloadNanoModel(lang, (f) => setText($('nanoState'), t('nano_downloadProgress', Math.round(f * 100)), 'warn'));
  } catch (err) {
    setText($('nanoState'), String(err?.message ?? err), 'err');
  } finally {
    $('downloadNano').disabled = false;
    await refreshNano(lang);
  }
});

fill();
