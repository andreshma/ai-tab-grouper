# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · Versionado: [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- `CLAUDE.md` con contexto, invariantes, comandos, lecciones y DoD para trabajar el repo con Claude Code.
- `npm run deploy:local`: copia el runtime a la carpeta que carga Chrome (ID estable, sin `node_modules`).
- `package-lock.json` versionado y `.gitignore`.

### Security
- `web-ext` ^10.8.0 (dev): elimina 3 vulnerabilidades críticas y 5 altas de la cadena de build (`npm audit` 0 high/critical).

## [1.4.1] - 2026-11-20

### Fixed
- Instalador del puente: con `AI_TAB_GROUPER_HOME` definido (instalación aislada, usada por los tests) ya no escribe ni borra la clave `HKCU\…\NativeMessagingHosts` en Windows. Ejecutar `npm test` en Windows reemplazaba el registro real por un manifest temporal con un ID de prueba y dejaba el popup en "Claude Desktop: reconectando…". `doctor` aplica la misma regla.

## [1.4.0] - 2026-11-19

### Added
- Grupo **"Varios"** (gris, plegado) garantiza cobertura en "Agrupar ahora", "Reorganizar todo" y Claude Desktop: las pestañas que ningún tema reclama ya no quedan sueltas. No aplica en modo automático (permite que las sueltas formen grupo después).
- Parámetro `catchAll` en `apply_tab_groups` (default true) para peticiones parciales; respuesta incluye `catchAllGroup`.
- Opción en Configuración para desactivarlo; `doctor` informa pestañas sin grupo y no agrupables en todas las ventanas.

### Changed
- La cobertura ya no depende de que el modelo siga instrucciones (garantía determinista en la extensión).

## [1.3.1] - 2026-11-19

### Fixed
- El popup mostraba "sin motor" (falso negativo) cuando el service worker seguía con la versión anterior tras actualizar archivos; ahora pide recargar la extensión.

## [1.3.0] - 2026-11-19

### Changed
- Claude Desktop agrupa **todas** las pestañas por defecto: instrucciones MCP piden cobertura total, `scope: all` y grupo "Varios" para lo que no encaja.

### Added
- `apply_tab_groups` devuelve `remainingUngroupedTabIds` para que Claude haga una segunda pasada.
- `list_tabs` devuelve `notGroupable` (fijadas y páginas no web) para que Claude pueda explicarlas.

## [1.2.2] - 2026-11-19

### Fixed
- El popup prometía "se usará heurística por dominio" aunque no hubiera ningún proveedor local activo; ahora informa la causa real ("No se agrupó: ningún proveedor disponible…") y cómo resolverla. Lógica extraída a `src/popup/status.js` con tests.

## [1.2.1] - 2026-11-19

### Fixed
- Configuración mostraba "Estado: —" y "Probar conexión" no reseteaba el circuit breaker: la validación de remitente rechazaba la página de opciones por abrirse como pestaña (`sender.tab`). Ahora se valida solo el id y el origen de la extensión.

## [1.2.0] - 2026-11-19

### Added
- Puente con **Claude Desktop** (tu sesión de Claude, sin API key): servidor MCP local + host de native messaging + instalador para Windows/macOS/Linux (`bridge/`, 0 dependencias runtime).
- Tools MCP `list_tabs`, `apply_tab_groups`, `ungroup_tabs` con validación en ambos extremos y salida marcada como no confiable.
- Política `allowDesktopBridge`; estado del puente en popup y configuración.
- `bridge/doctor.mjs`: diagnóstico end-to-end (instalación, Claude Desktop, MCP, Chrome ⇄ extensión) sin exponer contenido de pestañas.
- Plan de prueba E2E para Windows (`docs/E2E_TEST_PLAN_WINDOWS.md`).
- ADR-003; amenazas T11–T15 en el threat model; 72 tests (incluye E2E con procesos reales).

### Changed
- `CONSENT_VERSION` → 2 (nuevo destino de datos): se vuelve a pedir el consentimiento.
- Permiso opcional `nativeMessaging` (solo al activar el puente).
- Launcher del host en Windows como `.bat` (forma documentada por Chrome).

## [1.1.0] - 2026-11-19

### Added
- Política enterprise vía `chrome.storage.managed` (`managed_schema.json`): proveedores permitidos, exclusiones, modelos, BYOK, almacenamiento de key, auto-grouping.
- Modo proxy corporativo: sin API key en el dispositivo; SSO con `credentials: include`.
- Aviso de datos con consentimiento explícito y versionado antes de cualquier envío remoto (Chrome Web Store Disclosure Requirements).
- Tests de integración del service worker con fake de APIs Chrome (43 tests, cobertura 96% líneas).
- Gate `scripts/cws-check.mjs` (27 checks), ESLint con reglas de seguridad, CI (CodeQL, audit, SBOM).
- PRIVACY.md, SECURITY.md, threat model STRIDE/OWASP LLM, ADR-002, guía de despliegue enterprise y ficha de tienda.

### Changed
- La API key se guarda por defecto solo en memoria de sesión; persistir es opt-in.
- CSP estricta: `default-src 'self'`, `object-src 'none'`, `base-uri`/`frame-ancestors 'none'`, sin estilos inline.
- Llamadas a Anthropic con `credentials: 'omit'` y `redirect: 'error'`.

### Security
- Mensajería solo desde páginas propias de la extensión (id + URL + sin tab).
- Eliminación de caracteres bidi/zero-width en nombres de grupo; escaneo Trojan Source en CI.

## [1.0.0] - 2026-11-19

### Added
- Agrupación automática (debounce + throttle) y manual (popup, `Alt+Shift+G`).
- Proveedores: Claude API, Gemini Nano, heurística por dominio; retry/backoff y circuit breaker.
- Redacción de PII, `excludedHosts`, validación de salida, ledger por pestaña.
