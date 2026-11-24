# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic
Versioning](https://semver.org/).

## [Unreleased]

### Added

- `CITATION.cff`, linked from the README (left out of the store package).
- `docs/adr/template.md` for new decision records.
- `docs/runbook.md`: where things are on a machine, health checks, local deploy, bridge operation, logs, upgrading and
  recovery.
- Internationalization ([ADR-0004](docs/adr/0004-internationalization.md)): the interface is available in English
  (default) and Spanish and follows the browser language. Messages live in `_locales/en` and `_locales/es`; the manifest
  name, description and shortcut description are localized too.
- "Automatic (browser language)" option for the group-name language.
- `test/i18n.test.js`: the same keys in every locale, every referenced key exists, no unused message, consistent
  placeholders, store length limits per locale. The Chrome API fake gained `chrome.i18n`, backed by the real catalogues.
- Chrome Web Store gate: checks `default_locale`, that every `__MSG_*__` in the manifest resolves in every locale, the
  name and description limits per locale, and that the locale files are in the package.

### Changed

- **The interface is now English unless the browser is in Spanish.** Spanish wording is unchanged.
- The `language` setting (group names) defaults to `auto` instead of `es`: Spanish browsers keep Spanish names; other
  browsers that never saved the settings now get English names. A saved `es` or `en` is kept.
- The catch-all group is recognized by its title in any supported language ("Misc" or "Varios"), so changing the
  language reuses the existing group instead of creating a second one. Its default title follows the group-name
  language; with no setting and an unsupported language it is now "Misc" (was "Varios").
- The system prompt gives its example group names in English and states the language for new names explicitly;
  instructions to the model were already in English.
- Claude Desktop bridge: the MCP server instructions, tool titles and descriptions, validation errors, and the output of
  `install.mjs` and `doctor.mjs` are in English. Tool names and schemas are unchanged.
- `managed_schema.json`: policy titles and descriptions are in English. Policy keys are unchanged.
- `npm run deploy:local` prints in English and copies `_locales`; `npm run cws:check` prints its justifications in
  English.
- The provider chain reports skipped providers with a `code` (`unavailable`, `breaker-open`) instead of a Spanish
  message that the popup compared against.
- README: Mermaid diagrams (grouping pipeline, Claude Desktop bridge) replace the text diagram; new Why, Usage,
  Components and Configuration sections. The module map and the provider chain with fallback are in
  `docs/architecture.md`.
- `docs/architecture.md` (renamed from `docs/ARCHITECTURE.md`) expanded: scheduling, ledger outcomes, data minimization,
  provider chain, resilience, state, messages and limits, with Mermaid diagrams.
- `docs/DIAGRAMS.md`: the component diagram follows the real call graph; new sequence for the provider chain with
  fallback and a circuit-breaker state diagram.
- `docs/USAGE.md`: the settings table lists every setting.
- Documentation restructured to a shared standard, with no change of substance: fixed section sets and order in the
  README, `docs/architecture.md`, `docs/DIAGRAMS.md`, `docs/USAGE.md`, `docs/TESTING.md`, `docs/THREAT_MODEL.md`,
  `CONTRIBUTING.md` and `SECURITY.md`; decision records use the MADR headings (`# NNNN. Title`, status and date lines,
  context and problem statement, decision drivers, considered options, decision, consequences); every diagram is Mermaid
  (the text diagrams of the threat model and of `bridge/README.md` were converted) and `docs/DIAGRAMS.md` is the
  complete catalogue; prose wraps at 120 columns.

### Fixed

- `src/lib/resilience.js`: the circuit-breaker comment promised a single trial call after the cooldown; it now describes
  what the code does (calls pass again until one fails). No behavior change.
- `.gitignore`: local tool telemetry (`telemetry.jsonl`) is ignored.
- Bridge host: the Unix socket is created with a restrictive umask, so it is never wider than 0600, not even between
  bind and chmod. The test that checks it now waits for the host to be ready (it failed intermittently in CI).

## [1.4.2] - 2026-11-20

First public release. Fixes the three medium findings of the [adversarial review](docs/ADVERSARIAL_REVIEW.md).

### Added

- `npm run deploy:local`: copies the runtime to the folder Chrome loads (stable ID, no `node_modules`).
- `package-lock.json` under version control, and `.gitignore`.
- Open-source project files: Apache-2.0 `LICENSE` and `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`, `SUPPORT.md`, `RELEASING.md`, issue and pull request templates, `CODEOWNERS`, Dependabot,
  `.editorconfig`, `.gitattributes` and a pre-commit configuration.
- `docs/USAGE.md` (user manual), `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`, `docs/TESTING.md`,
  `docs/ADVERSARIAL_REVIEW.md` and an index of the decision records.
- `Makefile` wrapping the npm scripts.
- CI runs the test suite on Windows as well as Linux.

### Changed

- All documentation is now in English; the extension interface stays in Spanish.
- `PRIVACY.md` corrected to match the code: existing group names are sent, preferences use Chrome Sync, numbers are
  masked from 5 digits, and removing the bridge needs its uninstaller.
- Vulnerabilities are reported through GitHub private vulnerability reporting instead of an email address.
- Decision records renamed to `docs/adr/000N-*.md`; the threat model moved to `docs/THREAT_MODEL.md`.
- CodeQL runs in its own workflow, also for the workflow files, weekly and on every pull request; CI actions updated and
  pinned by commit SHA.

### Security

- A tab whose title is just its address (pages without a `<title>`) is now sent without a title: the title carried the
  query string and fragment that the path handling drops (AR-01).
- The title of a tab group that holds a tab on an excluded host is no longer sent to the Claude API, the proxy or the
  Claude Desktop bridge; the local fallback names such groups after the host (AR-02).
- Redaction scans a bounded amount of text and the email pattern has bounded quantifiers: a page could stall the service
  worker with a very long title or path (AR-03).
- `web-ext` ^10.8.0 (dev): removes 3 critical and 5 high vulnerabilities from the build chain (`npm audit` 0
  high/critical).

## [1.4.1] - 2026-11-20

### Fixed

- Bridge installer: when `AI_TAB_GROUPER_HOME` is set (isolated install, used by the tests) it no longer writes or
  deletes the `HKCU\...\NativeMessagingHosts` key on Windows. Running `npm test` on Windows replaced the real registry
  entry with a temporary manifest carrying a test ID and left the popup at "Claude Desktop: reconectando…" ("Claude
  Desktop: reconnecting..."). `doctor` applies the same rule.
- `npm run cws:check` no longer depends on the `unzip` binary (missing on Windows): it reads the zip central directory
  with Node, with no dependencies.
- Bridge tests are portable to Windows (path separator and POSIX permissions).

## [1.4.0] - 2026-11-19

### Added

- The **"Varios"** ("Miscellaneous") group (grey, collapsed) guarantees coverage in "Agrupar ahora" ("Group now"),
  "Reorganizar todo" ("Reorganize all") and Claude Desktop: tabs that no topic claims are no longer left ungrouped. It
  does not apply in automatic mode (so that ungrouped tabs can form a group later).
- `catchAll` parameter in `apply_tab_groups` (default true) for partial requests; the response includes `catchAllGroup`.
- Option in "Configuración" ("Settings") to turn it off; `doctor` reports ungrouped and non-groupable tabs across all
  windows.

### Changed

- Coverage no longer depends on the model following instructions (deterministic guarantee in the extension).

## [1.3.1] - 2026-11-19

### Fixed

- The popup showed "sin motor" ("no engine", a false negative) when the service worker was still running the previous
  version after the files were updated; it now asks you to reload the extension.

## [1.3.0] - 2026-11-19

### Changed

- Claude Desktop groups **all** tabs by default: the MCP instructions ask for full coverage, `scope: all` and a "Varios"
  ("Miscellaneous") group for whatever does not fit.

### Added

- `apply_tab_groups` returns `remainingUngroupedTabIds` so that Claude can make a second pass.
- `list_tabs` returns `notGroupable` (pinned tabs and non-web pages) so that Claude can explain them.

## [1.2.2] - 2026-11-19

### Fixed

- The popup promised "se usará heurística por dominio" ("the domain heuristic will be used") even when no local provider
  was enabled; it now reports the real cause ("No se agrupó: ningún proveedor disponible…", "Not grouped: no provider
  available...") and how to fix it. Logic extracted to `src/popup/status.js`, with tests.

## [1.2.1] - 2026-11-19

### Fixed

- "Configuración" ("Settings") showed "Estado: —" ("Status: —") and "Probar conexión" ("Test connection") did not reset
  the circuit breaker: sender validation rejected the options page because it opens as a tab (`sender.tab`). Now only
  the extension id and origin are validated.

## [1.2.0] - 2026-11-19

### Added

- Bridge to **Claude Desktop** (your Claude session, no API key): local MCP server + native messaging host + installer
  for Windows/macOS/Linux (`bridge/`, 0 runtime dependencies).
- MCP tools `list_tabs`, `apply_tab_groups`, `ungroup_tabs`, validated at both ends and with output marked as untrusted.
- `allowDesktopBridge` policy; bridge status in the popup and in settings.
- `bridge/doctor.mjs`: end-to-end diagnostics (installation, Claude Desktop, MCP, Chrome ⇄ extension) without exposing
  tab content.
- E2E test plan for Windows (`docs/E2E_TEST_PLAN_WINDOWS.md`).
- [ADR-0003](docs/adr/0003-claude-desktop-mcp-bridge.md); threats T11–T15 in the [threat model](docs/THREAT_MODEL.md);
  72 tests (including E2E with real processes).

### Changed

- `CONSENT_VERSION` → 2 (new data destination): consent is requested again.
- Optional `nativeMessaging` permission (requested only when the bridge is enabled).
- Host launcher on Windows as a `.bat` (the form documented by Chrome).

## [1.1.0] - 2026-11-19

### Added

- Enterprise policy through `chrome.storage.managed` (`managed_schema.json`): allowed providers, exclusions, models,
  BYOK, key storage, auto-grouping.
- Corporate proxy mode: no API key on the device; SSO with `credentials: include`.
- Data notice with explicit, versioned consent before any remote transmission (Chrome Web Store Disclosure
  Requirements).
- Service worker integration tests with a fake of the Chrome APIs (43 tests, 96% line coverage).
- `scripts/cws-check.mjs` gate (27 checks), ESLint with security rules, CI (CodeQL, audit, SBOM).
- PRIVACY.md, SECURITY.md, STRIDE/OWASP LLM threat model, [ADR-0002](docs/adr/0002-enterprise-hardening.md), enterprise
  deployment guide and store listing.

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
