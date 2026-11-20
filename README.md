# AI Tab Grouper

[![CI](https://github.com/andreshma/ai-tab-grouper/actions/workflows/ci.yml/badge.svg)](https://github.com/andreshma/ai-tab-grouper/actions/workflows/ci.yml)
[![CodeQL](https://github.com/andreshma/ai-tab-grouper/actions/workflows/codeql.yml/badge.svg)](https://github.com/andreshma/ai-tab-grouper/actions/workflows/codeql.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
![Chrome MV3](https://img.shields.io/badge/chrome-Manifest%20V3-blue)
![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![Status: beta](https://img.shields.io/badge/status-beta-orange)

A Chrome extension (Manifest V3) that groups your tabs by **topic or task**,
automatically while you browse or on demand from the popup or `Alt+Shift+G`.

It uses a chain of three engines and falls back on its own: the **Claude API**
with your own key, **Gemini Nano** running on-device, and an offline **domain
heuristic**. An optional local **MCP bridge** lets **Claude Desktop** list and
group your tabs with your Claude session, with no API key.

> 🔒 **Consent and minimization.** Nothing leaves your device until you accept
> the data notice. Then only the title, the host and (optionally) a redacted
> path of each tab are sent — never query strings, fragments, page content or
> cookies. Hosts you exclude never leave the device. Without a key the
> extension still works, fully offline, by domain.
>
> 🇪🇸 **The interface is in Spanish.** The documentation is in English and
> quotes each label with its meaning.

📖 **New here? Start with the [User Manual](docs/USAGE.md)**: install, first
run, the Claude Desktop bridge, settings and troubleshooting.

## Contents

- [Quickstart](#quickstart) · [How it works](#how-it-works) · [Claude Desktop bridge](#claude-desktop-bridge)
- [Security model](#security-model) · [Development](#development) · [Status](#status)
- [Documentation](#documentation) · [Community](#community) · [License](#license)

## Quickstart

```bash
git clone https://github.com/andreshma/ai-tab-grouper.git
cd ai-tab-grouper
npm ci
npm run deploy:local      # copies the runtime to ~/ai-tab-grouper (or ATG_DEPLOY_DIR)
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked** and select `~/ai-tab-grouper`. Open a few tabs: they are grouped by
domain straight away. To group by topic, open the options page, accept the
data notice and add your Anthropic API key — or connect Claude Desktop.

Requirements: Chrome 120+. Node.js 20+ to build and for the bridge.

## How it works

```
tabs.onUpdated(complete) ─► debounce ─► throttle per window ─► lock per window
        │
        ▼
 ledger ─► redact (PII) ─► managed policy + consent ─► provider chain ─► normalizeResult ─► tabGroups
                                                         │
                  Claude (own key, direct │ corporate proxy) ─fail/breaker─► Gemini Nano ─► domain heuristic
```

- Tab data is redacted before it goes anywhere, and whatever a model answers
  is validated before it touches your tabs: known tab ids, sanitized names,
  whitelisted colors.
- A tab you pull out of a group is not regrouped behind your back.
- On demand, tabs that fit no topic go to a collapsed "Varios"
  (miscellaneous) group, so nothing is left loose.
- Organizations can restrict the extension through Chrome managed policy,
  including a corporate proxy that keeps the API key out of the browser.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Claude Desktop bridge

```bash
node bridge/install.mjs --extension-id <EXTENSION_ID> --configure-claude
node bridge/doctor.mjs    # checks the whole chain; never prints titles or URLs
```

Then ask Claude Desktop: "Organize my Chrome tabs by topic." The bridge is a
dependency-free MCP server plus a Chrome native-messaging host; they talk over
a local pipe protected by an ephemeral token. See
[bridge/README.md](bridge/README.md).

## Security model

- **Least privilege:** `tabs`, `tabGroups`, `storage` and one host
  (`api.anthropic.com`); `nativeMessaging` only if you enable the bridge. No
  content scripts.
- **No remote code:** strict CSP, no `eval`, no inline scripts or styles.
- **Model output is untrusted**, including what Claude Desktop sends back.
- **Zero runtime dependencies**; CI actions are pinned by commit SHA.

Details: [SECURITY.md](SECURITY.md) · [Threat model](docs/THREAT_MODEL.md) ·
[Privacy policy](PRIVACY.md).

## Development

```bash
npm run lint              # ESLint with security rules
npm test                  # extension + bridge
npm run prepublish:cws    # lint → coverage → audit → package → Chrome Web Store policy gate
```

The suites need no browser: they run against a fake of the Chrome APIs and
against real MCP and native-host processes, on Linux and Windows. See
[docs/TESTING.md](docs/TESTING.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Status

Beta. Tested end to end on Windows 11 with Chrome and Claude Desktop. Not yet
published on the Chrome Web Store: install it from source for now.

## Documentation

- [User Manual](docs/USAGE.md) — install, engines, bridge, settings, troubleshooting
- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/adr/README.md)
- [Testing](docs/TESTING.md) and the [Windows end-to-end plan](docs/E2E_TEST_PLAN_WINDOWS.md)
- [Threat model](docs/THREAT_MODEL.md) · [Enterprise deployment](docs/ENTERPRISE_DEPLOYMENT.md)
- [Chrome Web Store listing](docs/STORE_LISTING.md) · [Releasing](RELEASING.md) · [Changelog](CHANGELOG.md)

## Community

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) (dev
setup, tests, the ground rules on consent and data minimization).

- Questions and ideas: [Discussions](https://github.com/andreshma/ai-tab-grouper/discussions) — see [SUPPORT.md](SUPPORT.md)
- Bugs and features: [issues](https://github.com/andreshma/ai-tab-grouper/issues/new/choose)
- Vulnerabilities: privately, per [SECURITY.md](SECURITY.md)
- How the project is run: [GOVERNANCE.md](GOVERNANCE.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This project is not
affiliated with Google or Anthropic.
