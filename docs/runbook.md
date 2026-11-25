# Runbook

Operations for one machine: the unpacked extension that Chrome loads and the optional Claude Desktop bridge. There is no
server to operate. For first-time setup see the [usage guide](USAGE.md); for rolling the extension out to an
organization see [ENTERPRISE_DEPLOYMENT.md](ENTERPRISE_DEPLOYMENT.md); for cutting a release see
[RELEASING.md](../RELEASING.md).

## Contents

- [1. Where things are](#1-where-things-are)
- [2. Is it healthy?](#2-is-it-healthy)
- [3. Deploy a change to the local runtime](#3-deploy-a-change-to-the-local-runtime)
- [4. Operate the bridge](#4-operate-the-bridge)
- [5. Logs](#5-logs)
- [6. Upgrading](#6-upgrading)
- [7. Recovery](#7-recovery)

## 1. Where things are

| What | Where |
|---|---|
| Source | The repository. Chrome never loads this folder |
| Runtime that Chrome loads | `~/ai-tab-grouper`, or the folder in `ATG_DEPLOY_DIR`. Holds `manifest.json`, `managed_schema.json`, `_locales`, `icons`, `src`, `bridge/src`, `bridge/install.mjs`, `bridge/doctor.mjs` and `bridge/package.json` |
| User settings and consent version | `chrome.storage.sync` |
| API key | `chrome.storage.session` by default; `chrome.storage.local` if you chose to remember it |
| Ledger, last run, breaker state, bridge status | `chrome.storage.session`, until the browser closes |
| Managed policy | `chrome.storage.managed`; inspect it in `chrome://policy` |
| Bridge state directory | Windows: `%LOCALAPPDATA%\ai-tab-grouper`. macOS and Linux: `~/.ai-tab-grouper`. Override with `AI_TAB_GROUPER_DIR` |
| Bridge token | `token` in the state directory, while the native host runs |
| Bridge endpoint | Windows: a named pipe `\\.\pipe\ai-tab-grouper-<id>` derived from the state directory path. macOS and Linux: `bridge.sock` in the state directory |
| Host launcher | `host.bat` (Windows) or `host.sh` in the state directory. It holds the absolute paths of the Node.js binary and of `bridge/src/host.js` |
| Native host registration (`com.aitabgrouper.bridge`) | Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.aitabgrouper.bridge`, pointing to a JSON file in the state directory. macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. Linux: `~/.config/google-chrome/NativeMessagingHosts/`. Edge and Chromium use their own vendor folder or key |
| Claude Desktop configuration | Windows: `%APPDATA%\Claude\claude_desktop_config.json`. macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`. Linux: `~/.config/Claude/claude_desktop_config.json`. The server entry is `ai-tab-grouper` under `mcpServers` |
| Packaged extension | `dist/ai-tab-grouper-<version>.zip`, built by `npm run package` |

## 2. Is it healthy?

Check the extension first, then the bridge.

1. Open the popup. It shows which engine produced the last run and, when an engine failed, the reason for the fallback.
2. Read the status lines against this table.

   | Status line | Meaning |
   |---|---|
   | "Claude Desktop: connected" | The native host is running and the link is up |
   | "Claude Desktop: host not installed" | The native host is not registered for this browser |
   | "Claude Desktop: reconnecting…" | Chrome found a host but could not use it |
   | "Claude paused (circuit breaker)" | Three failures in a row; it recovers on its own after 5 minutes |
   | "Claude inactive: accept the data notice" | The consent version is out of date |
   | "Extension half-updated" | The files changed but the service worker is still the old one |
   | "Managed by your organization" | A managed policy restricts the extension |

3. Open `chrome://extensions` → Service worker → Inspect. The console must show no errors.
4. If you use the bridge, run the doctor from the deployed folder:

   ```bash
   node bridge/doctor.mjs
   ```

   Every line must be `PASS`. The exit code is 0 when no check fails and 1 otherwise. The doctor never prints tab titles
   or URLs, only counts.

The doctor checks, in order:

| Check | Fails or warns when |
|---|---|
| Node.js >= 20 | The Node.js version is older |
| Native host registered | The registration is missing for that browser (`--browser chrome\|edge\|chromium`) |
| Host manifest valid | The manifest does not name this host, is not of type `stdio` or does not allow a valid extension id |
| Launcher exists, and points to an existing node and `host.js` | The folder was moved or Node.js was removed: reinstall |
| Claude Desktop configured | `claude_desktop_config.json` has no `ai-tab-grouper` entry |
| MCP server starts and exposes tools | The MCP server does not answer the handshake, or one of the three tools is missing |
| Chrome connected to the host | `WARN`: the host is not running. Open Chrome, accept the data notice and enable the bridge |
| Extension responds (ping) | The extension does not answer through the host |
| `list_tabs` end-to-end | The call fails; on success it reports counts of groupable, ungrouped, not groupable and excluded tabs |

## 3. Deploy a change to the local runtime

The repository folder and the folder Chrome loads are different on purpose: a fixed folder keeps the extension id, and
therefore the native-messaging registration, stable, and keeps `node_modules` out of it.

1. Copy the runtime:

   ```bash
   npm run deploy:local      # copies the runtime to ~/ai-tab-grouper (or ATG_DEPLOY_DIR)
   ```

2. Reload the extension in `chrome://extensions`. The service worker keeps running the old code until you do.
3. If `bridge/src` changed, quit Claude Desktop completely, open it again and start a new chat. Sessions started earlier
   do not see new MCP tools.
4. Run `node bridge/doctor.mjs` from the deployed folder.

The script replaces directories wholesale, so files deleted in the repository disappear from the runtime too. It refuses
to run when the target is the repository itself.

## 4. Operate the bridge

| Task | Command (from the deployed folder) |
|---|---|
| Install for Chrome and configure Claude Desktop | `node bridge/install.mjs --extension-id <EXTENSION_ID> --configure-claude` |
| Install for Edge or Chromium | Add `--browser edge` or `--browser chromium` |
| Install without touching the Claude Desktop configuration | Omit `--configure-claude`; the installer prints the `mcpServers` entry to add by hand |
| Verify | `node bridge/doctor.mjs` |
| Uninstall | `node bridge/install.mjs --uninstall --configure-claude` |

- The installer writes the absolute path of the Node.js binary you run it with. Run it again after you move the folder
  or change the Node.js installation.
- With `--configure-claude` the installer copies the existing configuration to
  `claude_desktop_config.json.bak-<timestamp>` before writing, and keeps your other servers.
- Restart Claude Desktop after installing: quit it completely, open it again and start a new chat.
- Chrome launches the native host when the extension connects, and only for the extension id in `allowed_origins`. The
  host deletes the token when Chrome closes the port.
- Until the findings AR-06 and AR-07 of the [adversarial review](ADVERSARIAL_REVIEW.md#remediation-status) are fixed,
  use the bridge with one browser profile on a machine you do not share.

## 5. Logs

| Component | Where |
|---|---|
| Service worker | `chrome://extensions` → Service worker → Inspect → Console. Tab data is never logged |
| Native host | Chrome's stderr (`chrome --enable-logging=stderr`), lines prefixed `[ai-tab-grouper host]` |
| MCP server | The Claude Desktop MCP log: Settings → Developer → Open Logs Folder → `mcp-server-ai-tab-grouper.log` |
| Managed policy as Chrome sees it | `chrome://policy` → the extension's section |

Stdout of the host and of the MCP server is a protocol channel; both log to stderr only.

## 6. Upgrading

1. Update the repository and run `npm ci`.
2. Deploy and reload as in [section 3](#3-deploy-a-change-to-the-local-runtime).
3. Check the popup. If the release raised the consent version, the extension asks for consent again before it sends
   anything: open the options page, accept the notice and save.
4. If the bridge is installed, run `node bridge/doctor.mjs`.

Cases that need one more step:

| Change | What to do |
|---|---|
| The deployed folder moved, or Node.js was reinstalled elsewhere | Run the bridge installer again |
| The extension id changed (for example from an unpacked build to the store listing) | Run the bridge installer again with the new id |
| `bridge/src` changed | Quit Claude Desktop completely, open it again and start a new chat |

Version numbers, the changelog and the Chrome Web Store upload are covered in [RELEASING.md](../RELEASING.md).

## 7. Recovery

| Situation | Recovery |
|---|---|
| Claude is paused by the circuit breaker | Options → "Test connection" resets it; check the key or proxy. It recovers on its own after 5 minutes |
| "Extension half-updated" | Press reload in `chrome://extensions` |
| "Claude Desktop: host not installed" | Run `node bridge/install.mjs --extension-id <EXTENSION_ID>`; restart Chrome |
| "Claude Desktop: reconnecting…" | The options page shows the exact error in parentheses. Run `node bridge/doctor.mjs`, then reinstall with the current id |
| Claude Desktop does not see the tools | Check `claude_desktop_config.json`, quit Claude Desktop completely, open it again and start a new chat |
| The Claude Desktop configuration is wrong after an install | Restore the `claude_desktop_config.json.bak-<timestamp>` copy next to it |
| The API key is gone after a restart | Default behavior (session storage) or the `apiKeyStorage=session` policy. Enter it again, and tick "Remember the key on this device" if the policy allows it |
| The service worker restarted | Nothing to do. Timers, the lock and the throttle clock are lost, which at worst causes one extra or earlier run; breaker state and the ledger survive in `chrome.storage.session` |
| Tabs you ungrouped are regrouped after a browser restart | Expected: the ledger lives in `chrome.storage.session` and is lost when the browser restarts |
| Two browser profiles with the bridge enabled break each other | Known finding (AR-07). Disable the bridge in one profile |
| Start over | Uninstall the bridge (`node bridge/install.mjs --uninstall --configure-claude`), remove the extension in `chrome://extensions` (this deletes its data), then follow the [usage guide](USAGE.md#2-install) |
