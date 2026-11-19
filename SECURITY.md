# Security Policy

## Reporting a vulnerability

Email **security@TU-DOMINIO.example** (reemplazar) con pasos de reproducción. Respuesta inicial ≤ 2 días hábiles; fix de severidad alta/crítica ≤ 14 días. No abras issues públicos para vulnerabilidades.

## Supported versions

Solo la última versión publicada en Chrome Web Store recibe parches.

## Security controls (resumen)

| Control | Implementación |
|---|---|
| Least privilege | `tabs`, `tabGroups`, `storage`; un único host (`api.anthropic.com`); sin content scripts ni web-accessible resources |
| No remote code | CSP `script-src 'self'`; gate `cws-check` bloquea `eval`, `new Function`, imports remotos, sinks HTML |
| CSP estricta | `default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self'` |
| Secretos | BYOK en `storage.session` por defecto; política `proxyEndpoint` saca la key del endpoint (vault) |
| Data minimisation | Sin query/fragment; redacción PII; `excludedHosts`; consentimiento versionado |
| LLM01 Prompt injection | Datos delimitados y escapados; salida forzada a schema; validación de ids/nombres/colores; sin capacidad de acción fuera de agrupar |
| Mensajería | Solo páginas propias (`sender.id` + origen `chrome-extension://<id>` en `sender.url`) |
| Supply chain | 0 dependencias runtime; dev deps auditadas (`npm audit`), SBOM CycloneDX, CodeQL en CI |
| Trojan Source | Escaneo de caracteres bidi/zero-width en CI |

Detalle: [docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md).
