# Adversarial Review

A red-team pass over AI Tab Grouper. Instead of checking that the happy path
works, each scenario assumes an attacker and asks *what could go wrong, and
does the design hold?* Scenarios are rated **HOLDS**, **HOLDS with a caveat**,
or **OPEN** (a finding, with an ID in the [findings table](#findings)).

- **2026-11-20**, against version 1.4.1: findings AR-01 to AR-19. The three
  Medium findings were fixed in 1.4.2; the rest are open — see
  [Remediation status](#remediation-status). File:line references point at the
  code of that date, before the fixes.

Every finding records how it was established:

- **Probe**: reproduced by running the real modules against crafted input in a
  throwaway directory. No browser, no real tabs and no network were involved.
- **Code**: established by reading the code only.

> A self-run red team is not a substitute for an independent audit. Treat this
> as a list of known weak spots, not a certificate.

## Contents

- [Attacker model](#attacker-model)
- [What was not verified](#what-was-not-verified)
- [Scenarios](#scenarios)
- [Findings](#findings)
- [Remediation status](#remediation-status)
- [What held](#what-held)
- [Suggested order](#suggested-order)

## Attacker model

- **A hostile web page.** It controls its own tab title and URL, and through
  them tries to steer the grouping model or Claude Desktop (indirect prompt
  injection), break the prompt delimiter, exhaust the service worker or run up
  the user's API bill.
- **A page or another extension sending runtime messages** to the extension.
- **Another local process without the bridge token.** It can reach the local
  pipe or socket but cannot read the token file. Another user on the same
  machine is in the same position.
- **A hostile or compromised model**, including Claude Desktop, sending tool
  arguments.
- **A hostile corporate proxy or a tampered managed policy.**
- **Accidental faults that act like attacks:** service-worker restarts, two
  browsers with the bridge enabled, an installer run with odd arguments.
- **Out of scope:** an attacker already running as the same OS user with file
  access. They can read the token and the browser profile, and so already
  win. Such items are listed for robustness only.

## What was not verified

Nothing was run in a real Chrome, and no Windows machine was available to the
review. Not verified: that Chrome uses the URL as the title of untitled
documents and how long a title or URL it hands to an extension; incognito
behavior; cookie and CORS handling for the proxy; the Windows named-pipe
namespace and permissions; how `cmd` reads the launcher. Everything about the
native host's socket handling is from reading the code, because the review
sandbox could not open Unix sockets.

## Scenarios

### 1. A title breaks the prompt delimiter or forges tab entries — **HOLDS**

Tab data is JSON-serialized and every `<` is escaped (`src/lib/prompt.js:58`);
`list_tabs` output gets the same treatment (`bridge/src/tools.js:136-137`).
Probe: a title built to close the block and append a fake tab produced no raw
`<` and round-tripped as one tab.

### 2. Indirect prompt injection toward Claude Desktop — **HOLDS with a caveat (AR-16)**

`list_tabs` output carries an untrusted-data notice and a delimiter
(`bridge/src/tools.js:14-15,137`), repeated in the server instructions
(`bridge/src/mcp-server.js:26`). The residual risk depends on the model and on
the user's other MCP tools. Invisible format characters in titles pass through
unchanged (Probe), so an instruction can be hidden from a person reading the
tool result, and the end-to-end case TC-10 has not been executed.

### 3. Smuggling data in group names — **HOLDS with a caveat (AR-16)**

Names lose control characters and are capped at 24 code points
(`src/lib/validate.js:29-36`); ids must be known and colors whitelisted. A page
cannot read group titles back, so there is no return channel. Some bidirectional
and tag characters are kept, and existing group names are re-sent to the model
without being marked as untrusted (`src/lib/prompt.js:41`).

### 4. Oversized input stalls redaction — **OPEN (AR-03)**

The email pattern (`src/lib/redact.js:9`) was quadratic on a long run of
address characters without an `@`. Probe: 20,000 characters took 250 ms and
100,000 took about 10 s. Redaction ran on the whole title and on each path
segment before truncation, for every engine, with automatic grouping on by
default.

### 5. A page drives paid calls — **OPEN (AR-05)**

A tab left loose that moves to a new host is a fresh candidate
(`src/lib/ledger.js:29-43`). A page hopping across subdomains can trigger one
call per `minIntervalMs` (10 s by default) for as long as it stays open. There
is no daily or session budget, and the throttle lives in memory only.

### 6. Runtime messages from pages or other extensions — **HOLDS**

`isTrustedSender` requires the extension id and its own origin
(`src/background.js:352-359`). The manifest has no `externally_connectable`, no
content scripts and no web-accessible resources. Message types and window ids
are validated. The integration tests for untrusted senders pass.

### 7. POSIX token and socket — **HOLDS**

The state directory is forced to 0700 and the token is created 0600
(`bridge/src/ipc.js:52-66`). Probe: a pre-existing 0755 directory is tightened.
The socket lives inside that directory and is set to 0600 after listening
(`bridge/src/host.js:29,100-102`).

### 8. Windows named pipe: squatting and a stale token — **OPEN (AR-06)**

The pipe name is derived from the state directory path alone
(`bridge/src/ipc.js:40-44`), so it is predictable. The client sends the token
to whatever answers on that name (`bridge/src/ipc.js:86-103`). Another local
user who creates the name first stops the bridge from starting; after a hard
kill the stale token goes to them, and they can return forged results. No tab
data is disclosed, since the real host still requires the token. Code only.

### 9. Slot exhaustion, frames, allowlist, timeouts — **HOLDS with a caveat (AR-12, AR-15)**

The method allowlist is enforced in the host and again in the extension. Probe:
the size caps work and malformed JSON is rejected. Caveats: the 8 client slots
are counted before authentication with no deadline; the line decoder corrupts a
multi-byte character split across chunks; a line over 4 MB kills the MCP
server.

### 10. Two hosts at once — **OPEN (AR-07, AR-08)**

Every host start overwrites the single token file and every exit deletes it
without checking ownership (`bridge/src/host.js:28-30,111-112`). Two browser
profiles with the bridge enabled break each other. The reconnect loop never
backs off, because the attempt counter resets as soon as `connectNative`
returns, which in Chrome is always (`src/lib/bridge.js:65-66`).

### 11. Hostile tool arguments — **HOLDS with a caveat (AR-17)**

The MCP layer validates types, ranges, colors and sizes
(`bridge/src/tools.js:96-126`) and the extension validates again: only eligible
tab ids in that window, sanitized names, consent checked on every call.
Caveats: `ungroup_tabs` acts on every group in any window, and
`apply_tab_groups` is annotated as non-destructive although it can dissolve
groups the user made. Confirmation exists only as tool-description text.

### 12. Tampered policy and hostile proxy — **HOLDS with a caveat (AR-09, AR-19)**

Probe: policy cannot enable the bridge, consent, automatic grouping or path
sending. Proxy URLs must be HTTPS without credentials; proxy mode sends no key
and refuses redirects. Caveats: an invalid `proxyEndpoint` is silently dropped,
so the extension falls back to a direct call instead of failing closed;
`apiKeyStorage: 'local'` forces the key to disk; proxy responses are unbounded.

### 13. Query strings and fragments leaving the device — **OPEN (AR-01)**

The URL path is handled correctly, and page content is unreachable with these
permissions. The title was not checked against the URL. Chrome shows the
address as the title of documents without one, so such a tab was described
with its query string and fragment in `title` (`src/lib/redact.js:71`; Probe).

### 14. Excluded hosts — **OPEN (AR-02, AR-04)**

Excluded tabs are withheld from every remote path, but their host label
leaked: they are grouped locally under a name derived from the host, and on
the next run every group title in the window was sent as context (Probe).
Separately, entries are matched exactly as typed: `https://bank.example`,
`*.bank.example` or `bank.example:443` exclude nothing, with no warning.

### 15. Consent on every outbound path — **HOLDS with a caveat (AR-10, AR-11)**

The API, the proxy and all three bridge data methods check consent; the
connection test sends synthetic tabs. Caveats: user-written group titles were
sent without being disclosed; consent is synced with the account; there is no
incognito filter.

### 16. Logs, errors and doctor output — **HOLDS**

Nothing logs titles or URLs: not the extension, not the host, not the MCP
server, not the doctor, which prints counts, versions and paths only.

### 17. Restarts, circuit breaker, version skew — **HOLDS with a caveat**

State that matters is in `storage.session`, and settings are re-read on every
call. A restart between applying groups and writing the ledger loses that
record; after its cooldown the breaker admits every concurrent caller rather
than one trial; bridge handlers do not take the per-window lock.

### 18. Installer with odd arguments — **OPEN, low severity (AR-13, AR-14)**

The extension id check is strict and `reg` is called without a shell. The
launcher, however, interpolates paths into shell and batch syntax: a checkout
directory named with `$(…)` is expanded by `sh` (Probe). `--uninstall` aborts
when the registry key is absent, and an unknown `--browser` value is not
rejected cleanly.

### 19. Packaging and CI — **HOLDS with a caveat (AR-18)**

Probe: the built zip holds only runtime files plus `LICENSE` and `NOTICE`.
Workflows are read-only with actions pinned by commit. The zip gate is a
denylist, though, and the zip reader accepts a forged end record placed in the
archive comment.

## Findings

| ID | Severity | Finding | Where | Status |
|---|---|---|---|---|
| AR-01 | Medium | A title that is the URL carries query and fragment off the device | `src/lib/redact.js` | Fixed in 1.4.2 |
| AR-02 | Medium | Excluded-host label leaks through group titles | `src/lib/classifier.js`, `src/background.js` | Fixed in 1.4.2 |
| AR-03 | Medium | Quadratic email pattern on untruncated input stalls the service worker | `src/lib/redact.js` | Fixed in 1.4.2 |
| AR-04 | Low | Excluded-host entries are not normalized; mistakes fail open | `src/options/options.js`, `src/lib/redact.js` | Open |
| AR-05 | Low | No spend cap; a host-hopping tab drives a paid call every interval | `src/lib/ledger.js`, `src/background.js` | Open |
| AR-06 | Low | Windows pipe name is predictable and the client sends the token to an unauthenticated endpoint | `bridge/src/ipc.js`, `bridge/src/host.js` | Open |
| AR-07 | Low | Concurrent hosts clobber each other's token and socket | `bridge/src/host.js` | Open |
| AR-08 | Low | Reconnect backoff never grows | `src/lib/bridge.js` | Open |
| AR-09 | Low | Policy fails open or loosens in two places (invalid proxy, forced local key) | `src/lib/config.js` | Open |
| AR-10 | Low | Incognito tabs are not excluded when the extension is allowed in incognito | `manifest.json`, `src/background.js` | Open |
| AR-11 | Low | Existing group titles are sent unredacted | `src/background.js` | Disclosed in `PRIVACY.md` in 1.4.2; redaction open |
| AR-12 | Low | Client slots are consumed before authentication, with no deadline | `bridge/src/host.js` | Open |
| AR-13 | Low | Launcher interpolates paths into shell and batch syntax | `bridge/install.mjs` | Open |
| AR-14 | Low | Uninstall and argument handling are brittle | `bridge/install.mjs` | Open |
| AR-15 | Low | Line decoder corrupts split multi-byte characters; an oversized line crashes the MCP server | `bridge/src/protocol.js`, `bridge/src/mcp-server.js` | Open |
| AR-16 | Info | Invisible format characters survive sanitizing | `src/lib/validate.js`, `src/lib/redact.js` | Open |
| AR-17 | Info | Destructive bridge actions rely on tool text for confirmation | `bridge/src/tools.js`, `src/background.js` | Open |
| AR-18 | Info | Packaging gate is a denylist with a lenient zip reader | `scripts/cws-check.mjs`, `scripts/zip-list.mjs` | Open |
| AR-19 | Info | Proxy responses are unbounded and their error text reaches the popup | `src/lib/providers/claude.js` | Open |

## Remediation status

Fixed in 1.4.2, each with a regression test:

- **AR-01** — a title that is the tab's own address is dropped
  (`isUrlLikeTitle` in `src/lib/redact.js`).
- **AR-02** — titles of groups that hold an excluded-host tab stay on the
  device: they are left out of the context sent to the Claude API or the proxy
  and out of `list_tabs` (`groupsWithExcludedTabs`).
- **AR-03** — redaction scans at most 2,048 characters and the email pattern
  has bounded quantifiers.

Documentation corrected in 1.4.2: `PRIVACY.md` now lists existing group names,
says that preferences use Chrome Sync, that numbers are masked from five
digits, and that removing the bridge needs its uninstaller; the threat model
shows the bridge and no longer claims that grouping is the only possible
action.

Open findings are tracked as issues. Until AR-06 and AR-07 are fixed, use the
bridge with one browser profile on a machine you do not share.

## What held

- Delimiter escaping and JSON encoding against forged entries, on both the API
  and the `list_tabs` paths.
- Output validation: known ids, first assignment wins, color whitelist, short
  names; non-string model output fails closed.
- Sender validation, and the absence of any external messaging surface.
- Consent and opt-in checked on every bridge data call and before every API or
  proxy call.
- Policy cannot enable the bridge, consent, automatic grouping or path
  sending; the proxy must be HTTPS without credentials; no key goes to the
  proxy and no cookies go to Anthropic.
- POSIX token and directory modes; constant-time token comparison; the method
  allowlist on both sides; frame size caps.
- No logging of titles or URLs anywhere.
- The built zip holds only runtime files; workflows are read-only with pinned
  actions.
- All DOM writes use `textContent`; the CSP has no unsafe sources.

## Suggested order

1. AR-04, AR-10, AR-09 and the redaction part of AR-11: privacy and policy
   behaviors that fail open.
2. Bridge reliability: AR-08 first (it amplifies the rest), then AR-07, AR-06,
   AR-12 and AR-15. AR-06 and AR-07 need a design decision — a random
   per-session endpoint name with a single-instance lock — and therefore an
   ADR.
3. AR-05: a persisted call budget.
4. Installer: AR-13 and AR-14.
5. The Info items, and running the end-to-end cases TC-05 (confirmation before
   ungrouping) and TC-10 (prompt injection).
