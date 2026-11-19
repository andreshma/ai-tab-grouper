# Despliegue enterprise

## 1. Forzar instalación

Política Chrome `ExtensionInstallForcelist`: `<EXTENSION_ID>;https://clients2.google.com/service/update2/crx`

## 2. Configurar la política de la extensión

### Google Admin console
Dispositivos → Chrome → Apps y extensiones → AI Tab Grouper → *Política para extensiones* (JSON):

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

### Windows (GPO / Intune OMA-URI, registro)

```
HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<EXTENSION_ID>\policy
  proxyEndpoint     REG_SZ    https://ai-proxy.corp.example/v1/messages
  allowUserApiKey   REG_DWORD 0
  forbidPathSending REG_DWORD 1
  allowedProviders  (subkey)  1=claude, 2=heuristic
  excludedHosts     (subkey)  1=intranet.corp.example
```

### macOS (perfil de configuración)
Dominio `com.google.Chrome.extensions.<EXTENSION_ID>` con las mismas claves.

Verificación: `chrome://policy` → sección de la extensión.

## 3. Perfiles recomendados

| Perfil | Política |
|---|---|
| **Máxima privacidad** | `allowedProviders: ["nano","heuristic"]` — nada sale del equipo |
| **Corporativo estándar** | `proxyEndpoint` + `allowUserApiKey:false` + `forbidPathSending:true` + `excludedHosts` |
| **Equipo técnico BYOK** | `apiKeyStorage:"session"` + `allowedModels` |

## 4. Contrato del proxy

- `POST {proxyEndpoint}` con body idéntico a Messages API (`model`, `system`, `tools`, `tool_choice`, `messages`). Responde el JSON de Anthropic sin modificar.
- Auth: SSO por cookie (IAP / Entra App Proxy / Cloudflare Access). La extensión envía `credentials: include` y **ninguna** key.
- CORS: `Access-Control-Allow-Origin: chrome-extension://<EXTENSION_ID>`, `Access-Control-Allow-Credentials: true`, `Allow-Headers: content-type, anthropic-version`.
- Debe: inyectar key desde Secret Manager/Key Vault · allowlist de modelos · rate limit por usuario · DLP sobre `messages[].content` · log de auditoría sin contenido (usuario, tokens, modelo, latencia) · ZDR/retención según acuerdo con Anthropic.
- Sin redirects (la extensión usa `redirect: 'error'`).
