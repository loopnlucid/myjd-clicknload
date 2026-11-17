const $ = (id) => document.getElementById(id);

async function render() {
  const s = await chrome.storage.local.get(null);
  $("enabled").checked = s.enabled !== false;
  const st = $("state");
  if (!s.loginSecret) {
    st.textContent = "Not logged in – please open the settings.";
    st.className = "status warn";
  } else if (!s.deviceId) {
    st.textContent = "No JDownloader selected.";
    st.className = "status warn";
  } else {
    st.textContent = `Target: ${s.deviceName || s.deviceId}`;
    st.className = "status " + (s.enabled === false ? "muted" : "ok");
  }
  const ul = $("history");
  ul.innerHTML = "";
  const hist = s.history || [];
  if (!hist.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nothing sent yet.";
    ul.appendChild(li);
  }
  for (const h of hist) {
    const li = document.createElement("li");
    const t = document.createElement("div");
    t.className = "t " + (h.ok ? "" : "err");
    t.textContent = (h.ok ? "✔ " : "✖ ") + h.title;
    t.title = h.source || "";
    const m = document.createElement("div");
    m.className = "m";
    m.textContent = new Date(h.time).toLocaleString() + (h.error ? " – " + h.error : "");
    li.append(t, m);
    ul.appendChild(li);
  }
}

$("enabled").addEventListener("change", () => chrome.storage.local.set({ enabled: $("enabled").checked }).then(render));
$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("clear").addEventListener("click", () => chrome.storage.local.set({ history: [] }).then(render));
render();
