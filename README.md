# Web CAA BRS

Portal web del Centro de Alumnos BRS con frontend público, backend en Node.js/Express, carga de imágenes y panel de administración para activar/desactivar módulos.

## Resumen Ejecutivo

Este proyecto implementa una web institucional/comunitaria con:

- Home pública con secciones informativas, galería y formularios.
- Módulo BRS 100 Palabras con control centralizado de estado.
- Panel Admin para habilitar/deshabilitar funcionalidades sin editar código.
- API backend para configuración, carga de archivos e inventario de imágenes.
- Medidas de seguridad y performance (Helmet, rate-limit, compresión, cache control).

## Funcionalidades Principales

### 1) Sitio público

- Página principal con contenido institucional.
- Popup de difusión de BRS 100 Palabras condicionado por configuración.
- Enlaces y navegación orientados a comunidad escolar.
- Integración de galería con imágenes en servidor.

### 2) Módulo BRS 100 Palabras

- Sección dedicada en ruta `/brs100palabras`.
- Configuración por archivo JSON en `config/brs100palabras.json`.
- Bloqueo total por backend cuando el módulo está desactivado.

### 3) Panel de Administración

- Ruta: `/admin`.
- Login simple de administrador.
- Toggle de estado del módulo BRS 100 Palabras.
- Persistencia de cambios vía API (`/api/config/brs100palabras`).

### 4) API y almacenamiento

- `POST /api/upload`: subida de imágenes con validación de tipo y tamaño.
- `GET /api/images`: listado de imágenes.
- `GET /api/gallery/images`: listado de imágenes de galería.
- `GET /api/config`: lectura de configuraciones disponibles.
- Configuración persistida en sistema de archivos (`config/*.json`).
- Correo receptor de propuestas configurable en `config/propuestas.json` (campo `recipient`).
- Respaldo persistente de cada propuesta en `data/proposal-inbox.jsonl` para evitar perdida de mensajes.
- Endpoint de monitoreo de propuestas en `GET /api/propuestas/status`.

### 5) Seguridad y rendimiento

- `helmet` para cabeceras de seguridad.
- `express-rate-limit` para limitar abuso de endpoints.
- `compression` para respuestas HTTP.
- Control de cache para evitar vistas obsoletas en HTML.
- Service Worker ajustado para evitar cachear documentos HTML en local.
- Trazabilidad de propuestas en `data/proposal-audit.jsonl` (IP, headers clave, user-agent, timestamp e ID de envio).
- Entrega con tolerancia a fallos: cada propuesta se persiste primero en PocketBase; luego se intenta notificacion por SMTP; si PocketBase no responde, se encola reintento local.
- Frontend con envio robusto para navegadores embebidos (Instagram, etc.): JSON -> x-www-form-urlencoded -> `sendBeacon`.

## Stack Tecnológico

### Backend

- Node.js
- Express
- dotenv
- multer
- helmet
- cors
- express-rate-limit
- compression

### Frontend

- HTML5
- CSS3
- JavaScript Vanilla
- Tailwind CSS (pipeline con PostCSS/Autoprefixer)

### Infraestructura/DevOps

- Docker / Docker Compose
- Nginx (configuración incluida)

## Estructura Relevante

- `server.js`: servidor principal y API.
- `index.html`: home pública.
- `service-worker.js`: cache/offline.
- `admin/index.html`: panel admin.
- `brs100palabras/`: módulo BRS 100 Palabras.
- `config/brs100palabras.json`: estado del módulo y features.
- `config/propuestas.json`: correo que recibe propuestas desde `POST /api/propuestas`.
- `css/` + `tailwind.config.js` + `postcss.config.js`: pipeline de estilos.

## Configurar Correo Receptor De Propuestas

Para cambiar el correo que recibe las propuestas, edita `config/propuestas.json`:

```json
{
  "recipient": "correo@dominio.com"
}
```

No necesitas modificar `server.js`; el backend lee este archivo automaticamente en cada envio.

Para persistencia remota define PocketBase por variables de entorno (`PROPOSAL_PB_*`).

## Trazabilidad De Propuestas

Cada envio en `POST /api/propuestas` ahora registra eventos de auditoria en `data/proposal-audit.jsonl`.

Campos registrados por evento:

- `submissionId`: identificador unico del envio.
- `timestamp`: fecha/hora UTC del evento.
- `requestMeta.ip`: IP de origen estimada.
- `requestMeta.xForwardedFor`, `requestMeta.cfConnectingIp`: headers de red para correlacion.
- `requestMeta.userAgent`, `requestMeta.origin`, `requestMeta.referer`: contexto tecnico de cliente.

Nota: estos datos ayudan al rastreo tecnico inicial, pero la identificacion formal de una persona requiere proceso legal con proveedor de internet/autoridad competente.

