# Chrome Web Store — ficha y formulario de privacidad

## Ficha

- **Nombre:** AI Tab Grouper
- **Resumen (≤132):** Agrupa tus pestañas por tema con IA (Claude o Gemini Nano local) o por dominio, de forma automática o manual.
- **Categoría:** Productividad / Herramientas
- **Descripción (primer párrafo = divulgación prominente):**
  > Organiza automáticamente tus pestañas en grupos por tema. **Para funcionar, lee el título y la dirección de tus pestañas.** Puedes usar IA local (Gemini Nano, nada sale de tu equipo), agrupación por dominio (sin IA) o Claude de Anthropic con tu propia API key — en ese caso, y solo tras tu consentimiento explícito, se envían el título y el dominio de las pestañas a Anthropic. Sin analítica, sin servidores propios, sin venta de datos.
- **Assets:** ícono 128×128 (incluido), ≥1 captura 1280×800 o 640×400 (popup + configuración), tile promocional 440×280 (opcional).
- **Política de privacidad (URL pública obligatoria):** publicar `PRIVACY.md` (p.ej. GitHub Pages) y pegar la URL.

## Pestaña "Privacy practices"

**Single purpose:** Agrupar las pestañas abiertas del usuario en grupos de Chrome según su tema.

**Justificación de permisos** (salida de `npm run cws:check`):

| Permiso | Justificación |
|---|---|
| `tabs` | Leer título y URL de las pestañas para decidir su grupo (función única de la extensión). |
| `tabGroups` | Crear, nombrar y colorear grupos de pestañas. |
| `storage` | Guardar preferencias del usuario, política gestionada por TI y estado de sesión. |
| `https://api.anthropic.com/*` | Enviar título/dominio redactados al modelo Claude del usuario (BYOK) para clasificar pestañas, solo con consentimiento explícito. |

| `nativeMessaging` (opcional) | Solicitado solo si el usuario activa el puente con Claude Desktop: comunica la extensión con el host local instalado por el usuario (`allowed_origins` restringido a esta extensión). |

**¿Usa código remoto?** No.

**Datos que recopila** (marcar):

| Categoría CWS | ¿Marcar? | Motivo |
|---|---|---|
| Web history | **Sí** | Títulos/dominios de pestañas se transmiten a Anthropic cuando el usuario activa Claude |
| Website content | No | No se lee contenido de páginas |
| Authentication information | No | La API key del usuario no se transmite al desarrollador; se usa solo hacia Anthropic |
| PII / Health / Financial / Location / Communications / User activity | No | — |

**Certificaciones** (marcar las tres): no se venden datos a terceros; no se usan para fines ajenos al propósito único; no se usan para solvencia/crédito.

## Checklist previa al envío

- [ ] `npm run prepublish:cws` en verde
- [ ] Smoke manual (README §Smoke) en Chrome estable Windows + macOS
- [ ] Reemplazar `security@TU-DOMINIO.example` en PRIVACY.md y SECURITY.md
- [ ] Privacy policy publicada y URL en el dashboard
- [ ] Capturas 1280×800
- [ ] Verificación 2FA de la cuenta de desarrollador y email de contacto verificado
- [ ] No usar el logo de Claude/Anthropic; mencionar "Claude" solo en texto descriptivo
