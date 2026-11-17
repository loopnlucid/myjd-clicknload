// Minimal MyJDownloader API client (https://api.jdownloader.org) based on WebCrypto.
// Protocol as used by the official MyJDownloader web clients:
//   loginSecret  = SHA256(email.lower + password + "server")
//   deviceSecret = SHA256(email.lower + password + "device")
//   serverToken  = SHA256(loginSecret  || hex(sessiontoken))
//   deviceToken  = SHA256(deviceSecret || hex(sessiontoken))
//   AES-128-CBC with IV = first 16 bytes, key = last 16 bytes of the respective secret.

export const API_ROOT = "https://api.jdownloader.org";
export const APP_KEY = "myjd_cnl_chrome";

const te = new TextEncoder();
const td = new TextDecoder();

export function bytesToHex(b) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(str) {
  const s = atob(str.replace(/\s+/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
async function hmacHex(keyBytes, str) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(str))));
}
async function aesKey(secret, usage) {
  return crypto.subtle.importKey("raw", secret.slice(16, 32), { name: "AES-CBC" }, false, [usage]);
}
async function encrypt(secret, text) {
  const key = await aesKey(secret, "encrypt");
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: secret.slice(0, 16) }, key, te.encode(text));
  return b64encode(new Uint8Array(ct));
}
async function decrypt(secret, b64) {
  const key = await aesKey(secret, "decrypt");
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv: secret.slice(0, 16) }, key, b64decode(b64));
  return td.decode(pt);
}

/** Derives both secrets from email and password (the password itself is not stored). */
export async function deriveSecrets(email, password) {
  const e = email.trim().toLowerCase();
  return {
    email: e,
    loginSecret: bytesToHex(await sha256(te.encode(e + password + "server"))),
    deviceSecret: bytesToHex(await sha256(te.encode(e + password + "device"))),
  };
}

let lastRid = 0;
function nextRid() {
  let r = Date.now();
  if (r <= lastRid) r = lastRid + 1;
  lastRid = r;
  return r;
}

export class MyJDError extends Error {
  constructor(type, status, detail) {
    super(type + (detail ? ": " + detail : ""));
    this.type = type;
    this.status = status;
  }
}

async function parseError(res, secret) {
  const text = await res.text().catch(() => "");
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    if (secret && text) {
      try {
        obj = JSON.parse(await decrypt(secret, text));
      } catch {}
    }
  }
  const type = (obj && (obj.type || obj.data?.type)) || "HTTP_" + res.status;
  return new MyJDError(type, res.status, obj && obj.src ? "(" + obj.src + ")" : text.slice(0, 200));
}

async function signedGet(path, params, signKey, decryptKey) {
  const rid = nextRid();
  const qs = new URLSearchParams({ ...params, rid: String(rid) }).toString();
  const query = path + "?" + qs;
  const sig = await hmacHex(signKey, query);
  const res = await fetch(API_ROOT + query + "&signature=" + sig, { method: "GET" });
  if (!res.ok) throw await parseError(res, decryptKey);
  const data = JSON.parse(await decrypt(decryptKey, await res.text()));
  if (data.rid !== undefined && data.rid !== rid) throw new MyJDError("RID_MISMATCH", 0);
  return data;
}

/**
 * Opens a session. creds = {email, loginSecret(hex), deviceSecret(hex)}.
 * Returns {sessiontoken, regaintoken, serverToken(hex), deviceToken(hex)}.
 */
export async function connect(creds) {
  const loginSecret = hexToBytes(creds.loginSecret);
  const deviceSecret = hexToBytes(creds.deviceSecret);
  const data = await signedGet("/my/connect", { email: creds.email, appkey: APP_KEY }, loginSecret, loginSecret);
  const ses = hexToBytes(data.sessiontoken);
  return {
    sessiontoken: data.sessiontoken,
    regaintoken: data.regaintoken,
    serverToken: bytesToHex(await sha256(concat(loginSecret, ses))),
    deviceToken: bytesToHex(await sha256(concat(deviceSecret, ses))),
  };
}

export async function listDevices(session) {
  const st = hexToBytes(session.serverToken);
  const data = await signedGet("/my/listdevices", { sessiontoken: session.sessiontoken }, st, st);
  return data.list || [];
}

export async function disconnect(session) {
  const st = hexToBytes(session.serverToken);
  try {
    await signedGet("/my/disconnect", { sessiontoken: session.sessiontoken }, st, st);
  } catch {}
}

/** Calls a method on the JDownloader device, e.g. "/linkgrabberv2/addLinks". */
export async function deviceCall(session, deviceId, action, params = []) {
  const dt = hexToBytes(session.deviceToken);
  const rid = nextRid();
  const body = await encrypt(dt, JSON.stringify({ url: action, params, apiVer: 1, rid }));
  const url = API_ROOT + "/t_" + session.sessiontoken + "_" + encodeURIComponent(deviceId) + action;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/aesjson-jd; charset=utf-8" },
    body,
  });
  if (!res.ok) throw await parseError(res, dt);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(await decrypt(dt, text));
  } catch {
    data = JSON.parse(text);
  }
  if (data.rid !== undefined && data.rid !== rid) throw new MyJDError("RID_MISMATCH", 0);
  return data.data;
}
