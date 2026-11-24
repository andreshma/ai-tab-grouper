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
> 🌐 **English and Spanish.** The interface follows your browser language
> (English by default, Spanish when Chrome is in Spanish). The documentation
> quotes the English labels.

📖 **New here? Start with the [User Manual](docs/USAGE.md)**: install, first
run, the Claude Desktop bridge, settings and troubleshooting.

## Contents

- [Quickstart](#quickstart) · [Usage](#usage) · [How it works](#how-it-works)
- [Components](#components) · [Claude Desktop bridge](#claude-desktop-bridge) · [Configuration](#configuration)
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

## Usage

| Action | How | What it does |
|---|---|---|
| Automatic grouping | Browse; toggle with "Group automatically while browsing" in the popup | Shortly after a tab finishes loading, loose tabs join a matching group or form a new one |
| Group now | Popup → "Group now", or `Alt+Shift+G` | Groups the loose tabs of the current window |
| Reorganize all | Popup → "Reorganize all" | Reclassifies every tab of the window, including tabs already in a group |
| Ungroup | Popup → "Ungroup" | Takes every tab of the window out of its group |
| Ask Claude Desktop | "Organize my Chrome tabs by topic" | Claude Desktop lists and groups the tabs through the [bridge](#claude-desktop-bridge) |

Pinned tabs and pages that are not `http(s)` are never grouped. The popup
shows which engine produced the last run and, when an engine failed, the
reason for the fallback. Details and troubleshooting are in the
[User Manual](docs/USAGE.md).

## How it works

### Module map

```mermaid
flowchart TB
    subgraph pages["Extension pages"]
        popup["popup.js · status.js"]
        options["options.js"]
    end
    subgraph worker["Service worker"]
        bg["background.js<br/>events · debounce · throttle · per-window lock"]
        cfg["config.js<br/>settings · managed policy · consent · API key"]
        led["ledger.js<br/>per-tab outcome"]
        red["redact.js<br/>title · host · redacted path"]
        cls["classifier.js<br/>provider chain"]
        res["resilience.js<br/>retry · circuit breaker"]
        val["validate.js<br/>normalizeResult"]
        grp["grouper.js · catchall.js"]
        prm["prompt.js<br/>system prompt · schema"]
        pc["providers/claude.js"]
        pn["providers/nano.js"]
        heu["heuristic.js"]
        link["bridge.js<br/>native-messaging link"]
    end
    chromeapi["Chrome APIs<br/>tabs · tabGroups · storage"]
    api["Claude API<br/>or proxy set by managed policy"]
    nano["Gemini Nano<br/>Prompt API, on-device"]
    host["Bridge host + MCP server<br/>(optional)"]

    popup -- "runtime messages" --> bg
    options -- "runtime messages" --> bg
    options -- "test connection" --> pc
    bg --> cfg
    bg --> led
    bg --> red
    bg --> cls
    bg --> grp
    bg -- "breakers" --> res
    bg --> link
    cls --> pc
    cls --> pn
    cls --> heu
    cls --> val
    pc --> prm
    pn --> prm
    pc -- "withRetry" --> res
    pc -- "HTTPS" --> api
    pn --> nano
    cfg --> chromeapi
    grp --> chromeapi
    link <-- "native messaging" --> host
```

`classifier.js` does not import the providers: `background.js` injects them,
together with the circuit breakers and the API-key lookup, so the chain is
tested without Chrome.

### Grouping pipeline

```mermaid
flowchart LR
    ev["tabs.onUpdated<br/>status complete"] --> deb["debounce"]
    deb --> thr["throttle<br/>per window"]
    thr --> lock["lock<br/>per window"]
    man["popup · Alt+Shift+G"] --> lock
    lock --> led["ledger<br/>pick candidates"]
    led --> red["redact"]
    red --> chain["provider chain<br/>policy + consent"]
    chain --> norm["normalizeResult"]
    norm --> apply["tabs.group<br/>tabGroups.update"]
    apply --> rec["ledger + last run"]
```

- Tab data is redacted before it goes anywhere, and whatever a model answers
  is validated before it touches your tabs: known tab ids, sanitized names,
  whitelisted colors.
- A tab you pull out of a group is not regrouped behind your back.
- On demand, tabs that fit no topic go to a collapsed catch-all
  group ("Misc"; "Varios" in Spanish), so nothing is left loose.
- Organizations can restrict the extension through Chrome managed policy,
  including a corporate proxy that keeps the API key out of the browser.

### Provider chain and fallback

Default order: Claude → Gemini Nano → domain heuristic. "Preferir on-device"
(prefer on-device) puts Gemini Nano first; the heuristic is always last.

```mermaid
sequenceDiagram
    autonumber
    participant BG as background.js
    participant CL as classifier.js
    participant BR as Circuit breaker
    participant PC as providers/claude.js
    participant API as Claude API or proxy
    participant PN as providers/nano.js
    participant HE as heuristic.js
    participant CH as Chrome tabs API

    BG->>BG: snapshot, ledger, candidates, toTabDescriptor
    BG->>CL: classifyTabs(input, settings, deps)
    CL->>BR: isOpen for claude
    alt breaker open, no consent, or no key and no proxy
        Note over CL: Claude is skipped and the reason is recorded
    else Claude is usable
        Note over CL: Tabs on excluded hosts are kept back
        CL->>PC: classifyWithClaude(remaining tabs)
        loop up to 3 attempts
            PC->>API: POST with forced tool call, 20 s timeout
            API-->>PC: tool_use, or an error
            Note over PC: Retry on 408, 429, 5xx, timeout, network error
        end
        alt success
            PC-->>CL: groups
            CL->>HE: groupByDomain(excluded-host tabs)
            CL->>BR: recordSuccess
        else failure
            PC-->>CL: error
            CL->>BR: recordFailure
            Note over BR: 3 failures in a row open it for 5 minutes
        end
    end
    opt Claude was skipped or failed
        CL->>PN: availability, then classifyWithNano
        Note over PN: Skipped unless available or if its breaker is open. First 30 tabs, 30 s timeout
        PN-->>CL: groups, or an error
    end
    opt no model produced a result
        CL->>HE: groupByDomain(all tabs)
        HE-->>CL: groups by registrable domain
    end
    CL->>CL: normalizeResult
    CL-->>BG: provider, groups, errors
    BG->>CH: tabs.group and tabGroups.update
    opt manual run and the catch-all is enabled
        BG->>CH: leftovers go to the catch-all group
    end
    BG->>BG: update ledger, record last run
```

- A retry waits for the server's `retry-after` when there is one, otherwise an
  exponential backoff with jitter (500 ms base, 8 s cap).
- Breaker state lives in `chrome.storage.session`, so it survives
  service-worker restarts. After the 5 minutes calls are tried again; a
  failure opens it again. "Test connection" in the
  options page resets it.
- If every enabled engine is skipped or fails, the chain returns no groups and
  the popup reports that no engine was available.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DIAGRAMS.md](docs/DIAGRAMS.md).

## Components

| Module | Responsibility |
|---|---|
| `src/background.js` | Service worker: tab events, scheduling, per-window locking, messages from the popup and options pages, bridge handlers |
| `src/lib/config.js` | Settings, managed policy overlay (`applyPolicy`), consent version, API-key storage |
| `src/lib/classifier.js` | Provider chain: order, skips, fall-through, validation of the result |
| `src/lib/providers/claude.js` · `nano.js` | Claude Messages API with a forced tool call · on-device Prompt API with a response schema |
| `src/lib/heuristic.js` | Offline fallback: groups by registrable domain |
| `src/lib/redact.js` · `validate.js` | What a model may see · what a model may change |
| `src/lib/resilience.js` | Retry with backoff and `retry-after`; persisted circuit breaker |
| `src/lib/ledger.js` | Remembers what was grouped, left alone or ungrouped by the user |
| `src/lib/grouper.js` · `catchall.js` | Applies groups through the Chrome APIs · the catch-all group ("Misc" / "Varios") |
| `src/lib/i18n.js` · `src/ui/localize.js` · `_locales/` | Message lookup and language resolution · applies messages to the pages · English and Spanish catalogues |
| `src/lib/bridge.js` | Native-messaging link to the bridge host, with reconnection |
| `src/popup/` · `src/options/` | Popup (actions and status) · options page (settings, consent, key) |
| `bridge/` | Optional native host, MCP server, installer and `doctor` |

## Claude Desktop bridge

```bash
node bridge/install.mjs --extension-id <EXTENSION_ID> --configure-claude
node bridge/doctor.mjs    # checks the whole chain; never prints titles or URLs
```

Then ask Claude Desktop: "Organize my Chrome tabs by topic." The bridge is a
dependency-free MCP server plus a Chrome native-messaging host; they talk over
a local pipe protected by an ephemeral token. See
[bridge/README.md](bridge/README.md).

```mermaid
sequenceDiagram
    participant D as Claude Desktop
    participant M as MCP server
    participant H as Native host
    participant SW as Service worker
    participant C as Chrome tabs API

    D->>M: tools/call (JSON-RPC over stdio)
    M->>M: validate arguments
    M->>H: request + token (named pipe or Unix socket)
    H->>H: check token and method allowlist
    H->>SW: native message
    SW->>SW: bridge enabled, consent, method allowlist
    alt list_tabs
        SW-->>H: redacted tabs, excluded hosts left out
    else apply_tab_groups
        SW->>SW: normalizeResult on eligible tab ids
        SW->>C: tabs.group and tabGroups.update
        SW-->>H: summary and tabs still loose
    end
    H-->>M: result
    M-->>D: text result, list_tabs data marked untrusted
```

## Configuration

Settings are edited in the options page and stored in `chrome.storage.sync`.
Defaults are in `src/lib/config.js`.

| Setting | Default | Meaning |
|---|---|---|
| `autoGroup` | `true` | Group automatically when a tab finishes loading |
| `enableClaude` · `enableNano` · `enableHeuristic` | `true` | Which engines the chain may use |
| `preferOnDevice` | `false` | Try Gemini Nano before Claude |
| `claudeModel` | `claude-haiku-5-5` | Model id sent to the Claude API |
| `language` | `auto` | Language of generated group names: `auto` (browser language), `en` or `es` |
| `minGroupSize` | `2` | Minimum tabs to create a new group; an existing group accepts one |
| `excludedHosts` | `[]` | Hosts (and their subdomains) never sent to a remote model; grouped locally |
| `sendPath` | `true` | Send a redacted URL path in addition to title and host |
| `minIntervalMs` | `10000` | Minimum time between automatic runs per window |
| `maxTabsPerRequest` | `60` | Upper bound of tabs per classification |
| `catchAllGroup` | `true` | Manual and Claude Desktop runs put leftover tabs in the catch-all group ("Misc" / "Varios") |
| `enableDesktopBridge` | `false` | Expose tabs to Claude Desktop through the bridge |
| `debounceMs` | `2000` | Quiet period before an automatic run (no field in the options page) |

The API key is kept apart from the settings: in `chrome.storage.session`
(memory, gone when the browser closes) by default, or in
`chrome.storage.local` if you choose to remember it. It is never synced.

Administrators can restrict these through Chrome managed storage
(`managed_schema.json`): `allowedProviders`, `excludedHosts`,
`forbidPathSending`, `disableAutoGroup`, `allowUserApiKey`, `apiKeyStorage`,
`allowedModels`, `allowDesktopBridge` and `proxyEndpoint`. See
[docs/ENTERPRISE_DEPLOYMENT.md](docs/ENTERPRISE_DEPLOYMENT.md).

Environment variables used by the tooling: `ATG_DEPLOY_DIR` (target of
`npm run deploy:local`) and `AI_TAB_GROUPER_DIR` (bridge state directory).

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
- [Architecture](docs/ARCHITECTURE.md), [diagrams](docs/DIAGRAMS.md) and [decision records](docs/adr/README.md)
- [Testing](docs/TESTING.md) and the [Windows end-to-end plan](docs/E2E_TEST_PLAN_WINDOWS.md)
- [Threat model](docs/THREAT_MODEL.md) · [Adversarial review](docs/ADVERSARIAL_REVIEW.md) · [Enterprise deployment](docs/ENTERPRISE_DEPLOYMENT.md)
- [Chrome Web Store listing](docs/STORE_LISTING.md) · [Releasing](RELEASING.md) · [Changelog](CHANGELOG.md)

## Community

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) (dev
setup, tests, the ground rules on consent and data minimization).

- Questions and ideas: [Discussions](https://github.com/andreshma/ai-tab-grouper/discussions) — see [SUPPORT.md](SUPPORT.md)
- Bugs and features: [issues](https://github.com/andreshma/ai-tab-grouper/issues/new/choose)
- Vulnerabilities: privately, per [SECURITY.md](SECURITY.md)
- How the project is run: [GOVERNANCE.md](GOVERNANCE.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- Citing the project: [CITATION.cff](CITATION.cff)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This project is not
affiliated with Google or Anthropic.
