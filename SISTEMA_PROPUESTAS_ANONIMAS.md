# Sistema de Propuestas Anonimas (CAA BRS)

Este documento resume como funciona actualmente el sistema de propuestas y como acceder a los mensajes recibidos.

## Estado Actual (Abril 2026)

El sistema esta operativo con este flujo principal:

1. El frontend envia propuestas a `POST /api/propuestas`.
2. El backend guarda cada envio en un inbox local (`data/proposal-inbox.jsonl`) como respaldo inmediato.
3. Luego intenta persistir la propuesta en PocketBase (coleccion configurable, por defecto `proposals`).
4. Si SMTP esta configurado, envia ademas una notificacion por correo.
5. Si falla la persistencia principal, se encola un reintento automatico en `data/proposal-queue.json`.

## Sobre el "anonimato"

En el formulario publico, nombre y curso son opcionales. Si no se completan, se guarda:

- `autor`: `Anónimo`
- `curso`: `No especificado`

Importante:

- Aun siendo anonimo en campos visibles, el backend registra metadatos tecnicos para trazabilidad (IP estimada, user-agent, origin, referer) en auditoria.
- Por lo tanto, es anonimo para el formulario publico, pero no es anonimato tecnico absoluto.

## Componentes y Archivos Clave

- Endpoint de envio: `POST /api/propuestas`
- Estado general: `GET /api/propuestas/status`
- Pendientes en cola: `GET /api/propuestas/pending?limit=50`
- Inbox de respaldo: `data/proposal-inbox.jsonl`
- Auditoria: `data/proposal-audit.jsonl`
- Cola de reintentos: `data/proposal-queue.json`
- Destinatario de notificacion: `config/propuestas.json`

## Como acceder a los mensajes

Tienes 4 formas practicas de revisar mensajes:

### 1) Ver estado rapido del sistema

```bash
curl -sS https://caabrs.cl/api/propuestas/status | jq
```

Si hay token de monitoreo configurado (`PROPOSAL_STATUS_TOKEN`):

```bash
curl -sS "https://caabrs.cl/api/propuestas/status?token=TU_TOKEN" | jq
```

Que mirar en la respuesta:

- `inbox.totalEntries`: total de propuestas respaldadas
- `inbox.lastSubmissionId` y `inbox.lastTimestamp`: ultima propuesta recibida
- `queue.length`: cantidad de propuestas pendientes por reintento
- `monitoring.pocketBaseConfigured`: si la persistencia remota esta activa

### 2) Revisar propuestas pendientes (si hubo fallos)

```bash
curl -sS "https://caabrs.cl/api/propuestas/pending?limit=50" | jq
```

Sirve para ver propuestas que aun no se pudieron entregar/persistir en el flujo principal.

### 3) Leer archivos locales directamente en el servidor

Ultimos mensajes recibidos (inbox):

```bash
tail -n 30 data/proposal-inbox.jsonl
```

Eventos de auditoria (entregas, errores, reintentos):

```bash
tail -n 50 data/proposal-audit.jsonl
```

Contenido actual de cola:

```bash
cat data/proposal-queue.json
```

### 4) Replay de emergencia desde inbox

Si necesitas reenviar propuestas almacenadas en inbox:

Dry run:

```bash
npm run proposals:replay:dry -- --limit 20
```

Replay real:

```bash
npm run proposals:replay -- --limit 20
```

Solo fallidas:

```bash
npm run proposals:replay -- --only-failed --limit 50
```

Forzar destinatario:

```bash
npm run proposals:replay -- --to correo@dominio.com --limit 20
```

## Requisitos de configuracion

Variables recomendadas para operacion estable:

- `PROPOSAL_PB_URL`
- `PROPOSAL_PB_COLLECTION` (default: `proposals`)
- `PROPOSAL_PB_TOKEN` o credenciales admin (`PROPOSAL_PB_ADMIN_EMAIL` + `PROPOSAL_PB_ADMIN_PASSWORD`)
- `PROPOSAL_STATUS_TOKEN` (opcional, recomendado en produccion)
- `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (opcional para notificaciones por correo)

## Flujo de diagnostico rapido

1. Consultar `GET /api/propuestas/status`.
2. Si `queue.length > 0`, revisar `GET /api/propuestas/pending`.
3. Revisar `data/proposal-audit.jsonl` para causa de error.
4. Si hace falta, ejecutar replay desde inbox.

## Referencias de implementacion

- Backend principal: `server.js`
- Formulario y envio frontend: `index.html`
- Script de replay: `scripts/replay-proposals-inbox.js`
- Checklist operativo existente: `.private/propuestas-operacion-checklist.md`
