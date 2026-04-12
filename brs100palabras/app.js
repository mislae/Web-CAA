(function showPopupOnlyOnHome() {
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
})();
