/**
 * @file MV3 service worker: event wiring, debounce/throttle, per-window locking.
 *
 * Flow: tab finishes loading → debounce → collect candidates → redact →
 * provider chain (Claude → Nano → heuristic) → validate → apply → ledger.
 */
import { classifyTabs } from './lib/classifier.js';
import { getUsableApiKey, hasRemoteConsent, loadEffectiveSettings, resolveProviderOrder } from './lib/config.js';
import { catchAllName } from './lib/catchall.js';
import { applyGroups, getWindowSnapshot, groupLeftovers, ungroupAll } from './lib/grouper.js';
import { isAutoCandidate, isFreshCandidate, isGroupableUrl, NO_GROUP } from './lib/ledger.js';
import { classifyWithClaude } from './lib/providers/claude.js';
import { classifyWithNano, nanoAvailability } from './lib/providers/nano.js';
import { createBridge } from './lib/bridge.js';
import { hostOf, isHostExcluded, toTabDescriptor } from './lib/redact.js';
import { CircuitBreaker } from './lib/resilience.js';
import { normalizeResult } from './lib/validate.js';

const LEDGER_KEY = 'ledger';
const LAST_RUN_KEY = 'lastRun';

/** Session storage: survives SW restarts, cleared on browser restart (tab ids are not stable anyway). */
const sessionStore = {
  get: async (key) => (await chrome.storage.session.get(key))[key],
  set: (key, value) => chrome.storage.session.set({ [key]: value }),
};

/** @type {Map<string, CircuitBreaker>} */
const breakers = new Map();
const breakerFor = (name) => {
  if (!breakers.has(name)) breakers.set(name, new CircuitBreaker(name, { store: sessionStore }));
  return /** @type {CircuitBreaker} */ (breakers.get(name));
};

const deps = { getApiKey: getUsableApiKey, breakerFor, nanoAvailability, classifyWithClaude, classifyWithNano };

// ---------- Ledger (serialised read-modify-write) ----------

let ledgerChain = Promise.resolve();
/**
 * @param {(ledger: import('./lib/ledger.js').Ledger) => void} mutate
 */
function updateLedger(mutate) {
  ledgerChain = ledgerChain
    .then(async () => {
      const ledger = (await sessionStore.get(LEDGER_KEY)) ?? {};
      mutate(ledger);
      await sessionStore.set(LEDGER_KEY, ledger);
    })
    .catch((err) => console.error('[AI Tab Grouper] ledger', err));
  return ledgerChain;
}

// ---------- Scheduling ----------

/** In-memory only: losing these on SW restart just means one extra/earlier run. */
const timers = new Map();
const running = new Set();
const rerun = new Set();
const lastAutoRun = new Map();

/**
 * @param {number} windowId
 * @param {number} delayMs
 */
function scheduleAuto(windowId, delayMs) {
  clearTimeout(timers.get(windowId));
  timers.set(windowId, setTimeout(() => {
    timers.delete(windowId);
    runGrouping(windowId, 'auto').catch((err) => console.error('[AI Tab Grouper] auto', err));
  }, delayMs));
}

/**
 * Persists and returns a run summary for the popup.
 * @param {object} summary
 */
async function recordRun(summary) {
  const entry = { at: Date.now(), ...summary };
  await sessionStore.set(LAST_RUN_KEY, entry);
  return entry;
}

/**
 * Core use case.
 * @param {number} windowId
 * @param {'auto'|'ungrouped'|'all'} mode
 *   auto: background, respects ledger/throttle · ungrouped: manual, all loose tabs · all: manual, reorganise everything
 */
