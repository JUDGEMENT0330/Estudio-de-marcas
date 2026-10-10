# Estudio de Marcas · Cyber Valtorix

> Auditorías de presencia digital e inteligencia de marca para negocios, con análisis estratégico asistido por IA y entregables (PDF, Word, PowerPoint y Excel) con la identidad de **Cyber Valtorix SAS. de C.V.**

Escribe el nombre de un negocio y la plataforma reúne su huella pública real —perfil de Google Business, reseñas, competidores, velocidad del sitio, tecnología, redes sociales y más—. Luego un modelo de IA de frontera la interpreta como lo haría un consultor senior y redacta el informe **en español**.

- **Sin datos inventados.** Si falta una llave, el módulo se marca como no disponible; nunca se rellena con datos ficticios.
- **Funciona en local o en Vercel**, con la misma base de código.
- **Diseño inspirado en Apple**: tipografía del sistema, superficies translúcidas, radios generosos y movimiento suave que respeta `prefers-reduced-motion`.
- **Documentos con tu marca**: encabezado con el escudo y la razón social, pie con correo · ícono · teléfono, paleta NAVY / GOLD / BLUE, portada y cierre con firmante.

Basado en **Phantom Reach** de [calesthio](https://github.com/calesthio) (AGPL-3.0). Ver [Licencia](#licencia).

---

## Inicio rápido (local)

Requisito: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm run local
```

Prepara el espacio de trabajo, instala dependencias, inicializa SQLite y abre la app en:

```text
http://127.0.0.1:3000
```

| Página | Para qué sirve |
| --- | --- |
| `/audits` | Historial de auditorías |
| `/audits/new` | Nueva auditoría |
| `/audits/{id}` | Reporte interactivo y descargas |
| `/settings` | Llaves de API, identidad de marca y entorno |

Las llaves se pueden pegar en **Configuración → Fuentes de datos** (se guardan cifradas con AES-256-GCM) o en `.env.local` (copia [.env.example](.env.example)).

---

## Despliegue en Vercel

1. **Importa el repositorio** en [vercel.com/new](https://vercel.com/new). Vercel detecta Next.js automáticamente; no hace falta configurar comandos.
2. **Conecta almacenamiento persistente**: en el proyecto, *Storage → Marketplace → Upstash for Redis*. Esto crea `KV_REST_API_URL` y `KV_REST_API_TOKEN`; la app los detecta y guarda allí reportes y llaves.
   - Sin Redis la app funciona, pero en Vercel los reportes viven en `/tmp` y se pierden al reiniciarse la función (verás un aviso en la parte superior).
3. **Variables de entorno** (*Settings → Environment Variables*):
   - `APP_PASSWORD` (y opcional `APP_USERNAME`): **muy recomendada**, porque la URL de Vercel es pública. Activa autenticación básica en toda la app, excepto los reportes compartidos `/r/*` y `/api/health`.
   - `APP_ENCRYPTION_KEY`: 64 caracteres hex (`openssl rand -hex 32`) para cifrar las llaves guardadas desde la app.
   - Llaves de datos e IA: `GOOGLE_PLACES_API_KEY`, `GOOGLE_PAGESPEED_API_KEY`, `ANTHROPIC_API_KEY` (u `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY`), etc.
4. **Duración de funciones**: una auditoría profunda tarda de 4 a 6 minutos y sigue corriendo tras responder (vía `after()`). `vercel.json` fija `maxDuration: 300` s, el máximo del plan Hobby. En el plan **Pro** sube `src/app/api/audit/route.ts` a `800` en `vercel.json` para auditorías largas.

Comprueba el entorno en `https://tu-app.vercel.app/api/health`: muestra `entorno`, `almacenamiento` y si es `persistente`.

---

## Base de datos en tu hosting (Hostinger)

La app puede guardar reportes y llaves en la **base de datos MySQL incluida en tu plan de Hostinger**, tanto si corre en local como en Vercel. Tiene prioridad sobre Redis y SQLite, y crea sus tablas (`edm_*`) automáticamente.

1. En **hPanel → Bases de datos → Administración**, crea una base y un usuario (Hostinger les antepone un prefijo, p. ej. `u123456789_estudio`). Usa una contraseña larga.
2. En **hPanel → Bases de datos → MySQL remoto**, agrega acceso para **Cualquier host** (`%`) sobre esa base. Vercel no tiene IP fija, así que es necesario. La protección real es la contraseña larga del usuario.
3. Copia el **host** que muestra esa pantalla (algo como `srv1234.hstgr.io` o una IP).
4. Define la variable en Vercel (*Settings → Environment Variables*) o en `.env.local`:

   ```text
   DATABASE_URL=mysql://u123456789_estudio:CLAVE@srv1234.hstgr.io:3306/u123456789_estudio
   ```

   Si la clave tiene caracteres especiales, codifícalos (`#` → `%23`, `@` → `%40`, `/` → `%2F`).
5. Vuelve a desplegar y abre `/api/health`: debe decir `"almacenamiento": "mysql"`.

Notas: el pool usa pocas conexiones (`MYSQL_CONNECTION_LIMIT=3`) porque los planes compartidos limitan las conexiones simultáneas. Los reportes de más de ~16 MB pueden requerir subir `max_allowed_packet` (raro en la práctica).

---

## Dirección privada con tu dominio

La app está pensada como herramienta interna: **no se indexa** (`robots.txt` con `Disallow: /`, cabecera `X-Robots-Tag: noindex` y meta `robots`) y no hay enlaces hacia ella desde tu sitio. Para servirla en un subdominio propio, p. ej. `estudio.cybervaltorix.com`:

1. En Vercel: *Project → Settings → Domains → Add* `estudio.cybervaltorix.com`.
2. En **hPanel → Dominios → cybervaltorix.com → DNS / Nameservers**, agrega un registro:

   | Tipo | Nombre | Apunta a | TTL |
   | --- | --- | --- | --- |
   | CNAME | `estudio` | `cname.vercel-dns.com` | 3600 |

   (Si Vercel muestra un valor específico del proyecto, como `xxxx.vercel-dns-017.com`, usa ese.)
3. Espera la propagación (minutos a pocas horas); Vercel emite el certificado HTTPS solo.
4. Define `APP_PASSWORD` y `NEXT_PUBLIC_APP_URL=https://estudio.cybervaltorix.com`. Importante: la protección SSO de Vercel **no** cubre dominios propios, así que sin `APP_PASSWORD` la app quedaría abierta.

Tu sitio principal no cambia: el subdominio solo responde a la app.

---

## Cambiar el logo

```bash
npm run brand:logo -- ruta/a/tu-logo.png
```

Reemplaza el logo en la barra lateral, los íconos del navegador y los encabezados y portadas de PDF, Word, PowerPoint y Excel. Usa un **PNG** con fondo transparente (mínimo 300 px de alto); se admiten logos cuadrados u horizontales y se respeta su proporción. Luego haz commit y push para que Vercel lo publique.

---

## Configuración

| Variable | Uso | ¿Necesaria? |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Búsqueda del negocio, perfil de Google, reseñas, competidores | Recomendada |
| `GOOGLE_PAGESPEED_API_KEY` | Rendimiento web (Lighthouse) | Opcional |
| `GOOGLE_CRUX_API_KEY` | Datos reales de usuarios de Chrome | Opcional |
| `CENSUS_API_KEY` | Contexto demográfico (solo EE. UU.) | Opcional |
| `OPENCORPORATES_API_TOKEN` | Registros mercantiles públicos | Opcional |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` | Análisis estratégico y redacción con IA | Opcional |
| `LLM_PROVIDER` | `anthropic` (por defecto), `openai` o `google` | Opcional |
| `REPORT_LANGUAGE` | Idioma de la redacción de la IA (`es` por defecto) | Opcional |
| `PLACES_COUNTRY` | País(es) del autocompletado (`sv` por defecto, `all` para todo el mundo) | Opcional |
| `DATABASE_URL` (`mysql://…`) | Base de datos MySQL de tu hosting | Recomendada |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Alternativa: Redis en Vercel | Opcional |
| `APP_PASSWORD` / `APP_USERNAME` | Protección por contraseña | En Vercel |
| `APP_ENCRYPTION_KEY` | Cifrado de llaves guardadas | En Vercel |
| `BRAND_*` | Razón social, correo, teléfono y firmante de los documentos | Opcional |

Sin llave de IA la auditoría igual se ejecuta con los datos recopilados; solo se omite la capa narrativa.

---

## Identidad de marca

Los valores por defecto son los de **Cyber Valtorix SAS. de C.V.** (escudo, `alexmancia@cybervaltorix.com`, `7803 9807`). Puedes cambiarlos de dos formas:

- **Desde la app**: *Configuración → Identidad de marca de los documentos* (razón social, logo PNG por URL, colores, correo y teléfono).
- **Por entorno**: variables `BRAND_*` en [.env.example](.env.example).

Activos en `public/brand/`: `escudo.png` (logo de encabezado/portada; se cambia con `npm run brand:logo`) e `icono-footer.png` (pie de página).

### Firma y sello

La imagen de firma y sello **no se incluye en el repositorio** (es público y la firma podría usarse para falsificaciones). Para que aparezca en el cierre de los documentos:

- **Local**: guarda el archivo como `private/firma-sello.png` (la carpeta está en `.gitignore`).
- **Vercel**: guarda el PNG en base64 en `BRAND_SIGNATURE_BASE64` (`base64 -w0 firma-sello.png`).

Si no está configurada, el cierre muestra nombre, cargo y teléfono del firmante sin imagen.

---

## Exportaciones

Desde cualquier reporte completado: **PDF**, **Word**, **PowerPoint** y **Excel**. Los cuatro formatos se generan del mismo modelo de contenido en español (`src/lib/exports/doc-content.ts`), así que cuentan la misma historia:

- **Word / PDF**: portada (Auditoría de presencia digital · Informe detallado), resumen ejecutivo, tablero de calificaciones, diagnóstico estratégico, evidencia por área, recomendaciones y cierre "Atentamente".
- **PowerPoint**: presentación tipo Keynote, una diapositiva por área.
- **Excel**: hojas Resumen, Calificaciones, Evidencia, Recomendaciones, Plan de acción y Cobertura, con encabezado y pie de impresión de marca.

---

## API

```bash
# Crear una auditoría
curl -X POST http://127.0.0.1:3000/api/audit \
  -H "Content-Type: application/json" \
  -d '{"businessName":"7 Sense Parfums","city":"San Salvador","state":"San Salvador"}'

# Consultar el reporte
curl http://127.0.0.1:3000/api/report/{reportId}

# Listar reportes
curl "http://127.0.0.1:3000/api/reports?type=audit"

# Descargar: /pdf, /docx, /pptx o /xlsx
curl -OJ http://127.0.0.1:3000/api/report/{reportId}/pdf
```

Con `APP_PASSWORD` activo, añade `-u usuario:contraseña` a cada llamada.

---

## Desarrollo

```bash
npm run dev          # servidor de desarrollo
npm run type-check   # TypeScript
npm test             # pruebas (Vitest)
npm run build        # build de producción
```

Estructura relevante:

- `src/lib/runtime.ts`: detección de entorno (local / Vercel) y backend de almacenamiento.
- `src/lib/db/kv-store.ts`: almacenamiento en Redis (Upstash / Vercel KV).
- `src/lib/brand/`: identidad de marca compartida por la app y los documentos.
- `src/lib/exports/`: generadores de Word, PowerPoint y Excel; `src/lib/pdf/` para PDF.
- `src/lib/ai/claude.ts`: enrutador de proveedores de IA y directiva de idioma.

El manual para asistentes de código está en [AGENTS.md](AGENTS.md).

---

## Licencia

Este proyecto es una obra derivada de **Phantom Reach** © calesthio, distribuida bajo la [GNU AGPL-3.0](LICENSE). Las modificaciones (traducción al español, soporte para Vercel, rediseño visual e identidad de marca de Cyber Valtorix) se distribuyen bajo la misma licencia. Si ofreces esta aplicación como servicio a terceros, la AGPL te obliga a poner a su disposición el código fuente correspondiente.

El escudo, el ícono y el nombre **Cyber Valtorix** son marcas de Cyber Valtorix SAS. de C.V. y no están cubiertos por la licencia del código.
