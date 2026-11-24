# Usage

AI Tab Grouper groups your Chrome tabs by topic, automatically while you browse or on demand. The interface follows your
browser language: English by default, Spanish when Chrome is set to Spanish. This guide quotes the English labels.

## Contents

- [1. Requirements](#1-requirements)
- [2. Install](#2-install)
- [3. First run](#3-first-run)
- [4. Grouping engines](#4-grouping-engines)
- [5. Group your tabs](#5-group-your-tabs)
- [6. Claude Desktop bridge](#6-claude-desktop-bridge)
- [7. Settings](#7-settings)
- [8. Enterprise policy](#8-enterprise-policy)
- [9. Command reference](#9-command-reference)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Known limitations](#11-known-limitations)

## 1. Requirements

- Chrome 120 or newer.
- Node.js 20 or newer, needed only to build from source and for the Claude Desktop bridge.
- Claude Desktop, only if you use the bridge.

## 2. Install

From source:

```bash
git clone https://github.com/andreshma/ai-tab-grouper.git
cd ai-tab-grouper
npm ci
npm run deploy:local      # copies the runtime to ~/ai-tab-grouper (or ATG_DEPLOY_DIR)
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select the deployed folder
(`~/ai-tab-grouper`). Do not load the repository folder itself: its `node_modules` contains file names Chrome reserves,
and the extension id depends on the folder path.

## 3. First run

The options page ("Settings") opens after installing. Nothing is sent anywhere until you accept the data notice.

- **Without a key** the extension already works: it groups by domain, fully offline.
- **With your own Anthropic API key:** accept the data notice, paste the key under "Anthropic API key", press "Test
  connection" and then "Save".

## 4. Grouping engines

The extension tries these in order and falls back automatically:

| Engine | What it needs | What leaves the device |
|---|---|---|
| Claude API | Your own API key (or a corporate proxy) and accepted consent | Title, host and optionally a redacted path of each loose tab |
| Gemini Nano | A Chrome build and hardware that support the on-device model | Nothing |
| Domain heuristic | Nothing | Nothing |

Query strings, fragments, page content and cookies are never sent. Hosts you list under "Domains that never leave the
device" are never sent either. See [PRIVACY.md](../PRIVACY.md).

## 5. Group your tabs

- **Automatic:** new tabs join a matching group, or form a new one, shortly after they finish loading.
- **Popup:** "Group now" (group the loose tabs of the current window), "Reorganize all" (regroup every tab of the
  window) and "Ungroup".
- **Shortcut:** `Alt+Shift+G` groups the loose tabs of the current window.

A tab you pull out of a group stays out until it navigates to another site. In manual mode, tabs that fit no topic go to
a collapsed grey catch-all group called "Misc" ("Varios" when group names are in Spanish); you can turn that off in the
options page.

### Language

The interface language is the browser's; there is no separate switch. The language of the **group names** is a setting
("Group name language"): "Automatic (browser language)" by default, or English or Spanish explicitly. Browsers in any
other language get the English interface and English group names. Changing the language never creates a second catch-all
group: an existing "Misc" or "Varios" group keeps receiving the leftover tabs.

## 6. Claude Desktop bridge

The bridge lets Claude Desktop list and group your tabs using your Claude session, with no API key. It is optional and
local: an MCP server that Claude Desktop starts, and a native-messaging host that Chrome starts.

1. In the options page, under "Claude Desktop (your Claude session)", copy the extension id ("This extension's ID").
2. From the deployed folder, register the host and add the MCP server to Claude Desktop:

   ```bash
   node bridge/install.mjs --extension-id <EXTENSION_ID> --configure-claude
   ```

3. In the options page, accept the data notice and enable the bridge. Chrome asks for the optional `nativeMessaging`
   permission.
4. Quit Claude Desktop completely, open it again and, in a new chat, ask: "Organize my Chrome tabs by topic."
5. Check the whole chain with `node bridge/doctor.mjs`. It never prints tab titles or URLs.

Other installer options: `--browser chrome|edge|chromium` and `--uninstall`. Details and the security model are in
[bridge/README.md](../bridge/README.md).

## 7. Settings

| Setting | Default | Stored in | Notes |
|---|---|---|---|
| `claudeApiKey` | — | `storage.session` (default) or `storage.local` (opt-in) | Never synced; ignored in proxy mode |
| `consentVersion` | `0` | sync | No remote call without the current consent |
| `claudeModel` | `claude-haiku-5-5` | sync | Can be restricted by `allowedModels` |
| `preferOnDevice` / `autoGroup` / `sendPath` | `false` / `true` / `true` | sync | |
| `enableClaude` / `enableNano` / `enableHeuristic` | `true` / `true` / `true` | sync | Which engines the chain may use; can be restricted by `allowedProviders` |
| `language` | `auto` | sync | Language of generated group names: `auto` (browser language), `en` or `es` |
| `catchAllGroup` | `true` | sync | Manual and Claude Desktop runs put leftover tabs in the catch-all group ("Misc" / "Varios") |
| `enableDesktopBridge` | `false` | sync | Can be forced off by `allowDesktopBridge` |
| `excludedHosts` | `[]` | sync and policy | Never leave the device |
| `minGroupSize` · `debounceMs` · `minIntervalMs` · `maxTabsPerRequest` | 2 · 2000 · 10000 · 60 | sync | Quality and cost control; `debounceMs` has no field in the options page |

## 8. Enterprise policy

Administrators can restrict the extension through Chrome managed storage (`managed_schema.json`): `allowedProviders`,
`excludedHosts`, `forbidPathSending`, `disableAutoGroup`, `allowUserApiKey`, `apiKeyStorage`, `allowedModels`,
`allowDesktopBridge` and `proxyEndpoint`. Policy can only restrict what the user may do. Guide:
[ENTERPRISE_DEPLOYMENT.md](ENTERPRISE_DEPLOYMENT.md).

## 9. Command reference

Actions in the browser:

| Action | How | What it does |
|---|---|---|
| Group now | Popup → "Group now", or `Alt+Shift+G` | Groups the loose tabs of the current window |
| Reorganize all | Popup → "Reorganize all" | Regroups every tab of the window, including tabs already in a group |
| Ungroup | Popup → "Ungroup" | Takes every tab of the window out of its group |
| Automatic grouping on or off | Popup → "Group automatically while browsing" | Turns the automatic mode on or off |
| Test connection | Options page → "Test connection" | Checks the key or proxy and resets the circuit breaker |

Commands in a terminal:

| Command | Run from | What it does |
|---|---|---|
| `npm run deploy:local` | Repository | Copies the runtime to `~/ai-tab-grouper` (or `ATG_DEPLOY_DIR`), the folder Chrome loads |
| `node bridge/install.mjs --extension-id <EXTENSION_ID> [--browser chrome\|edge\|chromium] [--configure-claude]` | Deployed folder | Registers the native host for that browser and, with `--configure-claude`, adds the MCP server to Claude Desktop |
| `node bridge/install.mjs --uninstall [--browser chrome\|edge\|chromium] [--configure-claude]` | Deployed folder | Removes the native host registration and, with `--configure-claude`, the MCP server entry |
| `node bridge/doctor.mjs [--browser chrome\|edge\|chromium]` | Deployed folder | Checks the whole bridge chain; prints `PASS`, `WARN` or `FAIL` per check and exits with 1 if any check fails |

Tools that Claude Desktop can call through the bridge:

| Tool | Effect |
|---|---|
| `list_tabs` | Title, domain, redacted path and current group, per window |
| `apply_tab_groups` | Creates or reuses groups with the `tabIds` from `list_tabs` |
| `ungroup_tabs` | Ungroups a window; Claude asks for confirmation |

Operational procedures (health checks, upgrading, recovery) are in the [runbook](runbook.md).

## 10. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| "Claude paused (circuit breaker)" | Three failures in a row (401, 429 or 5xx) | Options → "Test connection" resets it; check the key or proxy; it recovers on its own after 5 minutes |
| "Claude inactive: accept the data notice" | The consent version is out of date | Accept the notice and save |
| Always the domain heuristic | No key or proxy, Gemini Nano unavailable, or the `allowedProviders` policy | Check `chrome://policy` and the options page |
| CORS error in proxy mode | The proxy does not allow `chrome-extension://<ID>` with credentials | See the contract in [ENTERPRISE_DEPLOYMENT.md](ENTERPRISE_DEPLOYMENT.md) |
| The key disappears after a restart | Default behavior (session storage) or the `apiKeyStorage=session` policy | Tick "Remember the key on this device" if the policy allows it |
| "Claude Desktop: host not installed" | The native host is not registered for this browser | Run `node bridge/install.mjs --extension-id <EXTENSION_ID>` |
| "Claude Desktop: reconnecting…" | Chrome found a host but could not use it: registered for another extension id, or the launcher points to files that no longer exist | The options page shows the exact error in parentheses; run `node bridge/doctor.mjs`, then reinstall with the current id |
| "Extension half-updated" | The files changed but the service worker is still the old one | Press reload in `chrome://extensions` |
| Claude Desktop does not see the tools | It was running when the bridge was installed | Quit it completely, open it again and start a new chat |
| Where are the logs? | — | `chrome://extensions` → Service worker → Inspect. Tab data is never logged |

## 11. Known limitations

- The on-device model (`LanguageModel`) in a service worker depends on the Chrome version; when it is missing, Gemini
  Nano is skipped.
- The ledger of tabs you ungrouped lives in `storage.session`: it is lost when the browser restarts.
- Tabs beyond `maxTabsPerRequest` are processed on the next run.
