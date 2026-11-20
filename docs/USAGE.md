# User Manual

AI Tab Grouper groups your Chrome tabs by topic, automatically while you
browse or on demand. The interface is in Spanish; this manual quotes each
label with its English meaning.

## Contents

- [Install](#install) · [First run](#first-run) · [Grouping engines](#grouping-engines)
- [Using it](#using-it) · [Claude Desktop bridge](#claude-desktop-bridge)
- [Settings](#settings) · [Enterprise policy](#enterprise-policy)
- [Troubleshooting](#troubleshooting) · [Known limitations](#known-limitations)

## Install

Requirements: Chrome 120 or newer. Node.js 20 or newer is needed only to build
from source and for the Claude Desktop bridge.

From source:

```bash
git clone https://github.com/andreshma/ai-tab-grouper.git
cd ai-tab-grouper
npm ci
npm run deploy:local      # copies the runtime to ~/ai-tab-grouper (or ATG_DEPLOY_DIR)
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked** and select the deployed folder (`~/ai-tab-grouper`). Do not load the
repository folder itself: its `node_modules` contains file names Chrome
reserves, and the extension id depends on the folder path.

## First run

The options page ("Configuración") opens after installing. Nothing is sent
anywhere until you accept the data notice.

- **Without a key** the extension already works: it groups by domain, fully
  offline.
- **With your own Anthropic API key:** accept the data notice, paste the key
  under "API key de Anthropic", press "Probar conexión" (test connection) and
  then "Guardar" (save).

## Grouping engines

The extension tries these in order and falls back automatically:

| Engine | What it needs | What leaves the device |
|---|---|---|
| Claude API | Your own API key (or a corporate proxy) and accepted consent | Title, host and optionally a redacted path of each loose tab |
| Gemini Nano | A Chrome build and hardware that support the on-device model | Nothing |
| Domain heuristic | Nothing | Nothing |

Query strings, fragments, page content and cookies are never sent. Hosts you
list under "Dominios que nunca salen del dispositivo" (domains that never
leave the device) are never sent either. See [PRIVACY.md](../PRIVACY.md).

## Using it

- **Automatic:** new tabs join a matching group, or form a new one, shortly
  after they finish loading.
- **Popup:** "Agrupar ahora" (group the loose tabs of the current window),
  "Reorganizar todo" (regroup every tab of the window) and "Desagrupar"
  (ungroup).
- **Shortcut:** `Alt+Shift+G` groups the loose tabs of the current window.

A tab you pull out of a group stays out until it navigates to another site.
In manual mode, tabs that fit no topic go to a collapsed grey group called
"Varios" (miscellaneous); you can turn that off in the options page.

## Claude Desktop bridge

The bridge lets Claude Desktop list and group your tabs using your Claude
session, with no API key. It is optional and local: an MCP server that Claude
Desktop starts, and a native-messaging host that Chrome starts.

1. In the options page, under "Claude Desktop (tu sesión de Claude)", copy the
   extension id ("ID de esta extensión").
2. From the deployed folder, register the host and add the MCP server to
   Claude Desktop:
   ```bash
   node bridge/install.mjs --extension-id <EXTENSION_ID> --configure-claude
   ```
3. In the options page, accept the data notice and enable the bridge. Chrome
   asks for the optional `nativeMessaging` permission.
4. Quit Claude Desktop completely, open it again and, in a new chat, ask:
   "Organize my Chrome tabs by topic."
5. Check the whole chain with `node bridge/doctor.mjs`. It never prints tab
   titles or URLs.

Other installer options: `--browser chrome|edge|chromium` and `--uninstall`.
Details and the security model are in [bridge/README.md](../bridge/README.md).

## Settings

| Setting | Default | Stored in | Notes |
|---|---|---|---|
| `claudeApiKey` | — | `storage.session` (default) or `storage.local` (opt-in) | Never synced; ignored in proxy mode |
| `consentVersion` | `0` | sync | No remote call without the current consent |
| `claudeModel` | `claude-haiku-5-5` | sync | Can be restricted by `allowedModels` |
| `preferOnDevice` / `autoGroup` / `sendPath` | `false` / `true` / `true` | sync | |
| `excludedHosts` | `[]` | sync and policy | Never leave the device |
| `minGroupSize` · `debounceMs` · `minIntervalMs` · `maxTabsPerRequest` | 2 · 2000 · 10000 · 60 | sync | Quality and cost control |

## Enterprise policy

Administrators can restrict the extension through Chrome managed storage
(`managed_schema.json`): `allowedProviders`, `excludedHosts`,
`forbidPathSending`, `disableAutoGroup`, `allowUserApiKey`, `apiKeyStorage`,
`allowedModels`, `allowDesktopBridge` and `proxyEndpoint`. Policy can only
restrict what the user may do. Guide:
[ENTERPRISE_DEPLOYMENT.md](ENTERPRISE_DEPLOYMENT.md).

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| "Claude en pausa (circuit breaker)" (Claude paused) | Three failures in a row (401, 429 or 5xx) | Options → "Probar conexión" resets it; check the key or proxy; it recovers on its own after 5 minutes |
| "Claude inactivo: falta aceptar el aviso" (consent missing) | The consent version is out of date | Accept the notice and save |
| Always the domain heuristic | No key or proxy, Gemini Nano unavailable, or the `allowedProviders` policy | Check `chrome://policy` and the options page |
| CORS error in proxy mode | The proxy does not allow `chrome-extension://<ID>` with credentials | See the contract in [ENTERPRISE_DEPLOYMENT.md](ENTERPRISE_DEPLOYMENT.md) |
| The key disappears after a restart | Default behavior (session storage) or the `apiKeyStorage=session` policy | Tick "remember" if the policy allows it |
| "Claude Desktop: host no instalado" (host not installed) | The native host is not registered for this browser | Run `node bridge/install.mjs --extension-id <EXTENSION_ID>` |
| "Claude Desktop: reconectando…" (reconnecting) | Chrome found a host but could not use it: registered for another extension id, or the launcher points to files that no longer exist | The options page shows the exact error in parentheses; run `node bridge/doctor.mjs`, then reinstall with the current id |
| "Extensión actualizada a medias" (half-updated) | The files changed but the service worker is still the old one | Press reload in `chrome://extensions` |
| Claude Desktop does not see the tools | It was running when the bridge was installed | Quit it completely, open it again and start a new chat |
| Where are the logs? | — | `chrome://extensions` → Service worker → Inspect. Tab data is never logged |

## Known limitations

- The on-device model (`LanguageModel`) in a service worker depends on the
  Chrome version; when it is missing, Gemini Nano is skipped.
- The ledger of tabs you ungrouped lives in `storage.session`: it is lost when
  the browser restarts.
- Tabs beyond `maxTabsPerRequest` are processed on the next run.
