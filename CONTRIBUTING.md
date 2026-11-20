# Contributing to AI Tab Grouper

Thanks for helping! AI Tab Grouper is a Chrome extension that reads the titles
and URLs of a person's open tabs, so a few principles are non-negotiable —
everything else is open to discussion.

## Ground rules

1. **Consent first.** No data leaves the device (Claude API, corporate proxy or
   the Claude Desktop bridge) unless the user accepted the current consent
   version (`consentVersion >= CONSENT_VERSION`). If a change alters *what* is
   sent or *to whom*, raise `CONSENT_VERSION` and update `PRIVACY.md` and the
   notice in the options page in the same pull request.
2. **Send the minimum.** Only the title, the host and (optionally) the redacted
   path. Never the query string, the fragment, page content or cookies.
   `excludedHosts` are never sent and never shown to the bridge.
3. **Model output is untrusted.** Everything a model returns goes through
   `normalizeResult` (known tab ids, sanitized names, whitelisted colors). The
   output of `list_tabs` carries `UNTRUSTED_NOTICE` and has `<` escaped.
4. **Managed policy only restricts.** `applyPolicy` can take options away from
   the user, never grant more. The single exception is `proxyEndpoint` (HTTPS,
   no credentials).
5. **Trust only our own pages.** `isTrustedSender` validates `sender.id` and
   the `chrome-extension://<id>/` origin. Do not use `sender.tab` as a signal:
   the options page opens as a tab.
6. **Strict CSP.** No inline `<script>` or `<style>`, no `style=` attributes,
   no remote code, no `eval`, no `innerHTML`. Styles live in `.css` files.
7. **"Varios" is deterministic.** The catch-all group ("Varios", Spanish for
   "miscellaneous") applies to manual grouping and Claude Desktop, never to
   automatic mode, where loose tabs must be able to pair up later.
8. **The bridge stays small.** Zero runtime dependencies; a method allowlist in
   both the native host and the extension; an ephemeral, user-only token;
   `allowed_origins` holds only this extension's id; stdout of the host and of
   the MCP server is a protocol channel (logs go to stderr).
9. **Code over prompts.** If something must always happen, implement it in
   code. Do not rely on an instruction to the model.

## Language

Code, comments, JSDoc, commit messages and documentation are in English. The
user interface of the extension is in Spanish.

## Dev setup

```bash
git clone https://github.com/andreshma/ai-tab-grouper.git
cd ai-tab-grouper
npm ci                    # dev dependencies only; the runtime has none
npm run lint              # ESLint with security rules (no eval, no HTML sinks)
npm test                  # extension + bridge
npm run test:coverage     # gates: lines 85 · branches 75 · functions 85
npm run prepublish:cws    # lint → coverage → audit → package → CWS policy gate
```

(`make check` runs the same full gate.) Node.js 20 or newer. The unit and integration suites need no browser: they run
against a fake of the Chrome APIs (`test/helpers/chrome-fake.js`) and against
real MCP and native-host processes. See [docs/TESTING.md](docs/TESTING.md).

To try a change in Chrome, do not load the repository folder (its
`node_modules` contains file names Chrome reserves, and moving the folder
changes the extension id). Copy the runtime to a fixed folder instead:

```bash
npm run deploy:local      # copies the runtime to ~/ai-tab-grouper (or ATG_DEPLOY_DIR)
```

Then load that folder once in `chrome://extensions` (Developer mode → Load
unpacked) and press the reload button after each deploy. The service worker
does not update until the extension is reloaded.

## What every change needs

- **Tests** that cover it; a regression test when it fixes a bug. Tests are
  required for anything touching consent, permissions, the message validation,
  the bridge authentication or the installer.
- **Green gate:** `npm run prepublish:cws`.
- **Clean Trojan Source scan.** This must print nothing:
  ```bash
  grep -rnP "[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]" src test scripts bridge
  ```
  Write escapes (`\u200B`), never the literal invisible character.
- **Docs:** JSDoc on every public function plus the non-obvious *why*; no
  redundant comments. User-visible changes go under `[Unreleased]` in
  `CHANGELOG.md`.
- **ADR** for a non-trivial decision, in [docs/adr/](docs/adr/) (Status,
  Context, Decision, Consequences, Alternatives). Update
  [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) when the attack surface or the
  data that leaves the device changes.
- **A real-machine check** when the change touches Chrome behavior or the
  bridge: `npm run deploy:local` → reload the extension →
  `node bridge/doctor.mjs`.

Version numbers are bumped when a release is cut, not in feature pull requests
(see [RELEASING.md](RELEASING.md)).

## Branching and commits

This project uses **Gitflow**:

- `develop` is the default branch and the integration target for day-to-day work.
- `main` always holds the latest released state.
- Work on a `feature/<name>` branch off `develop` and open a PR into `develop`.
- Releases are cut on a `release/<version>` branch (`develop` → `main`), tagged
  on `main`, then merged back into `develop`. Urgent fixes use `hotfix/<name>`
  off `main`.

Both `main` and `develop` are protected: changes land through a pull request
that passes CI. Use [Conventional Commits](https://www.conventionalcommits.org/)
in the imperative mood — `type(scope): description`, with `feat`, `fix`,
`chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `style` or `build` — and
keep commits atomic.
