// Isolierte Welt: reicht die in der Seite abgefangenen CNL-Daten an den Service Worker weiter.
(() => {
  if (window.__myjdCnlBridge) return;
  window.__myjdCnlBridge = true;
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__myjd_cnl__ !== true) return;
    const { fields, via, pageUrl, pageTitle } = e.data;
    if (!fields || typeof fields !== "object") return;
    try {
      chrome.runtime.sendMessage({ type: "cnl", fields, via, pageUrl, pageTitle }).catch(() => {});
    } catch {
      // Erweiterung wurde neu geladen – Seite neu laden.
    }
  });
})();
