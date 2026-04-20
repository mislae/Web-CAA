# Checklist operativo propuestas (10 minutos)

Objetivo: validar que el flujo de propuestas funciona en web normal, navegador embebido (Instagram), persistencia en PocketBase y replay de emergencia.

## 1) Ver estado del sistema

Comando:

```bash
curl -sS https://caabrs.cl/api/propuestas/status | jq
```

Esperado:
- success: true
- queue.length cercano a 0
- inbox.lastTimestamp actualizado tras pruebas
- monitoring.pocketBaseConfigured: true

Si usas token de monitoreo:

```bash
curl -sS "https://caabrs.cl/api/propuestas/status?token=TU_TOKEN" | jq
```

## 2) Prueba envío JSON (navegador normal)

Comando:

```bash
curl -sS -X POST https://caabrs.cl/api/propuestas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Prueba JSON","descripcion":"Chequeo normal","autor":"QA","curso":"Soporte"}' | jq
```

Esperado:
- success: true
- message: Propuesta enviada correctamente o en cola de envio automatico

## 3) Prueba envío Instagram-like (User-Agent embebido)

Comando:

```bash
curl -sS -X POST https://caabrs.cl/api/propuestas \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 325.0.0.0.50" \
  -d '{"titulo":"Prueba IG","descripcion":"Chequeo navegador Instagram","autor":"IG QA","curso":"Mobile"}' | jq
```

Esperado:
- success: true
- Revisar en status que inbox.lastSubmissionId cambie

## 4) Prueba fallback sendBeacon (text/plain)

Comando:

```bash
curl -sS -X POST https://caabrs.cl/api/propuestas \
  -H "Content-Type: text/plain;charset=UTF-8" \
  --data '{"titulo":"Prueba Beacon","descripcion":"Payload text/plain","autor":"Beacon","curso":"Fallback"}' | jq
```

Esperado:
- success: true

## 5) Verificar cola y auditoría

Comandos:

```bash
tail -n 20 data/proposal-audit.jsonl
cat data/proposal-queue.json
```

Esperado:
- Eventos proposal_delivered o proposal_queued
- Si hay cola, queue worker debería drenar en reintentos automáticos

## 6) Replay de emergencia

Dry-run:

```bash
npm run proposals:replay:dry -- --limit 20
```

Ejecución real:

```bash
npm run proposals:replay -- --limit 20
```

Solo mensajes con fallo reciente:

```bash
npm run proposals:replay -- --only-failed --limit 50
```

Opcional (forzar buzon especifico):

```bash
npm run proposals:replay -- --to correo@dominio.com --limit 20
```

## 7) Cierre operativo

- Confirmar recepción en buzón principal y buzón de emergencia.
- Revisar status endpoint nuevamente.
- Guardar evidencia: hora, submissionId y resultado de replay.
