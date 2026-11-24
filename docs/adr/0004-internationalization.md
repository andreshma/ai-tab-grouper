# ADR-0004: Internationalization - English by default, Spanish as a second locale

## Status

Accepted - 2026-11-23

## Context

The extension was written with a Spanish interface: text was hard-coded in the HTML pages, in the popup and options controllers, in the errors of the service worker and in the manifest. The repository and its documentation are in English, and a public project whose interface is Spanish-only is hard to adopt, to review and to list in the Chrome Web Store outside one market.

Constraints:

- The Content Security Policy forbids inline script and the lint rules forbid HTML sinks (`innerHTML`); neither may be relaxed.
- No runtime dependencies and no build step: the files in the repository are the files Chrome loads.
- People who use the extension in Spanish must see the same wording as before.
- Group names are produced by a model or by code, not by the interface, and they already had their own `language` setting (`es` or `en`, default `es`).
- The catch-all group is a deterministic invariant: one per window, found again by its title on every run.
- Popup status logic compared an error message against a Spanish literal to tell a skipped provider from a failed one.

## Decision

1. **`chrome.i18n` with `_locales`.** `default_locale` is `en`; `_locales/en` and `_locales/es` hold every user-visible string. The Spanish catalogue keeps the previous wording verbatim. The manifest name, description, action title and command description use `__MSG_*__`. Chrome picks the locale from the browser UI language; there is no in-extension language switch for the interface.
2. **One lookup helper.** `t(key, ...substitutions)` in `src/lib/i18n.js` wraps `chrome.i18n.getMessage` and returns the key when a message cannot be resolved, so the interface never shows an empty string and Chrome-free unit tests keep working.
3. **Pages are localized by attributes.** `src/ui/localize.js` fills `data-i18n`, `data-i18n-title` and `data-i18n-placeholder` at load and sets `<html lang>`. Messages that need emphasis or an element owned by the page use a three-token markup (`<b>`, `<code>`, `{slot}`) that is tokenized and turned into DOM nodes one by one; any other tag stays literal text.
4. **Group-name language is separate from the interface language.** The `language` setting gains `auto` (new default), which follows the browser UI language reduced to a supported one (`es-*` → Spanish, anything else → English). Explicit `en` and `es` still work. A stored `es` is honored, so existing users who saved their settings keep Spanish names.
5. **Instructions to models are English; only the output language varies.** The system prompt and the MCP tool descriptions are in English and ask for group names in the resolved language. Heuristic names are product names or domain labels and are not translated.
6. **The catch-all title is a code table, not a message.** `CATCH_ALL_NAMES` (`en: "Misc"`, `es: "Varios"`) lives in `src/lib/catchall.js`. New groups get the title of the resolved group-name language. When looking for an existing catch-all, the title of the current language wins; otherwise the first existing group, in window order, whose title is the catch-all title of *any* supported language is reused and keeps its title. Matching is case-insensitive, as before.
7. **Machine-readable reasons instead of translated sentinels.** The provider chain reports skips with a `code` (`unavailable`, `breaker-open`); the popup maps codes to messages. Internal skip reasons of automatic runs are English identifiers.
8. **English-only where there is no interface.** `managed_schema.json` (the format has no localization), the bridge installer, the doctor, the native host and the MCP server.
9. **Tests enforce the contract**: identical keys in every locale, every key referenced in the manifest, HTML and JS exists, no unused message, identical placeholders and markup across locales, store length limits per locale, and catch-all recognition across languages. The Chrome fake reads the real catalogues.

## Consequences

- ✅ English-first interface and store listing; Spanish users see no change in wording.
- ✅ Adding a language is a catalogue, three table entries and a select option, and the tests list what is missing.
- ✅ No new dependency, no build step, CSP unchanged, still no HTML sink.
- ✅ A language change (browser or setting) never produces a second catch-all group.
- ⚠️ People with a non-Spanish browser who never saved the settings used to get Spanish group names and now get English ones. Intended; the setting can pin either language. Existing groups are not renamed.
- ⚠️ A group the user created by hand and titled "Misc" or "Varios" is treated as the catch-all in either language (before, only the title of the configured language was). Accepted: it is the price of not duplicating the group after a switch.
- ⚠️ When both a "Misc" and a "Varios" group already exist in a window they are not merged; the one for the current language receives the leftovers.
- ⚠️ Group names follow only the supported languages; a French browser gets English names. Mitigation: adding a language is cheap (see `CONTRIBUTING.md`).
- ⚠️ Errors returned to Claude Desktop by the extension are in the browser language, while the bridge's own errors are English. Accepted: the model relays both.
- ⚠️ The pages render their text after the module script runs; the delay is one frame on a local page.

## Alternatives

| Alternative | Rejected because |
|---|---|
| Keep Spanish and document the labels in English | Does not make the product usable or reviewable in English; every document has to quote and translate labels |
| Hand-rolled dictionary with an in-extension language picker | Duplicates what the platform provides; the manifest, the store listing and the shortcut description can only be localized through `_locales` |
| An i18n library (i18next, FormatJS) | A runtime dependency and a bundling step for about a hundred flat strings |
| `__MSG_*__` placeholders inside the HTML | Chrome expands them only in the manifest and in CSS files, not in HTML |
| Setting translated HTML through `innerHTML` | Forbidden by the lint rules and the store policy gate; a translation file would become a markup injection vector |
| Catch-all title from `chrome.i18n` | Only the current locale is readable at runtime, so a group created under the other language could not be recognized, and the title would follow the interface language instead of the group-name setting |
| Rename an existing catch-all group when the language changes | Mutates a group the user may have renamed or reordered on purpose; recognition achieves the invariant without touching it |
| Tag the catch-all group by id in storage instead of by title | Group ids do not survive a browser restart, so the title would still be needed as the fallback |
| Group names in any browser language | Gemini Nano accepts a fixed set of output languages and the catch-all table would be incomplete; behavior would differ between engines |
