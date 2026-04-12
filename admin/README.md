# 🎛️ Panel de Control - BRS en 100 Palabras

## Inicio Rápido

### Acceder al Panel
1. Abre tu navegador y ve a: `http://localhost:3000/admin`
2. Ingresa la contraseña: `admin123`

> ⚠️ **Nota de Seguridad**: Cambia esta contraseña en `admin/index.js` (línea 5) antes de desplegar en producción.

---

## ¿Qué puedo hacer?

### 🟢 **Módulo General**
- Ver estado de la aplicación
- Ver versión instalada
- Ver estado general de todos los módulos

### 🎯 **BRS en 100 Palabras**

#### Master Toggle (Activar/Desactivar Todo)
- Enciende o apaga completamente el módulo
- Si está desactivado, todas las funciones se desactivan automáticamente

#### Funciones Individuales

| Función | Descripción | Qué controla |
|---------|-------------|-------------|
| **Popup de Bienvenida** | Mostrar popup en la página de inicio | El popup que aparece cuando entras a `brs100palabras/` |
| **Página de Participación** | Permitir acceso a `participa.html` | El botón "ENTRA AQUÍ" del popup |
| **Página de Reglas** | Mostrar reglas del concurso | El acceso a las reglas desde el popup |
| **Página de Rúbrica** | Mostrar criterios de evaluación | El acceso a la rúbrica desde el popup |
| **Formulario de Envío** | Permitir envío de participaciones | La capacidad de subir archivos |
| **Galería de Participaciones** | Mostrar participaciones enviadas | La visualización de las participaciones |

---

## Cambios en Tiempo Real

✅ **Los cambios se guardan al instante**
- Sin necesidad de recargar el servidor
- Si desactivas una función, se verá afectada inmediatamente

⚠️ **Nota**: Los usuarios que ya tengan la página abierta pueden necesitar refrescar (F5) para ver los cambios

---

## Archivos Importantes

```
admin/
  ├── index.html          # Interfaz del panel
  ├── index.js            # Lógica del panel
  ├── styles.css          # Estilos responsive
  └── README.md           # Este archivo

config/
  └── brs100palabras.json # Configuración guardada

brs100palabras/
  └── app.js              # Script que lee la configuración
```

---

## Para Desarrolladores

### Modificar la Contraseña

En `admin/index.js`, línea 5:
```javascript
const ADMIN_PASSWORD = "admin123"; // ← Cambia esto
```

### Agregar Nuevas Funciones

1. En `config/brs100palabras.json`:
```json
"nuevaFuncion": {
  "enabled": true,
  "name": "Nombre de la Función",
  "description": "Descripción corta"
}
```

2. En `admin/index.html`, agregrega una tarjeta en la sección de features:
```html
<div class="feature-card">
  <div class="feature-header">
    <h3>Nueva Función</h3>
    <label class="toggle-label small">
      <input type="checkbox" class="feature-toggle" data-feature="nuevaFuncion" checked />
      <span class="toggle-switch small"></span>
    </label>
  </div>
  <p class="feature-description">Descripción</p>
  <p class="feature-status" id="status-nuevaFuncion">✓ Habilitado</p>
</div>
```

3. En `brs100palabras/app.js`, agrega lógica para verificar:
```javascript
if (!moduleConfig.features.nuevaFuncion.enabled) {
  // Deshabilitar la funcionalidad
}
```

---

## Seguridad

⚠️ **Recomendaciones para Producción:**

1. **Cambiar contraseña**: Edita `admin/index.js` línea 5
2. **Usar variables de entorno**: Guarda la contraseña en `.env`
3. **HTTPS**: Siempre usa HTTPS en producción
4. **Limitar acceso IP**: Usa firewall o reverse proxy para restringir quién puede acceder
5. **Cambiar puertos**: No dejes el admin en la raíz (considera `/admin-secreto/`)

---

## Troubleshooting

### El panel no carga
- Verifica que el servidor esté corriendo: `npm start`
- Abre la consola del navegador (F12) para ver errores

### Los cambios no se aplican
- Recarga la página (F5)
- Verifica que la contraseña sea correcta
- Mira la consola para errores de red

### Olvidé la contraseña
- Edita `admin/index.js` línea 5
- Cambia el valor de `ADMIN_PASSWORD`

---

## Más Información

Para preguntas sobre el módulo BRS en 100 Palabras, consulta:
- `brs100palabras/README.md`
- `config/brs100palabras.json` (configuración actual)

---

**Última actualización**: 12 de Abril de 2026
