# 0001. Hybrid AI provider chain (Claude → Gemini Nano → heuristic)

- Status: Accepted (the "API key in `chrome.storage.local`" consequence is superseded by
  [0002](0002-enterprise-hardening.md))
- Date: 2026-11-19

## Context and problem statement

The extension must classify tabs by topic with good quality, work without configuration and not leak sensitive data from
the browsing history.

## Decision drivers

- Automatic and manual grouping.
- Perceived latency < 3 s p95.
- Marginal cost ~0.
- Graceful degradation.

## Considered options

The chosen option is the hybrid chain described under [Decision](#decision). The alternatives:

| Alternative | Rejected because |
|---|---|
| Own backend proxy (key in a vault, central rate limit) | Infrastructure + cost + operations for a personal extension; recommended when the extension is deployed across an organization (see next steps) |
| Nano only | Availability depends on hardware/version; lower quality in semantic classification |
| Heuristic only | Does not group by task (e.g. "Travel" = skyscanner + booking) |
| Embeddings + local clustering | Requires an embeddings model in the browser; more complexity; less natural group names |
| Nano through an offscreen document | Adds complexity; adopted only if the SW does not expose `LanguageModel` in the target version |

## Decision

1. **Claude API (BYOK) as primary**, small-tier model (`claude-haiku-5-5`), structured output through forced
   `tool_choice`. Direct call from the extension with `anthropic-dangerous-direct-browser-access`.
2. **Gemini Nano (Prompt API)** as the second provider, with a JSON Schema `responseConstraint`. The `preferOnDevice`
   toggle reverses the order.
3. **Domain heuristic** as the terminal provider: it never fails and works offline.
4. Resilience: retry with backoff + jitter (honors `retry-after`), per-provider circuit breaker (3 failures / 5 min)
   persisted in `storage.session`.
5. Minimization before any provider + validation of all output afterwards.

## Consequences

- ✅ High quality by default; works without a key; no backend of our own (zero infrastructure, zero operating cost).
- ✅ Claude failures (429/529/network) do not block the user.
- ⚠️ **API key in `chrome.storage.local`**: there is no vault in the browser. Mitigation: dedicated key with a spend
  limit, never synced, strict CSP. Deliberate deviation from the usual rule of keeping secrets in a vault.
- ⚠️ Titles/hosts leave for Anthropic when Claude is used (redacted). `excludedHosts` and `preferOnDevice` cover
  sensitive users.
- ⚠️ Nano may not be exposed in service workers depending on the version → it is skipped.
- Prompt caching does not apply: the prefix (system + tool) is below the minimum cacheable size.

### Next steps

- Corporate distribution: proxy (Cloud Run/Lambda) with the key in Secret Manager, user OAuth, rate limiting and central
  DLP; the extension only changes the provider endpoint.
