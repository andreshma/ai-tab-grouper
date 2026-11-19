# ADR-002: Hardening enterprise — política gestionada, proxy corporativo y credenciales efímeras

**Status:** Accepted — 2026-11-19 · Supersedes la sección "API key en storage.local" de ADR-001

## Context

ADR-001 aceptó guardar la API key en `chrome.storage.local` (texto plano en el perfil). Para despliegue corporativo se requiere: secretos en vault, control central de TI, auditoría/DLP y cumplimiento de la política de divulgación de Chrome Web Store (consentimiento explícito, julio 2026).

## Decision

1. **Política gestionada** (`chrome.storage.managed` + `managed_schema.json`), desplegable por GPO / Intune / Google Admin. Regla: la política **solo restringe** (proveedores, rutas, auto, modelos, BYOK, almacenamiento de key, exclusiones); única excepción: `proxyEndpoint`.
2. **Modo proxy**: si TI define `proxyEndpoint` (HTTPS), la extensión no envía API key; el proxy (Cloud Run / Lambda / APIM) inyecta la key desde Secret Manager/Key Vault, autentica por SSO (`credentials:'include'`), aplica DLP, rate limit, allowlist de modelos y auditoría. CORS del proxy permite solo `chrome-extension://<ID>`.
3. **BYOK efímero por defecto**: `storage.session` (memoria). Persistir es opt-in; TI puede prohibirlo.
4. **Consentimiento versionado** (`CONSENT_VERSION`) obligatorio antes de cualquier envío remoto.
5. **CSP estricta** (`default-src 'self'`, sin inline), validación de remitente de mensajes, gate `cws-check` en CI.

## Consequences

- ✅ La key sale del endpoint en despliegue corporativo; trazabilidad central.
- ✅ TI puede imponer modo "solo local" (`allowedProviders: ["nano","heuristic"]`).
- ⚠️ BYOK en sesión exige re-ingresar la key tras reiniciar Chrome (fricción aceptada).
- ⚠️ `connect-src https:` necesario para proxy configurable; mitigado (endpoint solo desde política, sin código remoto).
- ⚠️ Requiere construir/operar el proxy (fuera del alcance de la extensión).

## Alternatives considered

| Alternativa | Descartada por |
|---|---|
| Cifrar la key en `storage.local` con clave derivada local | Teatro de seguridad: la clave de descifrado vive junto al ciphertext |
| `chrome.identity` + OAuth propio hacia backend | Requiere permiso `identity` y backend de identidad; el SSO del proxy (IAP/Entra App Proxy) cubre lo mismo sin permisos extra |
| `optional_host_permissions` amplio para el proxy | Banderas de revisión en CWS; CORS en el proxy evita el permiso |
| Usar la sesión de claude.ai del usuario | Prohibido por Anthropic (no intermediar credenciales de suscripción) y por CWS (eludir restricciones de servicios IA) |
