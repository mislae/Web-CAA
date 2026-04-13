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

### 5) Seguridad y rendimiento

- `helmet` para cabeceras de seguridad.
- `express-rate-limit` para limitar abuso de endpoints.
- `compression` para respuestas HTTP.
- Control de cache para evitar vistas obsoletas en HTML.
- Service Worker ajustado para evitar cachear documentos HTML en local.

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
- `css/` + `tailwind.config.js` + `postcss.config.js`: pipeline de estilos.

## Ejecución Local

### Requisitos

- Node.js 14+
- npm 6+

### Comandos

- Instalar dependencias: `npm install`
- Ejecutar servidor: `npm start`
- Modo desarrollo: `npm run dev`
- Build CSS: `npm run build:css`
- Watch CSS: `npm run watch:css`

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
