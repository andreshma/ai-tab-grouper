/**
 * Minimal in-memory fake of the Chrome extension APIs used by the service worker.
 * Only the surface the extension touches is implemented; semantics follow the
 * real APIs closely enough to exercise grouping, ledger, messaging and the
 * native-messaging bridge.
 */
import { readFileSync } from 'node:fs';

const NO_GROUP = -1;
const LOCALES_DIR = new URL('../../_locales/', import.meta.url);
const DEFAULT_LOCALE = 'en';

/** @param {string} locale @returns {Record<string, {message: string, placeholders?: Record<string, {content: string}>}>} */
export function loadMessages(locale) {
  return JSON.parse(readFileSync(new URL(`${locale}/messages.json`, LOCALES_DIR), 'utf8'));
}

/**
 * Fake `chrome.i18n` backed by the real `_locales` catalogues, with Chrome's
 * lookup rules: UI language → its base language → default locale; named
 * placeholders (`$NAME$`) expand to their `content`, then `$1`…`$9` to the
 * substitutions; an unknown key yields ''.
 * @param {string} [uiLanguage]  e.g. 'en-US', 'es-419'.
 */
export function createI18nFake(uiLanguage = 'en-US') {
  const state = { uiLanguage };
  const catalogue = (locale) => { try { return loadMessages(locale); } catch { return {}; } };
  const cache = new Map();
  const messagesFor = (locale) => {
    if (!cache.has(locale)) cache.set(locale, catalogue(locale));
    return cache.get(locale);
  };
  return {
    getUILanguage: () => state.uiLanguage,
    /** @param {string} key @param {string|string[]} [substitutions] */
    getMessage(key, substitutions = []) {
      const subs = [substitutions].flat();
      const chain = [state.uiLanguage.replace('-', '_'), state.uiLanguage.split(/[-_]/)[0], DEFAULT_LOCALE];
      const entry = chain.map((l) => messagesFor(l)[key]).find(Boolean);
      if (!entry) return '';
      const positional = (text) => text.replace(/\$([1-9])/g, (_, n) => String(subs[Number(n) - 1] ?? ''));
      const placeholders = Object.fromEntries(
        Object.entries(entry.placeholders ?? {}).map(([name, p]) => [name.toLowerCase(), p.content]),
      );
      // Named placeholders become their `$n` content first; substitution is then a single pass,
      // so a substituted value that itself contains `$1` is not expanded again.
      return positional(entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (m, name) => placeholders[name.toLowerCase()] ?? m));
    },
    /** Test helper (not part of the real API): switches the browser UI language. */
    setUILanguage(lang) { state.uiLanguage = lang; },
  };
}

/** @returns {{addListener:(fn:Function)=>void, fns:Function[], emit:(...a:any[])=>void}} */
function event() {
  const fns = [];
  return { addListener: (fn) => fns.push(fn), fns, emit: (...args) => fns.forEach((fn) => fn(...args)) };
}

/**
 * chrome.storage area backed by a plain object (values deep-copied like the real API).
 * @param {string} areaName
 * @param {ReturnType<typeof event>} onChanged
 */
function storageArea(areaName, onChanged) {
  const data = {};
  return {
    async get(key) {
      if (typeof key === 'string') return key in data ? { [key]: structuredClone(data[key]) } : {};
      return structuredClone(data);
    },
    async set(obj) {
      Object.assign(data, structuredClone(obj));
      onChanged.emit(Object.fromEntries(Object.keys(obj).map((k) => [k, { newValue: obj[k] }])), areaName);
    },
    async remove(key) { delete data[key]; },
  };
}

/** Fake native-messaging port. */
function createPort() {
  const port = {
    onMessage: event(),
    onDisconnect: event(),
    posted: [],
    connected: true,
    postMessage(msg) { port.posted.push(structuredClone(msg)); },
    disconnect() { port.connected = false; },
  };
  return port;
}

/**
 * @param {{uiLanguage?: string}} [opts]
 * @returns Fake `chrome` object plus test helpers.
 */
