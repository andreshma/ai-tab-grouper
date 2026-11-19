/**
 * @file Pure status → message mapping for the popup (unit-testable, no DOM).
 * Messages must state the actual cause and the fix, never a guess.
 */

const PROVIDER_LABEL = {
  claude: 'Claude', 'claude-desktop': 'Claude Desktop', nano: 'Gemini Nano (local)', heuristic: 'Heurística por dominio',
};
const BRIDGE_LABEL = {
  connected: ['Claude Desktop: conectado', 'ok'],
  'not-installed': ['Claude Desktop: host no instalado', 'warn'],
  error: ['Claude Desktop: reconectando…', 'warn'],
};

/** @typedef {{text: string, cls: ''|'ok'|'warn'|'err'|'muted'}} StatusLine */

/** @param {number} ts @param {number} now */
export function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}

/**
 * Builds the popup status lines from the service worker's `status` response.
 * @param {any} st
 * @param {number} [now]
 * @returns {StatusLine[]}
 */
export function describeStatus(st, now = Date.now()) {
  if (!st?.ok) return [{ text: st?.error ?? 'Sin respuesta del service worker', cls: 'err' }];
  /** @type {StatusLine[]} */
  const lines = [];
  const r = st.lastRun;

  if (!r) {
    lines.push({ text: 'Sin ejecuciones en esta sesión.', cls: 'muted' });
  } else if (r.provider === 'none') {
    lines.push({ text: `No se agrupó: ningún proveedor disponible para ${r.candidates} pestañas · ${ago(r.at, now)}`, cls: 'err' });
  } else if (r.provider === '-') {
    lines.push({ text: `Nada que agrupar: no hay pestañas sueltas · ${ago(r.at, now)}`, cls: 'muted' });
  } else {
    lines.push({ text: `${PROVIDER_LABEL[r.provider] ?? r.provider} · ${r.grouped} pestañas en ${r.groups} grupos · ${ago(r.at, now)}`, cls: '' });
    const real = (r.errors ?? []).filter((e) => e.message !== 'no disponible');
    if (real.length) lines.push({ text: `Fallback: ${real[0].provider} → ${real[0].message}`.slice(0, 140), cls: 'warn' });
  }

  const bridge = BRIDGE_LABEL[st.bridge?.state];
  if (bridge) lines.push({ text: bridge[0], cls: /** @type {any} */ (bridge[1]) });
  if (st.managed) lines.push({ text: st.proxy ? 'Gestionado por tu organización · proxy corporativo' : 'Gestionado por tu organización', cls: 'muted' });

  // What will the in-Chrome grouping (auto / "Agrupar ahora") actually use?
  // No `providers` field = service worker older than this popup (extension not
  // reloaded after an update): say so instead of guessing "no engine".
  if (!Array.isArray(st.providers)) {
    lines.push({ text: 'Extensión actualizada a medias: pulsa ↻ en chrome://extensions.', cls: 'warn' });
    return lines;
  }
  const providers = st.providers;
  const usable = providers.filter((p) => (p === 'claude' ? st.hasKey && st.consent : p === 'nano' ? st.nano === 'available' : p === 'heuristic'));
  const desktopHint = st.bridge?.state === 'connected' ? ' Para agrupar por tema, pídeselo a Claude Desktop.' : '';

  if (st.hasKey && !st.consent) {
    lines.push({ text: 'Claude inactivo: falta aceptar el aviso de datos en Configuración.', cls: 'warn' });
  } else if (usable.length === 0) {
    lines.push({ text: 'Agrupado en Chrome sin motor: activa "Fallback por dominio" o Gemini Nano en Configuración.', cls: 'err' });
  } else if (usable.length === 1 && usable[0] === 'heuristic') {
    lines.push({ text: `Agrupado en Chrome: por dominio (sin API key ni Gemini Nano).${desktopHint}`, cls: 'muted' });
  }
  if (st.claudeOpen) lines.push({ text: 'Claude en pausa (circuit breaker) por errores repetidos.', cls: 'warn' });
  return lines;
}
