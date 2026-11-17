const p = new URLSearchParams(location.search);
const ok = p.get("ok") === "1";
document.getElementById("title").textContent = ok ? "✔ An JDownloader gesendet" : "✖ Senden fehlgeschlagen";
document.getElementById("title").className = ok ? "ok" : "err";
document.getElementById("msg").textContent = ok ? "Die Links liegen jetzt im LinkGrabber deines JDownloaders." : p.get("msg") || "";
const close = () => chrome.runtime.sendMessage({ type: "closeTab" });
document.getElementById("close").addEventListener("click", close);
if (ok) setTimeout(close, 4000);
