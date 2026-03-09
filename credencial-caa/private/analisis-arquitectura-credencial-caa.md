# Analisis de Arquitectura - Credencial CAA

Fecha de analisis: 2026-03-09
Proyecto: `credencial-caa`
Stack actual: Node.js + Express + Frontend estatico servido por Express + JSON local como base de datos.

## 1. Resumen Ejecutivo
La base de la aplicacion ya es dinamica y cumple el flujo principal pedido: login por correo institucional, busqueda de alumno en base de datos y renderizado de credencial con datos reales.

Punto critico detectado: existe una inconsistencia entre el dominio institucional validado en backend y los correos almacenados en la base JSON. Esto puede impedir el login de todos los alumnos.

En terminos de evolucion, la arquitectura esta bien para una primera version (MVP), pero requiere mejoras en autenticacion real, seguridad de datos sensibles (RUT), persistencia y mantenibilidad.

## 2. Estructura del Proyecto
```
credencial-caa/
  data/
    students.json
  public/
    index.html
    script.js
    tarjeta.html
    card.js
    style.css
  server.js
  package.json
```

### Rol por archivo
- `server.js`: API y servidor web Express.
- `data/students.json`: base de datos local temporal de alumnos.
- `public/index.html`: vista de login.
- `public/script.js`: logica de autenticacion desde frontend.
- `public/tarjeta.html`: vista de credencial.
- `public/card.js`: carga dinamica del alumno en la tarjeta.
- `public/style.css`: estilos para login y tarjeta.

## 3. Flujo Funcional Actual
1. Usuario entra a `/` y ve `index.html`.
2. Ingresa correo en formulario.
3. `public/script.js` envia `POST /api/login` con `{ email }`.
4. `server.js` valida dominio y busca el alumno en `students.json`.
5. Si existe, frontend redirige a `/tarjeta?email=<correo>`.
6. `public/card.js` lee el query param `email` y consulta `GET /api/students/:email`.
7. Si encuentra alumno, renderiza nombre, curso, RUT y foto.

## 4. API Actual

### `POST /api/login`
Entrada:
```json
{ "email": "alumno@dominio" }
```
Respuesta exitosa:
```json
{
  "success": true,
  "email": "...",
  "student": {
    "name": "...",
    "course": "...",
    "rut": "...",
    "photoUrl": "..."
  }
}
```

Errores principales:
- `400`: correo vacio.
- `400`: correo no institucional.
- `404`: alumno no encontrado.
- `500`: error interno.

### `GET /api/students/:email`
Devuelve:
```json
{
  "student": {
    "name": "...",
    "course": "...",
    "rut": "...",
    "photoUrl": "..."
  }
}
```

## 5. Hallazgos Tecnicos (Importante)

### Hallazgo 1 (Critico): mismatch de dominio
- En `server.js` se valida `INSTITUTIONAL_DOMAIN = 'brs.cl'`.
- En `data/students.json` los correos son `@britishroyalschool.cl`.

Impacto:
- El backend rechazara correos validos de la base actual con mensaje de dominio invalido.
- El login puede fallar sistematicamente.

Recomendacion inmediata:
- Unificar dominio en un solo lugar (variable de entorno o config) y sincronizarlo con la base de datos.

### Hallazgo 2 (Seguridad): autenticacion basada solo en email
- Cualquier persona que conozca un correo existente podria entrar.
- No hay password, OTP, SSO, ni sesion firmada.

Impacto:
- Riesgo de suplantacion de identidad.

Recomendacion:
- Implementar autenticacion real (password hasheada, magic link, OTP o SSO institucional).

### Hallazgo 3 (Privacidad): RUT expuesto en frontend
- El RUT viaja completo en respuesta API y se renderiza tal cual.

Impacto:
- Exposicion de dato sensible.

Recomendacion:
- Enmascarar parcialmente RUT en frontend o backend.
- Definir criterio de minimizacion de datos.

### Hallazgo 4 (Arquitectura): identidad en query param
- Se usa `/tarjeta?email=...` y luego `GET /api/students/:email`.

Impacto:
- Facil manipulacion manual de URL para intentar acceder a otros alumnos.

Recomendacion:
- Reemplazar por sesion de servidor (cookie httpOnly) o JWT firmado.
- Endpoint `/api/me` para obtener alumno autenticado.

### Hallazgo 5 (Persistencia): JSON local como datastore
- `students.json` es util para prototipo, pero no escala y no maneja concurrencia robusta.

Recomendacion:
- Migrar a SQLite (paso natural y simple para este proyecto).

## 6. Riesgos Prioritarios
1. Riesgo funcional inmediato: login no operativo por mismatch de dominio.
2. Riesgo de seguridad: suplantacion por no requerir secreto adicional.
3. Riesgo de privacidad: exposicion de RUT completo.
4. Riesgo de integridad: identidad de usuario controlable por query param.

## 7. Propuesta de Mejora por Fases

### Fase 0 (Correccion rapida, 1 dia)
- Corregir dominio institucional para que coincida con los correos reales.
- Agregar validaciones adicionales de formato.
- Agregar logs de auditoria basicos (login ok/fail con timestamp).

### Fase 1 (Seguridad base, 2-4 dias)
- Implementar sesion con `express-session` y cookie `httpOnly`.
- Eliminar uso de email en querystring para identificar usuario.
- Crear endpoint `GET /api/me`.
- Mostrar RUT parcialmente enmascarado.

### Fase 2 (Persistencia robusta, 2-5 dias)
- Migrar JSON a SQLite.
- Agregar capa de acceso a datos (`repositories/studentRepository.js`).
- Crear script de migracion inicial.

### Fase 3 (Calidad y operacion, 3-6 dias)
- Tests unitarios y de integracion (`vitest` o `jest` + `supertest`).
- Config por entorno con `.env`.
- Manejo centralizado de errores y middleware de seguridad (`helmet`, rate limit).

## 8. Arquitectura Objetivo Recomendada (Simple y Escalable)
```
src/
  server.js
  app.js
  config/
    env.js
  routes/
    auth.routes.js
    student.routes.js
  controllers/
    auth.controller.js
    student.controller.js
  services/
    auth.service.js
    student.service.js
  repositories/
    student.repository.js
  middlewares/
    auth.middleware.js
    error.middleware.js
  db/
    client.js
    migrations/
public/
  index.html
  tarjeta.html
  assets/js/
    login.js
    card.js
```

Beneficios:
- Separacion clara de responsabilidades.
- Codigo mas testeable y mantenible.
- Facil migracion de base de datos sin romper rutas.

## 9. Checklist de Calidad Sugerido
- [ ] Dominio institucional consistente con datos reales.
- [ ] Login exige un segundo factor o secreto.
- [ ] No se expone identidad por query params.
- [ ] RUT protegido/enmascarado.
- [ ] Sesion segura (cookie httpOnly, secure en produccion, sameSite).
- [ ] Manejo de errores uniforme.
- [ ] Tests de endpoints criticos.

## 10. Conclusiones
El proyecto ya no es una pagina estatica y esta bien encaminado como aplicacion dinamica. El flujo principal existe y la experiencia es coherente. Sin embargo, antes de considerar esta version como "lista para uso real", conviene resolver tres temas de alta prioridad: consistencia de dominio, autenticacion fuerte y proteccion de datos sensibles.

Si quieres, la siguiente iteracion puede centrarse en aplicar la Fase 0 y Fase 1 directamente en codigo para dejar una version funcional y mucho mas segura.
