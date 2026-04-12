// ============================================
// CONFIG MANAGEMENT
// ============================================
let moduleConfig = null;

function initConfig() {
  // Si la configuración fue inyectada por el servidor, usarla
  if (typeof window.BRS100_CONFIG !== 'undefined') {
    moduleConfig = window.BRS100_CONFIG;
    console.log("BRS100 Config from server:", moduleConfig);
  } else {
    // Fallback: usar defaults
    console.warn("BRS100_CONFIG no encontrado, usando defaults");
    moduleConfig = {
      enabled: true,
      features: {
        popup: { enabled: true }
      }
    };
  }
  
  // Aplicar restricciones INMEDIATAMENTE
  applyRestrictions();
}

// ============================================
// FEATURE: Aplicar restricciones basadas en config
// ============================================
function applyRestrictions() {
  if (!moduleConfig || !moduleConfig.enabled) {
    // Módulo deshabilitado
    console.log("BRS100 módulo deshabilitado");
    
    // Ocultar el popup
    const overlay = document.getElementById("popupOverlay");
    if (overlay) {
      overlay.style.display = "none";
      console.log("Popup ocultado");
    }
    
    // Redirigir si estamos en una página del módulo
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/brs100palabras/") && !path.endsWith("/brs100palabras/") && !path.endsWith("/brs100palabras/index.html")) {
      console.log("Redirigiendo desde página del módulo deshabilitado...");
      window.location.href = "/";
      return;
    }
  } else {
    // Módulo habilitado - mostrar popup si feature está habilitada
    if (moduleConfig.features && moduleConfig.features.popup && moduleConfig.features.popup.enabled) {
      showPopupOnlyOnHome();
    }
  }
}

// ============================================
// FEATURE: Popup en Inicio
// ============================================
function showPopupOnlyOnHome() {
  const overlay = document.getElementById("popupOverlay");
  const closeButton = document.getElementById("popupClose");
  if (!overlay) return;

  const path = window.location.pathname.toLowerCase();
  const isHome = path.endsWith("/brs100palabras/") || path.endsWith("/brs100palabras/index.html") || path.endsWith("/") || path.endsWith("index.html");

  function closePopup() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  if (!isHome) {
    overlay.classList.add("only-home");
    overlay.setAttribute("aria-hidden", "true");
    return;
  }

  overlay.classList.remove("only-home");
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  });

  if (closeButton) {
    closeButton.addEventListener("click", closePopup);
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePopup();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-open")) {
      closePopup();
    }
  });
}

// ============================================
// INIT AL CARGAR
// ============================================
// Ejecutar lo antes posible
if (document.readyState === 'loading') {
  // El DOM aún se está cargando
  document.addEventListener("DOMContentLoaded", initConfig);
} else {
  // El DOM ya está listo
  initConfig();
}