## Monitoreo Rapido De Propuestas

Endpoint:

- `GET /api/propuestas/status`
- `GET /api/propuestas/pending?limit=50`

Respuesta resumen:

- Estado general (`success`, `now`, `recipient`).
- Inbox (`data/proposal-inbox.jsonl`): total y ultimo envio.
- Cola (`data/proposal-queue.json`): cantidad, item mas antiguo/nuevo, siguiente retry.
- Eventos recientes de entrega/cola/fallo en auditoria.

Contingencia operativa:

- Si PocketBase no responde o hay error transitorio, puedes consultar el contenido pendiente en `GET /api/propuestas/pending`.
- Este endpoint usa la misma proteccion opcional por `PROPOSAL_STATUS_TOKEN`.

Proteccion opcional:

- Define `PROPOSAL_STATUS_TOKEN` en entorno.
- Consulta con query `?token=...` o header `x-proposal-status-token`.

## Replay De Emergencia Del Inbox

Script:

- `scripts/replay-proposals-inbox.js`

Destino de emergencia recomendado:

- `islamartin312@gmail.com`

Ejemplos:

- Dry run:
  - `npm run proposals:replay:dry -- --limit 20`
- Replay real:
  - `npm run proposals:replay -- --limit 20`
- Solo mensajes con fallos previos:
  - `npm run proposals:replay -- --only-failed --limit 50`
- Forzar buzon destino (opcional):
  - `npm run proposals:replay -- --to correo@dominio.com --limit 20`

El script registra resultados en `data/proposal-audit.jsonl` con eventos `proposal_inbox_replay_sent` y `proposal_inbox_replay_failed`.

## Ejecución Local

### Requisitos

- Node.js 18+
- npm 8+

### Comandos

- Instalar dependencias: `npm install`
- Ejecutar servidor: `npm start`
- Modo desarrollo: `npm run dev`
- Build CSS: `npm run build:css`
- Watch CSS: `npm run watch:css`

## Despliegue Con Docker Compose

Variables recomendadas:

- Copia `.env.example` a `.env` y ajusta secretos/credenciales.
- Mantener:
  - `PROPOSAL_RECIPIENT=misla@alumnos.brs.cl` (correo principal)
  - `PROPOSAL_EMERGENCY_RECIPIENT=islamartin312@gmail.com` (correo de emergencia opcional para replay)
  - `PROPOSAL_PB_URL=https://tu-pocketbase`
  - `PROPOSAL_PB_COLLECTION=proposals`
  - `PROPOSAL_PB_TOKEN=...` (recomendado) o `PROPOSAL_PB_ADMIN_EMAIL` + `PROPOSAL_PB_ADMIN_PASSWORD`

Levantamiento/actualizacion:

- `docker compose pull`
- `docker compose build --no-cache web credencial`
- `docker compose up -d`

Verificacion:

- `docker compose ps`
- `docker compose logs -f web`
- `curl -sS http://localhost/api/propuestas/status | jq`

Persistencia activada en Compose:

- `web_images` -> `/app/Images`
- `web_data` -> `/app/data` (cola, inbox y auditoria de propuestas)
- `web_config` -> `/app/config` (configuracion editable, incluyendo `propuestas.json`)

## Guía de Valorización (Estimación)

Para cotizar una solución similar en empresa/agencia, considerar estos bloques:

1. Descubrimiento y UX base
- Levantamiento de requerimientos, arquitectura de información, flujos.

2. Frontend público
- Home, secciones, componentes responsive y accesibilidad.

3. Backend/API
- Endpoints, validaciones, manejo de archivos, configuración dinámica.

4. Panel Admin
- Autenticación, controles de estado por módulo, persistencia.

5. Seguridad y performance
- Hardening, headers, rate limits, caching strategy.

6. Deploy y operación
- Configuración servidor, Docker/Nginx, QA final, documentación.

### Rango referencial de mercado

- Proyecto similar (nivel pyme/colegio, con admin y backend):
  - Bajo: USD 4,000 - 7,000
  - Medio: USD 7,000 - 12,000
  - Alto: USD 12,000 - 20,000+

El valor final depende de:

- Nivel de diseño/UI solicitado.
- Complejidad de autenticación y permisos.
- Integraciones externas (pagos, CRM, correo transaccional, etc.).
- Cobertura de QA, soporte y mantenimiento mensual.
- SLA, monitoreo y requerimientos de alta disponibilidad.

## Notas para continuidad (legado)

- El esquema de activación/desactivación por configuración permite crecer por módulos.
- Recomendado: mantener cada nueva funcionalidad detrás de una flag en `config/*.json`.
- Recomendado: documentar cada módulo nuevo en este README para facilitar traspaso.
