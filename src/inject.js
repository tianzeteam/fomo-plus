/**
 * Fomo Plus — MAIN-world bridge.
 *
 * Runs in the page's own JS context (document_start) so it can observe the data
 * the app already fetches, without issuing privileged requests of its own.
 * Mirrored payloads + live-socket state are forwarded to the isolated content
 * script through window events. No network calls are made here.
 */
(() => {
  // anchored to the app's own API: anything else is noise, not data
  const FEED_URL = /https:\/\/prod-api\.fomo\.family\/feed(\?|$)|\/feed\/tradingActivity/;
  const WS_URL = /wss:\/\/prod-api\.fomo\.family\/ws/;
  const TAG = "fomo-plus";

  const emit = (type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(`${TAG}:${type}`, { detail: JSON.stringify(detail) }));
    } catch (_) {
      /* structured-clone failures are non-fatal */
    }
  };

  /** Project only the fields the UI consumes — this channel is public to the page by design. */
  const mirror = (url, payload) => {
    const items = payload?.responseObject?.items;
    if (!Array.isArray(items) || !items.length) return;
    const projected = items.slice(0, 200).map((item) => ({
      id: typeof item.id === "string" && item.id.length <= 64 ? item.id : null,
      tradeId: typeof item.tradeId === "string" && item.tradeId.length <= 64 ? item.tradeId : null,
      displayName: typeof item.displayName === "string" && item.displayName.length <= 64 ? item.displayName : null,
      userHandle: typeof item.userHandle === "string" && item.userHandle.length <= 64 ? item.userHandle : null,
      tokenAddress: typeof item.tokenAddress === "string" && item.tokenAddress.length <= 64 ? item.tokenAddress : null,
      networkId: Number.isInteger(item.networkId) ? item.networkId : null,
    }));
    const path = typeof url === "string" ? new URL(url, location.origin).pathname : "";
    emit("feed", { v: 1, items: projected, path });
  };

  /* ---------------------------------------------------------------- fetch -- */
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (...args) {
      const promise = nativeFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (url && FEED_URL.test(url)) {
          promise
            .then((res) => (res.ok ? res.clone().json() : null))
            .then((json) => json && mirror(url, json))
            .catch(() => {});
        }
      } catch (_) {}
      return promise;
    };
  }

  /* ------------------------------------------------------------------ xhr -- */
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (typeof url === "string" && FEED_URL.test(url)) {
        this.addEventListener("load", () => {
          try {
            mirror(url, JSON.parse(this.responseText));
          } catch (_) {}
        });
      }
    } catch (_) {}
    return nativeOpen.call(this, method, url, ...rest);
  };

  /* ------------------------------------------------------------ websocket -- */
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === "function") {
    const Tracked = function (url, protocols) {
      const socket = new NativeWebSocket(url, protocols);
      if (WS_URL.test(String(url))) {
        const state = (s) => emit("socket", { state: s, url: String(url) });
        state("connecting");
        socket.addEventListener("open", () => state("open"));
        socket.addEventListener("close", () => state("closed"));
        socket.addEventListener("error", () => state("error"));
      }
      return socket;
    };
    Tracked.prototype = NativeWebSocket.prototype;
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Tracked[key] = NativeWebSocket[key];
    Object.defineProperty(Tracked, "name", { value: "WebSocket" });
    window.WebSocket = Tracked;
  }
})();
