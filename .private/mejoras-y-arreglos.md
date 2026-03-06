# Auditoria tecnica: mejoras y arreglos pendientes

Fecha: 2026-03-06
Proyecto: Web-CAA

## Resumen rapido

Este documento consolida posibles mejoras y arreglos detectados durante la revision tecnica del proyecto.

## Prioridad critica

### 1) Token sensible expuesto en `docker-compose.yml`
- Archivo: `docker-compose.yml:11`
- Problema: el token de Cloudflare Tunnel esta en texto plano dentro del repositorio.
- Riesgo: acceso no autorizado al tunel si el token se filtra o comparte.
- Accion recomendada:
  1. Rotar el token en Cloudflare inmediatamente.
  2. Reemplazar en compose por variable de entorno: `${CLOUDFLARE_TUNNEL_TOKEN}`.
  3. Guardar el valor real en `.env` local/no versionado.

### 2) Posible publicacion accidental de archivos privados
- Archivo: `Dockerfile:2`
- Problema: `COPY . /usr/share/nginx/html` copia TODO el repo, incluida la carpeta `.private/`.
- Riesgo: documentos internos accesibles por URL en despliegues con Nginx sin reglas extra.
- Accion recomendada:
  1. Excluir `.private/` del artefacto web (ejemplo: usar `.dockerignore`).
  2. Bloquear rutas ocultas en Nginx (ejemplo: denegar `/.` rutas).

## Prioridad alta

### 3) Trampa de foco del modal se corta tras la primera tecla
- Archivo: `index.html:1377`
- Problema: el listener usa `{ once: true }`, por lo que Tab/Escape deja de funcionar tras un uso.
- Impacto: degradacion de accesibilidad y navegacion por teclado.
- Accion recomendada:
  1. Registrar el listener sin `once`.
  2. Removerlo explicitamente al cerrar modal.

### 4) Selector fragil en manejo de error del formulario
- Archivo: `index.html:1328`
- Problema: `form.querySelector('input[name="titulo"]').value` puede romper si no existe el input esperado.
- Impacto: error de runtime en flujo de error de envio.
- Accion recomendada:
  1. Usar `document.getElementById('propuestaTitulo')` o optional chaining.
  2. Validar null antes de leer `.value`.

## Prioridad media

### 5) Codigo sin uso (mantenibilidad)
- Archivo: `index.html`
- Hallazgos detectados sin referencias de uso actual:
  - `isValidEmail`
  - `loadPublicGallery`
  - `showNotification`
  - `mostrarMensajeExito`
  - `showMessage`
  - `Cache`
  - `imageCache`
  - `debounce`
- Impacto: aumenta complejidad y costo de mantenimiento.
- Accion recomendada:
  1. Eliminar lo no utilizado, o
  2. Marcarlo como "pendiente" con comentario minimo y fecha.

### 6) Politicas de seguridad permisivas en backend
- Archivo: `server.js`
- Hallazgos:
  - `cors()` abierto a cualquier origen.
  - `contentSecurityPolicy: false` en Helmet.
- Impacto: mayor superficie de ataque en produccion.
- Accion recomendada:
  1. Restringir CORS a dominios permitidos.
  2. Reintroducir CSP con allowlist para recursos necesarios.

## Prioridad baja

### 7) Sidebar abierta automaticamente en movil
- Archivo: `index.html:1090`
- Problema: el menu lateral se abre por defecto en mobile al cargar.
- Impacto: puede empeorar UX inicial (contenido tapado).
- Accion recomendada:
  1. Iniciar cerrada por defecto.
  2. Mantener apertura solo por accion del usuario.

## Validaciones sugeridas despues de aplicar arreglos

1. Navegacion de teclado completa en modal (Tab/Shift+Tab/Escape).
2. Prueba de envio de propuesta (exito y error de red).
3. Verificar que `/.private/*` no sea accesible en produccion.
4. Confirmar que compose levanta con token por variable de entorno.
5. Revisar headers de seguridad y comportamiento CORS.

## Nota

En el entorno de revision no habia `npm` instalado, por lo que no se pudo ejecutar `npm run lint` en esta pasada.
