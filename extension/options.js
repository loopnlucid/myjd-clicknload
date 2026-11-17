import { deriveSecrets } from "./myjd.js";

const $ = (id) => document.getElementById(id);
const setStatus = (el, text, cls = "") => {
  $(el).textContent = text;
  $(el).className = "status " + cls;
};

let creds = null;

async function load() {
  const s = await chrome.storage.local.get(null);
  $("enabled").checked = s.enabled !== false;
  $("autostart").checked = !!s.autostart;
  $("notifications").checked = s.notifications !== false;
  $("dest").value = s.destinationFolder || "";
  if (s.email && s.loginSecret) {
    creds = { email: s.email, loginSecret: s.loginSecret, deviceSecret: s.deviceSecret };
    showLoggedIn(s.email);
    if (s.deviceId) fillDevices([{ id: s.deviceId, name: s.deviceName || s.deviceId }], s.deviceId);
    loadDevices(s.deviceId);
  }
}

function showLoggedIn(email) {
  $("curEmail").textContent = email;
  $("loggedIn").hidden = !email;
  $("loginForm").hidden = !!email;
}

function fillDevices(list, selected) {
  const sel = $("device");
  sel.innerHTML = "";
  if (!list.length) {
    sel.innerHTML = '<option value="">– kein JDownloader online –</option>';
    return;
  }
  for (const d of list) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name + (d.status && d.status !== "ONLINE" && d.status !== "UNKNOWN" ? ` (${d.status})` : "");
    o.dataset.name = d.name;
    sel.appendChild(o);
  }
  if (selected && list.some((d) => d.id === selected)) sel.value = selected;
}

async function loadDevices(selected) {
  if (!creds) return;
  setStatus("deviceStatus", "Lade Geräte …");
  const r = await chrome.runtime.sendMessage({ type: "listDevices", ...creds });
  if (!r.ok) {
    setStatus("deviceStatus", r.error, "err");
    return false;
  }
  const list = r.devices.filter((d) => !d.type || d.type === "jd");
  fillDevices(list, selected);
  setStatus("deviceStatus", list.length ? `${list.length} Gerät(e) gefunden.` : "Kein JDownloader mit diesem Konto verbunden.", list.length ? "ok" : "warn");
  if (list.length && !selected) await saveDevice();
  return true;
}

async function saveDevice() {
  const opt = $("device").selectedOptions[0];
  if (!opt || !opt.value) return;
  await chrome.storage.local.set({ deviceId: opt.value, deviceName: opt.dataset.name || opt.textContent });
}

$("login").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const pw = $("password").value;
  if (!email || !pw) return setStatus("loginStatus", "Bitte E-Mail und Passwort eingeben.", "err");
  $("login").disabled = true;
  setStatus("loginStatus", "Melde an …");
  try {
    const c = await deriveSecrets(email, pw);
    const r = await chrome.runtime.sendMessage({ type: "listDevices", ...c });
    if (!r.ok) {
      setStatus("loginStatus", (r.type === "AUTH_FAILED" || r.type === "EMAIL_INVALID") ? "E-Mail oder Passwort falsch." : r.error, "err");
      return;
    }
    creds = c;
    $("password").value = "";
    const { deviceId } = await chrome.storage.local.get("deviceId");
    await chrome.storage.local.set({ ...c });
    showLoggedIn(c.email);
    setStatus("loginStatus", "Erfolgreich angemeldet.", "ok");
    const list = r.devices.filter((d) => !d.type || d.type === "jd");
    fillDevices(list, deviceId);
    setStatus("deviceStatus", list.length ? `${list.length} Gerät(e) gefunden.` : "Kein JDownloader mit diesem Konto verbunden.", list.length ? "ok" : "warn");
    await saveDevice();
  } catch (e) {
    setStatus("loginStatus", String(e.message || e), "err");
  } finally {
    $("login").disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["email", "loginSecret", "deviceSecret", "deviceId", "deviceName"]);
  await chrome.storage.session.remove("session");
  creds = null;
  showLoggedIn("");
  fillDevices([], "");
  $("device").innerHTML = '<option value="">– erst anmelden –</option>';
  setStatus("loginStatus", "Abgemeldet.");
  setStatus("deviceStatus", "");
});

$("device").addEventListener("change", async () => {
  await saveDevice();
  setStatus("deviceStatus", "Gerät gespeichert.", "ok");
});
$("reload").addEventListener("click", () => loadDevices($("device").value));
$("test").addEventListener("click", async () => {
  setStatus("deviceStatus", "Teste …");
  const r = await chrome.runtime.sendMessage({ type: "test" });
  setStatus("deviceStatus", r.ok ? `JDownloader „${r.deviceName}“ antwortet. ✔` : r.error, r.ok ? "ok" : "err");
});

for (const [id, key] of [["enabled", "enabled"], ["autostart", "autostart"], ["notifications", "notifications"]]) {
  $(id).addEventListener("change", async () => {
    await chrome.storage.local.set({ [key]: $(id).checked });
    setStatus("optStatus", "Gespeichert.", "ok");
  });
}
$("dest").addEventListener("change", async () => {
  await chrome.storage.local.set({ destinationFolder: $("dest").value.trim() });
  setStatus("optStatus", "Gespeichert.", "ok");
});

load();
