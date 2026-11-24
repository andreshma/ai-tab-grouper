# Privacy Policy - AI Tab Grouper

_Last updated: 2026-11-19 · Data notice version: 2_

## Single purpose

AI Tab Grouper groups Chrome tabs by topic. Every piece of data the extension reads is used **only** to decide which group each tab belongs to.

## What data it reads

| Data | Source | Where it is processed |
|---|---|---|
| Tab title | `chrome.tabs` | Locally; and at Anthropic **only** if you enable Claude and accept the notice |
| URL domain | `chrome.tabs` | Same as above |
| URL path (max. 4 segments, redacted) | `chrome.tabs` | Same as above, only if you enable "Enviar ruta" ("Send path") |
| Names of your existing tab groups | `chrome.tabGroups` | Same as the tab title, so new tabs can join them. Groups that hold a site you excluded are left out |
| Preferences (including the excluded sites and your consent) | You | In your browser (`chrome.storage.sync`); Chrome syncs them to your other devices if you use Chrome Sync |
| API key | You | In your browser only, never synced |

The extension reads each tab's address locally to extract the domain and the path. The following are **never** sent: URL parameters (`?…`) and fragments (`#…`); page content, cookies, passwords, forms and history are never read at all. A tab whose title is just its address (pages without a title) is sent without a title. Before anything is sent, emails, long identifiers, UUIDs and numbers with 5 or more digits are masked. Masking is best effort: avoid putting secrets in tab group names, and exclude sensitive sites.

## Who it is shared with

- **Anthropic, PBC** (api.anthropic.com), only if you enable Claude and accept the notice in the extension's "Settings" page, using **your own** API key; or **your organization's proxy** if IT configured one. Processing at Anthropic is governed by the terms of your account/organization with Anthropic.
- **Your Claude Desktop session**, only if you enable the local bridge and accept the notice: the data goes through a local program installed by you and reaches your conversation with Claude when you ask it to organize your tabs.
- **Nobody else.** The developer of the extension operates no servers, does not receive, store, sell or share data, and uses no analytics or telemetry.
- Gemini Nano (optional) and grouping by domain run **100% on your device**.

## Storage and retention

- The API key is stored only in your browser: in memory (cleared when Chrome closes) or, if you choose so, in local storage. It is never synced.
- The per-tab decision log lives in session memory and is cleared when Chrome closes.
- You can delete the extension's data by uninstalling it, or the key alone with "Eliminar key" ("Delete key"). If you installed the Claude Desktop bridge, remove it with `node bridge/install.mjs --uninstall --configure-claude`.

## User control

You can disable Claude, prefer local Gemini Nano, exclude domains so that they never leave the device, and turn off path sending. If we change which data is sent, the extension will ask you for new consent before sending anything.

## Limited use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

The data is not used for advertising, is not sold to third parties, and is not used to assess creditworthiness. The developer never receives it, so nobody on the developer's side can read it.

## Contact

- Security issues: report them privately through GitHub private vulnerability reporting at https://github.com/andreshma/ai-tab-grouper/security/advisories/new
- Privacy questions that are not security issues: https://github.com/andreshma/ai-tab-grouper/discussions
