# ADR-001: Cadena híbrida de proveedores IA (Claude → Gemini Nano → heurística)

**Status:** Accepted — 2026-11-19

## Context

La extensión debe clasificar pestañas por tema con buena calidad, funcionar sin configuración y no filtrar datos sensibles del historial de navegación. Requisitos: auto + manual, latencia < 3 s p95 percibida, costo marginal ~0, degradación elegante.

## Decision

1. **Claude API (BYOK) como primario**, modelo tier pequeño (`claude-haiku-5-5`), salida estructurada vía `tool_choice` forzado. Llamada directa desde la extensión con `anthropic-dangerous-direct-browser-access`.
2. **Gemini Nano (Prompt API)** como segundo proveedor, con `responseConstraint` JSON Schema. Toggle `preferOnDevice` invierte el orden.
3. **Heurística por dominio** como terminal: nunca falla, offline.
4. Resiliencia: retry con backoff + jitter (respeta `retry-after`), circuit breaker por proveedor (3 fallos / 5 min) persistido en `storage.session`.
5. Minimización previa a cualquier proveedor + validación posterior de toda salida.

## Consequences

- ✅ Calidad alta por defecto; funciona sin key; sin backend propio (cero infra, cero costo operativo).
- ✅ Fallos de Claude (429/529/red) no bloquean al usuario.
- ⚠️ **API key en `chrome.storage.local`**: no hay vault en el navegador. Mitigación: key dedicada con spend limit, nunca sincronizada, CSP estricta. Desviación consciente del estándar "secrets en vault".
- ⚠️ Títulos/hosts salen a Anthropic al usar Claude (redactados). `excludedHosts` y `preferOnDevice` cubren usuarios sensibles.
- ⚠️ Nano puede no estar expuesto en service workers según versión → se omite.
- Prompt caching no aplica: el prefijo (system + tool) está bajo el mínimo cacheable.

## Alternatives considered

| Alternativa | Descartada por |
|---|---|
| Backend proxy propio (key en vault, rate limit central) | Infra + costo + operación para una extensión personal; recomendado si se distribuye a la organización (ver next steps) |
| Solo Nano | Disponibilidad por hardware/versión; calidad menor en clasificación semántica |
| Solo heurística | No agrupa por tarea (p.ej. "Viajes" = skyscanner + booking) |
| Embeddings + clustering local | Requiere modelo de embeddings en el navegador; mayor complejidad; nombres de grupo menos naturales |
| Nano vía offscreen document | Añade complejidad; se adopta solo si el SW no expone `LanguageModel` en la versión objetivo |

## Next steps

- Distribución corporativa: proxy (Cloud Run/Lambda) con key en Secret Manager, OAuth del usuario, rate limiting y DLP central; la extensión cambia solo el endpoint del provider.
