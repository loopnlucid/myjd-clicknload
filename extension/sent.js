const p = new URLSearchParams(location.search);
const ok = p.get("ok") === "1";
document.getElementById("title").textContent = ok ? "✔ Sent to JDownloader" : "✖ Sending failed";
document.getElementById("title").className = ok ? "ok" : "err";
document.getElementById("msg").textContent = ok ? "The links are now in your JDownloader's LinkGrabber." : p.get("msg") || "";
const close = () => chrome.runtime.sendMessage({ type: "closeTab" });
document.getElementById("close").addEventListener("click", close);
if (ok) setTimeout(close, 4000);
