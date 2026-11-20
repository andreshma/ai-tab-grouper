# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `npm run deploy:local`: copies the runtime to the folder Chrome loads (stable ID, no `node_modules`).
- `package-lock.json` under version control, and `.gitignore`.
- Open-source project files: Apache-2.0 `LICENSE` and `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SUPPORT.md`, `RELEASING.md`, issue and pull request templates, `CODEOWNERS`, Dependabot, `.editorconfig`, `.gitattributes` and a pre-commit configuration.
- `docs/USAGE.md` (user manual), `docs/ARCHITECTURE.md`, `docs/TESTING.md` and an index of the decision records.
- CI runs the test suite on Windows as well as Linux.

### Changed
- All documentation is now in English; the extension interface stays in Spanish.
- Vulnerabilities are reported through GitHub private vulnerability reporting instead of an email address.
- Decision records renamed to `docs/adr/000N-*.md`; the threat model moved to `docs/THREAT_MODEL.md`.
- CodeQL runs in its own workflow, also for the workflow files, weekly and on every pull request; CI actions updated and pinned by commit SHA.

### Security
- `web-ext` ^10.8.0 (dev): removes 3 critical and 5 high vulnerabilities from the build chain (`npm audit` 0 high/critical).

## [1.4.1] - 2026-11-20

### Fixed
- Bridge installer: when `AI_TAB_GROUPER_HOME` is set (isolated install, used by the tests) it no longer writes or deletes the `HKCU\...\NativeMessagingHosts` key on Windows. Running `npm test` on Windows replaced the real registry entry with a temporary manifest carrying a test ID and left the popup at "Claude Desktop: reconectando…" ("Claude Desktop: reconnecting..."). `doctor` applies the same rule.
- `npm run cws:check` no longer depends on the `unzip` binary (missing on Windows): it reads the zip central directory with Node, with no dependencies.
- Bridge tests are portable to Windows (path separator and POSIX permissions).

## [1.4.0] - 2026-11-19

### Added
- The **"Varios"** ("Miscellaneous") group (grey, collapsed) guarantees coverage in "Agrupar ahora" ("Group now"), "Reorganizar todo" ("Reorganize all") and Claude Desktop: tabs that no topic claims are no longer left ungrouped. It does not apply in automatic mode (so that ungrouped tabs can form a group later).
- `catchAll` parameter in `apply_tab_groups` (default true) for partial requests; the response includes `catchAllGroup`.
- Option in "Configuración" ("Settings") to turn it off; `doctor` reports ungrouped and non-groupable tabs across all windows.

### Changed
- Coverage no longer depends on the model following instructions (deterministic guarantee in the extension).

## [1.3.1] - 2026-11-19

### Fixed
- The popup showed "sin motor" ("no engine", a false negative) when the service worker was still running the previous version after the files were updated; it now asks you to reload the extension.

## [1.3.0] - 2026-11-19

### Changed
- Claude Desktop groups **all** tabs by default: the MCP instructions ask for full coverage, `scope: all` and a "Varios" ("Miscellaneous") group for whatever does not fit.

### Added
- `apply_tab_groups` returns `remainingUngroupedTabIds` so that Claude can make a second pass.
- `list_tabs` returns `notGroupable` (pinned tabs and non-web pages) so that Claude can explain them.

## [1.2.2] - 2026-11-19

### Fixed
- The popup promised "se usará heurística por dominio" ("the domain heuristic will be used") even when no local provider was enabled; it now reports the real cause ("No se agrupó: ningún proveedor disponible…", "Not grouped: no provider available...") and how to fix it. Logic extracted to `src/popup/status.js`, with tests.

## [1.2.1] - 2026-11-19

### Fixed
- "Configuración" ("Settings") showed "Estado: —" ("Status: —") and "Probar conexión" ("Test connection") did not reset the circuit breaker: sender validation rejected the options page because it opens as a tab (`sender.tab`). Now only the extension id and origin are validated.

## [1.2.0] - 2026-11-19

### Added
- Bridge to **Claude Desktop** (your Claude session, no API key): local MCP server + native messaging host + installer for Windows/macOS/Linux (`bridge/`, 0 runtime dependencies).
- MCP tools `list_tabs`, `apply_tab_groups`, `ungroup_tabs`, validated at both ends and with output marked as untrusted.
- `allowDesktopBridge` policy; bridge status in the popup and in settings.
- `bridge/doctor.mjs`: end-to-end diagnostics (installation, Claude Desktop, MCP, Chrome ⇄ extension) without exposing tab content.
- E2E test plan for Windows (`docs/E2E_TEST_PLAN_WINDOWS.md`).
- [ADR-0003](docs/adr/0003-claude-desktop-mcp-bridge.md); threats T11–T15 in the [threat model](docs/THREAT_MODEL.md); 72 tests (including E2E with real processes).

### Changed
- `CONSENT_VERSION` → 2 (new data destination): consent is requested again.
- Optional `nativeMessaging` permission (requested only when the bridge is enabled).
- Host launcher on Windows as a `.bat` (the form documented by Chrome).

## [1.1.0] - 2026-11-19

### Added
- Enterprise policy through `chrome.storage.managed` (`managed_schema.json`): allowed providers, exclusions, models, BYOK, key storage, auto-grouping.
- Corporate proxy mode: no API key on the device; SSO with `credentials: include`.
- Data notice with explicit, versioned consent before any remote transmission (Chrome Web Store Disclosure Requirements).
- Service worker integration tests with a fake of the Chrome APIs (43 tests, 96% line coverage).
- `scripts/cws-check.mjs` gate (27 checks), ESLint with security rules, CI (CodeQL, audit, SBOM).
- PRIVACY.md, SECURITY.md, STRIDE/OWASP LLM threat model, [ADR-0002](docs/adr/0002-enterprise-hardening.md), enterprise deployment guide and store listing.

### Changed
- The API key is kept only in session memory by default; persisting it is opt-in.
- Strict CSP: `default-src 'self'`, `object-src 'none'`, `base-uri`/`frame-ancestors 'none'`, no inline styles.
- Calls to Anthropic use `credentials: 'omit'` and `redirect: 'error'`.

### Security
- Messaging only from the extension's own pages (id + URL + no tab).
- Bidi/zero-width characters are stripped from group names; Trojan Source scan in CI.

## [1.0.0] - 2026-11-19

### Added
- Automatic grouping (debounce + throttle) and manual grouping (popup, `Alt+Shift+G`).
- Providers: Claude API, Gemini Nano, domain heuristic; retry/backoff and circuit breaker.
- PII redaction, `excludedHosts`, output validation, per-tab ledger.
