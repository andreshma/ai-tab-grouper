# Política de privacidad — AI Tab Grouper

_Última actualización: 2026-11-19 · Versión de aviso de datos: 2_

## Propósito único

AI Tab Grouper agrupa las pestañas de Chrome por tema. Todo dato que la extensión lee se usa **solo** para decidir a qué grupo pertenece cada pestaña.

## Qué datos lee

| Dato | Origen | Dónde se procesa |
|---|---|---|
| Título de la pestaña | `chrome.tabs` | Local; y en Anthropic **solo** si activas Claude y aceptas el aviso |
| Dominio de la URL | `chrome.tabs` | Ídem |
| Ruta de la URL (máx. 4 segmentos, redactada) | `chrome.tabs` | Ídem, solo si activas "Enviar ruta" |
| Preferencias y API key | Tú | En tu navegador (`chrome.storage`) |

**Nunca** se leen ni envían: contenido de páginas, parámetros de URL (`?…`), fragmentos (`#…`), cookies, contraseñas, formularios ni historial. Antes de cualquier envío se ocultan emails, identificadores largos, UUIDs y números de 4+ dígitos.

## Con quién se comparte

- **Anthropic, PBC** (api.anthropic.com), solo si activas Claude y aceptas el aviso en Configuración, usando **tu propia** API key; o el **proxy de tu organización** si TI lo configuró. El tratamiento en Anthropic se rige por los términos de tu cuenta/organización con Anthropic.
- **Tu sesión de Claude Desktop**, solo si activas el puente local y aceptas el aviso: los datos pasan por un programa local instalado por ti y llegan a tu conversación con Claude cuando tú le pides organizar pestañas.
- **Nadie más.** El desarrollador de la extensión no opera servidores, no recibe, no almacena, no vende ni comparte datos, y no usa analítica ni telemetría.
- Gemini Nano (opcional) y la agrupación por dominio se ejecutan **100% en tu dispositivo**.

## Almacenamiento y retención

- La API key se guarda solo en tu navegador: en memoria (se borra al cerrar Chrome) o, si lo eliges, en almacenamiento local. Nunca se sincroniza.
- El registro de decisiones por pestaña vive en memoria de sesión y se borra al cerrar Chrome.
- Puedes borrar todo desinstalando la extensión o con "Eliminar key".

## Control del usuario

Puedes desactivar Claude, preferir Gemini Nano local, excluir dominios para que nunca salgan del equipo y desactivar el envío de rutas. Si cambiamos qué datos se envían, la extensión te pedirá un nuevo consentimiento antes de enviar nada.

## Uso limitado

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

Los datos no se usan para publicidad, no se venden a terceros, no se usan para evaluar solvencia crediticia y ninguna persona los lee.

## Contacto

security@TU-DOMINIO.example — reemplazar antes de publicar.
