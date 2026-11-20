# Architecture

AI Tab Grouper is a Manifest V3 Chrome extension with no runtime dependencies.
It groups tabs by topic using a chain of three engines and, optionally, lets
Claude Desktop drive the grouping through a local bridge.

## Grouping pipeline

```
tabs.onUpdated(complete) ─► debounce ─► throttle per window ─► lock per window
        │
        ▼
 ledger ─► redact (PII) ─► managed policy + consent ─► provider chain ─► normalizeResult ─► tabGroups
                                                         │
                  Claude (own key, direct │ corporate proxy) ─fail/breaker─► Gemini Nano ─► domain heuristic
```

1. **Trigger.** Automatic mode reacts to finished navigations, debounced and
   throttled per window; manual mode is the popup or `Alt+Shift+G`.
2. **Ledger.** A tab the user pulled out of a group is not regrouped until it
   navigates to another host.
3. **Redaction.** Only the title, the host and optionally the path survive,
   with emails, tokens, UUIDs and long numbers masked. Query and fragment are
   dropped. Excluded hosts never leave the device.
4. **Policy and consent.** Managed policy can only restrict; no remote call is
   made without the current consent version.
5. **Provider chain.** Claude API → Gemini Nano (on-device) → domain heuristic.
   A circuit breaker pauses Claude after repeated failures.
6. **Validation.** Model output is forced into a schema and normalized: known
   tab ids only, sanitized names, whitelisted colors, minimum group size.
7. **Catch-all.** In manual mode and from Claude Desktop, tabs no topic claims
   go to a collapsed grey group called "Varios" (miscellaneous). Automatic
   mode never uses it, so loose tabs can still pair up later.

## Modules

| Module | Responsibility |
|---|---|
| `src/background.js` | Service worker: events, scheduling, per-window locking, messaging with sender validation, bridge handlers |
| `src/lib/config.js` | Settings, managed policy (`applyPolicy`), consent version, API key storage |
| `src/lib/classifier.js` | Provider chain and circuit breaker (injected dependencies, testable without Chrome) |
| `src/lib/providers/claude.js` | Messages API with a forced tool call; own-key or proxy mode (no key) |
| `src/lib/providers/nano.js` | On-device Prompt API with a response schema |
| `src/lib/heuristic.js` | Offline fallback by registrable domain |
| `src/lib/redact.js` · `validate.js` | Input minimization · validation of model output |
| `src/lib/resilience.js` | Retry with jitter and `retry-after`; persisted circuit breaker |
| `src/lib/ledger.js` | Remembers what the user ungrouped |
| `src/lib/catchall.js` · `grouper.js` | "Varios" catch-all group · applying groups to tabs |
| `src/lib/bridge.js` | Native-messaging link to the local bridge host, with backoff |
| `src/lib/prompt.js` | Prompt construction with escaped, delimited tab data |
| `src/popup/status.js` | Pure mapping from service-worker status to popup messages |

## Claude Desktop bridge

```
Claude Desktop ──MCP (JSON-RPC over stdio)──► bridge/src/mcp-server.js
                                                    │  local pipe / socket + ephemeral token
                                                    ▼
Chrome extension ◄──native messaging (stdio)── bridge/src/host.js
```

Chrome launches the native host when the extension connects, and only the
extension id listed in `allowed_origins` can launch it. The host exposes a
token-protected local endpoint (a named pipe on Windows, a Unix socket
elsewhere) that the MCP server uses to relay three tools: `list_tabs`,
`apply_tab_groups` and `ungroup_tabs`. Both the host and the extension enforce
the same method allowlist. See [bridge/README.md](../bridge/README.md) and
[ADR 0003](adr/0003-claude-desktop-mcp-bridge.md).

## Decisions

Architectural decisions are recorded in [docs/adr/](adr/README.md). The threat
model is in [THREAT_MODEL.md](THREAT_MODEL.md).
