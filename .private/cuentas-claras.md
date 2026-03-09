# Sistema Cuentas Claras (CAA BRS)

Este documento describe como funciona la seccion "Cuentas Claras" del sitio.

## Objetivo

La seccion "Cuentas Claras" muestra informacion financiera del CAA de forma transparente para estudiantes y comunidad escolar.

## Implementacion actual

- La pagina dedicada esta archivada en `.archived/cuentas-claras.html`.
- Actualmente no esta publicada ni enlazada desde `index.html`.
- El contenido principal se muestra mediante un `iframe` de Airtable.
- El `iframe` carga esta vista publicada:
  - `https://airtable.com/embed/appB13HSymAL7ArK7/shrEeipVV7TKKU4oX`
- El diseno visual usa los mismos estilos y estructura general del sitio principal.

## Flujo general

1. Para publicarla, mover `.archived/cuentas-claras.html` a la raiz como `cuentas-claras.html`.
2. Se renderiza la barra lateral y el encabezado del sitio.
3. Se carga el `iframe` de Airtable con la tabla de datos financieros.
4. La informacion se consulta directamente desde Airtable.

## Mantenimiento

- Si cambia el enlace publico de Airtable, actualizar el atributo `src` del `iframe` en `.archived/cuentas-claras.html` (o en `cuentas-claras.html` si se reactiva).
- Mantener el acceso publico del recurso de Airtable para que el `iframe` se pueda visualizar.
- Revisar periodicamente que la altura (`height`) del `iframe` sea suficiente para la tabla.

## Nota de publicacion

Este archivo esta en una carpeta oculta (`.private/`) para documentacion interna y no se enlaza desde la interfaz del sitio.
