# Threat Model - AI Tab Grouper (STRIDE + OWASP LLM Top 10)

_Applies to version 1.4.2 · last reviewed 2026-11-20_

## Assets

| Asset | Classification |
|---|---|
| Tab titles/URLs (browsing activity) | Confidential (may contain PII, business data) |
| Anthropic API key (BYOK) | Secret |
| Integrity of the tab organization | Low |

## Trust boundaries

```
[Web pages] ──titles/URLs (untrusted)──► [Service worker] ──HTTPS──► [api.anthropic.com | Corp proxy]
                                             ▲   │  ▲
                        [Popup/Options] ─────┘   │  └──native messaging──► [Native host] ◄──pipe + token── [MCP server] ◄──stdio── [Claude Desktop]
                        [IT policy (managed storage, trusted)]                 └──► chrome.tabGroups
```

The bridge (native host, MCP server and Claude Desktop) exists only when the
user installs and enables it. Diagrams: [DIAGRAMS.md](DIAGRAMS.md#trust-boundaries).
The red-team pass over these controls is in
[ADVERSARIAL_REVIEW.md](ADVERSARIAL_REVIEW.md).

## Threats and controls

| # | STRIDE / OWASP | Threat | Control | Residual risk |
|---|---|---|---|---|
| T1 | Information disclosure · LLM02 | Leak of PII/tokens in URLs to the provider | No query/fragment; email/ID/UUID/number redaction; `sendPath` off by policy; local `excludedHosts`; versioned consent | Low: titles may contain sensitive data → `excludedHosts` / Nano / `allowedProviders` |
| T2 | Information disclosure | API key theft from the profile | Default `storage.session` (memory); policy `apiKeyStorage=session` or `proxyEndpoint` (key off the device); `credentials:'omit'` towards Anthropic | Low with proxy; Medium with persistent BYOK (opt-in) |
| T3 | Tampering · LLM01 | Prompt injection through the page title | `<tabs>` delimiter with `<` escaped; "data, not instructions" system prompt; forced `tool_choice`; `normalizeResult` (known ids, sanitized name, bidi/zero-width removed, color whitelist) | Low: worst case, wrong names or groupings (through the bridge, also ungrouping); tabs are never closed, navigated or read |
| T4 | Elevation of privilege | A page/another extension invokes SW actions | No content scripts or `externally_connectable`; `isTrustedSender` (extension id + origin) | Very low |
| T5 | Tampering | Remote code / XSS in extension pages | Strict CSP; no `innerHTML`; ESLint + `cws-check` block sinks | Very low |
| T6 | Spoofing | Fake proxy / MITM | Proxy only from managed storage (IT), HTTPS only with no embedded credentials; `redirect:'error'` | Low |
| T7 | DoS · LLM10 | Runaway cost / rate limit | Debounce, per-window throttle, `maxTabsPerRequest`, bounded retry, circuit breaker | Low |
| T8 | Repudiation | No traceability of what was sent | The corporate proxy centralizes audit/DLP; the extension does not log tab data | Low with proxy |
| T9 | Supply chain | Compromised dependency | 0 runtime deps; lockfile; `npm audit`; SBOM; CodeQL; Trojan Source scan | Low |
| T10 | LLM05/LLM06 | Model output executes actions | Only possible actions: `tabs.group`/`tabGroups.update` on validated ids and, through the bridge, `tabs.ungroup` | Very low |

### Claude Desktop bridge (since 1.2.0)

| # | STRIDE / OWASP | Threat | Control | Residual risk |
|---|---|---|---|---|
| T11 | Tampering · LLM01 (indirect) | A malicious title instructs Claude Desktop to use **other** tools (email, files) | `list_tabs` output marked "untrusted" and delimited with `<` escaped; MCP server instructions; the extension does not expose page content; client-side HITL on sensitive tools | **Medium**: depends on the robustness of the model and on which other MCP servers the user has. Recommend manual tool approval in Claude Desktop |
| T12 | Spoofing / EoP | Another local process connects to the pipe/socket and reads tabs | Ephemeral 256-bit token (0600 file in a 0700 dir), constant-time comparison, 0600 socket, deleted on close | Low (same user = same trust boundary) |
| T13 | Spoofing | Another extension/app launches the host | `allowed_origins` = this ID only; registration in HKCU/the user's profile | Very low |
| T14 | Tampering | Claude sends arbitrary ids / other windows | Validation in MCP and in the extension; eligible ids only (not pinned, http(s), not excluded) | Very low |
| T15 | DoS | Huge messages / flood | Limits: 1 MB host→Chrome, 8 MB Chrome→host, 4 MB per IPC line, 8 clients, 15-20 s timeouts, max. 200 tabs | Low |

## Accepted risk decisions

- Persistent BYOK (`storage.local`) is a user opt-in and can be disabled by policy. See [ADR-0002](adr/0002-enterprise-hardening.md).
- `connect-src https:` in the CSP to allow the configurable proxy; compensated because the endpoint can only come from managed policy and there is no remote code.

## Review

Review on every change to: data sent (→ bump `CONSENT_VERSION`), permissions, providers or CSP.
