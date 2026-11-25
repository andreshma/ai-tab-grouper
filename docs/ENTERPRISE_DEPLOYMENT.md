# Enterprise deployment

## 1. Force installation

Chrome policy `ExtensionInstallForcelist`: `<EXTENSION_ID>;https://clients2.google.com/service/update2/crx`

## 2. Configure the extension policy

### Google Admin console

Devices → Chrome → Apps & extensions → AI Tab Grouper → *Policy for extensions* (JSON):

```json
{
  "allowedProviders": { "Value": ["claude", "heuristic"] },
  "proxyEndpoint":    { "Value": "https://ai-proxy.corp.example/v1/messages" },
  "allowUserApiKey":  { "Value": false },
  "forbidPathSending":{ "Value": true },
  "allowedModels":    { "Value": ["claude-haiku-5-5"] },
  "excludedHosts":    { "Value": ["intranet.corp.example", "hr.corp.example", "bank.example"] }
}
```

### Windows (GPO / Intune OMA-URI, registry)

```text
HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<EXTENSION_ID>\policy
  proxyEndpoint     REG_SZ    https://ai-proxy.corp.example/v1/messages
  allowUserApiKey   REG_DWORD 0
  forbidPathSending REG_DWORD 1
  allowedProviders  (subkey)  1=claude, 2=heuristic
  excludedHosts     (subkey)  1=intranet.corp.example
```

### macOS (configuration profile)

Domain `com.google.Chrome.extensions.<EXTENSION_ID>` with the same keys.

Verification: `chrome://policy` → the extension's section.

## 3. Recommended profiles

| Profile | Policy |
|---|---|
| **Maximum privacy** | `allowedProviders: ["nano","heuristic"]` - nothing leaves the device |
| **Standard corporate** | `proxyEndpoint` + `allowUserApiKey:false` + `forbidPathSending:true` + `excludedHosts` |
| **BYOK technical team** | `apiKeyStorage:"session"` + `allowedModels` |

## 4. Proxy contract

- `POST {proxyEndpoint}` with a body identical to the Messages API (`model`, `system`, `tools`, `tool_choice`,
  `messages`). It returns the Anthropic JSON unmodified.
- Auth: cookie-based SSO (IAP / Entra App Proxy / Cloudflare Access). The extension sends `credentials: include` and
  **no** key.
- CORS: `Access-Control-Allow-Origin: chrome-extension://<EXTENSION_ID>`, `Access-Control-Allow-Credentials: true`,
  `Allow-Headers: content-type, anthropic-version`.
- It must: inject the key from Secret Manager/Key Vault · enforce a model allowlist · rate limit per user · apply DLP to
  `messages[].content` · keep an audit log without content (user, tokens, model, latency) · apply ZDR/retention as
  agreed with Anthropic.
- No redirects (the extension uses `redirect: 'error'`).
