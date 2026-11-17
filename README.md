# MyJD Click'n'Load für Chrome, Vivaldi & Co.

Eine schlanke Browser-Erweiterung (Manifest V3), die **Click'n'Load-Buttons** auf Webseiten abfängt und die Links über **MyJDownloader** an einen beliebigen JDownloader schickt, zum Beispiel an einen JDownloader im Docker-Container auf dem NAS.

> 🇬🇧 **English summary:** A minimal Manifest V3 extension for Chromium-based browsers (Chrome, Vivaldi, Edge, Brave, …) that intercepts Click'n'Load (CNL2) submissions and forwards them through the MyJDownloader API to a remote JDownloader (e.g. a Docker instance on a NAS). It replaces the official MyJDownloader browser extension, which no longer works in current Chrome versions. **Use at your own risk, for legal purposes only. See the [disclaimer](#️-haftungsausschluss--disclaimer).**

---

## Warum gibt es dieses Projekt?

Früher gab es eine offizielle MyJDownloader-Erweiterung für Chrome. Sie hat Click'n'Load-Buttons direkt an MyJDownloader weitergeleitet. Das war praktisch, wenn JDownloader **nicht** auf dem eigenen PC läuft, sondern auf einem Server oder NAS.

Diese Erweiterung funktioniert in aktuellen Chrome-Versionen nicht mehr bzw. ist im Chrome Web Store nicht mehr verfügbar:

- Sie basierte auf **Manifest V2**, das Google aus Chrome entfernt hat.
- Sie hat Netzwerk-Anfragen mit `webRequestBlocking` abgefangen und umgeleitet. Unter Manifest V3 ist das für normale Erweiterungen nicht mehr erlaubt.

Für Firefox existiert das alte Plugin noch, für Chromium-Browser gab es keinen funktionierenden Ersatz. Deshalb ist dieses Projekt entstanden: eine **eigenständige Neuimplementierung** der Click'n'Load-Weiterleitung, die mit Manifest V3 funktioniert und ohne fremde Bibliotheken auskommt. Es wurde kein Code aus der Original-Erweiterung übernommen. Das öffentlich dokumentierte Verhalten der MyJDownloader-API wurde mit WebCrypto nachgebaut.

## Funktionen

- ✅ Fängt Click'n'Load-Übermittlungen (`/flash/add`, `/flash/addcrypted2`) ab, egal ob per Formular, `fetch`, XHR, Popup, Link oder iframe
- ✅ Beantwortet die JDownloader-Erkennung (`jdcheck.js`, `crossdomain.xml`), damit Seiten den CNL-Button überhaupt anzeigen
- ✅ Sendet die Daten Ende-zu-Ende verschlüsselt über `api.jdownloader.org` an den ausgewählten JDownloader
- ✅ Die verschlüsselten CNL-Daten (`jk`/`crypted`) entschlüsselt JDownloader selbst, so wie bei der Original-Erweiterung
- ✅ Gerät frei wählbar (NAS, Server, PC …), falls mehrere JDownloader am Konto hängen
- ✅ Kontextmenü: „Link an JDownloader senden“ und „Markierten Text an JDownloader senden“
- ✅ Optionen: Autostart, Zielordner, Benachrichtigungen, Ein/Aus-Schalter
- ✅ Popup mit Verlauf der letzten Übermittlungen
- ✅ Das Passwort wird **nicht** gespeichert, nur die daraus abgeleiteten Schlüssel (wie bei der offiziellen API)

## Voraussetzungen

- Ein Chromium-basierter Browser ab Version 111 (Chrome, Vivaldi, Edge, Brave, Opera …)
- Ein kostenloses Konto auf [my.jdownloader.org](https://my.jdownloader.org)
- Ein JDownloader, der mit diesem Konto verbunden ist, z. B. per Docker auf einer Synology:
  [Anleitung Synology-NAS-Installation](https://support.jdownloader.org/de/knowledgebase/article/synology-nas-installation)

Auf dem PC selbst muss **kein** JDownloader laufen.

## Installation

1. Repository herunterladen: entweder `git clone https://github.com/loopnlucid/myjd-clicknload.git` oder unter [Releases](https://github.com/loopnlucid/myjd-clicknload/releases) die ZIP-Datei laden und entpacken.
2. Im Browser die Erweiterungsseite öffnen:
   - Chrome: `chrome://extensions`
   - Vivaldi: `vivaldi://extensions`
   - Edge: `edge://extensions`
3. Den **Entwicklermodus** einschalten.
4. **„Entpackte Erweiterung laden“** wählen und den Ordner **`extension`** auswählen, also den Ordner, in dem direkt die `manifest.json` liegt.
5. Die Einstellungen öffnen sich automatisch.

## Einrichtung

1. Mit dem MyJDownloader-Konto anmelden (E-Mail + Passwort).
2. Unter **„Ziel-JDownloader“** das gewünschte Gerät auswählen, z. B. den NAS-JDownloader.
3. **„Verbindung testen“** klicken. Erscheint „antwortet ✔“, ist alles bereit.
4. Optional: Autostart, Zielordner und Benachrichtigungen einstellen.

Ab jetzt landen Click'n'Load-Links im LinkGrabber des gewählten JDownloaders.

### Funktion testen

Im Ordner [`test/`](test/) liegt eine Testseite (`cnl-testseite.html`), die einen harmlosen Link (`example.com`) per Click'n'Load sendet. Damit die Erweiterung auf lokal geöffneten Dateien arbeitet, in den Details der Erweiterung **„Zugriff auf Datei-URLs zulassen“** aktivieren.

## So funktioniert es

```
Webseite mit CNL-Button
   │  Formular/XHR an http://127.0.0.1:9666/flash/addcrypted2
   ▼
content/main-world.js   ── fängt die Übermittlung in der Seite ab (kein Request an localhost)
   │  window.postMessage
   ▼
content/bridge.js       ── reicht die Daten an den Service Worker weiter
   ▼
background.js           ── baut den "dummycnl"-Link und ruft /linkgrabberv2/addLinks auf
   │  AES-verschlüsselt (myjd.js)
   ▼
api.jdownloader.org  ──►  dein JDownloader (NAS/Docker/Server)  ──►  LinkGrabber
```

| Datei | Aufgabe |
|---|---|
| `extension/manifest.json` | Manifest V3 |
| `extension/background.js` | Service Worker: Session, Senden, Verlauf, Kontextmenü, Netzwerk-Fallback |
| `extension/myjd.js` | Minimaler MyJDownloader-API-Client (WebCrypto: SHA-256, HMAC, AES-128-CBC) |
| `extension/content/main-world.js` | Hookt `form.submit`, Submit-Events, `fetch`, XHR, `window.open` und Links für `127.0.0.1:9666` |
| `extension/content/bridge.js` | Brücke zwischen Seite und Erweiterung |
| `extension/rules.json` | `declarativeNetRequest`-Regeln für `jdcheck.js`, `crossdomain.xml` und `/flash/` |
| `extension/options.*`, `popup.*`, `sent.*` | Oberfläche |

**Fallback:** Rutscht eine CNL-Anfrage trotzdem ins Netzwerk durch (z. B. eine direkte Navigation), liest ein nicht-blockierender `webRequest`-Listener den Inhalt mit und sendet ihn ebenfalls. Doppelte Übermittlungen werden erkannt und verworfen.

**Berechtigungen:** `<all_urls>` ist nötig, weil Click'n'Load-Buttons auf beliebigen Seiten vorkommen. Die Skripte werden nur aktiv, wenn die Erweiterung eingerichtet und eingeschaltet ist. Daten gehen ausschließlich an `api.jdownloader.org`.

## Datenschutz

- Gespeichert werden lokal im Browser (`chrome.storage.local`): E-Mail, die aus dem Passwort abgeleiteten Schlüssel, die gewählte Geräte-ID, Einstellungen und ein kurzer Verlauf (max. 30 Einträge).
- Das Passwort selbst wird nicht gespeichert.
- Es gibt keine Telemetrie, kein Tracking und keine Verbindungen außer zu `api.jdownloader.org`.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Cannot load extension … Filenames starting with "_" …“ | Falscher Ordner gewählt. Den Unterordner `extension` auswählen. |
| „E-Mail oder Passwort falsch“ | Zugangsdaten von my.jdownloader.org prüfen. |
| Kein Gerät in der Liste | Der JDownloader ist nicht mit MyJDownloader verbunden. Im JDownloader bzw. Docker-Container die MyJD-Zugangsdaten prüfen. |
| „JDownloader ist offline“ | NAS/Container läuft nicht oder hat keine Internetverbindung. |
| Button auf einer Seite reagiert nicht | Seite nach dem Einrichten bzw. Aktivieren neu laden. Hilft das nicht, bitte ein [Issue](https://github.com/loopnlucid/myjd-clicknload/issues) mit der betroffenen Seite eröffnen. |

## ⚖️ Haftungsausschluss / Disclaimer

**Deutsch**

- Diese Software wird **„wie besehen“ (as is)** und **ohne jegliche Gewährleistung** zur Verfügung gestellt.
- Der Autor **haftet für keinerlei Schäden**, die direkt oder indirekt durch die Nutzung, Fehlfunktion oder Nichtverfügbarkeit dieser Software entstehen. Das gilt auch für Datenverlust, Kontosperrungen, Rechtsverletzungen Dritter und Folgeschäden, soweit gesetzlich zulässig.
- Die Software darf **ausschließlich für legale Zwecke** verwendet werden, also zum Herunterladen von Inhalten, an denen du die erforderlichen Rechte besitzt oder die rechtmäßig frei verfügbar sind.
- **Jede Nutzung zur Verletzung von Urheberrechten oder anderen Gesetzen ist ausdrücklich untersagt.** Für die Einhaltung der in deinem Land geltenden Gesetze bist allein **du selbst verantwortlich**.
- Dieses Projekt steht in **keiner Verbindung zu AppWork GmbH**, dem Hersteller von JDownloader und MyJDownloader. „JDownloader“ und „MyJDownloader“ sind Marken bzw. Produkte ihrer jeweiligen Inhaber und werden hier nur zur Beschreibung der Kompatibilität genannt.

**English**

- This software is provided **"as is", without warranty of any kind**.
- The author **accepts no liability for any damages** arising directly or indirectly from the use, malfunction or unavailability of this software, to the extent permitted by law.
- It may be used **for legal purposes only**, i.e. to download content you are entitled to download. **Using it to infringe copyright or any other law is expressly prohibited.** You alone are responsible for complying with the laws applicable to you.
- This project is **not affiliated with AppWork GmbH**. "JDownloader" and "MyJDownloader" are trademarks/products of their respective owners.

## Lizenz

[MIT](LICENSE). Siehe dort auch den vollständigen Gewährleistungs- und Haftungsausschluss.
