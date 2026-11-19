# ADR-003: Puente MCP con Claude Desktop vía native messaging

**Status:** Accepted — 2026-11-19

## Context

El usuario quiere usar su Claude con sesión iniciada (suscripción) en lugar de una API key. Anthropic prohíbe que terceros ofrezcan login de Claude.ai, intermedien credenciales de suscripción o almacenen tokens de sesión; Chrome Web Store prohíbe eludir restricciones de servicios de IA. La vía permitida es que la app nativa de Anthropic (Claude Desktop) use herramientas locales vía MCP.

## Decision

1. **MCP server local** (`bridge/src/mcp-server.js`, stdio) registrado en Claude Desktop. Expone `list_tabs`, `apply_tab_groups`, `ungroup_tabs`.
2. **Native messaging** entre la extensión y un host local (`host.js`) lanzado por Chrome, restringido por `allowed_origins`.
3. **IPC local** MCP ⇄ host por named pipe / Unix socket (0600) con **token de sesión** efímero.
4. Permiso `nativeMessaging` **opcional**, solicitado solo al activar el puente.
5. MCP **implementado a mano** (JSON-RPC mínimo), cero dependencias runtime.
6. Mismo modelo de datos y consentimiento que el proveedor API (bump `CONSENT_VERSION` → 2).

## Consequences

- ✅ Usa la suscripción del usuario dentro de los términos (Claude Desktop es el cliente; nunca tocamos credenciales).
- ✅ Sin costo de API; sin key en el dispositivo.
- ✅ La instalación de la extensión desde la tienda no exige permisos nuevos (opcional).
- ⚠️ Bajo demanda (o tarea programada), no reactivo a cada pestaña como el modo auto.
- ⚠️ Requiere Node.js y un paso de instalación local por usuario.
- ⚠️ MCP hecho a mano: hay que seguir la evolución del protocolo (mitigado: negociación de versión + tests de handshake).
- ⚠️ Nueva amenaza: prompt injection indirecta hacia un agente con otras herramientas (ver threat model T11).

## Alternatives considered

| Alternativa | Descartada por |
|---|---|
| WebSocket en localhost en vez de native messaging | Cualquier página web puede abrir `ws://localhost`; exige auth y defensa DNS-rebinding; native messaging restringe por ID de extensión |
| SDK oficial `@modelcontextprotocol/sdk` | Añade árbol de dependencias runtime; para 3 tools el protocolo mínimo es pequeño. Reconsiderar si se necesitan recursos, prompts o transporte HTTP |
| Usar cookies/sesión de claude.ai desde la extensión | Prohibido por Anthropic y por CWS |
| Claude in Chrome | Solo opera sobre las pestañas de su propio grupo; sin API para terceros |
| Empaquetar como Desktop Extension (.mcpb) | Instalación 1-click; siguiente paso tras validar el flujo |
