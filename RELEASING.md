# Releasing

A release is a version tag plus a GitHub release that carries the packaged
extension. Publishing to the Chrome Web Store is a separate, manual step: no
workflow uploads to the store.

## Cutting a release

Releases follow Gitflow (see [CONTRIBUTING.md](CONTRIBUTING.md)): a
`release/<version>` branch goes from `develop` to `main`, is tagged on `main`
and is merged back into `develop`.

1. Make sure `develop` is green (CI and CodeQL) and create `release/X.Y.Z`
   from it.
2. Set the same version in the five places that carry it:
   - `manifest.json` → `version`
   - `package.json` → `version` and the zip name in the `cws:check` script
   - `bridge/package.json` → `version`
   - `bridge/src/mcp-server.js` → `SERVER_INFO.version`
   - `package-lock.json` (run `npm install --package-lock-only`)
3. Move the `[Unreleased]` entries in [CHANGELOG.md](CHANGELOG.md) under a new
   `[X.Y.Z] - <date>` heading and add a fresh, empty `[Unreleased]`.
4. Run the full gate and keep the artifact it builds:
   ```bash
   npm ci
   npm run prepublish:cws   # lint → coverage → audit → package → CWS policy gate
   ```
5. Test on a real machine (see [docs/TESTING.md](docs/TESTING.md)):
   `npm run deploy:local`, reload the extension, `node bridge/doctor.mjs`.
6. Open a pull request from `release/X.Y.Z` into `main`. After it merges, tag
   and publish:
   ```bash
   gh release create vX.Y.Z dist/ai-tab-grouper-X.Y.Z.zip --target main --title "vX.Y.Z" --notes "See CHANGELOG.md"
   ```
7. Merge `main` back into `develop` through a pull request.

## Chrome Web Store (manual)

1. Upload `dist/ai-tab-grouper-X.Y.Z.zip` in the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Paste the listing copy and the permission justifications from
   [docs/STORE_LISTING.md](docs/STORE_LISTING.md); `npm run cws:check` prints
   the same justifications.
3. Set the privacy policy URL to the public `PRIVACY.md` of this repository.
4. Submit for review. The store review is independent of the GitHub release.

The extension id of the store listing differs from the id of an unpacked
build. Users who installed the bridge against an unpacked build must run the
installer again with the store id (see [bridge/README.md](bridge/README.md)).
