# 0002. Enterprise hardening - managed policy, corporate proxy and ephemeral credentials

- Status: Accepted (supersedes the "API key in `chrome.storage.local`" consequence of
  [0001](0001-hybrid-ai-provider.md))
- Date: 2026-11-19

## Context and problem statement

[ADR 0001](0001-hybrid-ai-provider.md) accepted storing the API key in `chrome.storage.local` (plain text in the
profile). Corporate deployment has requirements that this does not meet.

## Decision drivers

Corporate deployment requires:

- Secrets in a vault.
- Central IT control.
- Audit/DLP.
- Compliance with the Chrome Web Store disclosure policy (explicit consent, July 2026).

## Considered options

The chosen option is the set of controls described under [Decision](#decision). The alternatives:

| Alternative | Rejected because |
|---|---|
| Encrypt the key in `storage.local` with a locally derived key | Security theater: the decryption key lives next to the ciphertext |
| `chrome.identity` + own OAuth towards a backend | Requires the `identity` permission and an identity backend; the proxy's SSO (IAP/Entra App Proxy) covers the same need with no extra permissions |
| Broad `optional_host_permissions` for the proxy | Review flags in CWS; CORS on the proxy avoids the permission |
| Use the user's claude.ai session | Forbidden by Anthropic (no brokering of subscription credentials) and by CWS (circumventing restrictions of AI services) |

## Decision

1. **Managed policy** (`chrome.storage.managed` + `managed_schema.json`), deployable through GPO / Intune / Google
   Admin. Rule: the policy **only restricts** (providers, paths, auto, models, BYOK, key storage, exclusions); the
   single exception is `proxyEndpoint`.
2. **Proxy mode**: if IT sets `proxyEndpoint` (HTTPS), the extension sends no API key; the proxy (Cloud Run / Lambda /
   APIM) injects the key from Secret Manager/Key Vault, authenticates through SSO (`credentials:'include'`), and applies
   DLP, rate limiting, a model allowlist and auditing. The proxy's CORS allows only `chrome-extension://<ID>`.
3. **Ephemeral BYOK by default**: `storage.session` (memory). Persisting is opt-in; IT can forbid it.
4. **Versioned consent** (`CONSENT_VERSION`), mandatory before any remote transmission.
5. **Strict CSP** (`default-src 'self'`, no inline), message sender validation, `cws-check` gate in CI.

## Consequences

- ✅ The key leaves the endpoint in corporate deployments; central traceability.
- ✅ IT can enforce a "local only" mode (`allowedProviders: ["nano","heuristic"]`).
- ⚠️ Session BYOK requires re-entering the key after restarting Chrome (accepted friction).
- ⚠️ `connect-src https:` is needed for a configurable proxy; mitigated (endpoint only from policy, no remote code).
- ⚠️ Requires building/operating the proxy (out of scope for the extension).
