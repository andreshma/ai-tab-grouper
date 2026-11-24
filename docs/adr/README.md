# Architecture Decision Records

Non-trivial design decisions for AI Tab Grouper, each recorded as Status, Context, Decision, Consequences and Alternatives.

| # | Title | Status |
|---|---|---|
| [0001](0001-hybrid-ai-provider.md) | Hybrid AI provider chain (Claude → Gemini Nano → heuristic) | Accepted (API key storage section superseded by 0002) |
| [0002](0002-enterprise-hardening.md) | Enterprise hardening - managed policy, corporate proxy and ephemeral credentials | Accepted |
| [0003](0003-claude-desktop-mcp-bridge.md) | MCP bridge to Claude Desktop through native messaging | Accepted |
| [0004](0004-internationalization.md) | Internationalization - English by default, Spanish as a second locale | Accepted |

To add one, copy [template.md](template.md) to `000N-short-title.md`, fill it in and add a row to the table above.
