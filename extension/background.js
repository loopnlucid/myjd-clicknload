import { connect, deviceCall, listDevices, MyJDError } from "./myjd.js";

const CNL_URL_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666\/flash\/(?:add|addcrypted2?)\/?(?:[?#]|$)/i;
const SCRIPT_IDS = ["myjd-cnl-main", "myjd-cnl-bridge"];
const HISTORY_MAX = 30;

// ---------------------------------------------------------------- Settings

async function getSettings() {
  const s = await chrome.storage.local.get(null);
  return {
    enabled: s.enabled !== false,
    email: s.email || "",
    loginSecret: s.loginSecret || "",
    deviceSecret: s.deviceSecret || "",
    deviceId: s.deviceId || "",
    deviceName: s.deviceName || "",
    autostart: !!s.autostart,
    destinationFolder: s.destinationFolder || "",
    notifications: s.notifications !== false,
  };
}

function isConfigured(s) {
  return !!(s.email && s.loginSecret && s.deviceSecret && s.deviceId);
}

// ---------------------------------------------------------------- Session

let sessionPromise = null;

async function getSession(settings, forceNew = false) {
  if (!forceNew) {
    const { session } = await chrome.storage.session.get("session");
    if (session && session.email === settings.email) return session;
  }
  if (!sessionPromise) {
    sessionPromise = connect(settings)
      .then(async (s) => {
        const session = { ...s, email: settings.email };
        await chrome.storage.session.set({ session });
        return session;
      })
      .finally(() => (sessionPromise = null));
  }
  return sessionPromise;
}

async function callDevice(action, params) {
  const settings = await getSettings();
  if (!isConfigured(settings)) throw new MyJDError("NOT_CONFIGURED", 0);
  let session = await getSession(settings);
  try {
    return await deviceCall(session, settings.deviceId, action, params);
  } catch (e) {
    const t = e.type || "";
    if (t === "TOKEN_INVALID" || t === "AUTH_FAILED" || t === "RID_MISMATCH" || e.status === 403 || e.status === 401) {
      session = await getSession(settings, true);
      return await deviceCall(session, settings.deviceId, action, params);
    }
    throw e;
  }
}

// ---------------------------------------------------------------- Sending links to JDownloader

function hexUtf8(str) {
  return Array.from(new TextEncoder().encode(str), (b) => b.toString(16).padStart(2, "0")).join("");
}

function firstValues(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== null) out[k] = String(val);
  }
  return out;
}

async function addLinks(query) {
  const settings = await getSettings();
  const q = { autostart: settings.autostart, ...query };
  if (settings.destinationFolder && !q.destinationFolder) q.destinationFolder = settings.destinationFolder;
  await callDevice("/linkgrabberv2/addLinks", [JSON.stringify(q)]);
  return settings;
}

// Ignore duplicate submissions (page hook + network fallback) within a short time window.
const recent = new Map();
function isDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 8000) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

async function handleCnl({ fields, pageUrl, pageTitle, via }) {
  const f = firstValues(fields);
  if (!f.crypted && !f.urls) return { ok: false, error: "No Click'n'Load data found" };
  if (isDuplicate((f.crypted || "") + "|" + (f.jk || "") + "|" + (f.urls || ""))) return { ok: true, duplicate: true };

  // The CNL data is passed to JDownloader as a "dummycnl" link; JDownloader
  // decrypts jk/crypted itself (same approach as the former official extension).
  let links = "https://dummycnl.jdownloader.org/#" + encodeURIComponent(hexUtf8(JSON.stringify(f)));
  if (f.urls && !f.crypted) links += "\r\n" + f.urls;

  const query = { links, permission: true };
  const src = f.source || pageUrl;
  if (src) query.sourceUrl = src;
  if (f.package) query.packageName = f.package;

  const title = f.package || pageTitle || src || "Click'n'Load";
  try {
    const settings = await addLinks(query);
    await log({ ok: true, title, source: src, via });
    notify(settings, "Sent to JDownloader", `${title}\n→ ${settings.deviceName || "JDownloader"}`);
    flashBadge("OK", "#2e7d32");
    return { ok: true };
  } catch (e) {
    const msg = errorText(e);
    await log({ ok: false, title, source: src, via, error: msg });
    notify(await getSettings(), "Sending failed", `${title}\n${msg}`, true);
    flashBadge("ERR", "#c62828");
    return { ok: false, error: msg };
  }
}

function errorText(e) {
  const t = e && e.type;
  switch (t) {
    case "NOT_CONFIGURED":
      return "The extension is not set up yet (open the options).";
    case "AUTH_FAILED":
    case "EMAIL_INVALID":
      return "MyJDownloader login failed – please check your credentials in the options.";
    case "OFFLINE":
    case "DEVICE_OFFLINE":
      return "The JDownloader is offline or not connected to MyJDownloader.";
    default:
      return (e && e.message) || String(e);
  }
}

async function log(entry) {
  const { history = [] } = await chrome.storage.local.get("history");
  history.unshift({ time: Date.now(), ...entry });
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_MAX) });
}

function notify(settings, title, message, force = false) {
  if (!settings.notifications && !force) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 0,
  });
}

let badgeTimer;
function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => updateBadge(), 6000);
}

