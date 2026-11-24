# Diagrams

GitHub renders these Mermaid diagrams automatically. This file is the complete catalogue: every diagram that appears in
another document is repeated here unchanged. They complement the prose in [architecture.md](architecture.md).

## Contents

- [System context (C4 level 1)](#system-context-c4-level-1)
- [Components (C4 level 2)](#components-c4-level-2)
- [Sequences](#sequences)
- [State and lifecycle](#state-and-lifecycle)
- [Trust boundaries](#trust-boundaries)

## System context (C4 level 1)

The extension runs inside Chrome on your machine and talks to at most one remote system, and only with consent.

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

Dotted arrows are optional paths set by an administrator: the corporate proxy replaces the direct call to the Claude
API, and managed policy can only restrict what the extension does.

## Components (C4 level 2)

The extension is a service worker plus two pages; the bridge is two small Node.js processes.

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

Arrows show who calls whom. `classifier.js` receives the two model providers and the circuit breakers from
`background.js` instead of importing them.

### Module map

The module map shows the same modules together with the Chrome APIs and the external systems they reach.

```mermaid
flowchart TB
    subgraph pages["Extension pages"]
        popup["popup.js · status.js"]
        options["options.js"]
    end
    subgraph worker["Service worker"]
        bg["background.js<br/>events · debounce · throttle · per-window lock"]
        cfg["config.js<br/>settings · managed policy · consent · API key"]
        led["ledger.js<br/>per-tab outcome"]
        red["redact.js<br/>title · host · redacted path"]
        cls["classifier.js<br/>provider chain"]
        res["resilience.js<br/>retry · circuit breaker"]
        val["validate.js<br/>normalizeResult"]
        grp["grouper.js · catchall.js"]
        prm["prompt.js<br/>system prompt · schema"]
        pc["providers/claude.js"]
        pn["providers/nano.js"]
        heu["heuristic.js"]
        link["bridge.js<br/>native-messaging link"]
    end
    chromeapi["Chrome APIs<br/>tabs · tabGroups · storage"]
    api["Claude API<br/>or proxy set by managed policy"]
    nano["Gemini Nano<br/>Prompt API, on-device"]
    host["Bridge host + MCP server<br/>(optional)"]

    popup -- "runtime messages" --> bg
    options -- "runtime messages" --> bg
    options -- "test connection" --> pc
    bg --> cfg
    bg --> led
    bg --> red
    bg --> cls
    bg --> grp
    bg -- "breakers" --> res
    bg --> link
    cls --> pc
    cls --> pn
    cls --> heu
    cls --> val
    pc --> prm
    pn --> prm
    pc -- "withRetry" --> res
    pc -- "HTTPS" --> api
    pn --> nano
    cfg --> chromeapi
    grp --> chromeapi
    link <-- "native messaging" --> host
```

### Import graph

The import graph of the service worker shows the static dependencies; an arrow means "imports".

```mermaid
flowchart LR
    bg["background.js"] --> cls["classifier.js"]
    bg --> cfg["config.js"]
    bg --> grp["grouper.js"]
    bg --> led["ledger.js"]
    bg --> red["redact.js"]
    bg --> res["resilience.js"]
    bg --> val["validate.js"]
    bg --> ca["catchall.js"]
    bg --> br["bridge.js"]
    bg --> pc["providers/claude.js"]
    bg --> pn["providers/nano.js"]
    cls --> cfg
    cls --> heu["heuristic.js"]
    cls --> red
    cls --> val
    pc --> prm["prompt.js"]
    pc --> res
    pn --> prm
    prm --> val
    grp --> ca
    grp --> led
    led --> red
    bg --> i18n["i18n.js"]
    br --> i18n
    ca --> i18n
    prm --> i18n
    pc --> i18n
    pn --> i18n
```

### Bridge

The bridge is a chain of three local hops between Claude Desktop and the extension.

```mermaid
flowchart LR
    desktop["Claude Desktop"] -- "MCP (JSON-RPC over stdio)" --> mcp["bridge/src/mcp-server.js"]
    mcp -- "local pipe / socket<br/>+ ephemeral token" --> host["bridge/src/host.js"]
    host -- "native messaging (stdio)" --> ext["Chrome extension<br/>src/lib/bridge.js"]
```

## Sequences

### A grouping run from trigger to tab groups

A grouping run goes from a trigger to tab groups through redaction, the provider chain and validation.

```mermaid
flowchart LR
    ev["tabs.onUpdated<br/>status complete"] --> deb["debounce"]
    deb --> thr["throttle<br/>per window"]
    thr --> lock["lock<br/>per window"]
    man["popup · Alt+Shift+G"] --> lock
    lock --> led["ledger<br/>pick candidates"]
    led --> red["redact (PII)"]
    red --> chain["provider chain<br/>managed policy + consent"]
    chain --> norm["normalizeResult"]
    norm --> apply["tabs.group<br/>tabGroups.update"]
    apply --> rec["ledger + last run"]

    subgraph order["Provider chain"]
        direction LR
        c["Claude<br/>own key, direct or corporate proxy"] -- "fail / breaker" --> n["Gemini Nano"]
        n --> h["domain heuristic"]
    end
    chain -.-> order
```

The dotted arrow expands the provider chain: Claude first, then Gemini Nano, then the domain heuristic.

### Automatic grouping

A finished navigation triggers a run on the loose tabs of that window.

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

### Provider chain with fallback

The chain tries each engine in the default order and falls through on a skip or a failure.

```mermaid
sequenceDiagram
    autonumber
    participant BG as background.js
    participant CL as classifier.js
    participant BR as Circuit breaker
    participant PC as providers/claude.js
    participant API as Claude API or proxy
    participant PN as providers/nano.js
    participant HE as heuristic.js
    participant CH as Chrome tabs API

    BG->>BG: snapshot, ledger, candidates, toTabDescriptor
    BG->>CL: classifyTabs(input, settings, deps)
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
        Note over PN: Skipped unless available or if its breaker is open. First 30 tabs, 30 s timeout
        PN-->>CL: groups, or an error
    end
    opt no model produced a result
        CL->>HE: groupByDomain(all tabs)
        HE-->>CL: groups by registrable domain
    end
    CL->>CL: normalizeResult
    CL-->>BG: provider, groups, errors
    BG->>CH: tabs.group and tabGroups.update
    opt manual run and the catch-all is enabled
        BG->>CH: leftovers go to the catch-all group
    end
    BG->>BG: update ledger, record last run
```

### Claude Desktop groups the tabs

Claude Desktop first lists the tabs and then applies the groups it chose.

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

### A bridge tool call

A tool call travels from Claude Desktop to the Chrome tabs API and is checked at every hop.

```mermaid
sequenceDiagram
    participant D as Claude Desktop
    participant M as MCP server
    participant H as Native host
    participant SW as Service worker
    participant C as Chrome tabs API

    D->>M: tools/call (JSON-RPC over stdio)
    M->>M: validate arguments
    M->>H: request + token (named pipe or Unix socket)
    H->>H: check token and method allowlist
    H->>SW: native message
    SW->>SW: bridge enabled, consent, method allowlist
    alt list_tabs
        SW-->>H: redacted tabs, excluded hosts left out
    else apply_tab_groups
        SW->>SW: normalizeResult on eligible tab ids
        SW->>C: tabs.group and tabGroups.update
        SW-->>H: summary and tabs still loose
    end
    H-->>M: result
    M-->>D: text result, list_tabs data marked untrusted
```

## State and lifecycle

### Circuit breaker

Each model provider has a circuit breaker with three states, persisted in `chrome.storage.session`.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Closed: success resets the count
    Closed --> Open: 3rd failure in a row
    Open --> Trial: 5 minutes elapsed
    Trial --> Closed: success
    Trial --> Open: failure
```

## Trust boundaries

Untrusted input reaches the service worker only through a check, and data leaves the device only with consent.

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
        desktop["Claude Desktop"]
    end
    subgraph remote["Remote (consent required)"]
        api["Claude API or corporate proxy"]
    end
    policy["Managed policy<br/>(trusted, restricts only)"]
    tabs["chrome.tabs · chrome.tabGroups"]

    pages -- "escaped and delimited" --> sw
    model -- "schema + normalizeResult" --> sw
    own -- "sender id + origin" --> sw
    policy --> sw
    sw -- "HTTPS, minimized data" --> api
    sw <-- "allowed_origins = this id" --> host
    host <-- "ephemeral token" --> mcp
    mcp <-- "MCP over stdio" --> desktop
    sw -- "group and ungroup only" --> tabs
```

The bridge (native host, MCP server and Claude Desktop) exists only when the user installs and enables it. Whatever a
model answers, the only actions on tabs are grouping and, through the bridge, ungrouping.
