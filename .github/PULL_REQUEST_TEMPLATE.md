<!-- Thanks for contributing! Keep PRs focused and small where possible. -->

## What & why

<!-- What does this change and why? Link any issue: Closes #123 -->

## Type

- [ ] feat
- [ ] fix
- [ ] docs
- [ ] refactor / chore / ci / test

## Safety checklist (required)

- [ ] **Consent:** no data leaves the device (API, proxy or bridge) without
      `consentVersion >= CONSENT_VERSION`. If *what* is sent or *to whom*
      changed, `CONSENT_VERSION`, `PRIVACY.md` and the options notice changed too.
- [ ] **Minimization:** only title, host and (optionally) the redacted path are
      sent. No query, fragment, page content or cookies. `excludedHosts` are
      never sent and never shown to the bridge.
- [ ] **Model output is untrusted:** everything still goes through
      `normalizeResult`; `list_tabs` output keeps `UNTRUSTED_NOTICE` and `<`
      stays escaped.
- [ ] **Managed policy only restricts** (`applyPolicy`); `proxyEndpoint` stays
      the single exception (HTTPS, no credentials).
- [ ] **Messaging:** `isTrustedSender` still validates `sender.id` and the
      extension origin; `sender.tab` is not used as a signal.
- [ ] **Strict CSP:** no inline `<script>`/`<style>`, no `style=`, no remote
      code, no `eval`, no `innerHTML`.
- [ ] **Bridge:** zero runtime dependencies; method allowlist in both host and
      extension; nothing but protocol frames on stdout.
- [ ] No tab titles, URLs, API keys, tokens or personal paths are committed.

## Tests

- [ ] New or updated tests cover the change (a regression test for a bug).
- [ ] `npm run prepublish:cws` passes (lint, coverage gates, audit, package,
      Chrome Web Store policy gate).
- [ ] The Trojan Source scan is clean (see CONTRIBUTING.md).
- [ ] User-visible changes are under `[Unreleased]` in `CHANGELOG.md`, and the
      docs match the new behavior.
- [ ] If it touches Chrome behavior or the bridge: tested on a real machine
      (`npm run deploy:local` → reload the extension → `node bridge/doctor.mjs`).
