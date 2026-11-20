# Testing

## Commands

```bash
npm run lint              # ESLint with security rules
npm test                  # extension + bridge
npm run test:coverage     # same suites with coverage gates
npm run prepublish:cws    # lint → coverage → audit → package → CWS policy gate
```

## Quality gates

| Stage | Tool | Gate |
|---|---|---|
| Lint and security rules | ESLint (no `eval`, no HTML sinks) | 0 errors |
| Trojan Source | `grep` for bidirectional and zero-width characters | no matches |
| Unit, integration and bridge end-to-end | `node:test` | all pass, on Linux and Windows |
| Coverage | c8 (`src/lib`, `src/background.js`, `bridge/src`, `bridge/install.mjs`) | lines ≥ 85 · branches ≥ 75 · functions ≥ 85 |
| Supply chain | `npm audit`, dependency review on pull requests | 0 high or critical · 0 runtime dependencies |
| Static analysis | CodeQL (`security-and-quality`) | no alerts |
| Chrome Web Store policy | `scripts/cws-check.mjs` | 28 checks: permissions, CSP, remote code, icons, zip contents, privacy policy |
| SBOM | `npm sbom` (CycloneDX) | artifact |

CI runs these in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and
[`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml).

## What the suites cover

- **`test/unit.test.js`** — redaction, validation of model output, heuristic,
  prompt escaping, retry and circuit breaker, providers, policy, popup status.
- **`test/integration.test.js`** — the whole service worker against a fake of
  the Chrome APIs (`test/helpers/chrome-fake.js`): consent, sender validation,
  automatic and manual grouping, fallbacks, enterprise policy, the bridge
  handlers and the catch-all group.
- **`test/zip-list.test.js`** — the zip reader used by the store policy gate.
- **`bridge/test/bridge.test.js`** — protocol framing, the MCP contract, the
  installer, an end-to-end run with real MCP and native-host processes, and
  the doctor.

Tests that install the bridge run in a sandboxed home directory
(`AI_TAB_GROUPER_HOME`) and never touch the real native-messaging registration
(on Windows, the `HKCU` registry key).

## Testing on a real machine

The repository folder and the folder Chrome loads are different on purpose.

1. `npm run deploy:local` copies the runtime to `~/ai-tab-grouper` (override
   with `ATG_DEPLOY_DIR`).
2. Reload the extension in `chrome://extensions`. The service worker keeps
   running the old code until you do; the popup does not, which shows up as a
   "half-updated extension" warning.
3. If `bridge/src` changed, quit Claude Desktop completely, open it again and
   start a new chat. Sessions started earlier do not see new MCP tools.
4. Run `node bridge/doctor.mjs` from the deployed folder: every line must be
   `PASS`, and the popup must show "Claude Desktop: conectado" (connected).

The full manual plan for Windows is in
[E2E_TEST_PLAN_WINDOWS.md](E2E_TEST_PLAN_WINDOWS.md).

## Manual smoke test

These need a real browser:

1. Load unpacked: the options page opens and the service worker console shows
   no errors.
2. Without an API key: open two or more tabs of the same site and two of
   another. They are grouped by domain.
3. Accept the data notice, add a key, "Probar conexión" (test connection)
   reports OK. Tabs about one topic on different sites form a topic group.
4. Pull a tab out of a group: it is not regrouped on its own.
5. Popup: "Agrupar ahora" (group now), "Reorganizar todo" (reorganize all),
   "Desagrupar" (ungroup); the `Alt+Shift+G` shortcut.
6. With the key not remembered, restart Chrome: the key is gone.
7. With a test policy (`chrome://policy`): locked fields and the "managed by
   your organization" banner.
8. Gemini Nano, on supported hardware: status "available" and the provider
   "Gemini Nano (local)" when on-device is preferred.
