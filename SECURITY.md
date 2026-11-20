# Security Policy

AI Tab Grouper reads the titles and URLs of your open tabs and can send a
reduced form of them to an AI model. It also ships an optional local bridge
that lets Claude Desktop list and group your tabs. This document explains how
to report a vulnerability and summarizes the security model.

## Supported versions

| Version | Security fixes |
|---|---|
| 1.4.x | Yes |
| < 1.4 | No — upgrade to the latest 1.4 release |

Fixes land on `main` and in the next 1.4.x release.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:
<https://github.com/andreshma/ai-tab-grouper/security/advisories/new> ("Report
a vulnerability" under the repository's Security tab). Please include the
affected version or commit, a description of the issue and its impact, and
reproduction steps (describe the *class* of problem; do not include a
weaponized exploit). Do not include real tab titles, URLs, API keys or the
bridge token.

The maintainer (GitHub: andreshma) aims to acknowledge within **5 business
days**, agrees a disclosure date with you, and credits you in the advisory
unless you prefer otherwise.

## Security model

| Control | Implementation |
|---|---|
| Least privilege | `tabs`, `tabGroups`, `storage`; a single host (`api.anthropic.com`); `nativeMessaging` is optional and requested only when the user enables the bridge; no content scripts, no web-accessible resources |
| No remote code | CSP `script-src 'self'`; the `cws-check` gate blocks `eval`, `new Function`, remote imports and HTML sinks |
| Strict CSP | `default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self'` |
| Secrets | The user's own API key lives in `storage.session` by default; the `proxyEndpoint` policy moves the key out of the endpoint entirely (vault-backed proxy) |
| Consent | Nothing leaves the device (API, proxy or bridge) without the current consent version accepted |
| Data minimization | Title, host and optionally a redacted path. Never query, fragment, page content or cookies; PII redaction; `excludedHosts` are never sent |
| Prompt injection (OWASP LLM01) | Tab data is delimited and escaped; model output is forced into a schema and validated (known ids, sanitized names, whitelisted colors); the model can do nothing but group tabs |
| Messaging | Only the extension's own pages are trusted (`sender.id` plus the `chrome-extension://<id>` origin) |
| Bridge | Zero runtime dependencies; method allowlist in both the native host and the extension; ephemeral token in a user-only directory; `allowed_origins` restricted to this extension's id |
| Supply chain | Zero runtime dependencies; dev dependencies audited (`npm audit`), CycloneDX SBOM, CodeQL, CI actions pinned by commit SHA |
| Trojan Source | CI scans the code for bidirectional and zero-width characters |

**Known limitation:** tab titles are attacker-controlled text (any web page
sets its own title). A title could try to instruct the model that groups the
tabs, or Claude Desktop when it reads `list_tabs`. The extension limits the
impact: titles are escaped and delimited, the output of `list_tabs` is marked
as untrusted data, and whatever the model answers can only become tab groups
with sanitized names. See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the
full analysis.