async function runGrouping(windowId, mode) {
  const settings = await loadEffectiveSettings();
  if (mode === 'auto') {
    if (!settings.autoGroup) return { ok: true, skipped: 'auto desactivado' };
    if (running.has(windowId)) { rerun.add(windowId); return { ok: true, skipped: 'en curso' }; }
    const wait = (lastAutoRun.get(windowId) ?? 0) + settings.minIntervalMs - Date.now();
    if (wait > 0) { scheduleAuto(windowId, wait); return { ok: true, skipped: 'throttle' }; }
  } else if (running.has(windowId)) {
    return { ok: false, error: 'Ya hay una agrupación en curso en esta ventana' };
  }

  running.add(windowId);
  try {
    const { tabs, groups } = await getWindowSnapshot(windowId);
    const ledger = (await sessionStore.get(LEDGER_KEY)) ?? {};
    const candidates = tabs.filter((t) => {
      if (mode === 'auto') return isAutoCandidate(/** @type {any} */ (t), ledger[t.id]);
      if (t.pinned || !isGroupableUrl(t.url)) return false;
      return mode === 'all' || t.groupId === NO_GROUP;
    }).slice(0, settings.maxTabsPerRequest);

    if (mode === 'auto') {
      if (!candidates.some((t) => isFreshCandidate(t, ledger[t.id]))) return { ok: true, skipped: 'sin cambios' };
      if (!groups.length && candidates.length < settings.minGroupSize) return { ok: true, skipped: 'insuficientes' };
      lastAutoRun.set(windowId, Date.now());
    }
    if (!candidates.length) {
      return recordRun({ ok: true, mode, provider: '-', grouped: 0, groups: 0, candidates: 0, errors: [] });
    }

    const input = {
      tabs: candidates.map((t) => toTabDescriptor(/** @type {any} */ (t), { sendPath: settings.sendPath })),
      existingGroups: groups.map((g) => g.title ?? '').filter(Boolean),
    };
    const result = await classifyTabs(input, settings, deps);
    const grouped = await applyGroups(windowId, result.groups, groups);
    // Manual runs guarantee coverage; auto runs leave singletons loose so they can still pair up later.
    let catchAll = 0;
    if (mode !== 'auto' && settings.catchAllGroup) {
      const extra = await groupLeftovers(windowId, new Set(candidates.map((t) => /** @type {number} */ (t.id))), settings.language);
      extra.forEach((id) => grouped.add(id));
      catchAll = extra.size ? 1 : 0;
    }

    await updateLedger((l) => {
      for (const t of candidates) {
        l[t.id] = { host: hostOf(t.url ?? ''), outcome: grouped.has(/** @type {number} */ (t.id)) ? 'grouped' : 'left' };
      }
    });

    return recordRun({
      ok: true, mode, provider: result.provider, grouped: grouped.size,
      groups: result.groups.length + catchAll, candidates: candidates.length, errors: result.errors,
    });
  } finally {
    running.delete(windowId);
    if (rerun.delete(windowId)) scheduleAuto(windowId, settings.debounceMs);
  }
}

// ---------- Claude Desktop bridge (MCP via native messaging) ----------

const BRIDGE_STATUS_KEY = 'bridgeStatus';
const BRIDGE_MAX_TABS = 200;

/**
 * Every bridge call re-checks opt-in, policy and consent: the user's Claude
 * session (Anthropic) receives this data, same as the API provider.
 */
async function bridgeGuard() {
  const s = await loadEffectiveSettings();
  if (!s.enableDesktopBridge) throw new Error('El puente con Claude Desktop está desactivado en la extensión');
  if (!hasRemoteConsent(s)) throw new Error('El usuario no ha aceptado el aviso de datos en la configuración de la extensión');
  return s;
}

/** @param {unknown} v */
function requireWindowId(v) {
  if (!Number.isInteger(v)) throw new Error('windowId inválido');
  return /** @type {number} */ (v);
}

