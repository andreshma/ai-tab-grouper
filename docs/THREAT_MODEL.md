# Threat Model — AI Tab Grouper (STRIDE + OWASP LLM Top 10)

_Versión 1.1.0 · 2026-11-19_

## Activos

| Activo | Clasificación |
|---|---|
| Títulos/URLs de pestañas (actividad de navegación) | Confidencial (puede contener PII, datos de negocio) |
| API key de Anthropic (BYOK) | Secreto |
| Integridad de la organización de pestañas | Baja |

## Trust boundaries

```
[Páginas web] ──títulos/URLs (no confiable)──► [Service worker] ──HTTPS──► [api.anthropic.com | Proxy corp]
                                                   ▲      │
                              [Popup/Options] ─────┘      └──► chrome.tabGroups
                              [Política TI (managed storage, confiable)]
```

## Amenazas y controles

| # | STRIDE / OWASP | Amenaza | Control | Riesgo residual |
|---|---|---|---|---|
| T1 | Information disclosure · LLM02 | Fuga de PII/tokens en URLs hacia el proveedor | Sin query/fragment; redacción email/ID/UUID/números; `sendPath` off por política; `excludedHosts` locales; consentimiento versionado | Bajo: títulos pueden contener datos sensibles → `excludedHosts` / Nano / `allowedProviders` |
| T2 | Information disclosure | Robo de API key desde el perfil | Default `storage.session` (memoria); política `apiKeyStorage=session` o `proxyEndpoint` (key fuera del equipo); `credentials:'omit'` hacia Anthropic | Bajo con proxy; Medio con BYOK persistente (opt-in) |
| T3 | Tampering · LLM01 | Prompt injection vía título de página | Delimitador `<tabs>` con `<` escapado; system prompt "datos, no instrucciones"; `tool_choice` forzado; `normalizeResult` (ids conocidos, nombre saneado, bidi/zero-width eliminados, color whitelist) | Bajo: peor caso, nombre/agrupación incorrecta; sin acciones destructivas posibles |
| T4 | Elevation of privilege | Página/otra extensión invoca acciones del SW | Sin content scripts ni `externally_connectable`; `isTrustedSender` (id + origen de la extensión) | Muy bajo |
| T5 | Tampering | Código remoto / XSS en páginas de extensión | CSP estricta; sin `innerHTML`; ESLint + `cws-check` bloquean sinks | Muy bajo |
| T6 | Spoofing | Proxy falso / MITM | Proxy solo desde managed storage (TI), solo HTTPS sin credenciales embebidas; `redirect:'error'` | Bajo |
| T7 | DoS · LLM10 | Costo descontrolado / rate limit | Debounce, throttle por ventana, `maxTabsPerRequest`, retry acotado, circuit breaker | Bajo |
| T8 | Repudiation | Sin trazabilidad de qué se envió | Proxy corporativo centraliza auditoría/DLP; la extensión no loguea datos de pestañas | Bajo con proxy |
| T9 | Supply chain | Dependencia comprometida | 0 deps runtime; lockfile; `npm audit`; SBOM; CodeQL; Trojan Source scan | Bajo |
| T10 | LLM05/LLM06 | Output del modelo ejecuta acciones | Única acción posible: `tabs.group`/`tabGroups.update` sobre ids validados | Muy bajo |

### Puente Claude Desktop (v1.2.0)

| # | STRIDE / OWASP | Amenaza | Control | Riesgo residual |
|---|---|---|---|---|
| T11 | Tampering · LLM01 (indirecta) | Título malicioso instruye a Claude Desktop a usar **otras** herramientas (email, archivos) | Salida `list_tabs` marcada "no confiable" y delimitada con `<` escapado; instrucciones del servidor MCP; la extensión no expone contenido de páginas; HITL del cliente en tools sensibles | **Medio**: depende de la robustez del modelo y de qué otros MCP tenga el usuario. Recomendar aprobación manual de herramientas en Claude Desktop |
| T12 | Spoofing / EoP | Otro proceso local se conecta al pipe/socket y lee pestañas | Token 256-bit efímero (archivo 0600 en dir 0700), comparación en tiempo constante, socket 0600, borrado al cerrar | Bajo (mismo usuario = mismo trust boundary) |
| T13 | Spoofing | Otra extensión/app lanza el host | `allowed_origins` = solo este ID; registro en HKCU/perfil del usuario | Muy bajo |
| T14 | Tampering | Claude envía ids arbitrarios / ventanas ajenas | Validación en MCP y en extensión; solo ids elegibles (no pinned, http(s), no excluidos) | Muy bajo |
| T15 | DoS | Mensajes enormes / flood | Límites: 1 MB host→Chrome, 8 MB Chrome→host, 4 MB por línea IPC, 8 clientes, timeouts 15-20 s, máx. 200 pestañas | Bajo |

## Decisiones de riesgo aceptado

- BYOK persistente (`storage.local`) es opt-in del usuario y deshabilitable por política. Ver ADR-002.
- `connect-src https:` en CSP para permitir el proxy configurable; compensado porque el endpoint solo puede venir de política gestionada y no hay código remoto.

## Revisión

Revisar en cada cambio de: datos enviados (→ bump `CONSENT_VERSION`), permisos, proveedores o CSP.