export function createChromeFake({ uiLanguage = 'en-US' } = {}) {
  /** @type {any[]} */
  const tabs = [];
  /** @type {any[]} */
  const groups = [];
  let nextGroupId = 100;
  let nativeGranted = false;
  /** @type {ReturnType<typeof createPort>[]} */
  const ports = [];
  const connectNativeCalls = [];

  const tabsOnUpdated = event();
  const tabsOnRemoved = event();
  const onMessage = event();
  const storageOnChanged = event();
  const permOnAdded = event();
  const permOnRemoved = event();

  const emitUpdated = (tabId, changeInfo) => {
    const tab = tabs.find((t) => t.id === tabId);
    tabsOnUpdated.fns.forEach((fn) => fn(tabId, changeInfo, { ...tab }));
  };

  const liveGroups = () => groups.filter((g) => tabs.some((t) => t.groupId === g.id));

  const chrome = {
    i18n: createI18nFake(uiLanguage),
    runtime: {
      id: 'ext-id',
      lastError: undefined,
      OnInstalledReason: { INSTALL: 'install' },
      onInstalled: event(),
      onMessage,
      openOptionsPage: async () => {},
      getURL: (path) => `chrome-extension://ext-id/${path}`,
      getManifest: () => ({ version: '1.2.0' }),
      connectNative(name) {
        connectNativeCalls.push(name);
        const port = createPort();
        ports.push(port);
        return port;
      },
    },
    permissions: {
      contains: async ({ permissions }) => permissions.every((p) => p === 'nativeMessaging' && nativeGranted),
      onAdded: permOnAdded,
      onRemoved: permOnRemoved,
    },
    storage: {
      onChanged: storageOnChanged,
      sync: storageArea('sync', storageOnChanged),
      local: storageArea('local', storageOnChanged),
      session: storageArea('session', storageOnChanged),
      managed: storageArea('managed', storageOnChanged),
    },
    tabs: {
      onUpdated: tabsOnUpdated,
      onRemoved: tabsOnRemoved,
      async query({ windowId }) {
        return tabs.filter((t) => t.windowId === windowId).map((t) => ({ ...t }));
      },
      async group({ groupId, tabIds, createProperties }) {
        let id = groupId;
        if (id === undefined) {
          id = nextGroupId++;
          groups.push({ id, windowId: createProperties.windowId, title: '', color: 'grey' });
        } else if (!groups.some((g) => g.id === id)) {
          throw new Error(`No group with id: ${id}`);
        }
        for (const t of tabs) {
          if (tabIds.includes(t.id)) { t.groupId = id; emitUpdated(t.id, { groupId: id }); }
        }
        return id;
      },
      async ungroup(ids) {
        for (const t of tabs) {
          if (ids.includes(t.id)) { t.groupId = NO_GROUP; emitUpdated(t.id, { groupId: NO_GROUP }); }
        }
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: NO_GROUP,
      async query({ windowId }) {
        return liveGroups().filter((g) => g.windowId === windowId).map((g) => ({ ...g }));
      },
      async update(id, props) {
        Object.assign(groups.find((g) => g.id === id), props);
      },
    },
    commands: { onCommand: event() },
    windows: {
      getLastFocused: async () => ({ id: 1, focused: true }),
      getCurrent: async () => ({ id: 1, focused: true }),
      getAll: async () => [...new Set(tabs.map((t) => t.windowId))].map((id) => ({ id, focused: id === 1 })),
    },
  };

  return {
    chrome,
    emitUpdated,
    ports,
    connectNativeCalls,
    /** @param {{id:number,url:string,title:string,pinned?:boolean,windowId?:number}} t */
    /** Switches the browser UI language seen by `chrome.i18n`. */
    setUILanguage(lang) { chrome.i18n.setUILanguage(lang); },
    addTab(t) { tabs.push({ windowId: 1, pinned: false, groupId: NO_GROUP, ...t }); },
    tab: (id) => tabs.find((t) => t.id === id),
    groupOf: (id) => groups.find((g) => g.id === tabs.find((t) => t.id === id)?.groupId),
    groupTitles: () => liveGroups().map((g) => g.title),
    /** Simulates the user dragging a tab out of its group. */
    ungroupByUser(id) { chrome.tabs.ungroup([id]); },
    /** Grants the optional nativeMessaging permission and fires onAdded. */
    grantNativeMessaging() { nativeGranted = true; permOnAdded.emit({ permissions: ['nativeMessaging'] }); },
    /**
     * Simulates the native host sending a request and waits for the extension's reply.
     * @param {ReturnType<typeof createPort>} port
     * @param {{id:number, method:string, params?:object}} msg
     */
    async hostRequest(port, msg) {
      port.onMessage.emit(msg);
      for (let i = 0; i < 200; i++) {
        const reply = port.posted.find((r) => r.id === msg.id);
        if (reply) return reply;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(`no reply for ${msg.id}`);
    },
    /** Simulates Chrome closing the native port with an error. */
    disconnectPort(port, error) {
      chrome.runtime.lastError = error ? { message: error } : undefined;
      port.connected = false;
      port.onDisconnect.emit();
      chrome.runtime.lastError = undefined;
    },
    /**
     * Dispatches a runtime message like chrome.runtime.sendMessage would.
     * @returns {Promise<any>} The listener's async response (undefined if not handled).
     */
    send(msg, sender = { id: 'ext-id', url: 'chrome-extension://ext-id/src/popup/popup.html' }) {
      return new Promise((resolve) => {
        let handled = false;
        for (const fn of onMessage.fns) {
          const keepOpen = fn(msg, sender, (r) => { handled = true; resolve(r); });
          if (keepOpen === true) return;
        }
        if (!handled) resolve(undefined);
      });
    },
  };
}
