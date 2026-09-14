/**
 * Fomo Plus — content script (ISOLATED world).
 *
 * Rebuilds the left "discovery / 实时动态" column of fomo.family into a scannable
 * card list: trader → @handle → action · token · chain · size · MC → contract
 * address with one-click copy, plus a live socket indicator in the panel header.
 *
 * Data comes exclusively from the app's own traffic (mirrored by inject.js) and
 * from URLs already present in the DOM — this script never calls the API itself.
 */
(() => {
  const TAG = "fomo-plus";
  const INJECTED = "data-fp-injected";

  /* ------------------------------------------------------------- settings -- */
  const DEFAULTS = { enabled: true, density: "cozy", handle: true, ca: true, chain: true, status: true };
  let settings = { ...DEFAULTS };

  const applySettings = () => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.fp = settings.enabled ? "on" : "off";
    root.dataset.fpDensity = settings.density;
    root.dataset.fpHandle = settings.handle ? "1" : "0";
    root.dataset.fpCa = settings.ca ? "1" : "0";
    root.dataset.fpChain = settings.chain ? "1" : "0";
    root.dataset.fpStatus = settings.status ? "1" : "0";
  };

  try {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = { ...DEFAULTS, ...stored };
      applySettings();
      scan(true);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
      applySettings();
      if (!settings.enabled) clearInjected();
      scan(true);
    });
  } catch (_) {
    applySettings();
  }

  /* -------------------------------------------------------------- data -- */
  /** feed items by trade id (and id) */

  const trades = new Map();
  /** display name → handle, for rows that arrive without a trade id */
  const handlesByName = new Map();
  /** bump on any format change of the mirrors below */
  const PROTOCOL = 1;
  const MAX_REMEMBERED = 500;
  const MAX_ITEMS_PER_EVENT = 200;
  /** the only shape remember() will accept */
  const ADDRESS_RE = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
  const sane = (v) => (typeof v === "string" && v.length <= 64 ? v : null);
  const saneId = (v) => (typeof v === "string" && v.length <= 64 ? v : null);

  const remember = (items) => {
    if (items.length > MAX_ITEMS_PER_EVENT) items = items.slice(0, MAX_ITEMS_PER_EVENT);
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = {
        tradeId: saneId(item.tradeId),
        id: saneId(item.id),
        displayName: sane(item.displayName),
        userHandle: sane(item.userHandle),
        tokenAddress: ADDRESS_RE.test(item.tokenAddress || "") ? item.tokenAddress : null,
        networkId: Number.isInteger(item.networkId) ? item.networkId : null,
      };
      if (!entry.displayName && !entry.tokenAddress) continue; // nothing the UI would use
      for (const key of [entry.tradeId, entry.id]) if (key) trades.set(key, entry);
      if (entry.displayName && entry.userHandle) handlesByName.set(entry.displayName, entry.userHandle);
    }
    // bound retention: drop the oldest entries when over capacity
    while (trades.size > MAX_REMEMBERED) trades.delete(trades.keys().next().value);
    while (handlesByName.size > MAX_REMEMBERED) handlesByName.delete(handlesByName.keys().next().value);
  };

  window.addEventListener(`${TAG}:feed`, (event) => {
    try {
      const { v, items } = JSON.parse(event.detail);
      if (v !== PROTOCOL || !Array.isArray(items)) return;
      remember(items);
      scheduleScan(true);
    } catch (_) {}
  });

  let socketState = "connecting";
  window.addEventListener(`${TAG}:socket`, (event) => {
    try {
      const state = JSON.parse(event.detail).state;
      if (state === "open" || state === "closed" || state === "error" || state === "connecting") socketState = state;
      renderStatus();
    } catch (_) {}
  });


  /* -------------------------------------------------------------- chains --- */
  const CHAINS = {
    1399811149: { label: "SOL", color: "#14f195" },
    solana: { label: "SOL", color: "#14f195" },
    1: { label: "ETH", color: "#627eea" },
    ethereum: { label: "ETH", color: "#627eea" },
    56: { label: "BNB", color: "#f3ba2f" },
    bnb: { label: "BNB", color: "#f3ba2f" },
    8453: { label: "BASE", color: "#0052ff" },
    base: { label: "BASE", color: "#0052ff" },
    143: { label: "MON", color: "#836ef9" },
    monad: { label: "MON", color: "#836ef9" },
    4663: { label: "RH", color: "#00c805" },
    robinhood: { label: "RH", color: "#00c805" },
  };
  const chainOf = (value) => (value != null && Object.hasOwn(CHAINS, String(value)) ? CHAINS[String(value)] : { label: String(value ?? "?").toUpperCase(), color: "#9899a3" });

  /* ------------------------------------------------------------- helpers --- */
  const text = (el) => (el?.textContent || "").trim();

  /** Create an injected node; `name` identifies it for CSS and cleanup. */
  const el = (tag, name) => {
    const node = document.createElement(tag);
    node.setAttribute(INJECTED, name);
    return node;
  };

  /** The ticker node: dotted-underline in swap/thesis rows, the mini-card title in profit rows. */
  const tickerOf = (item) =>
    item.querySelector('[class*="border-dotted-underline"]') ||
    [...item.querySelectorAll('div[class*="truncate"][class*="text-sm"]')].pop() ||
    null;

  /** Contract addresses the app already renders (its own inline "CA 0x…" line). */
  const nativeCa = (item) => {
    for (const code of item.querySelectorAll("code")) {
      if (code.closest(`[${INJECTED}]`)) continue; // our own row, not the app's
      const value = text(code);
      if (/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value)) return { node: code, address: value };
    }
    return null;
  };

  /** Resolve everything we know about the token behind a feed row. */
  const resolve = (item) => {
    const link = item.matches?.("a[href]") ? item : item.querySelector("a[href]");
    const href = link?.getAttribute("href") || "";
    const tradeId = typeof rawTradeId === "string" && rawTradeId.length <= 64 ? rawTradeId : null;
    const path = href.match(/\/tokens\/([^/]+)\/([^?/]+)/);
    const media = item.querySelector('img[src*="token-media"], img[src*="defined.fi"]')?.getAttribute("src")?.match(/defined\.fi\/(\d+)_([A-Za-z0-9]+)_/);

    const payload = tradeId ? trades.get(tradeId) : null;
    const name = text(item.querySelector("div.truncate")) || payload?.displayName || "";
    const handle = payload?.userHandle || handlesByName.get(name) || null;
    const address = nativeCa(item)?.address || payload?.tokenAddress || path?.[2] || media?.[2] || null;

    return {
      tradeId,
      handle,
      address,
      chainSlug: path?.[1] || media?.[1] || null,
      networkId: media?.[1] ?? null,
    };
  };

  /* ------------------------------------------------------------ injection -- */
  const injectHandle = (item, handle) => {
    if (!handle || item.querySelector(`[${INJECTED}="handle"]`)) return;
    const nameEl = item.querySelector("div.truncate");
    const group = nameEl?.closest('div[class*="flex-wrap"]');
    if (!group) return;
    const node = el("div", "handle");
    node.textContent = `@${handle}`;
    group.appendChild(node);
  };

  const injectChainChip = (item, ticker, data) => {
    if (!ticker || item.querySelector(`[${INJECTED}="chain"]`)) return;
    const chain = chainOf(data.chainSlug ?? data.networkId);
    const chip = el("div", "chain");
    chip.style.setProperty("--fp-chain-color", chain.color);
    const dot = el("span", "chain-dot");
    const label = el("span", "chain-label");
    label.textContent = chain.label;
    chip.append(dot, label);
    ticker.insertAdjacentElement("afterend", chip);

    // profit rows stack ticker + market cap in a column: keep the chip on the ticker's line
    const group = ticker.parentElement;
    const mcap = group?.querySelector('div[class*="truncate"][class*="text-xs"]');
    if (mcap && group.contains(chip)) {
      group.setAttribute("data-fp-token-group", "1");
      mcap.setAttribute("data-fp-mcap-line", "1");
    }
  };

  /** Clipboard write with a textarea fallback for contexts that deny the async API. */
  const writeClipboard = async (value) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch (_) {
      /* fall through to execCommand */
    }
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.setAttribute("readonly", "");
    scratch.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(scratch);
    scratch.select();
    try {
      document.execCommand("copy");
    } catch (_) {}
    scratch.remove();
  };

  const copyButton = (address) => {
    const button = el("button", "ca-copy");
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", "复制合约地址");
    button.setAttribute("title", address);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(writeClipboard(address)).then(() => {
        button.dataset.fpCopied = "1";
        setTimeout(() => delete button.dataset.fpCopied, 1200);
      });
    });
    return button;
  };

  /** Horizontal pull that lines an injected row up with the trader-avatar column. */
  const avatarIndent = (item, node) => {
    const anchor = node.closest("a") || item;
    const avatar = anchor.firstElementChild;
    if (!avatar || avatar === node) return 0;
    return Math.max(0, Math.round(node.getBoundingClientRect().left - avatar.getBoundingClientRect().left));
  };

  const injectCa = (item, host, address) => {
    if (item.querySelector(`[${INJECTED}="ca"]`)) return true; // our row is already rendered
    if (!host || !address) return false;
    const wrap = el("div", "ca");
    const label = el("span", "ca-label");
    label.textContent = "CA";
    const value = el("code", "ca-value");
    value.setAttribute("title", address);
    value.textContent = address;
    wrap.append(label, value, copyButton(address));
    host.appendChild(wrap);
    const indent = avatarIndent(item, wrap);
    if (indent > 0) wrap.style.marginLeft = `-${indent}px`;
    return true;
  };

  /**
   * Keep exactly one CA line per card: when our full-width row is rendered, the app's own
   * inline "CA 0x…" text is marked for hiding — never the other way round.
   */
  const syncNativeCa = (item, injected) => {
    const native = nativeCa(item);
    if (!native) return;
    if (injected) native.node.parentElement?.setAttribute("data-fp-ca-native", "1");
    else native.node.parentElement?.removeAttribute("data-fp-ca-native");
  };

  /**
   * 买入/卖出 belongs in front of the token avatar, not next to the trader name.
   * The app's own chip is only hidden (never moved) so React keeps owning its tree;
   * a copy with the same colours takes its place at the head of the token row, and the
   * whole row is pulled left so the chip lines up with the trader avatar above it.
   */
  const injectActionChip = (item, row, source) => {
    if (!row || !source || item.querySelector(`[${INJECTED}="action"]`)) return;
    const colors = getComputedStyle(source);
    const chip = el("div", "action");
    chip.textContent = text(source);
    chip.style.color = colors.color;
    chip.style.backgroundColor = colors.backgroundColor;
    row.prepend(chip);
    const indent = avatarIndent(item, chip);
    if (indent > 0) chip.style.marginLeft = `-${indent}px`;
    source.setAttribute("data-fp-chip-hidden", "1");
  };

  /** Where the action chip goes: the row that already holds the token avatar (swap: token row, 观点: token group). */
  const tokenRowOf = (item, ticker) => {
    let node = ticker?.parentElement;
    while (node && node !== item) {
      if (node.querySelector("img")) return node;
      node = node.parentElement;
    }
    return ticker?.parentElement || null;
  };

  /** Where a full-width CA line belongs: the item's own column, never inside a mini-card. */
  const caHost = (item, ticker) => {
    if (!ticker) return item;
    if (ticker.closest('div[class*="ring"]')) return item;
    return ticker.closest('div[class*="flex-col"]') || item;
  };

  /** Right-align the "$size … MC $x" cluster inside swap-style token rows. */
  const tagNumbers = (row) => {
    if (!row || row.hasAttribute("data-fp-numbers")) return;
    const spans = [...row.children].filter((child) => child.tagName === "SPAN" && !child.hasAttribute(INJECTED));
    if (spans.length >= 4) {
      row.setAttribute("data-fp-numbers", "1");
      spans[0].setAttribute("data-fp-amount", "1");
      spans[spans.length - 2].setAttribute("data-fp-mcap", "1");
    }
  };

  const decorate = (item, force) => {
    if (!settings.enabled) return;
    try {
      const data = resolve(item);
      // virtualised rows are recycled: only skip when the *same* alert is already decorated
      const key = data.tradeId || text(item).slice(0, 72);
      if (!force && item.getAttribute("data-fp-done") === key) return;
      const ticker = tickerOf(item);
      const row = ticker?.parentElement || null;
      const chip = actionChip(item);
      const side = sideOf(chip) ?? (item.querySelector('div[role="link"][class*="py-2.5"]') ? "view" : null);
      if (side) item.setAttribute("data-fp-side", side);
      else item.removeAttribute("data-fp-side");
      tagNumbers(row);
      injectActionChip(item, tokenRowOf(item, ticker), chip);
      if (settings.handle) injectHandle(item, data.handle);
      if (settings.chain) injectChainChip(item, ticker, data);
      if (settings.ca) {
        const address = data.address || nativeCa(item)?.address || null;
        syncNativeCa(item, injectCa(item, caHost(item, ticker), address));
      }
      item.setAttribute("data-fp-done", key);
    } catch (_) {
      /* one malformed row must not stop the rest */
    }
  };

  /* --------------------------------------------------------- panel wiring -- */
  /** The action chip (买入/卖出/观点/盈利…) — inline-styled or class-styled, and so are fallback avatars. */
  const ACTION_LABEL = /^(买入|卖出|观点|buy|sell|view|thesis|idea)$/i;
  const actionChip = (item) =>
    [...item.querySelectorAll('div[style*="background-color"], div[class*="rounded-sm"][class*="px-1"]')].find((node) =>
      ACTION_LABEL.test((node.textContent || "").trim()),
    ) || null;

  /** 买入 / 卖出 / 观点 get the card treatment — 盈利 and system posts keep the app's rendering. */
  const isCard = (item) =>
    !!actionChip(item) ||
    (!!item.querySelector('a[class*="items-start"]') && !!item.querySelector('[class*="border-dotted-underline"]')) ||
    !!item.querySelector('div[role="link"][class*="py-2.5"]');

  /** 买入 / 卖出 / 观点 — drives the card's frame colour. */
  const sideOf = (chip) => {
    const label = (chip?.textContent || "").trim().toLowerCase();
    if (/买入|buy/.test(label)) return "buy";
    if (/卖出|sell/.test(label)) return "sell";
    if (/观点|view|thesis|idea/.test(label)) return "view";
    return null;
  };

  /** Undo any earlier upgrade (type changes when the feed re-renders). */
  const strip = (item, row) => {
    if (item.hasAttribute("data-fp-item") || item.hasAttribute("data-fp-done")) {
      for (const node of item.querySelectorAll(`[${INJECTED}]`)) node.remove();
      for (const node of item.querySelectorAll("[data-fp-ca-native], [data-fp-chip-hidden]")) {
        node.removeAttribute("data-fp-ca-native");
        node.removeAttribute("data-fp-chip-hidden");
      }
      item.removeAttribute("data-fp-item");
      item.removeAttribute("data-fp-done");
      item.removeAttribute("data-fp-side");
    }
    row?.removeAttribute("data-fp-row");
  };

  const isPanel = (node) =>
    /通知/.test(node.textContent || "") && /动态/.test(node.textContent || "") && !!node.querySelector(".legend-list-content-container");

  const panelOf = (list) => {
    let node = list;
    while (node && node !== document.body) {
      if (isPanel(node)) return node;
      node = node.parentElement;
    }
    return null;
  };

  const renderStatus = () => {
    const label = { open: "已连接", closed: "已断开", error: "连接异常", connecting: "连接中" }[Object.hasOwn({ open: 1, closed: 1, error: 1, connecting: 1 }, socketState) ? socketState : "connecting"];
    for (const pill of document.querySelectorAll(`[${INJECTED}="status"]`)) {
      pill.dataset.fpState = socketState;
      const node = pill.querySelector(`[${INJECTED}="status-label"]`);
      if (node) node.textContent = label;
    }
  };

  const tagPanels = (force) => {
    for (const list of document.querySelectorAll(".legend-list-content-container")) {
      const panel = panelOf(list);
      if (!panel) continue;
      panel.setAttribute("data-fp-panel", "1");
      const header = panel.firstElementChild;
      header?.setAttribute("data-fp-header", "1");
      const group = header?.querySelector('div[class*="ml-auto"]');
      if (group && !group.querySelector(`[${INJECTED}="status"]`)) {
        const pill = el("div", "status");
        const dot = el("span", "status-dot");
        const label = el("span", "status-label");
        pill.append(dot, label);
        group.prepend(pill);
      }
      list.parentElement?.setAttribute("data-fp-viewport", "1");

      for (const row of [...(list.children[0]?.children || [])]) {
        const item = row.firstElementChild;
        if (!item || item.hasAttribute(INJECTED)) continue;
        if (!isCard(item)) {
          strip(item, row);
          continue;
        }
        row.setAttribute("data-fp-row", "1");
        item.setAttribute("data-fp-item", "1");
        decorate(item, force);
      }
    }
    renderStatus();
  };

  const clearInjected = () => {
    for (const node of document.querySelectorAll(`[${INJECTED}]`)) node.remove();
    for (const node of document.querySelectorAll("[data-fp-ca-native], [data-fp-chip-hidden]")) {
      node.removeAttribute("data-fp-ca-native");
      node.removeAttribute("data-fp-chip-hidden");
    }
  };

  /* ----------------------------------------------------------- scheduling -- */
  let queued = null;
  const scheduleScan = (force = false) => {
    if (queued !== null) {
      queued = queued || force;
      return;
    }
    queued = force;
    requestAnimationFrame(() => {
      const runForce = queued;
      queued = null;
      scan(runForce);
    });
  };

  const scan = (force) => {
    if (!settings.enabled) return;
    try {
      if (force) for (const item of document.querySelectorAll("[data-fp-done]")) item.removeAttribute("data-fp-done");
      tagPanels(force);
    } catch (_) {}
  };

  const observer = new MutationObserver(() => scheduleScan(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan(false);
  document.addEventListener("DOMContentLoaded", () => {
    applySettings();
    scan(true);
  });
})();
