# Testing

The suites need no browser: they run with `node:test` against a fake of the Chrome APIs and against real MCP and
native-host processes, on Linux and Windows.

## Contents

- [Commands](#commands)
- [What the suites cover](#what-the-suites-cover)
- [What is not covered](#what-is-not-covered)
- [Static checks](#static-checks)
- [Continuous integration](#continuous-integration)
- [Manual checks](#manual-checks)
- [Before opening a pull request](#before-opening-a-pull-request)

## Commands

```bash
npm run lint              # ESLint with security rules
npm test                  # extension + bridge
npm run test:coverage     # same suites with coverage gates
npm run prepublish:cws    # lint → coverage → audit → package → CWS policy gate
```

`make check` runs the same full gate as `npm run prepublish:cws`. The bridge suite alone, from `bridge/`:

```bash
node --test "test/**/*.test.js"   # protocol, contract, MCP, installer, E2E with real processes
```

## What the suites cover

| Suite | Covers |
|---|---|
| `test/unit.test.js` | Redaction, validation of model output, heuristic, prompt escaping and language, retry and circuit breaker, providers, policy, popup status (English and Spanish), catch-all recognition across languages |
| `test/integration.test.js` | The whole service worker against a fake of the Chrome APIs (`test/helpers/chrome-fake.js`): consent, sender validation, automatic and manual grouping, fallbacks, enterprise policy, the bridge handlers and the catch-all group |
| `test/i18n.test.js` | The localization contract: the same keys in every locale, every key referenced in the manifest, HTML and JS exists, no unused message, consistent placeholders and inline markup, language resolution and the page localizer |
| `test/zip-list.test.js` | The zip reader used by the store policy gate, and what the package script ships |
| `bridge/test/bridge.test.js` | Protocol framing, the MCP contract, the installer, an end-to-end run with real MCP and native-host processes, and the doctor |

Tests that install the bridge run in a sandboxed home directory (`AI_TAB_GROUPER_HOME`) and never touch the real
native-messaging registration (on Windows, the `HKCU` registry key).

| Gate | Tool | Threshold |
|---|---|---|
| Unit, integration and bridge end-to-end | `node:test` | all pass, on Linux and Windows |
| Coverage | c8 (`src/lib`, `src/background.js`, `bridge/src`, `bridge/install.mjs`) | lines ≥ 85 · branches ≥ 75 · functions ≥ 85 |

## What is not covered

- **A real browser.** Nothing in the automated suites runs in Chrome: the Chrome APIs are a fake. Loading the extension,
  the popup, the options page, the shortcut and the `chrome://policy` behavior are [manual checks](#manual-checks).
- **Gemini Nano.** The on-device model needs supported hardware and a Chrome build that exposes it; it is checked by
  hand (step 8 of the [manual smoke test](#manual-smoke-test)).
- **Claude Desktop.** The bridge end-to-end test uses real MCP and native-host processes, not Claude Desktop itself. The
  Windows plan covers it; its cases TC-05 (confirmation before ungrouping) and TC-10 (prompt injection) have not been
  executed (see the [adversarial review](ADVERSARIAL_REVIEW.md#suggested-order)).
- **Coverage gates outside the measured paths.** c8 measures `src/lib`, `src/background.js`, `bridge/src` and
  `bridge/install.mjs` only.
- **What the adversarial review could not verify**, listed in
  [ADVERSARIAL_REVIEW.md](ADVERSARIAL_REVIEW.md#what-was-not-verified).

## Static checks

| Stage | Tool | Gate |
|---|---|---|
| Lint and security rules | ESLint (no `eval`, no HTML sinks) | 0 errors |
| Trojan Source | `grep` for bidirectional and zero-width characters | no matches |
| Supply chain | `npm audit`, dependency review on pull requests | 0 high or critical · 0 runtime dependencies |
| Static analysis | CodeQL (`security-and-quality`) | no alerts |
| Chrome Web Store policy | `scripts/cws-check.mjs` | 34 checks: locales, permissions, CSP, remote code, icons, zip contents, privacy policy |

## Continuous integration

CI runs the gates in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and
[`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml), on pushes to `main` and `develop` and on every pull
request. CodeQL also runs weekly.

| Job | Runs on | What it does |
|---|---|---|
| `lint` | Ubuntu | `npm run lint` and the Trojan Source scan |
| `sca` | Ubuntu | `npm run audit:deps`; dependency review on pull requests |
| `test` | Ubuntu and Windows, Node.js 22 | `npm run test:coverage` (the suites with the coverage gates); uploads the coverage report |
| `build` | Ubuntu | `npm run package`, the Chrome Web Store policy gate (`npm run cws:check`) and `npm run sbom`; uploads `dist/` |
| CodeQL | Ubuntu | Analyzes `javascript-typescript` and `actions` with `security-and-quality` |

The SBOM (`npm sbom`, CycloneDX) is published as an artifact of the `build` job; it is not a gate.

## Manual checks

### Testing on a real machine

The repository folder and the folder Chrome loads are different on purpose.

1. `npm run deploy:local` copies the runtime to `~/ai-tab-grouper` (override with `ATG_DEPLOY_DIR`).
2. Reload the extension in `chrome://extensions`. The service worker keeps running the old code until you do; the popup
   does not, which shows up as a "half-updated extension" warning.
3. If `bridge/src` changed, quit Claude Desktop completely, open it again and start a new chat. Sessions started earlier
   do not see new MCP tools.
4. Run `node bridge/doctor.mjs` from the deployed folder: every line must be `PASS`, and the popup must show "Claude
   Desktop: connected".

The full manual plan for Windows is in [E2E_TEST_PLAN_WINDOWS.md](E2E_TEST_PLAN_WINDOWS.md).

### Manual smoke test

These need a real browser:

1. Load unpacked: the options page opens and the service worker console shows no errors.
2. Without an API key: open two or more tabs of the same site and two of another. They are grouped by domain.
3. Accept the data notice, add a key, "Test connection" reports OK. Tabs about one topic on different sites form a topic
   group.
4. Pull a tab out of a group: it is not regrouped on its own.
5. Popup: "Group now", "Reorganize all", "Ungroup"; the `Alt+Shift+G` shortcut.
6. With the key not remembered, restart Chrome: the key is gone.
7. With a test policy (`chrome://policy`): locked fields and the "managed by your organization" banner.
8. Gemini Nano, on supported hardware: status "available" and the provider "Gemini Nano (on-device)" when on-device is
   preferred.
9. With Chrome in Spanish (`chrome://settings/languages`, then restart): the popup, the options page and the shortcut
   description are in Spanish, and leftover tabs still join an existing "Misc" group instead of creating "Varios".

## Before opening a pull request

The full list is in [CONTRIBUTING.md](../CONTRIBUTING.md#workflow); the checks are:

1. Add tests that cover the change, and a regression test when it fixes a bug.
2. Run the full gate: `npm run prepublish:cws`.
3. Run the Trojan Source scan; it must print nothing:

   ```bash
   grep -rnP "[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]" src test scripts bridge
   ```

4. When the change touches Chrome behavior or the bridge, check it on a real machine: `npm run deploy:local`, reload the
   extension, `node bridge/doctor.mjs`.
