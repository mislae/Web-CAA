// Configuration
const ADMIN_PASSWORD = "admin123"; // En producción, esto debe estar en .env
const CONFIG_FILE = "/api/config/brs100palabras";

// State
let config = null;
let isAuthenticated = false;

// ==============================================
// AUTHENTICATION
// ==============================================
function checkAuthentication() {
  const token = sessionStorage.getItem("admin_token");
  if (!token) {
    showLoginModal();
    return false;
  }
  isAuthenticated = true;
  hideLoginModal();
  return true;
}

function showLoginModal() {
  document.getElementById("loginModal").classList.remove("hidden");
}

function hideLoginModal() {
  document.getElementById("loginModal").classList.add("hidden");
}

// Handle login form
document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const password = document.getElementById("passwordInput").value;

  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem("admin_token", "valid");
    isAuthenticated = true;
    document.getElementById("passwordInput").value = "";
    hideLoginModal();
    initializePanel();
    showToast("✓ Acceso concedido", "success");
  } else {
    document.getElementById("loginError").textContent =
      "Contraseña incorrecta";
    showToast("✗ Contraseña incorrecta", "error");
  }
});

// Handle logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("admin_token");
  isAuthenticated = false;
  showLoginModal();
  showToast("Sesión cerrada", "warning");
});

// ==============================================
// TAB NAVIGATION
// ==============================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");

    // Update active tab button
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Update active content
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));
    document.getElementById(tabName).classList.add("active");
  });
});

// ==============================================
// LOAD CONFIGURATION
// ==============================================
async function loadConfig() {
  try {
    const response = await fetch(CONFIG_FILE);
    if (!response.ok) throw new Error("Failed to load config");
    config = await response.json();
    updateUIFromConfig();
    showToast("✓ Configuración cargada", "success");
  } catch (error) {
    console.error("Error loading config:", error);
    showToast("✗ Error al cargar configuración", "error");
  }
}

// ==============================================
// SAVE CONFIGURATION
// ==============================================
async function saveConfig() {
  try {
    const response = await fetch(CONFIG_FILE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) throw new Error("Failed to save config");
    showToast("✓ Cambios guardados", "success");
  } catch (error) {
    console.error("Error saving config:", error);
    showToast("✗ Error al guardar cambios", "error");
  }
}

// ==============================================
// UPDATE UI FROM CONFIG
// ==============================================
function updateUIFromConfig() {
  if (!config) return;

  // Update last modified
  const lastModified = new Date(config.lastModified);
  document.getElementById("lastModified").textContent =
    lastModified.toLocaleString("es-ES");

  // Update master toggle
  const masterToggle = document.getElementById("masterToggle");
  masterToggle.checked = config.enabled;

  // Update feature toggles
  Object.keys(config.features).forEach((featureKey) => {
    const featureToggle = document.querySelector(
      `input[data-feature="${featureKey}"]`
    );
    if (featureToggle) {
      featureToggle.checked = config.features[featureKey].enabled;
      updateFeatureCardState(featureKey);
    }
  });
}

// ==============================================
// UPDATE FEATURE CARD STATE
// ==============================================
function updateFeatureCardState(featureKey) {
  const isEnabled = config.features[featureKey].enabled;
  const statusElement = document.getElementById(`status-${featureKey}`);
  const cardElement = document.querySelector(
    `input[data-feature="${featureKey}"]`
  ).closest(".feature-card");

  if (isEnabled) {
    statusElement.textContent = "✓ Habilitado";
    statusElement.style.color = "#10b981";
    cardElement.classList.remove("disabled");
  } else {
    statusElement.textContent = "✗ Deshabilitado";
    statusElement.style.color = "#ef4444";
    cardElement.classList.add("disabled");
  }
}

// ==============================================
// EVENT LISTENERS
// ==============================================

// Master toggle (enable/disable entire module)
document.getElementById("masterToggle").addEventListener("change", (e) => {
  config.enabled = e.target.checked;
  config.lastModified = new Date().toISOString();

  // Enable/disable all feature toggles
  document.querySelectorAll(".feature-toggle").forEach((toggle) => {
    if (!config.enabled) {
      toggle.checked = false;
    } else {
      toggle.checked = config.features[toggle.dataset.feature].enabled;
    }
    updateFeatureCardState(toggle.dataset.feature);
  });

  saveConfig();
  showToast(
    config.enabled
      ? "✓ Módulo activado"
      : "✓ Módulo desactivado",
    "success"
  );
});

// Feature toggles
document.querySelectorAll(".feature-toggle").forEach((toggle) => {
  toggle.addEventListener("change", (e) => {
    const featureKey = e.target.dataset.feature;
    config.features[featureKey].enabled = e.target.checked;
    config.lastModified = new Date().toISOString();

    updateFeatureCardState(featureKey);
    updateUIFromConfig(); // Refresh last modified
    saveConfig();

    showToast(
      e.target.checked
        ? `✓ ${config.features[featureKey].name} habilitado`
        : `✓ ${config.features[featureKey].name} deshabilitado`,
      "success"
    );
  });
});

// ==============================================
// TOAST NOTIFICATIONS
// ==============================================
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==============================================
// INITIALIZE PANEL
// ==============================================
async function initializePanel() {
  await loadConfig();
}

// ==============================================
// APP START
// ==============================================
document.addEventListener("DOMContentLoaded", () => {
  if (checkAuthentication()) {
    initializePanel();
  }

  // Focus on password input when modal shows
  const passwordInput = document.getElementById("passwordInput");
  if (passwordInput) {
    passwordInput.focus();
  }
});
