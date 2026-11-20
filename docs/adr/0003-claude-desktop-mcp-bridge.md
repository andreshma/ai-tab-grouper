# ADR-0003: MCP bridge to Claude Desktop through native messaging

## Status

Accepted - 2026-11-19

## Context

The user wants to use their signed-in Claude (subscription) instead of an API key. Anthropic forbids third parties from offering Claude.ai login, brokering subscription credentials or storing session tokens; the Chrome Web Store forbids circumventing restrictions of AI services. The permitted route is for Anthropic's native app (Claude Desktop) to use local tools through MCP.

## Decision

1. **Local MCP server** (`bridge/src/mcp-server.js`, stdio) registered in Claude Desktop. It exposes `list_tabs`, `apply_tab_groups`, `ungroup_tabs`.
2. **Native messaging** between the extension and a local host (`host.js`) launched by Chrome, restricted by `allowed_origins`.
3. **Local IPC** MCP ⇄ host over a named pipe / Unix socket (0600) with an ephemeral **session token**.
4. **Optional** `nativeMessaging` permission, requested only when the bridge is enabled.
5. MCP **implemented by hand** (minimal JSON-RPC), zero runtime dependencies.
6. Same data model and consent as the API provider (bump `CONSENT_VERSION` → 2).

## Consequences

- ✅ Uses the user's subscription within the terms (Claude Desktop is the client; we never touch credentials).
- ✅ No API cost; no key on the device.
- ✅ Installing the extension from the store requires no new permissions (optional).
- ⚠️ On demand (or scheduled task), not reactive to every tab like auto mode.
- ⚠️ Requires Node.js and a local installation step per user.
- ⚠️ Hand-written MCP: the evolution of the protocol has to be tracked (mitigated: version negotiation + handshake tests).
- ⚠️ New threat: indirect prompt injection towards an agent that has other tools (see [threat model](../THREAT_MODEL.md) T11).

## Alternatives

| Alternative | Rejected because |
|---|---|
| WebSocket on localhost instead of native messaging | Any web page can open `ws://localhost`; it requires auth and a DNS-rebinding defense; native messaging restricts by extension ID |
| Official `@modelcontextprotocol/sdk` SDK | Adds a runtime dependency tree; for 3 tools the minimal protocol is small. Reconsider if resources, prompts or HTTP transport are needed |
| Use claude.ai cookies/session from the extension | Forbidden by Anthropic and by CWS |
| Claude in Chrome | Only operates on the tabs of its own group; no API for third parties |
| Package as a Desktop Extension (.mcpb) | 1-click installation; next step once the flow is validated |
