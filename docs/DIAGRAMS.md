# Diagrams

Rendered by GitHub automatically (Mermaid). They complement the prose in
[ARCHITECTURE.md](ARCHITECTURE.md).

## System context (C4 level 1)

```mermaid
flowchart TB
    user(["User"])
    admin(["IT administrator<br/>(optional)"])
    subgraph machine["This machine"]
        chrome["Chrome"]
        ext["AI Tab Grouper<br/>extension (MV3)"]
        nano["Gemini Nano<br/>on-device model"]
        bridge["Local bridge<br/>native host · MCP server<br/>(optional)"]
        desktop["Claude Desktop<br/>(optional)"]
    end
    claude["Claude API<br/>api.anthropic.com"]
    proxy["Corporate proxy<br/>(optional, by policy)"]

    user -- "browses, clicks the popup" --> chrome
    chrome -- "tab events" --> ext
    ext -- "tab groups" --> chrome
    ext -- "prompt (local)" --> nano
    ext -- "title · host · redacted path<br/>(only with consent)" --> claude
    ext -. "same payload, no key" .-> proxy
    admin -. "managed policy<br/>(restricts only)" .-> ext
    user -- "organize my tabs" --> desktop
    desktop -- "MCP tools" --> bridge
    bridge -- "native messaging" --> ext
```

## Components (C4 level 2)

Arrows show who calls whom. `classifier.js` receives the two model providers
and the circuit breakers from `background.js` instead of importing them.

```mermaid
flowchart TB
    subgraph ext["Extension"]
        ui["popup · options<br/>(own pages only)"]
        sw["background.js<br/>service worker: events · scheduling · locks · messaging"]
        cfg["config.js<br/>settings · applyPolicy · consent"]
        ledger["ledger.js<br/>what the user ungrouped"]
        redact["redact.js<br/>minimization · PII masking"]
        cls["classifier.js<br/>provider chain"]
        res["resilience.js<br/>retry · circuit breaker"]
        pc["providers/claude.js"]
        pn["providers/nano.js"]
        ph["heuristic.js"]
        prm["prompt.js<br/>system prompt · schema"]
        val["validate.js<br/>normalizeResult"]
        grp["grouper.js · catchall.js"]
        link["bridge.js<br/>native-messaging link"]
    end
    subgraph br["Bridge (optional)"]
        host["host.js<br/>native host · token · allowlist"]
        mcp["mcp-server.js · tools.js<br/>MCP over stdio"]
    end

    ui -- "validated messages" --> sw
    sw --> cfg
    sw --> ledger
    sw --> redact
    sw --> cls
    sw -- "breakers" --> res
    sw --> grp
    cls --> pc
    cls --> pn
    cls --> ph
    cls --> val
    pc --> prm
    pn --> prm
    pc -- "withRetry" --> res
    sw <--> link
    link <-- "stdio frames" --> host
    host <-- "pipe / socket + token" --> mcp
```

## Sequence — automatic grouping

```mermaid
sequenceDiagram
    participant C as Chrome
    participant SW as Service worker
    participant R as redact
    participant P as Provider chain
    participant V as normalizeResult

    C->>SW: tabs.onUpdated (complete)
    SW->>SW: debounce, throttle and lock per window
    SW->>SW: loose tabs the ledger allows
    SW->>R: candidate tabs
    R-->>SW: title · host · redacted path
    alt consent accepted and Claude available
        SW->>P: Claude (forced tool call), without excluded hosts
        P-->>SW: groups, or failure
    end
    opt Claude unavailable or failed
        SW->>P: Gemini Nano (on-device)
    end
    opt no model available
        SW->>P: domain heuristic
    end
    P->>V: raw result
    V-->>SW: known ids · sanitized names · whitelisted colors
    SW->>C: tabs.group / tabGroups.update
    Note over SW,C: No catch-all group in automatic mode
```

## Sequence — provider chain with fallback

What happens inside the provider chain, in the default order.

```mermaid
sequenceDiagram
    autonumber
    participant CL as classifier.js
    participant BR as Circuit breaker
    participant PC as providers/claude.js
    participant API as Claude API or proxy
    participant PN as providers/nano.js
    participant HE as heuristic.js

    CL->>BR: isOpen for claude
    alt breaker open, no consent, or no key and no proxy
        Note over CL: Claude is skipped and the reason is recorded
    else Claude is usable
        Note over CL: Tabs on excluded hosts are kept back
        CL->>PC: classifyWithClaude(remaining tabs)
        loop up to 3 attempts
            PC->>API: POST with forced tool call, 20 s timeout
            API-->>PC: tool_use, or an error
            Note over PC: Retry on 408, 429, 5xx, timeout, network error
        end
        alt success
            PC-->>CL: groups
            CL->>HE: groupByDomain(excluded-host tabs)
            CL->>BR: recordSuccess
        else failure
            PC-->>CL: error
            CL->>BR: recordFailure
            Note over BR: 3 failures in a row open it for 5 minutes
        end
    end
    opt Claude was skipped or failed
        CL->>PN: availability, then classifyWithNano
        Note over PN: Skipped unless available or if its breaker is open
        PN-->>CL: groups, or an error
    end
    opt no model produced a result
        CL->>HE: groupByDomain(all tabs)
        HE-->>CL: groups by registrable domain
    end
    CL->>CL: normalizeResult
```

## Circuit breaker

One per model provider, persisted in `chrome.storage.session`.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Closed: success resets the count
    Closed --> Open: 3rd failure in a row
    Open --> Trial: 5 minutes elapsed
    Trial --> Closed: success
    Trial --> Open: failure
```

## Sequence — Claude Desktop groups the tabs

```mermaid
sequenceDiagram
    participant D as Claude Desktop
    participant M as MCP server
    participant H as Native host
    participant SW as Service worker
    participant C as Chrome

    Note over H,SW: Chrome started the host when the user enabled the bridge
    D->>M: tools/call list_tabs
    M->>M: validate arguments
    M->>H: request + token (pipe / socket)
    H->>H: check token and method allowlist
    H->>SW: native message
    SW->>SW: consent · policy · excluded hosts · redaction
    SW-->>H: redacted tab list
    H-->>M: result
    M-->>D: list marked as untrusted data, "<" escaped
    D->>M: tools/call apply_tab_groups
    M->>H: request + token
    H->>SW: native message
    SW->>SW: normalizeResult (eligible ids only)
    SW->>C: tabs.group / tabGroups.update (+ catch-all group)
    SW-->>D: summary of what was grouped
```

## Trust boundaries

```mermaid
flowchart LR
    subgraph untrusted["Untrusted input"]
        pages["Web pages<br/>titles and URLs"]
        model["Model output<br/>Claude · Gemini Nano · Claude Desktop"]
    end
    subgraph trusted["Extension (trusted code)"]
        sw["Service worker"]
        own["Popup and options pages"]
    end
    subgraph local["Same user, local"]
        host["Native host"]
        mcp["MCP server"]
    end
    subgraph remote["Remote (consent required)"]
        api["Claude API or corporate proxy"]
    end
    policy["Managed policy<br/>(trusted, restricts only)"]

    pages -- "escaped and delimited" --> sw
    model -- "schema + normalizeResult" --> sw
    own -- "sender id + origin" --> sw
    policy --> sw
    sw -- "HTTPS, minimized data" --> api
    sw <-- "allowed_origins = this id" --> host
    host <-- "ephemeral token" --> mcp
```
