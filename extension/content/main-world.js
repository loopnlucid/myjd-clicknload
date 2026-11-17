// Runs in the context of the web page (world: MAIN) and intercepts Click'n'Load submissions to
// http://127.0.0.1:9666 before the browser even sends them.
(() => {
  if (window.__myjdCnlHooked) return;
  Object.defineProperty(window, "__myjdCnlHooked", { value: true });

  const TAG = "__myjd_cnl__";
  const LOCAL_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666(?:\/|$)/i;
  const CNL_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666\/flash\/(?:add|addcrypted2?)\/?(?:[?#]|$)/i;
  const JDCHECK_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666\/jdcheck\.js/i;
  const FLASH_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666\/flash\/?(?:[?#]|$)/i;
  const CROSSDOMAIN_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost):9666\/crossdomain\.xml/i;
  const CROSSDOMAIN_XML =
    '<?xml version="1.0" ?>\n<cross-domain-policy>\n<site-control permitted-cross-domain-policies="master-only"/>\n<allow-access-from domain="*"/>\n<allow-http-request-headers-from domain="*" headers="*"/>\n</cross-domain-policy>';

  // Many sites use jdcheck.js to check whether JDownloader is running.
  try {
    if (window.jdownloader === undefined) window.jdownloader = true;
  } catch {}

  const abs = (u) => {
    try {
      return new URL(String(u), document.baseURI).href;
    } catch {
      return "";
    }
  };

  const add = (obj, k, v) => {
    if (typeof v !== "string") v = v == null ? "" : String(v);
    (obj[k] ||= []).push(v);
  };

  const fromQuery = (url, obj = {}) => {
    try {
      for (const [k, v] of new URL(url).searchParams) add(obj, k, v);
    } catch {}
    return obj;
  };

  const fromBody = (body, obj = {}) => {
    if (body == null) return obj;
    if (typeof body === "string") {
      for (const [k, v] of new URLSearchParams(body)) add(obj, k, v);
    } else if (body instanceof URLSearchParams || body instanceof FormData) {
      for (const [k, v] of body) if (typeof v === "string") add(obj, k, v);
    } else if (typeof body === "object" && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
      for (const [k, v] of Object.entries(body)) add(obj, k, v);
    }
    return obj;
  };

  const emit = (fields, via) => {
    window.postMessage({ [TAG]: true, fields, via, pageUrl: location.href, pageTitle: document.title }, "*");
  };

  const fakeText = (url) => {
    if (JDCHECK_RE.test(url)) return "var jdownloader = true;";
    if (CROSSDOMAIN_RE.test(url)) return CROSSDOMAIN_XML;
    if (FLASH_RE.test(url)) return "JDownloader";
    return "success\r\n";
  };

  // ------------------------------------------------------------ Forms

  const formAction = (form, submitter) => {
    const a = (submitter && submitter.getAttribute && submitter.getAttribute("formaction")) || form.getAttribute("action") || "";
    return abs(a);
  };

  const fromForm = (form, submitter) => {
    let fd;
    try {
      fd = submitter ? new FormData(form, submitter) : new FormData(form);
    } catch {
      fd = new FormData(form);
    }
    return fromBody(fd);
  };

  const origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    const url = formAction(this);
    if (CNL_RE.test(url)) {
      emit(fromBody(new FormData(this), fromQuery(url)), "form.submit");
      return;
    }
    return origSubmit.apply(this, arguments);
  };

  // Bubble phase: page handlers (which may still fill in fields) have already run by then.
  window.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || e.defaultPrevented) return;
    const url = formAction(form, e.submitter);
    if (!CNL_RE.test(url)) return;
    e.preventDefault();
    emit(fromForm(form, e.submitter), "form.event");
  });

  // ------------------------------------------------------------ fetch

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = abs(input instanceof Request ? input.url : input);
    if (LOCAL_RE.test(url)) {
      const reply = () => new Response(fakeText(url), { status: 200, headers: { "Content-Type": "text/plain" } });
      if (CNL_RE.test(url)) {
        const fields = fromQuery(url);
        if (init && init.body != null) {
          fromBody(init.body, fields);
          emit(fields, "fetch");
          return Promise.resolve(reply());
        }
        if (input instanceof Request) {
          return input
            .clone()
            .text()
            .then((t) => {
              fromBody(t, fields);
              emit(fields, "fetch");
              return reply();
            });
        }
        emit(fields, "fetch");
      }
      return Promise.resolve(reply());
    }
    return origFetch.apply(this, arguments);
  };

  // ------------------------------------------------------------ XMLHttpRequest

  const xhrUrl = new WeakMap();
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  XHR.open = function (method, url) {
    xhrUrl.set(this, abs(url));
    return origOpen.apply(this, arguments);
  };

  XHR.send = function (body) {
    const url = xhrUrl.get(this) || "";
    if (!LOCAL_RE.test(url)) return origSend.apply(this, arguments);
    if (CNL_RE.test(url)) emit(fromBody(body, fromQuery(url)), "xhr");
    const xhr = this;
    const text = fakeText(url);
    const def = (k, v) => Object.defineProperty(xhr, k, { configurable: true, get: () => v });
    setTimeout(() => {
      def("readyState", 4);
      def("status", 200);
      def("statusText", "OK");
      def("responseText", text);
      def("response", text);
      def("responseURL", url);
      xhr.dispatchEvent(new Event("readystatechange"));
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    }, 0);
  };

  // ------------------------------------------------------------ window.open / Links

  const origOpenWin = window.open;
  window.open = function (url) {
    const u = url ? abs(url) : "";
    if (CNL_RE.test(u)) {
      emit(fromQuery(u), "window.open");
      return null;
    }
    return origOpenWin.apply(this, arguments);
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const u = abs(a.getAttribute("href"));
    if (!CNL_RE.test(u)) return;
    e.preventDefault();
    emit(fromQuery(u), "link");
  });
})();