/** Request handlers exposed to the MCP server. Inputs are untrusted (validated again here). */
const bridgeHandlers = {
  ping: async () => ({ ok: true, version: chrome.runtime.getManifest().version }),

  /** @param {{scope?: 'current'|'all', onlyUngrouped?: boolean}} params */
  list_tabs: async ({ scope = 'current', onlyUngrouped = false }) => {
    const s = await bridgeGuard();
    const windows = scope === 'all'
      ? await chrome.windows.getAll({ windowTypes: ['normal'] })
      : [await chrome.windows.getLastFocused()];
    let excludedByPolicy = 0;
    let notGroupable = 0;
    let budget = BRIDGE_MAX_TABS;
    const out = [];
    for (const w of windows) {
      if (w.id === undefined) continue;
      const { tabs, groups } = await getWindowSnapshot(w.id);
      const titleOf = new Map(groups.map((g) => [g.id, g.title ?? '']));
      const list = [];
      for (const t of tabs) {
        if (budget <= 0) break;
        if (t.pinned || !isGroupableUrl(t.url)) { notGroupable++; continue; }
        if (onlyUngrouped && t.groupId !== NO_GROUP) continue;
        const d = toTabDescriptor(/** @type {any} */ (t), { sendPath: s.sendPath });
        if (isHostExcluded(d.host, s.excludedHosts)) { excludedByPolicy++; continue; }
        list.push({ ...d, group: t.groupId === NO_GROUP ? null : titleOf.get(t.groupId) ?? null });
        budget--;
      }
      out.push({
        windowId: w.id,
        focused: Boolean(w.focused),
        existingGroups: groups.map((g) => ({ title: g.title ?? '', color: g.color })),
        tabs: list,
      });
    }
    return { windows: out, excludedByPolicy, notGroupable, truncated: budget <= 0 };
  },

  /** @param {{windowId: number, groups: {name: string, color?: string, tabIds: number[]}[], catchAll?: boolean}} params */
  apply_tab_groups: async ({ windowId, groups, catchAll = true }) => {
    const s = await bridgeGuard();
    const wid = requireWindowId(windowId);
    const { tabs, groups: existing } = await getWindowSnapshot(wid);
    // Only tabs the model could legitimately have seen: same eligibility as list_tabs.
    const valid = new Set(tabs
      .filter((t) => !t.pinned && isGroupableUrl(t.url) && !isHostExcluded(hostOf(t.url ?? ''), s.excludedHosts))
      .map((t) => /** @type {number} */ (t.id)));
    const assignments = normalizeResult({ groups }, valid, {
      existingTitles: existing.map((g) => g.title ?? '').filter(Boolean),
      minGroupSize: 1,
    });
    const grouped = await applyGroups(wid, assignments, existing);
    // Deterministic coverage: the model may skip tabs; leftovers go to the catch-all group.
    let catchAllCount = 0;
    if (catchAll !== false && s.catchAllGroup) {
      const extra = await groupLeftovers(wid, valid, s.language);
      extra.forEach((id) => grouped.add(id));
      catchAllCount = extra.size;
    }
    await updateLedger((l) => {
      for (const id of grouped) l[id] = { host: hostOf(tabs.find((t) => t.id === id)?.url ?? ''), outcome: 'grouped' };
    });
    const requested = (Array.isArray(groups) ? groups : []).flatMap((g) => (Array.isArray(g?.tabIds) ? g.tabIds : []));
    // Feedback loop: tell the model what is still loose so it can do a second pass.
    const after = await chrome.tabs.query({ windowId: wid });
    const remainingUngroupedTabIds = after
      .filter((t) => t.groupId === NO_GROUP && valid.has(/** @type {number} */ (t.id)))
      .map((t) => /** @type {number} */ (t.id));
    await recordRun({
      ok: true, mode: 'desktop', provider: 'claude-desktop', grouped: grouped.size,
      groups: assignments.length + (catchAllCount ? 1 : 0), candidates: valid.size, errors: [],
    });
    return {
      grouped: grouped.size,
      groups: assignments.map((a) => ({ name: a.name, color: a.color, tabs: a.tabIds.length })),
      catchAllGroup: catchAllCount ? { name: catchAllName(s.language), tabs: catchAllCount } : null,
      ignoredTabIds: requested.filter((id) => !grouped.has(id)),
      remainingUngroupedTabIds,
    };
  },

  /** @param {{windowId: number}} params */
  ungroup_tabs: async ({ windowId }) => {
    await bridgeGuard();
    return { ungrouped: await ungroupAll(requireWindowId(windowId)) };
  },
};

