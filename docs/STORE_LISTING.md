# Chrome Web Store - listing and privacy form

## Listing

The extension ships `_locales/en` (default) and `_locales/es`, so the store shows the name and summary of the matching
locale automatically; the summaries below are the `ext_description` messages. The detailed description is entered per
locale in the dashboard.

### English (en) locale

This block is the English listing, for the default `en` locale of the dashboard.

- **Name:** AI Tab Grouper
- **Summary (≤132):** Group your tabs by topic with AI (Claude or local Gemini Nano) or by domain, automatically or
  manually.
- **Category:** Productivity / Tools
- **Description (first paragraph = prominent disclosure):**
  > Automatically organize your tabs into groups by topic. **To work, it reads the title and address of your tabs.** You
  > can use local AI (Gemini Nano, nothing leaves your device), grouping by domain (no AI) or Anthropic's Claude with
  > your own API key - in that case, and only after your explicit consent, the title and domain of your tabs are sent to
  > Anthropic. No analytics, no servers of our own, no selling of data.

### Spanish (es) locale

This block is the Spanish listing, in Spanish on purpose: paste it as is into the `es` locale of the dashboard. It is
the translation of the English listing above.

- **Nombre:** AI Tab Grouper
- **Resumen (≤132):** Agrupa tus pestañas por tema con IA (Claude o Gemini Nano local) o por dominio, de forma
  automática o manual.
- **Categoría:** Productividad / Herramientas
- **Descripción (primer párrafo = divulgación prominente):**
  > Organiza automáticamente tus pestañas en grupos por tema. **Para funcionar, lee el título y la dirección de tus
  > pestañas.** Puedes usar IA local (Gemini Nano, nada sale de tu equipo), agrupación por dominio (sin IA) o Claude de
  > Anthropic con tu propia API key — en ese caso, y solo tras tu consentimiento explícito, se envían el título y el
  > dominio de las pestañas a Anthropic. Sin analítica, sin servidores propios, sin venta de datos.

### Common to both locales

- **Assets:** 128×128 icon (included), ≥1 screenshot at 1280×800 or 640×400 (popup + settings), 440×280 promotional tile
  (optional).
- **Privacy policy (public URL required):** publish `PRIVACY.md` (e.g. GitHub Pages) and paste the URL.

## "Privacy practices" tab

**Single purpose:** Group the user's open tabs into Chrome tab groups according to their topic.

**Permission justification** (output of `npm run cws:check`):

| Permission | Justification |
|---|---|
| `tabs` | Read the title and URL of tabs to decide their group (the extension's single purpose). |
| `tabGroups` | Create, name and color tab groups. |
| `storage` | Store user preferences, IT-managed policy and session state. |
| `https://api.anthropic.com/*` | Send the redacted title/domain to the user's Claude model (BYOK) to classify tabs, only with explicit consent. |
| `nativeMessaging` (optional) | Requested only if the user enables the Claude Desktop bridge: it connects the extension to the local host installed by the user (`allowed_origins` restricted to this extension). |

**Does it use remote code?** No.

**Data it collects** (tick):

| CWS category | Tick? | Reason |
|---|---|---|
| Web history | **Yes** | Tab titles/domains are transmitted to Anthropic when the user enables Claude |
| Website content | No | Page content is not read |
| Authentication information | No | The user's API key is not transmitted to the developer; it is only used towards Anthropic |
| PII / Health / Financial / Location / Communications / User activity | No | — |

**Certifications** (tick all three): data is not sold to third parties; it is not used for purposes unrelated to the
single purpose; it is not used for creditworthiness/lending.

## Pre-submission checklist

- [ ] `npm run prepublish:cws` passes
- [ ] Manual smoke test ([TESTING.md](TESTING.md#manual-smoke-test)) on stable Chrome, Windows + macOS
- [ ] Privacy policy published and its URL entered in the dashboard
- [ ] 1280×800 screenshots
- [ ] Developer account 2FA verification and verified contact email
- [ ] Do not use the Claude/Anthropic logo; mention "Claude" only in descriptive text
