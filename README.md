# MyJD Click'n'Load for Chrome, Vivaldi & Co.

A lightweight browser extension (Manifest V3) that intercepts **Click'n'Load buttons** on websites and sends the links via **MyJDownloader** to any JDownloader instance, for example a JDownloader running in a Docker container on your NAS.

> ⚠️ **Use at your own risk and for legal purposes only.** The author accepts no liability for any damages. See the [disclaimer](#️-disclaimer).

---

## Why does this project exist?

There used to be an official MyJDownloader extension for Chrome. It forwarded Click'n'Load buttons directly to MyJDownloader. That was very convenient when JDownloader does **not** run on your own PC but on a server or NAS.

That extension no longer works in current versions of Chrome and is no longer available in the Chrome Web Store:

- It was built on **Manifest V2**, which Google has removed from Chrome.
- It intercepted and redirected network requests with `webRequestBlocking`. Under Manifest V3 this is no longer allowed for regular extensions.

The old extension is still available for Firefox, but there was no working replacement for Chromium-based browsers. That is why this project was created: an **independent re-implementation** of the Click'n'Load forwarding that works with Manifest V3 and has no third-party dependencies. No code from the original extension was copied; the behaviour of the MyJDownloader API was re-implemented using the browser's built-in WebCrypto.

## Features

- ✅ Intercepts Click'n'Load submissions (`/flash/add`, `/flash/addcrypted2`), whether sent via form, `fetch`, XHR, popup, link or iframe
- ✅ Answers JDownloader detection checks (`jdcheck.js`, `crossdomain.xml`) so that websites show the CNL button at all
- ✅ Sends the data end-to-end encrypted via `api.jdownloader.org` to the selected JDownloader
- ✅ The encrypted CNL data (`jk`/`crypted`) is decrypted by JDownloader itself, just like with the original extension
- ✅ Freely selectable target device (NAS, server, PC …) if several JDownloaders are connected to your account
- ✅ Context menu: "Send link to JDownloader" and "Send selected text to JDownloader"
- ✅ Options: autostart, download folder, notifications, on/off switch
- ✅ Popup with a history of recent submissions
- ✅ Your password is **not** stored, only the keys derived from it (as with the official API)

## Requirements

- A Chromium-based browser, version 111 or later (Chrome, Vivaldi, Edge, Brave, Opera …)
- A free account at [my.jdownloader.org](https://my.jdownloader.org)
- A JDownloader connected to that account, e.g. via Docker on a Synology NAS:
  [Synology NAS installation guide](https://support.jdownloader.org/knowledgebase/article/synology-nas-installation)

You do **not** need a JDownloader running on your PC.

## Installation

1. Download the extension: either `git clone https://github.com/loopnlucid/myjd-clicknload.git`, or download and unzip the ZIP file from [Releases](https://github.com/loopnlucid/myjd-clicknload/releases).
2. Open the extensions page in your browser:
   - Chrome: `chrome://extensions`
   - Vivaldi: `vivaldi://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode**.
4. Click **"Load unpacked"** and select the **`extension`** folder, i.e. the folder that directly contains `manifest.json`.
5. The settings page opens automatically.

## Setup

1. Log in with your MyJDownloader account (email + password).
2. Under **"Target JDownloader"**, select the device you want, e.g. your NAS JDownloader.
3. Click **"Test connection"**. If it says "is responding ✔", you're all set.
4. Optionally configure autostart, download folder and notifications.

From now on, Click'n'Load links end up in the LinkGrabber of the selected JDownloader.

### Testing

The [`test/`](test/) folder contains a test page (`cnl-test.html`) that sends a harmless link (`example.com`) via Click'n'Load. To let the extension work on locally opened files, enable **"Allow access to file URLs"** in the extension's details.

## How it works

```
Website with CNL button
   │  form/XHR to http://127.0.0.1:9666/flash/addcrypted2
   ▼
content/main-world.js   ── intercepts the submission inside the page (no request to localhost)
   │  window.postMessage
   ▼
content/bridge.js       ── passes the data on to the service worker
   ▼
background.js           ── builds the "dummycnl" link and calls /linkgrabberv2/addLinks
   │  AES-encrypted (myjd.js)
   ▼
api.jdownloader.org  ──►  your JDownloader (NAS/Docker/server)  ──►  LinkGrabber
```

| File | Purpose |
|---|---|
| `extension/manifest.json` | Manifest V3 |
| `extension/background.js` | Service worker: session, sending, history, context menu, network fallback |
| `extension/myjd.js` | Minimal MyJDownloader API client (WebCrypto: SHA-256, HMAC, AES-128-CBC) |
| `extension/content/main-world.js` | Hooks `form.submit`, submit events, `fetch`, XHR, `window.open` and links targeting `127.0.0.1:9666` |
| `extension/content/bridge.js` | Bridge between the page and the extension |
| `extension/rules.json` | `declarativeNetRequest` rules for `jdcheck.js`, `crossdomain.xml` and `/flash/` |
| `extension/options.*`, `popup.*`, `sent.*` | User interface |

**Fallback:** If a CNL request still reaches the network (e.g. a direct navigation), a non-blocking `webRequest` listener reads its content and sends it as well. Duplicate submissions are detected and discarded.

**Permissions:** `<all_urls>` is required because Click'n'Load buttons can appear on any website. The scripts are only active when the extension is set up and switched on. Data is sent exclusively to `api.jdownloader.org`.

## Privacy

- Stored locally in your browser (`chrome.storage.local`): your email, the keys derived from your password, the selected device ID, settings and a short history (max. 30 entries).
- Your password itself is never stored.
- There is no telemetry, no tracking and no connection to anything other than `api.jdownloader.org`.

## Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot load extension … Filenames starting with "_" …" | Wrong folder selected. Select the `extension` subfolder. |
| "Wrong email or password" | Check your my.jdownloader.org credentials. |
| No device in the list | Your JDownloader is not connected to MyJDownloader. Check the MyJD credentials in JDownloader or in the Docker container. |
| "JDownloader is offline" | The NAS/container is not running or has no internet connection. |
| A button on a website does nothing | Reload the page after setting up or enabling the extension. If that doesn't help, please open an [issue](https://github.com/loopnlucid/myjd-clicknload/issues) and include the affected website. |

## ⚖️ Disclaimer

- This software is provided **"as is", without warranty of any kind**, express or implied.
- The author **accepts no liability whatsoever for any damages** arising directly or indirectly from the use, malfunction or unavailability of this software. This includes, to the extent permitted by law, data loss, account suspensions, third-party rights infringements and consequential damages.
- This software may be used **for legal purposes only**, i.e. to download content you hold the necessary rights to or that is lawfully and freely available.
- **Any use to infringe copyright or any other law is expressly prohibited.** You alone are responsible for complying with the laws applicable in your country.
- This project is **not affiliated with AppWork GmbH**, the maker of JDownloader and MyJDownloader. "JDownloader" and "MyJDownloader" are trademarks/products of their respective owners and are mentioned here only to describe compatibility.

## License

[MIT](LICENSE). See there for the full warranty disclaimer and limitation of liability.