const bridge = createBridge({
  handlers: bridgeHandlers,
  connectNative: (name) => chrome.runtime.connectNative(name),
  lastError: () => chrome.runtime.lastError?.message,
  onStatus: (status) => { sessionStore.set(BRIDGE_STATUS_KEY, status); },
});

/** Starts/stops the bridge to match settings, policy and the optional permission. */
async function syncBridge() {
  const s = await loadEffectiveSettings();
  const granted = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
  if (s.enableDesktopBridge && granted && typeof chrome.runtime.connectNative === 'function') bridge.start();
  else bridge.stop();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync' || area === 'managed') syncBridge().catch(console.error);
});
chrome.permissions.onAdded.addListener(() => { syncBridge().catch(console.error); });
chrome.permissions.onRemoved.addListener(() => { syncBridge().catch(console.error); });
syncBridge().catch(console.error); // every service-worker start

// ---------- Event wiring ----------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // User pulled a tab out of a group we created → stop auto-grouping it.
  if (changeInfo.groupId === NO_GROUP) {
    updateLedger((l) => { if (l[tabId]?.outcome === 'grouped') l[tabId].outcome = 'user'; });
  }
  if (changeInfo.status === 'complete' && tab.groupId === NO_GROUP && !tab.pinned && isGroupableUrl(tab.url)) {
    const { autoGroup, debounceMs } = await loadEffectiveSettings();
    if (autoGroup) scheduleAuto(tab.windowId, debounceMs);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  updateLedger((l) => { delete l[tabId]; });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'group-now') return;
  const win = await chrome.windows.getLastFocused();
  if (win.id !== undefined) runGrouping(win.id, 'ungrouped').catch(console.error);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage();
});

/**
 * Popup/options API. Only accepts messages from this extension's own pages.
 * @param {any} msg
 */
async function handleMessage(msg) {
  const windowId = Number(msg?.windowId);
  switch (msg?.type) {
    case 'group':
      if (!Number.isInteger(windowId)) throw new Error('windowId inválido');
      return runGrouping(windowId, msg.all ? 'all' : 'ungrouped');
    case 'ungroup':
      if (!Number.isInteger(windowId)) throw new Error('windowId inválido');
      return { ok: true, ungrouped: await ungroupAll(windowId) };
    case 'status': {
      const settings = await loadEffectiveSettings();
      return {
        ok: true,
        lastRun: await sessionStore.get(LAST_RUN_KEY),
        hasKey: Boolean(settings.proxyEndpoint) || Boolean(await getUsableApiKey(settings)),
        proxy: Boolean(settings.proxyEndpoint),
        managed: settings.managed,
        consent: hasRemoteConsent(settings),
        nano: await nanoAvailability(settings.language),
        claudeOpen: await breakerFor('claude').isOpen(),
        providers: resolveProviderOrder(settings),
        bridge: settings.enableDesktopBridge ? bridge.status() : { state: 'off', error: '' },
      };
    }
    case 'reset-breakers':
      await Promise.all(['claude', 'nano'].map((n) => breakerFor(n).recordSuccess()));
      return { ok: true };
    default:
      throw new Error(`Mensaje desconocido: ${msg?.type}`);
  }
}

/**
 * Accept only this extension's own pages (popup/options). The origin check is
 * what matters: content scripts always report the web page's URL and other
 * extensions a different id. `sender.tab` is NOT a signal — the options page
 * opens as a tab and legitimately carries it.
 * @param {chrome.runtime.MessageSender} sender
 */
function isTrustedSender(sender) {
  return sender.id === chrome.runtime.id
    && typeof sender.url === 'string'
    && sender.url.startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isTrustedSender(sender)) return false;
  handleMessage(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: err?.message ?? String(err) }));
  return true; // async response
});
