# AI Tab Grouper

Extensión Chrome (Manifest V3) que agrupa pestañas por **tema/tarea** con IA — automático al navegar o manual (popup / `Alt+Shift+G`). Lista para Chrome Web Store y despliegue enterprise gestionado.

## Arquitectura

```
tabs.onUpdated(complete) ─► debounce ─► throttle/ventana ─► lock/ventana
        │
        ▼
 ledger ─► redact (PII) ─► política TI + consentimiento ─► Provider chain ─► normalizeResult ─► tabGroups
                                                           │
                    Claude (BYOK directo │ proxy corporativo) ─fallo/CB─► Gemini Nano ─► Heurística dominio
```

| Módulo | Responsabilidad |
|---|---|
| `src/background.js` | Service worker: eventos, scheduling, locking, mensajería con validación de remitente |
| `src/lib/config.js` | Settings, **política gestionada** (`applyPolicy`), consentimiento, almacenamiento de key |
| `src/lib/classifier.js` | Cadena de proveedores + circuit breaker (deps inyectadas) |
| `src/lib/providers/claude.js` | Messages API con `tool_choice` forzado; modo BYOK o proxy (sin key) |
| `src/lib/providers/nano.js` | Prompt API on-device con `responseConstraint` |
| `src/lib/heuristic.js` | Fallback offline por eTLD+1 |
| `src/lib/redact.js` · `validate.js` | Minimización de entrada · validación de salida del modelo |
| `src/lib/resilience.js` | Retry con jitter + `retry-after`; breaker persistido |
| `src/lib/ledger.js` | No re-agrupa lo que el usuario sacó de un grupo |

**Claude Desktop con tu sesión (sin API key):** puente MCP local en [`bridge/`](bridge/README.md) — `node bridge/install.mjs --extension-id <ID> --configure-claude`, luego pide a Claude "organiza mis pestañas de Chrome".

Decisiones: [ADR-001](docs/adr/ADR-001-hybrid-ai-provider.md) · [ADR-002](docs/adr/ADR-002-enterprise-hardening.md) · [ADR-003](docs/adr/ADR-003-claude-desktop-mcp-bridge.md) · Seguridad: [SECURITY.md](SECURITY.md) · [Threat model](docs/security/THREAT_MODEL.md) · Privacidad: [PRIVACY.md](PRIVACY.md)

## Setup (desarrollo)

1. `chrome://extensions` → Developer mode → **Load unpacked** → esta carpeta.
2. Configuración: acepta el aviso de datos → pega tu API key → **Probar conexión** → **Guardar**.

Sin key ni Nano funciona con la heurística por dominio (nada sale del equipo).

## Configuración

| Clave | Default | Dónde | Notas |
|---|---|---|---|
| `claudeApiKey` | — | `storage.session` (default) / `storage.local` (opt-in) | Nunca sincronizada; ignorada en modo proxy |
| `consentVersion` | `0` | sync | Sin consentimiento vigente no hay llamadas remotas |
| `claudeModel` | `claude-haiku-5-5` | sync | Restringible por `allowedModels` |
| `preferOnDevice` / `autoGroup` / `sendPath` | `false` / `true` / `true` | sync | |
| `excludedHosts` | `[]` | sync + política | Nunca salen del dispositivo |
| `minGroupSize` · `debounceMs` · `minIntervalMs` · `maxTabsPerRequest` | 2 · 2000 · 10000 · 60 | sync | Control de calidad/costo |

**Política enterprise** (`managed_schema.json`): `allowedProviders`, `excludedHosts`, `forbidPathSending`, `disableAutoGroup`, `allowUserApiKey`, `apiKeyStorage`, `allowedModels`, `proxyEndpoint`. Guía: [docs/ENTERPRISE_DEPLOYMENT.md](docs/ENTERPRISE_DEPLOYMENT.md).

## Calidad y pre-publicación

```bash
npm ci
npm run prepublish:cws   # lint → test+coverage → audit → package → cws:check
```

| Stage | Herramienta | Gate |
|---|---|---|
| Lint + reglas de seguridad | ESLint (no eval / no sinks HTML) | 0 errores |
| Unit + integración + E2E puente | `node:test`: fake de APIs Chrome (SW completo) + procesos reales MCP⇄host | 71 tests |
| Cobertura | c8 (`src/lib`, `background.js`) | líneas ≥85 · ramas ≥75 · funciones ≥85 |
| SCA | `npm audit` + dependency-review | 0 high/critical · 0 deps runtime |
| SAST | CodeQL `security-extended` (CI) | sin alertas |
| Política CWS | `scripts/cws-check.mjs` | 28 checks (permisos, CSP, código remoto, iconos, zip, privacy) |
| SBOM | `npm sbom` CycloneDX | artefacto |

CI: `.github/workflows/ci.yml`.

### Smoke manual (no automatizable sin navegador real)

1. Load unpacked → se abre Configuración; sin errores en *Service worker → Inspect*.
2. Sin key: abrir 2+ pestañas de github.com y 2 de docs.google.com → se agrupan por dominio.
3. Aceptar aviso + key → **Probar conexión** = OK → abrir pestañas de un mismo tema en sitios distintos → grupo temático.
4. Sacar una pestaña de un grupo → no vuelve a agruparse sola.
5. Popup: Agrupar / Reorganizar / Desagrupar; `Alt+Shift+G`.
6. Desmarcar "Recordar key" → reiniciar Chrome → la key ya no está.
7. Con política de prueba (`chrome://policy`) → campos bloqueados y banner "Gestionado".
8. Gemini Nano: en hardware compatible, estado *Disponible* y proveedor "Gemini Nano (local)" con `preferOnDevice`.

## Runbook

| Síntoma | Causa probable | Acción |
|---|---|---|
| "Claude en pausa (circuit breaker)" | 3 fallos seguidos (401/429/5xx) | Configuración → Probar conexión (resetea); revisar key/proxy; auto-recupera en 5 min |
| "Claude inactivo: falta aceptar el aviso" | `consentVersion` desactualizado | Aceptar aviso y guardar |
| Siempre heurística | Sin key/proxy, Nano no disponible o política `allowedProviders` | Ver `chrome://policy` y Configuración |
| Error CORS en modo proxy | Proxy no permite `chrome-extension://<ID>` con credenciales | Ver contrato en ENTERPRISE_DEPLOYMENT.md |
| La key desaparece al reiniciar | Comportamiento por defecto (sesión) o política `apiKeyStorage=session` | Marcar "Recordar" si la política lo permite |
| Logs | — | `chrome://extensions` → Service worker → Inspect (no se registran datos de pestañas) |

## Limitaciones conocidas

- `LanguageModel` en service worker depende de la versión de Chrome; si no está, Nano se omite.
- Ledger en `storage.session`: se pierde al reiniciar el navegador.
- Pestañas > `maxTabsPerRequest` se procesan en la siguiente ejecución.