async function updateBadge() {
  const s = await getSettings();
  if (!s.enabled) {
    chrome.action.setBadgeBackgroundColor({ color: "#777" });
    chrome.action.setBadgeText({ text: "OFF" });
  } else if (!isConfigured(s)) {
    chrome.action.setBadgeBackgroundColor({ color: "#e65100" });
    chrome.action.setBadgeText({ text: "!" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ---------------------------------------------------------------- Content scripts / rules depending on state

async function syncInterception() {
  const s = await getSettings();
  const active = s.enabled && isConfigured(s);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map((r) => r.id) });
  if (active) {
    await chrome.scripting.registerContentScripts([
      {
        id: "myjd-cnl-main",
        js: ["content/main-world.js"],
        matches: ["<all_urls>"],
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_start",
        world: "MAIN",
      },
      {
        id: "myjd-cnl-bridge",
        js: ["content/bridge.js"],
        matches: ["<all_urls>"],
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_start",
      },
    ]);
  }
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    active ? { enableRulesetIds: ["cnl_rules"] } : { disableRulesetIds: ["cnl_rules"] }
  );
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncInterception();
  setupContextMenus();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(syncInterception);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (["enabled", "email", "loginSecret", "deviceSecret", "deviceId"].some((k) => k in changes)) {
    if ("loginSecret" in changes || "email" in changes) chrome.storage.session.remove("session");
    syncInterception();
  }
});

// ---------------------------------------------------------------- Network fallback
// Catches CNL requests that were not already intercepted inside the page (e.g. direct
// navigations or iframes). Observe-only – the request itself goes nowhere because no
// local JDownloader is listening on port 9666.

function parseUrlEncoded(str, into) {
  for (const [k, v] of new URLSearchParams(str)) (into[k] ||= []).push(v);
  return into;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!CNL_URL_RE.test(details.url) || details.method === "OPTIONS" || details.url.includes("fromExtension")) return;
    (async () => {
      const s = await getSettings();
      if (!s.enabled) return;
      const fields = {};
      const q = details.url.indexOf("?");
      if (q >= 0) parseUrlEncoded(details.url.slice(q + 1).split("#")[0], fields);
      const body = details.requestBody;
      if (body?.formData) {
        for (const [k, v] of Object.entries(body.formData)) (fields[k] ||= []).push(...v);
      } else if (body?.raw?.length) {
        const bytes = body.raw.filter((r) => r.bytes).map((r) => new Uint8Array(r.bytes));
        const text = new TextDecoder().decode(bytes.length === 1 ? bytes[0] : new Uint8Array(await new Blob(bytes).arrayBuffer()));
        parseUrlEncoded(text, fields);
      }
      let pageUrl = details.initiator || "";
      let pageTitle = "";
      let tab = null;
      if (details.tabId >= 0) {
        try {
          tab = await chrome.tabs.get(details.tabId);
          if (details.type !== "main_frame") {
            pageUrl = tab.url || pageUrl;
            pageTitle = tab.title || "";
          }
        } catch {}
      }
      const result = await handleCnl({ fields, pageUrl, pageTitle, via: "network/" + details.type });
      if (details.type === "main_frame" && tab) {
        const page = chrome.runtime.getURL("sent.html") + "?ok=" + (result.ok ? 1 : 0) + "&msg=" + encodeURIComponent(result.error || "");
        chrome.tabs.update(tab.id, { url: page }).catch(() => {});
      }
    })();
  },
  { urls: ["*://127.0.0.1:9666/*", "*://localhost:9666/*"] },
  ["requestBody"]
);

// ---------------------------------------------------------------- Messages

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "cnl": {
        const tab = sender.tab || {};
        return handleCnl({
          fields: msg.fields,
          pageUrl: tab.url || msg.pageUrl,
          pageTitle: tab.title || msg.pageTitle,
          via: "page/" + (msg.via || "?"),
        });
      }
      case "listDevices": {
        const settings = { email: msg.email, loginSecret: msg.loginSecret, deviceSecret: msg.deviceSecret };
        const session = await getSession(settings, true);
        return { ok: true, devices: await listDevices(session) };
      }
      case "test": {
        const s = await getSettings();
        await callDevice("/jd/version", []);
        return { ok: true, deviceName: s.deviceName };
      }
      case "closeTab":
        if (sender.tab) chrome.tabs.remove(sender.tab.id);
        return { ok: true };
    }
    return { ok: false, error: "unknown message" };
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: errorText(e), type: e.type }));
  return true;
});

// ---------------------------------------------------------------- Context menu

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "send-link", title: "Send link to JDownloader", contexts: ["link"] });
    chrome.contextMenus.create({ id: "send-selection", title: "Send selected text to JDownloader", contexts: ["selection"] });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const links = info.menuItemId === "send-link" ? info.linkUrl : info.selectionText;
  if (!links) return;
  const title = (tab && tab.title) || links.slice(0, 80);
  try {
    const settings = await addLinks({ links, sourceUrl: (tab && tab.url) || undefined });
    await log({ ok: true, title, source: tab && tab.url, via: "contextmenu" });
    notify(settings, "Sent to JDownloader", `${title}\n→ ${settings.deviceName || "JDownloader"}`);
    flashBadge("OK", "#2e7d32");
  } catch (e) {
    const msg = errorText(e);
    await log({ ok: false, title, source: tab && tab.url, via: "contextmenu", error: msg });
    notify(await getSettings(), "Sending failed", msg, true);
    flashBadge("ERR", "#c62828");
  }
});
