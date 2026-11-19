/**
 * @file Popup controller: manual actions + status of the last run.
 */
import { loadSettings, saveSettings } from '../lib/config.js';
import { describeStatus } from './status.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const statusEl = $('status');
const buttons = ['group', 'regroup', 'ungroup'].map($);

/** Safe DOM line (no innerHTML: error text can echo untrusted API content). */
function line(text, cls = '') {
  const p = document.createElement('p');
  p.textContent = text;
  if (cls) p.className = cls;
  return p;
}

async function refresh() {
  const st = await chrome.runtime.sendMessage({ type: 'status' });
  statusEl.replaceChildren(...describeStatus(st).map((l) => line(l.text, l.cls)));
}

/**
 * Sends an action to the SW and shows its result.
 * @param {object} msg
 */
async function act(msg) {
  const win = await chrome.windows.getCurrent();
  buttons.forEach((b) => { b.disabled = true; });
  statusEl.replaceChildren(line('Procesando…', 'muted'));
  try {
    const res = await chrome.runtime.sendMessage({ ...msg, windowId: win.id });
    if (!res?.ok) { statusEl.replaceChildren(line(res?.error ?? 'Error', 'err')); return; }
    if (msg.type === 'ungroup') { statusEl.replaceChildren(line(`${res.ungrouped} pestañas desagrupadas.`, 'ok')); return; }
    await refresh();
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

$('group').addEventListener('click', () => act({ type: 'group' }));
$('regroup').addEventListener('click', () => act({ type: 'group', all: true }));
$('ungroup').addEventListener('click', () => act({ type: 'ungroup' }));
$('options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

const auto = /** @type {HTMLInputElement} */ ($('auto'));
auto.addEventListener('change', () => saveSettings({ autoGroup: auto.checked }));

loadSettings().then((s) => { auto.checked = s.autoGroup; });
refresh();
