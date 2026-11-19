# Puente Claude Desktop ⇄ Chrome (MCP)

Permite que **Claude Desktop, con tu sesión de Claude** (suscripción, sin API key), lea y agrupe tus pestañas de Chrome mediante la extensión AI Tab Grouper.

```
Claude Desktop ──stdio/MCP──► mcp-server.js ──IPC + token──► host.js ◄──native messaging── Extensión (SW)
 (tu sesión)                    (0 deps)       (pipe/socket 0600)  (lanzado por Chrome,           │
                                                                    solo para esta extensión)     ▼
                                                                                         chrome.tabGroups
```

Claude Desktop nunca entrega credenciales a este código: el razonamiento ocurre en tu sesión de Claude y solo llegan aquí llamadas a herramientas.

## Requisitos

- Node.js ≥ 20 (se usa la ruta absoluta del binario con el que ejecutes el instalador).
- Chrome (o Edge/Chromium) con la extensión instalada.
- Claude Desktop.

## Instalación (una vez)

1. Extensión → **Configuración** → sección *Claude Desktop* → copia el **ID de la extensión**.
2. En esta carpeta:
   ```bash
   node install.mjs --extension-id <ID> --configure-claude
   # Edge: añade --browser edge
   ```
   - Registra el host nativo (Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.aitabgrouper.bridge`; macOS/Linux: JSON en `NativeMessagingHosts/`).
   - Añade `ai-tab-grouper` a `mcpServers` en `claude_desktop_config.json` (con backup; conserva tus otros servidores).
3. Reinicia Claude Desktop.
4. Extensión → Configuración → acepta el **aviso de datos** → activa **Puente con Claude Desktop** (Chrome pedirá el permiso "comunicarse con aplicaciones nativas") → **Guardar**. Estado: *Conectado*.

Verifica con `node doctor.mjs` (todo PASS). No muevas la carpeta tras instalar (o vuelve a ejecutar el instalador). Desinstalar: `node install.mjs --uninstall --configure-claude`.

## Uso

En Claude Desktop:

- "Organiza mis pestañas de Chrome por tema."
- "Agrupa solo las pestañas sueltas de la ventana actual; usa nombres en inglés."
- "Lista mis pestañas de todas las ventanas y propón grupos antes de aplicarlos." (revisión humana antes de actuar)

Herramientas MCP:

| Tool | Efecto | Anotaciones |
|---|---|---|
| `list_tabs` | Título, dominio, ruta redactada y grupo actual por ventana | readOnly |
| `apply_tab_groups` | Crea/reutiliza grupos con los `tabIds` de `list_tabs` | idempotent, no destructiva |
| `ungroup_tabs` | Desagrupa una ventana | **destructiva** → Claude pide confirmación |

Para ejecutarlo de forma recurrente, crea una tarea programada en Claude Desktop/Cowork con el prompt "Organiza mis pestañas de Chrome por tema" (requiere que Chrome esté abierto).

## Seguridad

| Control | Detalle |
|---|---|
| Quién lanza el host | Solo Chrome, y solo para el ID en `allowed_origins` |
| Quién habla con el host | Clientes locales con el token de sesión (256 bits, comparación en tiempo constante); el token se borra cuando Chrome cierra el puerto |
| Superficie | Allowlist de 4 métodos en host y extensión; validación de argumentos en ambos lados |
| Datos | Mismos que el proveedor Claude API: redactados, sin query/fragment, dominios excluidos nunca expuestos; requiere consentimiento vigente |
| Prompt injection indirecta | Salida de `list_tabs` marcada como no confiable y delimitada; la extensión solo acepta ids elegibles; acción máxima = agrupar/desagrupar |
| Política TI | `allowDesktopBridge: false` lo apaga; `excludedHosts` y `forbidPathSending` aplican también aquí |
| Supply chain | 0 dependencias runtime |

## Troubleshooting

| Síntoma | Acción |
|---|---|
| Extensión: "Host no instalado" | Ejecuta el instalador con el ID correcto; reinicia Chrome |
| Claude: "Chrome no está abierto o el puente…" | Abre Chrome; verifica que el puente esté activado y *Conectado* |
| Claude: "aviso de datos" | Acepta el aviso en Configuración de la extensión |
| Claude no ve las herramientas | Revisa `claude_desktop_config.json` y reinicia Claude Desktop |
| Logs del host | stderr de Chrome (`chrome --enable-logging=stderr`) · logs MCP de Claude Desktop |

## Tests

```bash
node --test "test/**/*.test.js"   # 20 tests: protocolo, contrato, MCP, instalador, E2E con procesos reales
```
