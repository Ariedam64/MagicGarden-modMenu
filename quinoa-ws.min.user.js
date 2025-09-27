// ==UserScript==
// @name         Magic Garden ModMenu 
// @namespace    Quinoa
// @version      1.3.1
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @all-frames   true
// @inject-into  page
// @grant        none
// @downloadURL  https://github.com/Ariedam64/MagicGarden-modMenu/raw/refs/heads/main/quinoa-ws.min.user.js
// @updateURL    https://github.com/Ariedam64/MagicGarden-modMenu/raw/refs/heads/main/quinoa-ws.min.user.js
// ==/UserScript==
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // src/core/state.ts
  var NativeWS = window.WebSocket;
  var NativeWorker = window.Worker;
  var sockets = [];
  var quinoaWS = null;
  function setQWS(ws, why) {
    if (!quinoaWS) {
      quinoaWS = ws;
      try {
        console.log("[QuinoaWS] selected ->", why);
      } catch {
      }
    }
  }
  var workerFound = false;
  var Workers = typeof Set !== "undefined" ? /* @__PURE__ */ new Set() : {
    _a: [],
    add(w) {
      this._a.push(w);
    },
    delete(w) {
      const i = this._a.indexOf(w);
      if (i >= 0) this._a.splice(i, 1);
    },
    forEach(fn) {
      for (let i = 0; i < this._a.length; i++) fn(this._a[i]);
    }
  };
  function label(rs) {
    return ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][rs ?? -1] || "none";
  }

  // src/core/parse.ts
  async function parseWSData(d) {
    try {
      if (typeof d === "string") return JSON.parse(d);
      if (d instanceof Blob) return JSON.parse(await d.text());
      if (d instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(d));
    } catch {
    }
    return null;
  }

  // src/hooks/ws-hook.ts
  function installPageWebSocketHook() {
    function WrappedWebSocket(url, protocols) {
      const ws = protocols !== void 0 ? new NativeWS(url, protocols) : new NativeWS(url);
      sockets.push(ws);
      ws.addEventListener("open", () => {
        setTimeout(() => {
          if (ws.readyState === NativeWS.OPEN) setQWS(ws, "open-fallback");
        }, 800);
      });
      ws.addEventListener("message", async (ev) => {
        const j = await parseWSData(ev.data);
        if (!j) return;
        if (!window.quinoaWS && (j.type === "Welcome" || j.type === "Config" || j.fullState || j.config)) {
          setQWS(ws, "message:" + (j.type || "state"));
        }
      });
      const nativeSend = ws.send.bind(ws);
      ws.send = function(data) {
        try {
          let j = null;
          if (typeof data === "string") j = JSON.parse(data);
          else if (data instanceof ArrayBuffer) j = JSON.parse(new TextDecoder().decode(data));
          if (!window.quinoaWS && j && Array.isArray(j.scopePath) && j.scopePath.join("/") === "Room/Quinoa") {
            setQWS(ws, "send:" + j.type);
          }
        } catch {
        }
        return nativeSend(data);
      };
      return ws;
    }
    WrappedWebSocket.prototype = NativeWS.prototype;
    try {
      WrappedWebSocket.OPEN = NativeWS.OPEN;
    } catch {
    }
    try {
      WrappedWebSocket.CLOSED = NativeWS.CLOSED;
    } catch {
    }
    try {
      WrappedWebSocket.CLOSING = NativeWS.CLOSING;
    } catch {
    }
    try {
      WrappedWebSocket.CONNECTING = NativeWS.CONNECTING;
    } catch {
    }
    window.WebSocket = WrappedWebSocket;
  }

  // src/store/jotai.ts
  var _store = null;
  var _captureInProgress = false;
  var _captureError = null;
  var _lastCapturedVia = null;
  var getAtomCache = () => globalThis.jotaiAtomCache?.cache;
  function findStoreViaFiber() {
    const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers?.size) return null;
    for (const [rid] of hook.renderers) {
      const roots = hook.getFiberRoots(rid);
      for (const root of roots) {
        const seen = /* @__PURE__ */ new Set();
        const stack = [root.current];
        while (stack.length) {
          const f = stack.pop();
          if (!f || seen.has(f)) continue;
          seen.add(f);
          const v = f?.pendingProps?.value;
          if (v && typeof v.get === "function" && typeof v.set === "function" && typeof v.sub === "function") {
            _lastCapturedVia = "fiber";
            return v;
          }
          if (f.child) stack.push(f.child);
          if (f.sibling) stack.push(f.sibling);
          if (f.alternate) stack.push(f.alternate);
        }
      }
    }
    return null;
  }
  async function captureViaWriteOnce(timeoutMs = 5e3) {
    const cache = getAtomCache();
    if (!cache) throw new Error("jotaiAtomCache.cache introuvable");
    let capturedGet = null;
    let capturedSet = null;
    const patched = [];
    for (const atom of cache.values()) {
      if (!atom || typeof atom.write !== "function") continue;
      const orig = atom.write;
      atom.__origWrite = orig;
      atom.write = function(get, set2, ...args) {
        if (!capturedSet) {
          capturedGet = get;
          capturedSet = set2;
          for (const a of patched) {
            a.write = a.__origWrite;
            delete a.__origWrite;
          }
        }
        return orig.call(this, get, set2, ...args);
      };
      patched.push(atom);
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    try {
      globalThis.dispatchEvent?.(new Event("visibilitychange"));
    } catch {
    }
    while (!capturedSet && Date.now() - t0 < timeoutMs) {
      await wait(50);
    }
    if (!capturedSet) {
      _lastCapturedVia = "polyfill";
      return {
        get: () => {
          throw new Error("Store non captur\xE9: get indisponible");
        },
        set: () => {
          throw new Error("Store non captur\xE9: set indisponible");
        },
        sub: () => () => {
        },
        __polyfill: true
      };
    }
    _lastCapturedVia = "write";
    return {
      get: (a) => capturedGet(a),
      set: (a, v) => capturedSet(a, v),
      sub: (a, cb) => {
        let last;
        try {
          last = capturedGet(a);
        } catch {
        }
        const id = setInterval(() => {
          let curr;
          try {
            curr = capturedGet(a);
          } catch {
            return;
          }
          if (curr !== last) {
            last = curr;
            try {
              cb();
            } catch {
            }
          }
        }, 100);
        return () => clearInterval(id);
      }
    };
  }
  async function ensureStore() {
    if (_store) return _store;
    if (_captureInProgress) {
      const t0 = Date.now();
      while (!_store && Date.now() - t0 < 3e3) await new Promise((r) => setTimeout(r, 25));
      if (_store) return _store;
    }
    _captureInProgress = true;
    try {
      _store = findStoreViaFiber() || await captureViaWriteOnce();
      return _store;
    } catch (e) {
      _captureError = e;
      throw e;
    } finally {
      _captureInProgress = false;
    }
  }
  function isStoreCaptured() {
    return !!_store && !_store.__polyfill;
  }
  function getCapturedInfo() {
    return { via: _lastCapturedVia, polyfill: !!_store?.__polyfill, error: _captureError };
  }
  async function jGet(atom) {
    const s = await ensureStore();
    return s.get(atom);
  }
  async function jSet(atom, value) {
    const s = await ensureStore();
    await s.set(atom, value);
  }
  async function jSub(atom, cb) {
    const s = await ensureStore();
    return s.sub(atom, cb);
  }
  function findAtomsByLabel(regex) {
    const cache = getAtomCache();
    if (!cache) return [];
    const out = [];
    for (const a of cache.values()) {
      const label2 = a?.debugLabel || a?.label || "";
      if (regex.test(String(label2))) out.push(a);
    }
    return out;
  }
  function getAtomByLabel(label2) {
    return findAtomsByLabel(new RegExp("^" + label2 + "$"))[0] || null;
  }

  // src/core/webSocketBridge.ts
  function postAllToWorkers(msg) {
    if (Workers.forEach) Workers.forEach((w) => {
      try {
        w.postMessage(msg);
      } catch {
      }
    });
    else for (const w of Workers._a) {
      try {
        w.postMessage(msg);
      } catch {
      }
    }
  }
  function getPageWS() {
    if (quinoaWS && quinoaWS.readyState === NativeWS.OPEN) return quinoaWS;
    let any = null;
    if (sockets.find) any = sockets.find((s) => s.readyState === NativeWS.OPEN) || null;
    if (!any) {
      for (let i = 0; i < sockets.length; i++) if (sockets[i].readyState === NativeWS.OPEN) {
        any = sockets[i];
        break;
      }
    }
    if (any) {
      setQWS(any, "getPageWS");
      return any;
    }
    throw new Error("No page WebSocket open");
  }
  function sendToGame(payloadObj) {
    const msg = { scopePath: ["Room", "Quinoa"], ...payloadObj };
    try {
      const ws = getPageWS();
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      postAllToWorkers({ __QWS_CMD: "send", payload: JSON.stringify(msg) });
      return true;
    }
  }

  // src/store/api.ts
  async function ensureStore2() {
    try {
      await ensureStore();
    } catch {
    }
  }
  async function select(label2, fallback) {
    await ensureStore2();
    const atom = getAtomByLabel(label2);
    if (!atom) return fallback;
    try {
      return await jGet(atom);
    } catch {
      return fallback;
    }
  }
  async function subscribe(label2, cb) {
    await ensureStore2();
    const atom = getAtomByLabel(label2);
    if (!atom) return () => {
    };
    const unsub = await jSub(atom, async () => {
      try {
        cb(await jGet(atom));
      } catch {
      }
    });
    return unsub;
  }
  async function subscribeImmediate(label2, cb) {
    const first = await select(label2);
    if (first !== void 0) cb(first);
    return subscribe(label2, cb);
  }
  async function set(label2, value) {
    await ensureStore2();
    const atom = getAtomByLabel(label2);
    if (!atom) return;
    await jSet(atom, value);
  }
  var Store = { ensure: ensureStore2, select, subscribe, subscribeImmediate, set };

  // src/store/hub.ts
  function toPathArray(path) {
    if (!path) return [];
    return Array.isArray(path) ? path.slice() : path.split(".").map((k) => k.match(/^\d+$/) ? Number(k) : k);
  }
  function getAtPath(root, path) {
    const segs = toPathArray(path);
    let cur2 = root;
    for (const s of segs) {
      if (cur2 == null) return void 0;
      cur2 = cur2[s];
    }
    return cur2;
  }
  function setAtPath(root, path, nextValue) {
    const segs = toPathArray(path);
    if (!segs.length) return nextValue;
    const clone = Array.isArray(root) ? root.slice() : { ...root ?? {} };
    let cur2 = clone;
    for (let i = 0; i < segs.length - 1; i++) {
      const key2 = segs[i];
      const src = cur2[key2];
      const obj = typeof src === "object" && src !== null ? Array.isArray(src) ? src.slice() : { ...src } : {};
      cur2[key2] = obj;
      cur2 = obj;
    }
    cur2[segs[segs.length - 1]] = nextValue;
    return clone;
  }
  var eq = {
    shallow(a, b) {
      if (Object.is(a, b)) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) if (!Object.is(a[k], b[k])) return false;
      return true;
    },
    idSet(a, b) {
      if (a === b) return true;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      const sa = new Set(a);
      for (const id of b) if (!sa.has(id)) return false;
      return true;
    }
  };
  function makeView(sourceLabel, opts = {}) {
    const { path, write = "replace" } = opts;
    async function get() {
      const src = await Store.select(sourceLabel);
      return path ? getAtPath(src, path) : src;
    }
    async function set2(next) {
      if (typeof write === "function") {
        const prev2 = await Store.select(sourceLabel);
        const raw2 = write(next, prev2);
        return Store.set(sourceLabel, raw2);
      }
      const prev = await Store.select(sourceLabel);
      const raw = path ? setAtPath(prev, path, next) : next;
      if (write === "merge-shallow" && !path && prev && typeof prev === "object" && typeof next === "object") {
        return Store.set(sourceLabel, { ...prev, ...next });
      }
      return Store.set(sourceLabel, raw);
    }
    async function update(fn) {
      const prev = await get();
      const next = fn(prev);
      await set2(next);
      return next;
    }
    async function onChange(cb, isEqual = Object.is) {
      let prev;
      return Store.subscribe(sourceLabel, (src) => {
        const v = path ? getAtPath(src, path) : src;
        if (typeof prev === "undefined" || !isEqual(prev, v)) {
          const p = prev;
          prev = v;
          cb(v, p);
        }
      });
    }
    async function onChangeNow(cb, isEqual = Object.is) {
      let prev;
      return Store.subscribeImmediate(sourceLabel, (src) => {
        const v = path ? getAtPath(src, path) : src;
        if (typeof prev === "undefined" || !isEqual(prev, v)) {
          const p = prev;
          prev = v;
          cb(v, p);
        }
      });
    }
    function asSignature(opts2) {
      return makeSignatureChannel(sourceLabel, path, opts2);
    }
    return { label: sourceLabel + (path ? ":" + toPathArray(path).join(".") : ""), get, set: set2, update, onChange, onChangeNow, asSignature };
  }
  function stablePick(obj, fields) {
    const out = {};
    for (const f of fields) {
      const v = getAtPath(obj, f.includes(".") ? f : [f]);
      out[f] = v;
    }
    try {
      return JSON.stringify(out);
    } catch {
      return String(out);
    }
  }
  function makeSignatureChannel(sourceLabel, path, opts) {
    const mode = opts.mode ?? "auto";
    function computeSig(whole) {
      const base = whole;
      const value = path ? getAtPath(base, path) : base;
      const sig = /* @__PURE__ */ new Map();
      if (value == null) return { sig, keys: [] };
      if ((mode === "array" || mode === "auto" && Array.isArray(value)) && Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const key2 = opts.key ? opts.key(item, i, whole) : i;
          const s = opts.sig ? opts.sig(item, i, whole) : opts.fields ? stablePick(item, opts.fields) : (() => {
            try {
              return JSON.stringify(item);
            } catch {
              return String(item);
            }
          })();
          sig.set(key2, s);
        }
      } else {
        for (const [k, item] of Object.entries(value)) {
          const key2 = opts.key ? opts.key(item, k, whole) : k;
          const s = opts.sig ? opts.sig(item, k, whole) : opts.fields ? stablePick(item, opts.fields) : (() => {
            try {
              return JSON.stringify(item);
            } catch {
              return String(item);
            }
          })();
          sig.set(key2, s);
        }
      }
      return { sig, keys: Array.from(sig.keys()) };
    }
    function mapEqual(a, b) {
      if (a === b) return true;
      if (!a || !b || a.size !== b.size) return false;
      for (const [k, v] of a) if (b.get(k) !== v) return false;
      return true;
    }
    async function sub(cb) {
      let prevSig = null;
      return Store.subscribeImmediate(sourceLabel, (src) => {
        const whole = path ? getAtPath(src, path) : src;
        const { sig } = computeSig(whole);
        if (!mapEqual(prevSig, sig)) {
          const allKeys = /* @__PURE__ */ new Set([
            ...prevSig ? Array.from(prevSig.keys()) : [],
            ...Array.from(sig.keys())
          ]);
          const changed = [];
          for (const k of allKeys) if ((prevSig?.get(k) ?? "__NONE__") !== (sig.get(k) ?? "__NONE__")) changed.push(k);
          prevSig = sig;
          cb({ value: whole, changedKeys: changed });
        }
      });
    }
    async function subKey(key2, cb) {
      let last = "__INIT__";
      return sub(({ value, changedKeys }) => {
        if (changedKeys.includes(key2)) cb({ value });
      });
    }
    async function subKeys(keys, cb) {
      const wanted = new Set(keys);
      return sub(({ value, changedKeys }) => {
        const hit = changedKeys.filter((k) => wanted.has(k));
        if (hit.length) cb({ value, changedKeys: hit });
      });
    }
    return { sub, subKey, subKeys };
  }
  var HubEq = eq;
  function makeAtom(label2) {
    return makeView(label2);
  }

  // src/store/atoms.ts
  var position = makeAtom("positionAtom");
  var state = makeAtom("stateAtom");
  var map = makeAtom("mapAtom");
  var myData = makeAtom("myDataAtom");
  var myInventory = makeAtom("myInventoryAtom");
  var myCropInventory = makeAtom("myCropInventoryAtom");
  var mySeedInventory = makeAtom("mySeedInventoryAtom");
  var myPetInfos = makeAtom("myPetInfosAtom");
  var myPetSlotInfos = makeAtom("myPetSlotInfosAtom");
  var shops = makeAtom("shopsAtom");
  var myShopPurchases = makeAtom("myShopPurchasesAtom");
  var numPlayers = makeAtom("numPlayersAtom");
  var totalCropSellPrice = makeAtom("totalCropSellPriceAtom");
  var myValidatedSelectedItemIndex = makeAtom("myValidatedSelectedItemIndexAtom");
  var setSelectedIndexToEnd = makeAtom("setSelectedIndexToEndAtom");
  var mySelectedItemName = makeAtom("mySelectedItemNameAtom");
  var myPossiblyNoLongerValidSelectedItemIndex = makeAtom("myPossiblyNoLongerValidSelectedItemIndexAtom");
  var myCurrentGardenObject = makeAtom("myCurrentGardenObjectAtom");
  var myCurrentSortedGrowSlotIndices = makeAtom("myCurrentSortedGrowSlotIndicesAtom");
  var myCurrentGrowSlotIndex = makeAtom("myCurrentGrowSlotIndexAtom");
  var activeModal = makeAtom("activeModalAtom");
  var garden = makeView("myDataAtom", { path: "garden" });
  var gardenTileObjects = makeView("myDataAtom", { path: "garden.tileObjects" });
  var favoriteIds = makeView("myInventoryAtom", { path: "favoritedItemIds" });
  var stateChild = makeView("stateAtom", { path: "child" });
  var stateChildData = makeView("stateAtom", { path: "child.data" });
  var stateShops = makeView("stateAtom", { path: "child.data.shops" });
  var stateUserSlots = makeView("stateAtom", { path: "child.data.userSlots" });
  var statePlayers = makeView("stateAtom", { path: "data.players" });
  function slotSig(o) {
    if (!o) return "\u2205";
    return [
      o.objectType ?? o.type ?? "",
      o.species ?? o.seedSpecies ?? o.plantSpecies ?? o.eggId ?? o.decorId ?? "",
      o.plantedAt ?? o.startTime ?? 0,
      o.maturedAt ?? o.endTime ?? 0
    ].join("|");
  }
  var GardenSlotsSig = gardenTileObjects.asSignature({
    mode: "record",
    key: (_item, key2) => Number(key2),
    sig: (item) => slotSig(item)
  });
  function petSig(p) {
    const s = p?.slot ?? {};
    const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
    const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
    const name = s.name ?? "";
    const species = s.petSpecies ?? "";
    const xp = Number.isFinite(s.xp) ? Math.round(s.xp) : 0;
    const hunger = Number.isFinite(s.hunger) ? Math.round(s.hunger * 1e3) : 0;
    const scale = Number.isFinite(s.targetScale) ? Math.round(s.targetScale * 1e3) : 0;
    const x = Number.isFinite(p?.position?.x) ? Math.round(p.position.x) : 0;
    const y = Number.isFinite(p?.position?.y) ? Math.round(p.position.y) : 0;
    return `${species}|${name}|xp:${xp}|hg:${hunger}|sc:${scale}|m:${muts}|a:${ab}|pos:${x},${y}`;
  }
  var PetsByIdSig = myPetInfos.asSignature({
    mode: "array",
    key: (p) => String(p?.slot?.id ?? ""),
    sig: (p) => petSig(p)
  });
  var FavoriteIdsSig = favoriteIds.asSignature({
    mode: "array",
    key: (id) => String(id),
    sig: () => "1"
  });
  var Atoms = {
    ui: {
      activeModal
    },
    server: {
      numPlayers
    },
    player: {
      position
    },
    root: {
      state,
      map
    },
    data: {
      myData,
      garden,
      gardenTileObjects,
      myCurrentGardenObject,
      myCurrentSortedGrowSlotIndices,
      myCurrentGrowSlotIndex
    },
    inventory: {
      myInventory,
      myCropInventory,
      mySeedInventory,
      favoriteIds,
      mySelectedItemName,
      myPossiblyNoLongerValidSelectedItemIndex,
      myValidatedSelectedItemIndex,
      setSelectedIndexToEnd
    },
    pets: {
      myPetInfos,
      myPetSlotInfos
    },
    shop: {
      shops,
      myShopPurchases,
      totalCropSellPrice
    }
  };
  function onFavoriteIds(cb) {
    return favoriteIds.onChange((next) => cb(Array.isArray(next) ? next : []), HubEq.idSet);
  }
  async function onFavoriteIdsNow(cb) {
    cb(Array.isArray(await favoriteIds.get()) ? await favoriteIds.get() : []);
    return onFavoriteIds(cb);
  }
  async function getFavoriteIdSet() {
    const arr = await favoriteIds.get();
    return new Set(Array.isArray(arr) ? arr : []);
  }

  // src/services/player.ts
  function slotSig2(o) {
    if (!o) return "\u2205";
    return [
      o.objectType ?? o.type ?? "",
      o.species ?? o.seedSpecies ?? o.plantSpecies ?? o.eggId ?? o.decorId ?? "",
      o.plantedAt ?? o.startTime ?? 0,
      o.maturedAt ?? o.endTime ?? 0
    ].join("|");
  }
  function diffGarden(prev, next) {
    const p = prev?.tileObjects ?? {};
    const n = next?.tileObjects ?? {};
    const added = [];
    const updated = [];
    const removed = [];
    const changes = [];
    const seen = /* @__PURE__ */ new Set();
    for (const k of Object.keys(n)) {
      seen.add(k);
      if (!(k in p)) {
        added.push(+k);
        changes.push({ kind: "added", slot: +k, next: n[k] });
      } else if (slotSig2(p[k]) !== slotSig2(n[k])) {
        updated.push(+k);
        changes.push({ kind: "updated", slot: +k, prev: p[k], next: n[k] });
      }
    }
    for (const k of Object.keys(p)) {
      if (!seen.has(k)) {
        removed.push(+k);
        changes.push({ kind: "removed", slot: +k, prev: p[k] });
      }
    }
    return { added, updated, removed, changes };
  }
  function petSig2(p) {
    const s = p?.slot ?? {};
    const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
    const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
    const name = s.name ?? "";
    const species = s.petSpecies ?? "";
    const xp = Number.isFinite(s.xp) ? Math.round(s.xp) : 0;
    const hunger = Number.isFinite(s.hunger) ? Math.round(s.hunger * 1e3) : 0;
    const scale = Number.isFinite(s.targetScale) ? Math.round(s.targetScale * 1e3) : 0;
    const x = Number.isFinite(p?.position?.x) ? Math.round(p.position.x) : 0;
    const y = Number.isFinite(p?.position?.y) ? Math.round(p.position.y) : 0;
    return `${species}|${name}|xp:${xp}|hg:${hunger}|sc:${scale}|m:${muts}|a:${ab}|pos:${x},${y}`;
  }
  function snapshotPets(state2) {
    const snap = /* @__PURE__ */ new Map();
    const arr = Array.isArray(state2) ? state2 : [];
    for (const it of arr) {
      const id = String(it?.slot?.id ?? "");
      if (!id) continue;
      snap.set(id, petSig2(it));
    }
    return snap;
  }
  function diffPetsSnapshot(prev, next) {
    const added = [];
    const updated = [];
    const removed = [];
    const changes = [];
    for (const [id, sig] of next) {
      if (!prev.has(id)) {
        added.push(id);
        changes.push({ kind: "added", id });
      } else if (prev.get(id) !== sig) {
        updated.push(id);
        changes.push({ kind: "updated", id });
      }
    }
    for (const id of prev.keys()) {
      if (!next.has(id)) {
        removed.push(id);
        changes.push({ kind: "removed", id });
      }
    }
    return { added, updated, removed, changes };
  }
  function cropSig(it) {
    const muts = Array.isArray(it.mutations) ? it.mutations.slice().sort().join(",") : "";
    const scale = Number.isFinite(it.scale) ? Math.round(it.scale * 1e3) : 0;
    return `${it.species ?? ""}|${it.itemType ?? ""}|${scale}|${muts}`;
  }
  function snapshotInventory(inv) {
    const snap = /* @__PURE__ */ new Map();
    const arr = Array.isArray(inv) ? inv : [];
    for (const it of arr) {
      const id = String(it?.id ?? "");
      if (!id) continue;
      snap.set(id, cropSig(it));
    }
    return snap;
  }
  function diffCropInventorySnapshot(prev, next) {
    const added = [];
    const updated = [];
    const removed = [];
    const changes = [];
    for (const [id, sig] of next) {
      if (!prev.has(id)) {
        added.push(id);
        changes.push({ kind: "added", key: id });
      } else if (prev.get(id) !== sig) {
        updated.push(id);
        changes.push({ kind: "updated", key: id });
      }
    }
    for (const id of prev.keys()) {
      if (!next.has(id)) {
        removed.push(id);
        changes.push({ kind: "removed", key: id });
      }
    }
    return { added, updated, removed, changes };
  }
  var PlayerService = {
    /* ------------------------- Position / Déplacement ------------------------- */
    getPosition() {
      return Atoms.player.position.get();
    },
    onPosition(cb) {
      return Atoms.player.position.onChange(cb);
    },
    onPositionNow(cb) {
      return Atoms.player.position.onChangeNow(cb);
    },
    async setPosition(x, y) {
      await Atoms.player.position.set({ x, y });
    },
    async teleport(x, y) {
      try {
        await this.setPosition(x, y);
      } catch {
      }
      try {
        sendToGame({ type: "Teleport", position: { x, y } });
      } catch {
      }
    },
    async move(x, y) {
      try {
        await this.setPosition(x, y);
      } catch {
      }
      try {
        sendToGame({ type: "PlayerPosition", position: { x, y } });
      } catch {
      }
    },
    /* ------------------------------ Actions jeu ------------------------------ */
    async plantSeed(slot, species) {
      try {
        sendToGame({ type: "PlantSeed", slot, species });
      } catch {
      }
    },
    async sellAllCrops() {
      try {
        sendToGame({ type: "SellAllCrops" });
      } catch {
      }
    },
    async sellPet(itemId) {
      try {
        sendToGame({ type: "SellPet", itemId });
      } catch {
      }
    },
    async waterPlant(slot) {
      try {
        sendToGame({ type: "WaterPlant", slot });
      } catch {
      }
    },
    async setSelectedItem(itemIndex) {
      try {
        sendToGame({ type: "SetSelectedItem", itemIndex });
      } catch {
      }
    },
    async pickupObject() {
      try {
        sendToGame({ type: "PickupObject" });
      } catch {
      }
    },
    async dropObject() {
      try {
        sendToGame({ type: "DropObject" });
      } catch {
      }
    },
    async harvestCrop(slot, slotsIndex) {
      try {
        sendToGame({ type: "HarvestCrop", slot, slotsIndex });
      } catch {
      }
    },
    async feedPet(petItemId, cropItemId) {
      try {
        sendToGame({ type: "FeedPet", petItemId, cropItemId });
      } catch {
      }
    },
    async hatchEgg(slot) {
      try {
        sendToGame({ type: "HatchEgg", slot });
      } catch {
      }
    },
    async placeDecor(tileType, localTileIndex, decorId) {
      try {
        sendToGame({ type: "PlaceDecor", tileType, localTileIndex, decorId });
      } catch {
      }
    },
    async swapPet(petSlotId, petInventoryId) {
      try {
        sendToGame({ type: "SwapPet", petSlotId, petInventoryId });
      } catch {
      }
    },
    async placePet(itemId, position2, tileType, localTileIndex) {
      try {
        sendToGame({ type: "PlacePet", itemId, position: position2, tileType, localTileIndex });
      } catch {
      }
    },
    async storePet(itemId) {
      try {
        sendToGame({ type: "StorePet", itemId });
      } catch {
      }
    },
    async wish(itemId) {
      try {
        sendToGame({ type: "Wish", itemId });
      } catch {
      }
    },
    /* -------------------------------- Favorites ------------------------------ */
    async toggleFavoriteItem(itemId) {
      try {
        sendToGame({ type: "ToggleFavoriteItem", itemId });
      } catch {
      }
    },
    async getFavoriteIds() {
      const ids = await Atoms.inventory.favoriteIds.get();
      return Array.isArray(ids) ? ids.slice() : [];
    },
    async getFavoriteIdSet() {
      return getFavoriteIdSet();
    },
    async isFavoriteItem(itemId) {
      const set2 = await getFavoriteIdSet();
      return set2.has(itemId);
    },
    async ensureFavoriteItem(itemId, shouldBeFavorite) {
      const cur2 = await this.isFavoriteItem(itemId);
      if (cur2 !== shouldBeFavorite) {
        await this.toggleFavoriteItem(itemId);
        return shouldBeFavorite;
      }
      return cur2;
    },
    async ensureFavorites(items, shouldBeFavorite) {
      const set2 = await getFavoriteIdSet();
      for (const id of items) {
        const cur2 = set2.has(id);
        if (cur2 !== shouldBeFavorite) {
          try {
            await this.toggleFavoriteItem(id);
          } catch {
          }
        }
      }
    },
    onFavoriteIdsChange(cb) {
      return onFavoriteIds((ids) => cb(Array.isArray(ids) ? ids : []));
    },
    async onFavoriteIdsChangeNow(cb) {
      return onFavoriteIdsNow((ids) => cb(Array.isArray(ids) ? ids : []));
    },
    onFavoriteSetChange(cb) {
      return onFavoriteIds((ids) => cb(new Set(Array.isArray(ids) ? ids : [])));
    },
    async onFavoriteSetChangeNow(cb) {
      const cur2 = await getFavoriteIdSet();
      cb(cur2);
      return onFavoriteIds((ids) => cb(new Set(Array.isArray(ids) ? ids : [])));
    },
    /* --------------------------------- Garden -------------------------------- */
    async getGardenState() {
      return await Atoms.data.garden.get() ?? null;
    },
    onGardenChange(cb) {
      return Atoms.data.garden.onChange(cb);
    },
    onGardenChangeNow(cb) {
      return Atoms.data.garden.onChangeNow(cb);
    },
    onGardenDiff(cb) {
      let prev = null;
      return Atoms.data.garden.onChange((g) => {
        const d = diffGarden(prev, g);
        if (d.added.length || d.updated.length || d.removed.length || g !== prev) {
          prev = g;
          cb(g, d);
        }
      });
    },
    async onGardenDiffNow(cb) {
      let prev = await Atoms.data.garden.get() ?? null;
      cb(prev, diffGarden(null, prev));
      return Atoms.data.garden.onChange((next) => {
        const d = diffGarden(prev, next);
        if (d.added.length || d.updated.length || d.removed.length) {
          prev = next;
          cb(next, d);
        }
      });
    },
    /* ------------------------------------ Pets ------------------------------------ */
    async getPets() {
      const arr = await Atoms.pets.myPetInfos.get();
      return Array.isArray(arr) ? arr : null;
    },
    onPetsChange(cb) {
      let prev = null;
      return Atoms.pets.myPetInfos.onChange((next) => {
        if (next !== prev) {
          prev = next;
          cb(prev);
        }
      });
    },
    async onPetsChangeNow(cb) {
      let prev = await this.getPets();
      cb(prev);
      return Atoms.pets.myPetInfos.onChange((next) => {
        if (next !== prev) {
          prev = next;
          cb(prev);
        }
      });
    },
    onPetsDiff(cb) {
      let prevSnap = snapshotPets(null);
      return Atoms.pets.myPetInfos.onChange((state2) => {
        const nextSnap = snapshotPets(state2);
        const d = diffPetsSnapshot(prevSnap, nextSnap);
        if (d.added.length || d.updated.length || d.removed.length) {
          cb(state2, d);
          prevSnap = nextSnap;
        }
      });
    },
    async onPetsDiffNow(cb) {
      let cur2 = await this.getPets();
      let prevSnap = snapshotPets(null);
      let nextSnap = snapshotPets(cur2);
      const first = diffPetsSnapshot(prevSnap, nextSnap);
      cb(cur2, first);
      prevSnap = nextSnap;
      return Atoms.pets.myPetInfos.onChange((state2) => {
        nextSnap = snapshotPets(state2);
        const d = diffPetsSnapshot(prevSnap, nextSnap);
        if (d.added.length || d.updated.length || d.removed.length) {
          cb(state2, d);
          prevSnap = nextSnap;
        }
      });
    },
    /* ------------------------- Crop Inventory (crops) ------------------------- */
    async getCropInventoryState() {
      return Atoms.inventory.myCropInventory.get();
    },
    onCropInventoryChange(cb) {
      let prev = null;
      return Atoms.inventory.myCropInventory.onChange((inv) => {
        if (inv !== prev) {
          prev = inv;
          cb(inv);
        }
      });
    },
    async onCropInventoryChangeNow(cb) {
      let prev = await Atoms.inventory.myCropInventory.get();
      cb(prev);
      return Atoms.inventory.myCropInventory.onChange((inv) => {
        if (inv !== prev) {
          prev = inv;
          cb(inv);
        }
      });
    },
    onCropInventoryDiff(cb) {
      let prevSnap = snapshotInventory(null);
      return Atoms.inventory.myCropInventory.onChange((inv) => {
        const nextSnap = snapshotInventory(inv);
        const d = diffCropInventorySnapshot(prevSnap, nextSnap);
        if (d.added.length || d.updated.length || d.removed.length) {
          cb(inv, d);
          prevSnap = nextSnap;
        }
      });
    },
    async onCropInventoryDiffNow(cb) {
      let cur2 = await Atoms.inventory.myCropInventory.get();
      let prevSnap = snapshotInventory(null);
      let nextSnap = snapshotInventory(cur2);
      const firstDiff = diffCropInventorySnapshot(prevSnap, nextSnap);
      cb(cur2, firstDiff);
      prevSnap = nextSnap;
      return Atoms.inventory.myCropInventory.onChange((inv) => {
        nextSnap = snapshotInventory(inv);
        const d = diffCropInventorySnapshot(prevSnap, nextSnap);
        if (d.added.length || d.updated.length || d.removed.length) {
          cb(inv, d);
          prevSnap = nextSnap;
        }
      });
    },
    /* --------------------------- Players in room --------------------------- */
    async getNumPlayers() {
      const n = await Atoms.server.numPlayers.get();
      return typeof n === "number" ? n : 0;
    },
    onNumPlayersChange(cb) {
      let prev = void 0;
      return Atoms.server.numPlayers.onChange((n) => {
        if (n !== prev) {
          prev = n;
          cb(n);
        }
      });
    },
    async onNumPlayersChangeNow(cb) {
      let prev = await this.getNumPlayers();
      cb(prev);
      return Atoms.server.numPlayers.onChange((n) => {
        if (n !== prev) {
          prev = n;
          cb(n);
        }
      });
    }
  };

  // src/data/hardcoded-data.clean.js
  var rarity = {
    Common: "Common",
    Uncommon: "Uncommon",
    Rare: "Rare",
    Legendary: "Legendary",
    Mythic: "Mythical",
    Divine: "Divine",
    Celestial: "Celestial"
  };
  var harvestType = {
    Single: "Single",
    Multiple: "Multiple"
  };
  var tileRefsPlants = {
    Empty: 0,
    DirtPatch: 1,
    SproutFlower: 2,
    SproutVegetable: 3,
    SproutFruit: 4,
    SproutVine: 5,
    StemFlower: 6,
    Trellis: 7,
    Daffodil: 11,
    Tulip: 12,
    Sunflower: 13,
    Lily: 14,
    Starweaver: 15,
    AloePlant: 17,
    Aloe: 18,
    Blueberry: 21,
    Banana: 22,
    Strawberry: 23,
    Mango: 24,
    Grape: 25,
    Watermelon: 26,
    Lemon: 27,
    Apple: 28,
    Pepper: 31,
    Tomato: 32,
    BabyCarrot: 33,
    Carrot: 34,
    Pumpkin: 35,
    Corn: 36,
    PalmTreeTop: 39,
    BushyTree: 40,
    Coconut: 41,
    MushroomPlant: 42,
    PassionFruit: 43,
    DragonFruit: 44,
    Lychee: 45,
    Mushroom: 46,
    BurrosTail: 47,
    Cacao: 48,
    Echeveria: 49,
    // NEW Celestial crops
    DawnCelestialCrop: 51,
    // Sunbriar Bulb
    MoonCelestialCrop: 52
    // Mooncatcher Bulb
  };
  var tileRefsTallPlants = {
    Empty: 0,
    Bamboo: 1,
    PalmTree: 2,
    // NEW Dawn Celestial stack
    DawnCelestialPlatform: 3,
    DawnCelestialPlant: 4,
    DawnCelestialPlantActive: 5,
    DawnCelestialPlatformTopmostLayer: 6,
    Cactus: 7,
    Tree: 8,
    // NEW Moon Celestial stack
    MoonCelestialPlatform: 9,
    MoonCelestialPlant: 10,
    MoonCelestialPlantActive: 11,
    // Starweaver
    StarweaverPlatform: 13,
    StarweaverPlant: 14
  };
  var tileRefsSeeds = {
    Empty: 0,
    Daffodil: 1,
    Tulip: 2,
    Sunflower: 3,
    Starweaver: 6,
    MoonCelestial: 7,
    // NEW
    DawnCelestial: 8,
    // NEW
    Blueberry: 11,
    Banana: 12,
    Strawberry: 13,
    Mango: 14,
    Grape: 15,
    Watermelon: 16,
    Lemon: 17,
    Apple: 18,
    Lily: 20,
    Pepper: 21,
    Tomato: 22,
    Carrot: 23,
    Pumpkin: 25,
    Corn: 26,
    Coconut: 31,
    Mushroom: 32,
    PassionFruit: 33,
    DragonFruit: 34,
    Lychee: 35,
    BurrosTail: 37,
    Aloe: 39,
    Echeveria: 40,
    Bamboo: 41,
    Cactus: 42
  };
  var tileRefsItems = {
    Empty: 0,
    Coin: 1,
    Shovel: 2,
    Seeds: 3,
    PlanterPot: 5,
    InventoryBag: 6,
    WateringCan: 14,
    Fertilizer: 15,
    RainbowPotion: 16,
    ArrowKeys: 41,
    Touchpad: 42
  };
  var tileRefsPets = {
    Bee: 1,
    Chicken: 2,
    Bunny: 3,
    Turtle: 4,
    Capybara: 5,
    Cow: 6,
    Pig: 7,
    Butterfly: 8,
    Snail: 9,
    Worm: 10,
    CommonEgg: 11,
    UncommonEgg: 12,
    RareEgg: 13,
    LegendaryEgg: 14,
    MythicalEgg: 15,
    DivineEgg: 16,
    CelestialEgg: 17,
    Squirrel: 18,
    Goat: 19,
    Dragonfly: 20,
    Peacock: 30
  };
  var tileRefsMutations = {
    Wet: 1,
    Chilled: 2,
    Frozen: 3,
    Dawnlit: 11,
    Amberlit: 12,
    Dawncharged: 13,
    Ambercharged: 14
  };
  var tileRefsDecor = {
    SmallRock: 11,
    MediumRock: 21,
    LargeRock: 31,
    WoodPedestal: 4,
    WoodBench: 13,
    WoodBucketPedestal: 14,
    WoodLampPost: 23,
    WoodStool: 24,
    WoodArch: 33,
    WoodBridge: 34,
    WoodOwl: 43,
    WoodGardenBox: 44,
    StonePedestal: 6,
    StoneBench: 15,
    StoneBucketPedestal: 16,
    StoneLampPost: 25,
    StoneColumn: 26,
    StoneArch: 35,
    StoneBridge: 36,
    StoneGnome: 45,
    StoneGardenBox: 46,
    MarblePedestal: 8,
    MarbleBench: 17,
    MarbleBucketPedestal: 18,
    MarbleLampPost: 27,
    MarbleColumn: 28,
    MarbleArch: 37,
    MarbleBridge: 38,
    MarbleBlobling: 47,
    MarbleGardenBox: 48,
    StrawScarecrow: 49,
    MiniFairyCottage: 50,
    MiniFairyForge: 40,
    MiniFairyKeep: 60,
    Birdhouse: 63,
    WoodenWindmill: 64,
    StoneBirdbath: 65
  };
  var plantCatalog = {
    Carrot: {
      seed: { tileRef: tileRefsSeeds.Carrot, name: "Carrot Seed", coinPrice: 10, creditPrice: 7, rarity: rarity.Common },
      plant: { tileRef: tileRefsPlants.BabyCarrot, name: "Carrot Plant", harvestType: harvestType.Single, baseTileScale: 0.7 },
      crop: { tileRef: tileRefsPlants.Carrot, name: "Carrot", baseSellPrice: 20, baseWeight: 0.1, baseTileScale: 0.6, maxScale: 3 }
    },
    Strawberry: {
      seed: { tileRef: tileRefsSeeds.Strawberry, name: "Strawberry Seed", coinPrice: 50, creditPrice: 21, rarity: rarity.Common },
      plant: {
        tileRef: tileRefsPlants.SproutFruit,
        name: "Strawberry Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.3, y: 0.4, rotation: 85 }, { x: 0.675, y: 0.3, rotation: 195 }, { x: 0.32, y: 0.72, rotation: 340 }, { x: 0.7, y: 0.7, rotation: 280 }, { x: 0.51, y: 0.51, rotation: 0 }],
        secondsToMature: 70,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: true
      },
      crop: { tileRef: tileRefsPlants.Strawberry, name: "Strawberry", baseSellPrice: 14, baseWeight: 0.05, baseTileScale: 0.25, maxScale: 2 }
    },
    Aloe: {
      seed: { tileRef: tileRefsSeeds.Aloe, name: "Aloe Seed", coinPrice: 135, creditPrice: 18, rarity: rarity.Common },
      plant: { tileRef: tileRefsPlants.AloePlant, name: "Aloe Plant", harvestType: harvestType.Single, baseTileScale: 0.9 },
      crop: { tileRef: tileRefsPlants.Aloe, name: "Aloe", baseSellPrice: 310, baseWeight: 1.5, baseTileScale: 0.7, maxScale: 2.5 }
    },
    Blueberry: {
      seed: { tileRef: tileRefsSeeds.Blueberry, name: "Blueberry Seed", coinPrice: 400, creditPrice: 49, rarity: rarity.Uncommon },
      plant: {
        tileRef: tileRefsPlants.SproutFruit,
        name: "Blueberry Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.3, y: 0.4, rotation: 85 }, { x: 0.675, y: 0.3, rotation: 195 }, { x: 0.32, y: 0.72, rotation: 340 }, { x: 0.7, y: 0.7, rotation: 280 }, { x: 0.51, y: 0.51, rotation: 0 }],
        secondsToMature: 105,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: true
      },
      crop: { tileRef: tileRefsPlants.Blueberry, name: "Blueberry", baseSellPrice: 23, baseWeight: 0.01, baseTileScale: 0.25, maxScale: 2 }
    },
    Apple: {
      seed: { tileRef: tileRefsSeeds.Apple, name: "Apple Seed", coinPrice: 500, creditPrice: 67, rarity: rarity.Uncommon, unavailableSurfaces: ["discord"] },
      plant: {
        tileRef: tileRefsTallPlants.Tree,
        name: "Apple Tree",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.15, y: -1.9, rotation: -90 }, { x: 0, y: -1.5, rotation: -75 }, { x: 0.6, y: -1.7, rotation: -60 }, { x: 0.3, y: -1.15, rotation: -55 }, { x: 1.05, y: -1.4, rotation: -45 }, { x: 0.8, y: -1.2, rotation: -35 }, { x: 0.9, y: 0.6, rotation: -30 }],
        secondsToMature: 360 * 60,
        baseTileScale: 3,
        rotateSlotOffsetsRandomly: false,
        tileTransformOrigin: "bottom",
        nudgeY: 0.25
      },
      crop: { tileRef: tileRefsPlants.Apple, name: "Apple", baseSellPrice: 73, baseWeight: 0.18, baseTileScale: 0.5, maxScale: 2 }
    },
    OrangeTulip: {
      seed: { tileRef: tileRefsSeeds.Tulip, name: "Tulip Seed", coinPrice: 600, creditPrice: 14, rarity: rarity.Uncommon },
      plant: { tileRef: tileRefsPlants.Tulip, name: "Tulip Plant", harvestType: harvestType.Single, baseTileScale: 0.5 },
      crop: { tileRef: tileRefsPlants.Tulip, name: "Tulip", baseSellPrice: 767, baseWeight: 0.01, baseTileScale: 0.5, maxScale: 3 }
    },
    Tomato: {
      seed: { tileRef: tileRefsSeeds.Tomato, name: "Tomato Seed", coinPrice: 800, creditPrice: 79, rarity: rarity.Uncommon },
      plant: {
        tileRef: tileRefsPlants.SproutVine,
        name: "Tomato Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.2, y: 0.2, rotation: 0 }, { x: 0.8, y: 0.8, rotation: 0 }],
        secondsToMature: 1100,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: false
      },
      crop: { tileRef: tileRefsPlants.Tomato, name: "Tomato", baseSellPrice: 27, baseWeight: 0.3, baseTileScale: 0.33, maxScale: 2 }
    },
    Daffodil: {
      seed: { tileRef: tileRefsSeeds.Daffodil, name: "Daffodil Seed", coinPrice: 1e3, creditPrice: 19, rarity: rarity.Rare },
      plant: { tileRef: tileRefsPlants.Daffodil, name: "Daffodil Plant", harvestType: harvestType.Single, baseTileScale: 0.5 },
      crop: { tileRef: tileRefsPlants.Daffodil, name: "Daffodil", baseSellPrice: 1090, baseWeight: 0.01, baseTileScale: 0.5, maxScale: 3 }
    },
    Corn: {
      seed: { tileRef: tileRefsSeeds.Corn, name: "Corn Kernel", coinPrice: 1300, creditPrice: 135, rarity: rarity.Rare },
      plant: {
        tileRef: tileRefsPlants.SproutVegetable,
        name: "Corn Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.5, y: 0.4, rotation: 0 }],
        secondsToMature: 130,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: false
      },
      crop: { tileRef: tileRefsPlants.Corn, name: "Corn", baseSellPrice: 36, baseWeight: 1.2, baseTileScale: 0.7, maxScale: 2 }
    },
    Watermelon: {
      seed: { tileRef: tileRefsSeeds.Watermelon, name: "Watermelon Seed", coinPrice: 2500, creditPrice: 195, rarity: rarity.Rare },
      plant: { tileRef: tileRefsPlants.Watermelon, name: "Watermelon Plant", harvestType: harvestType.Single, baseTileScale: 0.8 },
      crop: { tileRef: tileRefsPlants.Watermelon, name: "Watermelon", baseSellPrice: 2708, baseWeight: 4.5, baseTileScale: 0.8, maxScale: 3 }
    },
    Pumpkin: {
      seed: { tileRef: tileRefsSeeds.Pumpkin, name: "Pumpkin Seed", coinPrice: 3e3, creditPrice: 210, rarity: rarity.Rare },
      plant: { tileRef: tileRefsPlants.Pumpkin, name: "Pumpkin Plant", harvestType: harvestType.Single, baseTileScale: 0.8 },
      crop: { tileRef: tileRefsPlants.Pumpkin, name: "Pumpkin", baseSellPrice: 3700, baseWeight: 6, baseTileScale: 0.8, maxScale: 3 }
    },
    Echeveria: {
      seed: { tileRef: tileRefsSeeds.Echeveria, name: "Echeveria Cutting", coinPrice: 4200, creditPrice: 113, rarity: rarity.Legendary },
      plant: { tileRef: tileRefsPlants.Echeveria, name: "Echeveria Plant", harvestType: harvestType.Single, baseTileScale: 0.8 },
      crop: { tileRef: tileRefsPlants.Echeveria, name: "Echeveria", baseSellPrice: 4600, baseWeight: 0.8, baseTileScale: 0.8, maxScale: 2.75 }
    },
    Coconut: {
      seed: { tileRef: tileRefsSeeds.Coconut, name: "Coconut Seed", coinPrice: 6e3, creditPrice: 235, rarity: rarity.Legendary },
      plant: {
        tileRef: tileRefsTallPlants.PalmTree,
        name: "Coconut Tree",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.3, y: -2.1, rotation: 0 }, { x: 0.2, y: -1.9, rotation: 51.4 }, { x: 0.7, y: -2, rotation: 102.9 }, { x: 0.25, y: -1.6, rotation: 154.3 }, { x: 0.5, y: -1.8, rotation: 205.7 }, { x: 0.8, y: -1.7, rotation: 257.1 }, { x: 0.55, y: -1.5, rotation: 308.6 }],
        secondsToMature: 720 * 60,
        baseTileScale: 3,
        rotateSlotOffsetsRandomly: true,
        tileTransformOrigin: "bottom",
        nudgeY: 0.15
      },
      crop: { tileRef: tileRefsPlants.Coconut, name: "Coconut", baseSellPrice: 302, baseWeight: 5, baseTileScale: 0.25, maxScale: 3 }
    },
    Banana: {
      seed: {
        tileRef: tileRefsSeeds.Banana,
        name: "Banana Seed",
        coinPrice: 7500,
        creditPrice: 199,
        rarity: rarity.Legendary,
        spawnRule: { type: "parity", parity: "even" }
      },
      plant: {
        tileRef: tileRefsTallPlants.PalmTree,
        name: "Banana Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.2, y: -1.2, rotation: 10 }, { x: 0.3, y: -1.2, rotation: -10 }, { x: 0.4, y: -1.2, rotation: -30 }, { x: 0.5, y: -1.2, rotation: -50 }, { x: 0.6, y: -1.2, rotation: -70 }],
        secondsToMature: 14400,
        baseTileScale: 2.5,
        rotateSlotOffsetsRandomly: false,
        tileTransformOrigin: "bottom",
        nudgeY: 0.1
      },
      crop: { tileRef: tileRefsPlants.Banana, name: "Banana", baseSellPrice: 1750, baseWeight: 0.12, baseTileScale: 0.5, maxScale: 1.7 }
    },
    Lily: {
      seed: { tileRef: tileRefsSeeds.Lily, name: "Lily Seed", coinPrice: 2e4, creditPrice: 34, rarity: rarity.Legendary },
      plant: { tileRef: tileRefsPlants.Lily, name: "Lily Plant", harvestType: harvestType.Single, baseTileScale: 0.75, nudgeY: 0.4 },
      crop: { tileRef: tileRefsPlants.Lily, name: "Lily", baseSellPrice: 20123, baseWeight: 0.02, baseTileScale: 0.5, maxScale: 2.75 }
    },
    BurrosTail: {
      seed: { tileRef: tileRefsSeeds.BurrosTail, name: "Burro's Tail Cutting", coinPrice: 93e3, creditPrice: 338, rarity: rarity.Legendary },
      plant: {
        tileRef: tileRefsPlants.Trellis,
        name: "Burro's Tail Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.37, y: 0.4, rotation: 0 }, { x: 0.67, y: 0.63, rotation: 0 }],
        secondsToMature: 1800,
        baseTileScale: 0.8,
        rotateSlotOffsetsRandomly: false
      },
      crop: { tileRef: tileRefsPlants.BurrosTail, name: "Burro's Tail", baseSellPrice: 6e3, baseWeight: 0.4, baseTileScale: 0.4, maxScale: 2.5 }
    },
    Mushroom: {
      seed: { tileRef: tileRefsSeeds.Mushroom, name: "Mushroom Spore", coinPrice: 15e4, creditPrice: 249, rarity: rarity.Mythic },
      plant: { tileRef: tileRefsPlants.MushroomPlant, name: "Mushroom Plant", harvestType: harvestType.Single, baseTileScale: 0.8 },
      crop: { tileRef: tileRefsPlants.Mushroom, name: "Mushroom", baseSellPrice: 16e4, baseWeight: 25, baseTileScale: 0.8, maxScale: 3.5 }
    },
    Cactus: {
      seed: { tileRef: tileRefsSeeds.Cactus, name: "Cactus Seed", coinPrice: 25e4, creditPrice: 250, rarity: rarity.Mythic },
      plant: { tileRef: tileRefsTallPlants.Cactus, name: "Cactus Plant", harvestType: harvestType.Single, baseTileScale: 2.5, tileTransformOrigin: "bottom", nudgeY: 0.15 },
      crop: { tileRef: tileRefsTallPlants.Cactus, name: "Cactus", baseSellPrice: 261e3, baseWeight: 1500, baseTileScale: 2.5, maxScale: 1.8 }
    },
    Bamboo: {
      seed: { tileRef: tileRefsSeeds.Bamboo, name: "Bamboo Seed", coinPrice: 4e5, creditPrice: 300, rarity: rarity.Mythic },
      plant: { tileRef: tileRefsTallPlants.Bamboo, name: "Bamboo Plant", harvestType: harvestType.Single, baseTileScale: 2.5, tileTransformOrigin: "bottom", nudgeY: 0.1 },
      crop: { tileRef: tileRefsTallPlants.Bamboo, name: "Bamboo Shoot", baseSellPrice: 5e5, baseWeight: 1, baseTileScale: 2.5, maxScale: 2 }
    },
    Grape: {
      seed: {
        tileRef: tileRefsSeeds.Grape,
        name: "Grape Seed",
        coinPrice: 85e4,
        creditPrice: 599,
        rarity: rarity.Mythic,
        spawnRule: { type: "suffix", value: "1" }
      },
      plant: {
        tileRef: tileRefsPlants.SproutVine,
        name: "Grape Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.5, y: 0.5, rotation: 0 }],
        secondsToMature: 1440 * 60,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: false
      },
      crop: { tileRef: tileRefsPlants.Grape, name: "Grape", baseSellPrice: 7085, baseWeight: 3, baseTileScale: 0.5, maxScale: 2 }
    },
    Pepper: {
      seed: { tileRef: tileRefsSeeds.Pepper, name: "Pepper Seed", coinPrice: 1e6, creditPrice: 629, rarity: rarity.Divine },
      plant: {
        tileRef: tileRefsPlants.SproutVine,
        name: "Pepper Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.1, y: 0.1, rotation: 0 }, { x: 0.9, y: 0.1, rotation: 0 }, { x: 0.3, y: 0.3, rotation: 0 }, { x: 0.7, y: 0.3, rotation: 0 }, { x: 0.5, y: 0.5, rotation: 0 }, { x: 0.3, y: 0.7, rotation: 0 }, { x: 0.7, y: 0.7, rotation: 0 }, { x: 0.1, y: 0.9, rotation: 0 }, { x: 0.9, y: 0.9, rotation: 0 }],
        secondsToMature: 560,
        baseTileScale: 1,
        rotateSlotOffsetsRandomly: true
      },
      crop: { tileRef: tileRefsPlants.Pepper, name: "Pepper", baseSellPrice: 7220, baseWeight: 0.5, baseTileScale: 0.3, maxScale: 2 }
    },
    Lemon: {
      seed: {
        tileRef: tileRefsSeeds.Lemon,
        name: "Lemon Seed",
        coinPrice: 2e6,
        creditPrice: 500,
        rarity: rarity.Divine,
        spawnRule: { type: "suffix", value: "2" }
      },
      plant: {
        tileRef: tileRefsTallPlants.Tree,
        name: "Lemon Tree",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0, y: -1, rotation: 85 }, { x: 0.9, y: -1.1, rotation: 195 }, { x: 0.2, y: -0.68, rotation: 340 }, { x: 0.7, y: -0.7, rotation: 280 }, { x: 0.51, y: -1, rotation: 0 }, { x: 0.45, y: -1.3, rotation: 280 }],
        secondsToMature: 720 * 60,
        baseTileScale: 2.3,
        rotateSlotOffsetsRandomly: true,
        tileTransformOrigin: "bottom",
        nudgeY: 0.25
      },
      crop: { tileRef: tileRefsPlants.Lemon, name: "Lemon", baseSellPrice: 1e4, baseWeight: 0.5, baseTileScale: 0.25, maxScale: 3 }
    },
    PassionFruit: {
      seed: { tileRef: tileRefsSeeds.PassionFruit, name: "Passion Fruit Seed", coinPrice: 275e4, creditPrice: 679, rarity: rarity.Divine },
      plant: {
        tileRef: tileRefsPlants.SproutVine,
        name: "Passion Fruit Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.2, y: 0.2, rotation: 0 }, { x: 0.8, y: 0.8, rotation: 0 }],
        secondsToMature: 1440 * 60,
        baseTileScale: 1.1,
        rotateSlotOffsetsRandomly: false
      },
      crop: { tileRef: tileRefsPlants.PassionFruit, name: "Passion Fruit", baseSellPrice: 24500, baseWeight: 9.5, baseTileScale: 0.35, maxScale: 2 }
    },
    DragonFruit: {
      seed: { tileRef: tileRefsSeeds.DragonFruit, name: "Dragon Fruit Seed", coinPrice: 5e6, creditPrice: 715, rarity: rarity.Divine },
      plant: {
        tileRef: tileRefsPlants.PalmTreeTop,
        name: "Dragon Fruit Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.2, y: 0.1, rotation: 0 }, { x: 0.1, y: 0.45, rotation: 51.4 }, { x: 0.86, y: 0.2, rotation: 102.9 }, { x: 0.25, y: 0.8, rotation: 154.3 }, { x: 0.5, y: 0.4, rotation: 205.7 }, { x: 0.9, y: 0.6, rotation: 257.1 }, { x: 0.6, y: 0.7, rotation: 308.6 }],
        secondsToMature: 600,
        baseTileScale: 1.6,
        rotateSlotOffsetsRandomly: true
      },
      crop: { tileRef: tileRefsPlants.DragonFruit, name: "Dragon Fruit", baseSellPrice: 24500, baseWeight: 8.4, baseTileScale: 0.4, maxScale: 2 }
    },
    Lychee: {
      seed: {
        tileRef: tileRefsSeeds.Lychee,
        name: "Lychee Pit",
        coinPrice: 25e6,
        creditPrice: 819,
        rarity: rarity.Divine,
        spawnRule: { type: "suffix", value: "2" }
      },
      plant: {
        tileRef: tileRefsPlants.BushyTree,
        name: "Lychee Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.1, y: 0.4, rotation: 85 }, { x: 0.8, y: 0.3, rotation: 195 }, { x: 0.2, y: 0.72, rotation: 340 }, { x: 0.7, y: 0.7, rotation: 280 }, { x: 0.51, y: 0.4, rotation: 0 }, { x: 0.3, y: 0.2, rotation: 280 }],
        secondsToMature: 1440 * 60,
        baseTileScale: 1.2,
        rotateSlotOffsetsRandomly: true
      },
      crop: { tileRef: tileRefsPlants.Lychee, name: "Lychee Fruit", baseSellPrice: 5e4, baseWeight: 9, baseTileScale: 0.2, maxScale: 2 }
    },
    Sunflower: {
      seed: { tileRef: tileRefsSeeds.Sunflower, name: "Sunflower Seed", coinPrice: 1e8, creditPrice: 900, rarity: rarity.Divine },
      plant: {
        tileRef: tileRefsPlants.StemFlower,
        name: "Sunflower Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.51, y: -0.1, rotation: 0 }],
        secondsToMature: 1440 * 60,
        rotateSlotOffsetsRandomly: true,
        tileTransformOrigin: "bottom",
        baseTileScale: 0.8,
        nudgeY: 0.15
      },
      crop: { tileRef: tileRefsPlants.Sunflower, name: "Sunflower", baseSellPrice: 75e4, baseWeight: 10, baseTileScale: 0.5, maxScale: 2.5 }
    },
    Starweaver: {
      seed: { tileRef: tileRefsSeeds.Starweaver, name: "Starweaver Pod", coinPrice: 1e9, creditPrice: 1e3, rarity: rarity.Celestial },
      plant: {
        tileRef: tileRefsPlants.StarweaverPlant,
        name: "Starweaver Plant",
        harvestType: harvestType.Multiple,
        slotOffsets: [{ x: 0.5, y: -0.158, rotation: 0 }],
        secondsToMature: 1440 * 60,
        baseTileScale: 1.5,
        rotateSlotOffsetsRandomly: false,
        nudgeY: 0.25
      },
      crop: { tileRef: tileRefsPlants.Starweaver, name: "Starweaver Fruit", baseSellPrice: 1e7, baseWeight: 10, baseTileScale: 0.6, maxScale: 2 }
    },
    DawnCelestial: {
      seed: { tileRef: tileRefsSeeds.DawnCelestial, name: "Sunbriar Pod", coinPrice: 1e10, creditPrice: 1129, rarity: rarity.Celestial },
      plant: { tileRef: tileRefsPlants.DawnCelestialPlant, name: "Sunbriar", harvestType: harvestType.Multiple, secondsToMature: 1440 * 60, baseTileScale: 2.3 },
      crop: { tileRef: tileRefsPlants.DawnCelestial, name: "Sunbriar Bulb", baseSellPrice: 11e6, baseWeight: 6, baseTileScale: 0.4, maxScale: 2.5 }
    },
    MoonCelestial: {
      seed: { tileRef: tileRefsSeeds.MoonCelestial, name: "Mooncatcher Pod", coinPrice: 5e10, creditPrice: 1249, rarity: rarity.Celestial },
      plant: { tileRef: tileRefsPlants.MoonCelestialPlant, name: "Mooncatcher", harvestType: harvestType.Multiple, secondsToMature: 1440 * 60, baseTileScale: 2.5 },
      crop: { tileRef: tileRefsPlants.MoonCelestial, name: "Mooncatcher Bulb", baseSellPrice: 11e6, baseWeight: 2, baseTileScale: 0.4, maxScale: 2 }
    }
  };
  var mutationCatalog = {
    Gold: { name: "Gold", baseChance: 0.01, coinMultiplier: 25 },
    Rainbow: { name: "Rainbow", baseChance: 1e-3, coinMultiplier: 50 },
    Wet: { name: "Wet", baseChance: 0, coinMultiplier: 2, tileRef: tileRefsMutations.Wet },
    Chilled: { name: "Chilled", baseChance: 0, coinMultiplier: 2, tileRef: tileRefsMutations.Chilled },
    Frozen: { name: "Frozen", baseChance: 0, coinMultiplier: 10, tileRef: tileRefsMutations.Frozen },
    Dawnlit: { name: "Dawnlit", baseChance: 0, coinMultiplier: 2, tileRef: tileRefsMutations.Dawnlit },
    Ambershine: { name: "Amberlit", baseChance: 0, coinMultiplier: 5, tileRef: tileRefsMutations.Ambershine },
    Dawncharged: { name: "Dawn Radiant", baseChance: 0, coinMultiplier: 3, tileRef: tileRefsMutations.Dawncharged },
    Ambercharged: { name: "Amber Radiant", baseChance: 0, coinMultiplier: 6, tileRef: tileRefsMutations.Ambercharged }
  };
  var eggCatalog = {
    CommonEgg: { tileRef: tileRefsPets.CommonEgg, name: "Common Egg", coinPrice: 1e5, creditPrice: 19, rarity: rarity.Common, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 600, faunaSpawnWeights: { Worm: 60, Snail: 35, Bee: 5 } },
    UncommonEgg: { tileRef: tileRefsPets.UncommonEgg, name: "Uncommon Egg", coinPrice: 1e6, creditPrice: 48, rarity: rarity.Uncommon, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 3600, faunaSpawnWeights: { Chicken: 65, Bunny: 25, Dragonfly: 10 } },
    RareEgg: { tileRef: tileRefsPets.RareEgg, name: "Rare Egg", coinPrice: 1e7, creditPrice: 99, rarity: rarity.Rare, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 21600, faunaSpawnWeights: { Pig: 90, Cow: 10 } },
    LegendaryEgg: { tileRef: tileRefsPets.LegendaryEgg, name: "Legendary Egg", coinPrice: 1e8, creditPrice: 249, rarity: rarity.Legendary, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 43200, faunaSpawnWeights: { Squirrel: 60, Turtle: 30, Goat: 10 } },
    MythicalEgg: { tileRef: tileRefsPets.MythicalEgg, name: "Mythical Egg", coinPrice: 1e9, creditPrice: 599, rarity: rarity.Mythic, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 86400, faunaSpawnWeights: { Butterfly: 75, Capybara: 5, Peacock: 20 } }
  };
  var petCatalog = {
    Worm: {
      tileRef: tileRefsPets.Worm,
      name: "Worm",
      description: "",
      coinsToFullyReplenishHunger: 500,
      innateAbilityWeights: { SeedFinderI: 50, ProduceEater: 50 },
      baseTileScale: 0.6,
      maxScale: 2,
      maturitySellPrice: 5e3,
      matureWeight: 0.1,
      moveProbability: 0.1,
      hoursToMature: 12,
      rarity: rarity.Common,
      tileTransformOrigin: "bottom",
      nudgeY: 0.25,
      diet: ["Carrot", "Strawberry", "Aloe", "Tomato", "Apple"]
    },
    Snail: {
      tileRef: tileRefsPets.Snail,
      name: "Snail",
      description: "",
      coinsToFullyReplenishHunger: 1e3,
      innateAbilityWeights: { CoinFinderI: 100 },
      baseTileScale: 0.6,
      maxScale: 2,
      maturitySellPrice: 5e3,
      matureWeight: 0.15,
      moveProbability: 0.01,
      hoursToMature: 12,
      rarity: rarity.Common,
      tileTransformOrigin: "bottom",
      nudgeY: -0.25,
      diet: ["Blueberry", "Tomato", "Corn", "Daffodil"]
    },
    Bee: {
      tileRef: tileRefsPets.Bee,
      name: "Bee",
      coinsToFullyReplenishHunger: 1500,
      innateAbilityWeights: { ProduceScaleBoost: 50, ProduceMutationBoost: 50 },
      baseTileScale: 0.6,
      maxScale: 2.5,
      maturitySellPrice: 3e4,
      matureWeight: 0.2,
      moveProbability: 0.5,
      hoursToMature: 12,
      rarity: rarity.Common,
      diet: ["Strawberry", "Blueberry", "OrangeTulip", "Daffodil", "Lily"]
    },
    Chicken: {
      tileRef: tileRefsPets.Chicken,
      name: "Chicken",
      coinsToFullyReplenishHunger: 3e3,
      innateAbilityWeights: { EggGrowthBoost: 80, PetRefund: 20 },
      baseTileScale: 0.8,
      maxScale: 2,
      maturitySellPrice: 5e4,
      matureWeight: 3,
      moveProbability: 0.2,
      hoursToMature: 24,
      rarity: rarity.Uncommon,
      tileTransformOrigin: "bottom",
      nudgeY: -0.2,
      diet: ["Aloe", "Corn", "Watermelon", "Pumpkin"]
    },
    Bunny: {
      tileRef: tileRefsPets.Bunny,
      name: "Bunny",
      coinsToFullyReplenishHunger: 750,
      innateAbilityWeights: { CoinFinderII: 60, SellBoostI: 40 },
      baseTileScale: 0.7,
      maxScale: 2,
      maturitySellPrice: 75e3,
      matureWeight: 2,
      moveProbability: 0.3,
      hoursToMature: 24,
      rarity: rarity.Uncommon,
      tileTransformOrigin: "bottom",
      nudgeY: -0.2,
      diet: ["Carrot", "Strawberry", "Blueberry", "Echeveria"]
    },
    Dragonfly: {
      tileRef: tileRefsPets.Dragonfly,
      name: "Dragonfly",
      coinsToFullyReplenishHunger: 250,
      innateAbilityWeights: { HungerRestore: 70, PetMutationBoost: 30 },
      baseTileScale: 0.6,
      maxScale: 2.5,
      maturitySellPrice: 15e4,
      matureWeight: 0.2,
      moveProbability: 0.7,
      hoursToMature: 24,
      rarity: rarity.Uncommon,
      tileTransformOrigin: "center",
      diet: ["Apple", "OrangeTulip", "Echeveria"]
    },
    Pig: {
      tileRef: tileRefsPets.Pig,
      name: "Pig",
      coinsToFullyReplenishHunger: 5e4,
      innateAbilityWeights: { SellBoostII: 30, PetAgeBoost: 30, PetHatchSizeBoost: 30 },
      baseTileScale: 1,
      maxScale: 2.5,
      maturitySellPrice: 5e5,
      matureWeight: 200,
      moveProbability: 0.2,
      hoursToMature: 72,
      rarity: rarity.Rare,
      tileTransformOrigin: "bottom",
      nudgeY: -0.15,
      diet: ["Watermelon", "Pumpkin", "Mushroom", "Bamboo"]
    },
    Cow: {
      tileRef: tileRefsPets.Cow,
      name: "Cow",
      coinsToFullyReplenishHunger: 25e3,
      innateAbilityWeights: { SeedFinderII: 30, HungerBoost: 30, PlantGrowthBoost: 30 },
      baseTileScale: 1.1,
      maxScale: 2.5,
      maturitySellPrice: 1e6,
      matureWeight: 600,
      moveProbability: 0.1,
      hoursToMature: 72,
      rarity: rarity.Rare,
      tileTransformOrigin: "bottom",
      nudgeY: -0.15,
      diet: ["Coconut", "Banana", "BurrosTail", "Mushroom"]
    },
    Squirrel: {
      tileRef: tileRefsPets.Squirrel,
      name: "Squirrel",
      coinsToFullyReplenishHunger: 15e3,
      innateAbilityWeights: { CoinFinderIII: 70, SellBoostIII: 20, PetMutationBoostII: 10 },
      baseTileScale: 0.6,
      maxScale: 2,
      maturitySellPrice: 5e6,
      matureWeight: 0.5,
      moveProbability: 0.4,
      hoursToMature: 100,
      rarity: rarity.Legendary,
      tileTransformOrigin: "bottom",
      nudgeY: -0.1,
      diet: ["Pumpkin", "Banana", "Grape"]
    },
    Turtle: {
      tileRef: tileRefsPets.Turtle,
      name: "Turtle",
      coinsToFullyReplenishHunger: 1e5,
      innateAbilityWeights: { HungerRestoreII: 25, HungerBoostII: 25, PlantGrowthBoostII: 25, EggGrowthBoostII: 25 },
      baseTileScale: 1,
      maxScale: 2.5,
      maturitySellPrice: 1e7,
      matureWeight: 150,
      moveProbability: 0.05,
      hoursToMature: 100,
      rarity: rarity.Legendary,
      tileTransformOrigin: "bottom",
      nudgeY: -0.15,
      diet: ["Watermelon", "BurrosTail", "Bamboo", "Pepper"]
    },
    Goat: {
      tileRef: tileRefsPets.Goat,
      name: "Goat",
      coinsToFullyReplenishHunger: 2e4,
      innateAbilityWeights: { PetHatchSizeBoostII: 10, PetAgeBoostII: 40, PetXpBoost: 40 },
      baseTileScale: 1,
      maxScale: 2,
      maturitySellPrice: 2e7,
      matureWeight: 100,
      moveProbability: 0.2,
      hoursToMature: 100,
      rarity: rarity.Legendary,
      tileTransformOrigin: "bottom",
      nudgeY: -0.1,
      diet: ["Pumpkin", "Coconut", "Cactus", "Pepper"]
    },
    Butterfly: {
      tileRef: tileRefsPets.Butterfly,
      name: "Butterfly",
      coinsToFullyReplenishHunger: 25e3,
      innateAbilityWeights: { ProduceScaleBoostII: 40, ProduceMutationBoostII: 40, SeedFinderIII: 20 },
      baseTileScale: 0.6,
      maxScale: 2.5,
      maturitySellPrice: 5e7,
      matureWeight: 0.2,
      moveProbability: 0.6,
      hoursToMature: 144,
      rarity: rarity.Mythic,
      tileTransformOrigin: "center",
      diet: ["Daffodil", "Lily", "Grape", "Lemon", "Sunflower"]
    },
    Capybara: {
      tileRef: tileRefsPets.Capybara,
      name: "Capybara",
      coinsToFullyReplenishHunger: 15e4,
      innateAbilityWeights: { DoubleHarvest: 50, ProduceRefund: 50 },
      baseTileScale: 1,
      maxScale: 2.5,
      maturitySellPrice: 2e8,
      matureWeight: 50,
      moveProbability: 0.2,
      hoursToMature: 144,
      rarity: rarity.Mythic,
      tileTransformOrigin: "bottom",
      nudgeY: -0.1,
      diet: ["Lemon", "PassionFruit", "DragonFruit", "Lychee"]
    },
    Peacock: {
      tileRef: tileRefsPets.Peacock,
      name: "Peacock",
      coinsToFullyReplenishHunger: 1e5,
      innateAbilityWeights: { SellBoostIV: 40, PetXpBoostII: 50, PetRefundII: 10 },
      baseTileScale: 1.2,
      maxScale: 2.5,
      maturitySellPrice: 1e8,
      matureWeight: 5,
      moveProbability: 0.2,
      hoursToMature: 144,
      rarity: rarity.Mythic,
      tileTransformOrigin: "bottom",
      nudgeY: -0.1,
      diet: ["Cactus", "Sunflower", "Lychee"]
    }
  };
  var petAbilities = {
    ProduceScaleBoost: {
      name: "Crop Size Boost I",
      description: "Increases the scale of garden crops",
      trigger: "continuous",
      baseProbability: 0.3,
      baseParameters: { cropScaleIncreasePercentage: 6 }
    },
    ProduceScaleBoostII: {
      name: "Crop Size Boost II",
      description: "Increases the scale of garden crops",
      trigger: "continuous",
      baseProbability: 0.4,
      baseParameters: { cropScaleIncreasePercentage: 10 }
    },
    DoubleHarvest: {
      name: "Double Harvest",
      description: "Chance to duplicate harvested crops",
      trigger: "harvest",
      baseProbability: 5,
      baseParameters: {}
    },
    ProduceEater: {
      name: "Crop Eater",
      description: "Harvests non-mutated crops and sells them",
      trigger: "continuous",
      baseProbability: 60,
      baseParameters: { cropSellPriceIncreasePercentage: 150 }
    },
    SellBoostI: {
      name: "Sell Boost I",
      description: "Receive bonus coins when selling crops",
      trigger: "sellAllCrops",
      baseProbability: 10,
      baseParameters: { cropSellPriceIncreasePercentage: 20 }
    },
    SellBoostII: {
      name: "Sell Boost II",
      description: "Receive bonus coins when selling crops",
      trigger: "sellAllCrops",
      baseProbability: 12,
      baseParameters: { cropSellPriceIncreasePercentage: 30 }
    },
    SellBoostIII: {
      name: "Sell Boost III",
      description: "Receive bonus coins when selling crops",
      trigger: "sellAllCrops",
      baseProbability: 14,
      baseParameters: { cropSellPriceIncreasePercentage: 40 }
    },
    SellBoostIV: {
      name: "Sell Boost IV",
      description: "Receive bonus coins when selling crops",
      trigger: "sellAllCrops",
      baseProbability: 16,
      baseParameters: { cropSellPriceIncreasePercentage: 50 }
    },
    ProduceRefund: {
      name: "Crop Refund",
      description: "Chance to get crops back when selling",
      trigger: "sellAllCrops",
      baseProbability: 20,
      baseParameters: {}
    },
    PlantGrowthBoost: {
      name: "Plant Growth Boost I",
      description: "Reduces the time for plants to grow",
      trigger: "continuous",
      baseProbability: 24,
      baseParameters: { plantGrowthReductionMinutes: 3 }
    },
    PlantGrowthBoostII: {
      name: "Plant Growth Boost II",
      description: "Reduces the time for plants to grow",
      trigger: "continuous",
      baseProbability: 27,
      baseParameters: { plantGrowthReductionMinutes: 5 }
    },
    ProduceMutationBoost: {
      name: "Crop Mutation Boost I",
      description: "Increases the chance of garden crops gaining mutations",
      trigger: "continuous",
      baseParameters: { mutationChanceIncreasePercentage: 10 }
    },
    ProduceMutationBoostII: {
      name: "Crop Mutation Boost II",
      description: "Increases the chance of garden crops gaining mutations",
      trigger: "continuous",
      baseParameters: { mutationChanceIncreasePercentage: 15 }
    },
    PetMutationBoost: {
      name: "Pet Mutation Boost I",
      description: "Increases the chance of hatched pets gaining mutations",
      trigger: "hatchEgg",
      baseParameters: { mutationChanceIncreasePercentage: 7 }
    },
    PetMutationBoostII: {
      name: "Pet Mutation Boost II",
      description: "Increases the chance of hatched pets gaining mutations",
      trigger: "hatchEgg",
      baseParameters: { mutationChanceIncreasePercentage: 10 }
    },
    GoldGranter: {
      name: "Gold Granter",
      description: "Grants the Gold mutation to a garden crop",
      trigger: "continuous",
      baseProbability: 0.72,
      baseParameters: { grantedMutations: ["Gold"] }
    },
    RainbowGranter: {
      name: "Rainbow Granter",
      description: "Grants the Rainbow mutation to a garden crop",
      trigger: "continuous",
      baseProbability: 0.72,
      baseParameters: { grantedMutations: ["Rainbow"] }
    },
    EggGrowthBoost: {
      name: "Egg Growth Boost I",
      description: "Reduces the time for eggs to hatch",
      trigger: "continuous",
      baseProbability: 21,
      baseParameters: { eggGrowthTimeReductionMinutes: 7 }
    },
    EggGrowthBoostII: {
      name: "Egg Growth Boost II",
      description: "Reduces the time for eggs to hatch",
      trigger: "continuous",
      baseProbability: 24,
      baseParameters: { eggGrowthTimeReductionMinutes: 10 }
    },
    // NEW
    EggGrowthBoostIII: {
      name: "Egg Growth Boost III",
      description: "Reduces the time for eggs to hatch",
      trigger: "continuous",
      baseProbability: 27,
      baseParameters: { eggGrowthTimeReductionMinutes: 13 }
    },
    PetAgeBoost: {
      name: "Hatch XP Boost I",
      description: "Hatched pets start with bonus XP",
      trigger: "hatchEgg",
      baseProbability: 50,
      baseParameters: { bonusXp: 8e3 }
    },
    PetAgeBoostII: {
      name: "Hatch XP Boost II",
      description: "Hatched pets start with bonus XP",
      trigger: "hatchEgg",
      baseProbability: 60,
      baseParameters: { bonusXp: 12e3 }
    },
    PetHatchSizeBoost: {
      name: "Max Strength Boost I",
      description: "Increases the maximum strength of hatched pets",
      trigger: "hatchEgg",
      baseProbability: 12,
      baseParameters: { maxStrengthIncreasePercentage: 2.4 }
    },
    PetHatchSizeBoostII: {
      name: "Max Strength Boost II",
      description: "Increases the maximum strength of hatched pets",
      trigger: "hatchEgg",
      baseProbability: 14,
      baseParameters: { maxStrengthIncreasePercentage: 3.5 }
    },
    PetXpBoost: {
      name: "XP Boost I",
      description: "Gives bonus XP to active pets",
      trigger: "continuous",
      baseProbability: 30,
      baseParameters: { bonusXp: 300 }
    },
    PetXpBoostII: {
      name: "XP Boost II",
      description: "Gives bonus XP to active pets",
      trigger: "continuous",
      baseProbability: 35,
      baseParameters: { bonusXp: 400 }
    },
    HungerRestore: {
      name: "Hunger Restore I",
      description: "Restores the hunger of a random active pet",
      trigger: "continuous",
      baseProbability: 12,
      baseParameters: { hungerRestorePercentage: 30 }
    },
    // NEW
    HungerRestoreII: {
      name: "Hunger Restore II",
      description: "Restores the hunger of a random active pet",
      trigger: "continuous",
      baseProbability: 14,
      baseParameters: { hungerRestorePercentage: 35 }
    },
    HungerBoost: {
      name: "Hunger Boost I",
      description: "Reduces the hunger depletion rate of active pets",
      trigger: "continuous",
      baseParameters: { hungerDepletionRateDecreasePercentage: 12 }
    },
    HungerBoostII: {
      name: "Hunger Boost II",
      description: "Reduces the hunger depletion rate of active pets",
      trigger: "continuous",
      baseParameters: { hungerDepletionRateDecreasePercentage: 16 }
    },
    PetRefund: {
      name: "Pet Refund I",
      description: "Chance to receive the pet back as an egg when sold",
      trigger: "sellPet",
      baseProbability: 5,
      baseParameters: {}
    },
    // NEW
    PetRefundII: {
      name: "Pet Refund II",
      description: "Chance to receive the pet back as an egg when sold",
      trigger: "sellPet",
      baseProbability: 7,
      baseParameters: {}
    },
    Copycat: {
      name: "Copycat",
      description: "Chance to copy the ability of another active pet",
      trigger: "continuous",
      baseProbability: 1,
      baseParameters: {}
    },
    CoinFinderI: {
      name: "Coin Finder I",
      description: "Finds coins in your garden",
      trigger: "continuous",
      baseProbability: 35,
      baseParameters: { baseMaxCoinsFindable: 12e4 }
    },
    CoinFinderII: {
      name: "Coin Finder II",
      description: "Finds coins in your garden",
      trigger: "continuous",
      baseProbability: 13,
      baseParameters: { baseMaxCoinsFindable: 12e5 }
    },
    CoinFinderIII: {
      name: "Coin Finder III",
      description: "Finds coins in your garden",
      trigger: "continuous",
      baseProbability: 6,
      baseParameters: { baseMaxCoinsFindable: 1e7 }
    },
    SeedFinderI: {
      name: "Seed Finder I",
      description: "Finds common and uncommon seeds in your garden",
      trigger: "continuous",
      baseProbability: 40,
      baseParameters: {}
    },
    SeedFinderII: {
      name: "Seed Finder II",
      description: "Finds rare and legendary seeds in your garden",
      trigger: "continuous",
      baseProbability: 16,
      baseParameters: {}
    },
    SeedFinderIII: {
      name: "Seed Finder III",
      description: "Finds mythical seeds in your garden",
      trigger: "continuous",
      baseProbability: 9,
      baseParameters: {}
    },
    SeedFinderIV: {
      name: "Seed Finder IV",
      description: "Finds divine and celestial seeds in your garden",
      trigger: "continuous",
      baseProbability: 0.01,
      baseParameters: {}
    }
  };
  var toolCatalog = {
    WateringCan: {
      tileRef: tileRefsItems.WateringCan,
      name: "Watering Can",
      coinPrice: 5e3,
      creditPrice: 2,
      rarity: rarity.Common,
      description: "Speeds up growth of plant by 5 minutes. SINGLE USE.",
      isOneTimePurchase: false,
      baseTileScale: 0.6,
      maxInventoryQuantity: 99
    },
    PlanterPot: {
      tileRef: tileRefsItems.PlanterPot,
      name: "Planter Pot",
      coinPrice: 25e3,
      creditPrice: 5,
      rarity: rarity.Common,
      description: "Extract a plant to your inventory (can be replanted). SINGLE USE.",
      isOneTimePurchase: false,
      baseTileScale: 0.8
    },
    Shovel: {
      tileRef: tileRefsItems.Shovel,
      name: "Shovel",
      coinPrice: 1e6,
      creditPrice: 100,
      rarity: rarity.Uncommon,
      description: "Remove plants from your garden. UNLIMITED USES.",
      isOneTimePurchase: true,
      baseTileScale: 0.7
    },
    RainbowPotion: {
      tileRef: tileRefsItems.RainbowPotion,
      name: "Rainbow Potion",
      coinPrice: 1 / 0,
      creditPrice: 1 / 0,
      rarity: rarity.Celestial,
      description: "Adds the Rainbow mutation to a crop in your garden. SINGLE USE.",
      isOneTimePurchase: true,
      baseTileScale: 1
    }
  };
  var decorCatalog = {
    // Rochers
    SmallRock: {
      tileRef: tileRefsDecor.SmallRock,
      name: "Small Garden Rock",
      coinPrice: 1e3,
      creditPrice: 2,
      rarity: rarity.Common,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.3
    },
    MediumRock: {
      tileRef: tileRefsDecor.MediumRock,
      name: "Medium Garden Rock",
      coinPrice: 2500,
      creditPrice: 5,
      rarity: rarity.Common,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.21
    },
    LargeRock: {
      tileRef: tileRefsDecor.LargeRock,
      name: "Large Garden Rock",
      coinPrice: 5e3,
      creditPrice: 10,
      rarity: rarity.Common,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.1
    },
    // Bois
    WoodBench: {
      tileRef: tileRefsDecor.WoodBench,
      name: "Wood Bench",
      coinPrice: 1e4,
      creditPrice: 15,
      rarity: rarity.Common,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.3,
      avatarNudgeY: -0.18
    },
    WoodArch: {
      tileRef: tileRefsDecor.WoodArch,
      name: "Wood Arch",
      coinPrice: 2e4,
      creditPrice: 25,
      rarity: rarity.Common,
      baseTileScale: 1.53,
      isOneTimePurchase: false,
      nudgeY: -0.5
    },
    WoodBridge: {
      tileRef: tileRefsDecor.WoodBridge,
      name: "Wood Bridge",
      coinPrice: 4e4,
      creditPrice: 35,
      rarity: rarity.Common,
      baseTileScale: 1.22,
      isOneTimePurchase: false,
      nudgeY: -0.35,
      avatarNudgeY: -0.44
    },
    WoodLampPost: {
      tileRef: tileRefsDecor.WoodLampPost,
      name: "Wood Lamp Post",
      coinPrice: 8e4,
      creditPrice: 49,
      rarity: rarity.Common,
      baseTileScale: 1.5,
      isOneTimePurchase: false,
      nudgeY: -0.6
    },
    WoodOwl: {
      tileRef: tileRefsDecor.WoodOwl,
      name: "Wood Owl",
      coinPrice: 9e4,
      creditPrice: 59,
      rarity: rarity.Common,
      baseTileScale: 1.3,
      isOneTimePurchase: false,
      nudgeY: -0.4
    },
    WoodBirdhouse: {
      tileRef: tileRefsDecor.Birdhouse,
      name: "Wood Birdhouse",
      coinPrice: 1e5,
      creditPrice: 69,
      rarity: rarity.Common,
      baseTileScale: 1.5,
      isOneTimePurchase: false,
      nudgeY: -0.6
    },
    // Pierre
    StoneBench: {
      tileRef: tileRefsDecor.StoneBench,
      name: "Stone Bench",
      coinPrice: 1e6,
      creditPrice: 75,
      rarity: rarity.Uncommon,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.3,
      avatarNudgeY: -0.18
    },
    StoneArch: {
      tileRef: tileRefsDecor.StoneArch,
      name: "Stone Arch",
      coinPrice: 4e6,
      creditPrice: 124,
      rarity: rarity.Uncommon,
      baseTileScale: 1.53,
      isOneTimePurchase: false,
      nudgeY: -0.5
    },
    StoneBridge: {
      tileRef: tileRefsDecor.StoneBridge,
      name: "Stone Bridge",
      coinPrice: 5e6,
      creditPrice: 179,
      rarity: rarity.Uncommon,
      baseTileScale: 1.22,
      isOneTimePurchase: false,
      nudgeY: -0.35,
      avatarNudgeY: -0.44
    },
    StoneLampPost: {
      tileRef: tileRefsDecor.StoneLampPost,
      name: "Stone Lamp Post",
      coinPrice: 8e6,
      creditPrice: 199,
      rarity: rarity.Uncommon,
      baseTileScale: 1.5,
      isOneTimePurchase: false,
      nudgeY: -0.6
    },
    StoneGnome: {
      tileRef: tileRefsDecor.StoneGnome,
      name: "Stone Gnome",
      coinPrice: 9e6,
      creditPrice: 219,
      rarity: rarity.Uncommon,
      baseTileScale: 1.3,
      isOneTimePurchase: false,
      nudgeY: -0.4
    },
    StoneBirdbath: {
      tileRef: tileRefsDecor.StoneBirdbath,
      name: "Stone Birdbath",
      coinPrice: 1e7,
      creditPrice: 249,
      rarity: rarity.Uncommon,
      baseTileScale: 1.2,
      isOneTimePurchase: false,
      nudgeY: -0.46
    },
    // Marbre
    MarbleBench: {
      tileRef: tileRefsDecor.MarbleBench,
      name: "Marble Bench",
      coinPrice: 75e6,
      creditPrice: 349,
      rarity: rarity.Rare,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.3,
      avatarNudgeY: -0.18
    },
    MarbleArch: {
      tileRef: tileRefsDecor.MarbleArch,
      name: "Marble Arch",
      coinPrice: 1e8,
      creditPrice: 399,
      rarity: rarity.Rare,
      baseTileScale: 1.53,
      isOneTimePurchase: false,
      nudgeY: -0.5
    },
    MarbleBridge: {
      tileRef: tileRefsDecor.MarbleBridge,
      name: "Marble Bridge",
      coinPrice: 15e7,
      creditPrice: 429,
      rarity: rarity.Rare,
      baseTileScale: 1.22,
      isOneTimePurchase: false,
      nudgeY: -0.35,
      avatarNudgeY: -0.44
    },
    MarbleLampPost: {
      tileRef: tileRefsDecor.MarbleLampPost,
      name: "Marble Lamp Post",
      coinPrice: 2e8,
      creditPrice: 449,
      rarity: rarity.Rare,
      baseTileScale: 1.5,
      isOneTimePurchase: false,
      nudgeY: -0.6
    },
    MarbleBlobling: {
      tileRef: tileRefsDecor.MarbleBlobling,
      name: "Marble Blobling",
      coinPrice: 3e8,
      creditPrice: 499,
      rarity: rarity.Rare,
      baseTileScale: 1.5,
      isOneTimePurchase: false,
      nudgeY: -0.56
    },
    // Spéciaux
    MiniFairyCottage: {
      tileRef: tileRefsDecor.MiniFairyCottage,
      name: "Mini Fairy Cottage",
      coinPrice: 5e8,
      creditPrice: 549,
      rarity: rarity.Rare,
      baseTileScale: 1.1,
      isOneTimePurchase: false,
      nudgeY: -0.37
    },
    StrawScarecrow: {
      tileRef: tileRefsDecor.StrawScarecrow,
      name: "Straw Scarecrow",
      coinPrice: 1e9,
      creditPrice: 599,
      rarity: rarity.Legendary,
      baseTileScale: 1.8,
      isOneTimePurchase: false,
      nudgeY: -0.65
    },
    MiniFairyForge: {
      tileRef: tileRefsDecor.MiniFairyForge,
      name: "Mini Fairy Forge",
      coinPrice: 5e9,
      creditPrice: 979,
      rarity: rarity.Legendary,
      baseTileScale: 1,
      isOneTimePurchase: false,
      nudgeY: -0.3
    },
    MiniFairyKeep: {
      tileRef: tileRefsDecor.MiniFairyKeep,
      name: "Mini Fairy Keep",
      coinPrice: 25e9,
      creditPrice: 1249,
      rarity: rarity.Mythic,
      baseTileScale: 1.05,
      isOneTimePurchase: false,
      nudgeY: -0.33
    }
  };

  // src/services/fakeAtoms.ts
  var _fakeRegistry = /* @__PURE__ */ new Map();
  function _atomsByExactLabel(label2) {
    try {
      return findAtomsByLabel(new RegExp("^" + label2 + "$"));
    } catch {
      return [];
    }
  }
  function _findReadKey(atom) {
    if (atom && typeof atom.read === "function") return "read";
    for (const k of Object.keys(atom || {})) {
      const v = atom[k];
      if (typeof v === "function" && k !== "write" && k !== "onMount" && k !== "toString") {
        const ar = v.length;
        if (ar === 1 || ar === 2) return k;
      }
    }
    throw new Error("Impossible de localiser la fonction read() de l'atom");
  }
  function _getState(label2) {
    return _fakeRegistry.get(label2) || null;
  }
  async function _forceRepaintViaGate(gate) {
    if (!gate?.closeAction || !gate?.openAction) return;
    await gate.closeAction();
    await new Promise((r) => setTimeout(r, 0));
    await gate.openAction();
  }
  async function _ensureFakeInstalled(config) {
    const key2 = config.label;
    const existing = _fakeRegistry.get(key2);
    if (existing?.installed) return existing;
    const atoms = _atomsByExactLabel(config.label);
    if (!atoms.length) throw new Error(`${config.label} introuvable`);
    const state2 = existing ?? {
      config,
      enabled: false,
      payload: null,
      patched: /* @__PURE__ */ new Map(),
      installed: false
    };
    let gateAtom = null;
    if (config.gate?.label) gateAtom = getAtomByLabel(config.gate.label);
    for (const a of atoms) {
      const readKey = _findReadKey(a);
      const orig = a[readKey];
      a[readKey] = (get) => {
        try {
          if (gateAtom) get(gateAtom);
        } catch {
        }
        for (const dep of config.extraDeps || []) {
          try {
            const d = getAtomByLabel(dep);
            d && get(d);
          } catch {
          }
        }
        const real = orig(get);
        if (!state2.enabled || state2.payload == null) return real;
        return config.merge ? config.merge(real, state2.payload) : state2.payload;
      };
      state2.patched.set(a, { readKey, orig });
    }
    if (gateAtom && config.gate?.autoDisableOnClose) {
      state2.unsubGate = await jSub(gateAtom, async () => {
        let v;
        try {
          v = await jGet(gateAtom);
        } catch {
          v = null;
        }
        const isOpen = config.gate?.isOpen ? config.gate.isOpen(v) : !!v;
        if (!isOpen && state2.enabled) state2.enabled = false;
      });
    }
    state2.installed = true;
    _fakeRegistry.set(key2, state2);
    return state2;
  }
  async function fakeShow(config, payload, options) {
    await ensureStore();
    const st = await _ensureFakeInstalled(config);
    st.payload = payload;
    st.enabled = true;
    if (options?.merge && !config.merge) {
      config.merge = (_real, fake) => fake;
    }
    if (options?.openGate && config.gate?.openAction) await config.gate.openAction();
    if (st.autoTimer) {
      clearTimeout(st.autoTimer);
      st.autoTimer = null;
    }
    if (options?.autoRestoreMs && options.autoRestoreMs > 0) {
      st.autoTimer = setTimeout(() => {
        void fakeHide(config.label);
      }, options.autoRestoreMs);
    }
  }
  async function fakeHide(label2) {
    const st = _getState(label2);
    if (!st) return;
    st.enabled = false;
    st.payload = null;
    if (st.autoTimer) {
      clearTimeout(st.autoTimer);
      st.autoTimer = null;
    }
    await _forceRepaintViaGate(st.config.gate);
  }

  // src/services/fakeModal.ts
  async function openModal(modalId) {
    try {
      await Atoms.ui.activeModal.set(modalId);
    } catch {
    }
  }
  async function closeModal(_modalId) {
    try {
      await Atoms.ui.activeModal.set(null);
    } catch {
    }
  }
  function isModalOpen(value, modalId) {
    return value === modalId;
  }
  async function isModalOpenAsync(modalId) {
    try {
      const v = await Atoms.ui.activeModal.get();
      return isModalOpen(v, modalId);
    } catch {
      return false;
    }
  }
  async function waitModalClosed(modalId, timeoutMs = 12e4) {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      try {
        const v = await Atoms.ui.activeModal.get();
        if (!isModalOpen(v, modalId)) return true;
      } catch {
        return true;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }
  var SHARED_MYDATA_PATCH = {
    label: Atoms.data.myData.label,
    merge: (real, patch) => {
      const base = real && typeof real === "object" ? real : {};
      const add = patch && typeof patch === "object" ? patch : {};
      return { ...base, ...add };
    },
    gate: {
      label: Atoms.ui.activeModal.label,
      isOpen: (v) => v === "inventory" || v === "journal",
      autoDisableOnClose: true
    }
  };
  var INVENTORY_ATOM_PATCH = {
    label: Atoms.inventory.myInventory.label,
    merge: (_real, fake) => fake,
    gate: {
      label: Atoms.ui.activeModal.label,
      isOpen: (v) => v === "inventory",
      autoDisableOnClose: true
    }
  };
  var INVENTORY_MODAL_ID = "inventory";
  async function openInventoryPanel() {
    return openModal(INVENTORY_MODAL_ID);
  }
  async function closeInventoryPanel() {
    return closeModal(INVENTORY_MODAL_ID);
  }
  function isInventoryOpen(v) {
    return isModalOpen(v, INVENTORY_MODAL_ID);
  }
  async function isInventoryPanelOpen() {
    return isModalOpenAsync(INVENTORY_MODAL_ID);
  }
  async function waitInventoryPanelClosed(timeoutMs = 12e4) {
    return waitModalClosed(INVENTORY_MODAL_ID, timeoutMs);
  }
  async function fakeInventoryShow(payload, opts) {
    const shouldOpen = opts?.open !== false;
    await fakeShow(SHARED_MYDATA_PATCH, { inventory: payload }, {
      openGate: false,
      autoRestoreMs: opts?.autoRestoreMs
    });
    await fakeShow(INVENTORY_ATOM_PATCH, payload, {
      openGate: false,
      autoRestoreMs: opts?.autoRestoreMs
    });
    if (shouldOpen) await openInventoryPanel();
  }
  async function fakeInventoryHide() {
    await fakeHide(INVENTORY_ATOM_PATCH.label);
    await fakeHide(SHARED_MYDATA_PATCH.label);
    await closeInventoryPanel();
  }
  var JOURNAL_MODAL_ID = "journal";
  async function openJournalModal() {
    return openModal(JOURNAL_MODAL_ID);
  }
  async function isJournalModalOpen() {
    return isModalOpenAsync(JOURNAL_MODAL_ID);
  }
  async function waitJournalModalClosed(timeoutMs = 12e4) {
    return waitModalClosed(JOURNAL_MODAL_ID, timeoutMs);
  }
  async function fakeJournalShow(payload, opts) {
    const shouldOpen = opts?.open !== false;
    await fakeHide(INVENTORY_ATOM_PATCH.label);
    await fakeShow(SHARED_MYDATA_PATCH, { journal: payload ?? {} }, {
      openGate: false,
      autoRestoreMs: opts?.autoRestoreMs
    });
    if (shouldOpen) await openJournalModal();
  }

  // src/ui/menu.ts
  var Menu = class {
    constructor(opts = {}) {
      this.opts = opts;
      // NOTE: je rends root public pour pouvoir faire ui.root.appendChild(...) côté menus
      __publicField(this, "root");
      __publicField(this, "tabBar");
      __publicField(this, "views");
      __publicField(this, "tabs", /* @__PURE__ */ new Map());
      __publicField(this, "events", /* @__PURE__ */ new Map());
      __publicField(this, "currentId", null);
      __publicField(this, "lsKeyActive");
      __publicField(this, "_altDown", false);
      __publicField(this, "_hovering", false);
      __publicField(this, "_onKey", (e) => {
        const alt = e.altKey;
        if (alt !== this._altDown) {
          this._altDown = alt;
          this._updateAltCursor();
        }
      });
      __publicField(this, "_onBlur", () => {
        this._altDown = false;
        this._updateAltCursor();
      });
      __publicField(this, "_onEnter", () => {
        this._hovering = true;
        this._updateAltCursor();
      });
      __publicField(this, "_onLeave", () => {
        this._hovering = false;
        this._updateAltCursor();
      });
      this.lsKeyActive = `menu:${opts.id || "default"}:activeTab`;
    }
    /** Monte le menu dans un conteneur */
    mount(container) {
      this.ensureStyles();
      container.innerHTML = "";
      this.root = el("div", `qmm ${this.opts.classes || ""} ${this.opts.compact ? "qmm-compact" : ""}`);
      if (this.opts.startHidden) this.root.style.display = "none";
      this.tabBar = el("div", "qmm-tabs");
      this.views = el("div", "qmm-views");
      this.root.appendChild(this.tabBar);
      this.root.appendChild(this.views);
      container.appendChild(this.root);
      if (this.tabs.size) {
        for (const [id, def] of this.tabs) this.createTabView(id, def);
        this.restoreActive();
      }
      this.updateTabsBarVisibility();
      this.root.addEventListener("pointerenter", this._onEnter);
      this.root.addEventListener("pointerleave", this._onLeave);
      window.addEventListener("keydown", this._onKey, true);
      window.addEventListener("keyup", this._onKey, true);
      window.addEventListener("blur", this._onBlur);
      document.addEventListener("visibilitychange", this._onBlur);
      if (this.opts.startWindowHidden) this.setWindowVisible(false);
      this.emit("mounted");
    }
    /** Démonte le menu (optionnel) */
    unmount() {
      this.root?.removeEventListener("pointerenter", this._onEnter);
      this.root?.removeEventListener("pointerleave", this._onLeave);
      window.removeEventListener("keydown", this._onKey, true);
      window.removeEventListener("keyup", this._onKey, true);
      window.removeEventListener("blur", this._onBlur);
      document.removeEventListener("visibilitychange", this._onBlur);
      if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
      this.emit("unmounted");
    }
    /** Retourne l'élément fenêtre englobant (barre – / ×) */
    getWindowEl() {
      if (!this.root) return null;
      const sel = this.opts.windowSelector || ".qws-win";
      return this.root.closest(sel);
    }
    /** Affiche/masque la FENÊTRE (barre incluse) */
    setWindowVisible(visible) {
      const win = this.getWindowEl();
      if (!win) return;
      win.classList.toggle("is-hidden", !visible);
      this.emit(visible ? "window:show" : "window:hide");
    }
    /** Bascule l’état de la fenêtre. Retourne true si maintenant visible. */
    toggleWindow() {
      const win = this.getWindowEl();
      if (!win) return false;
      const willShow = win.classList.contains("is-hidden");
      this.setWindowVisible(willShow);
      return willShow;
    }
    /** Donne l’état courant de la fenêtre (true = visible) */
    isWindowVisible() {
      const win = this.getWindowEl();
      if (!win) return true;
      return !win.classList.contains("is-hidden") && getComputedStyle(win).display !== "none";
    }
    /** Affiche/masque le root */
    setVisible(visible) {
      if (!this.root) return;
      this.root.style.display = visible ? "" : "none";
      this.emit(visible ? "show" : "hide");
    }
    toggle() {
      if (!this.root) return false;
      const v = this.root.style.display === "none";
      this.setVisible(v);
      return v;
    }
    /** Ajoute un onglet (peut être appelé avant ou après mount) */
    addTab(id, title, render) {
      this.tabs.set(id, { title, render, badge: null });
      if (this.root) {
        this.createTabView(id, this.tabs.get(id));
        this.updateTabsBarVisibility();
      }
      return this;
    }
    /** Ajoute plusieurs onglets en une fois */
    addTabs(defs) {
      defs.forEach((d) => this.addTab(d.id, d.title, d.render));
      return this;
    }
    /** Met à jour le titre de l’onglet (ex: compteur, libellé) */
    setTabTitle(id, title) {
      const def = this.tabs.get(id);
      if (!def) return;
      def.title = title;
      if (def.btn) {
        const label2 = def.btn.querySelector(".label");
        if (label2) label2.textContent = title;
      }
    }
    /** Ajoute/retire un badge à droite du titre (ex: “3”, “NEW”, “!”) */
    setTabBadge(id, text) {
      const def = this.tabs.get(id);
      if (!def || !def.btn) return;
      if (!def.badge) {
        def.badge = document.createElement("span");
        def.badge.className = "badge";
        def.btn.appendChild(def.badge);
      }
      if (text == null || text === "") {
        def.badge.style.display = "none";
      } else {
        def.badge.textContent = text;
        def.badge.style.display = "";
      }
    }
    /** Force le re-render d’un onglet (ré-exécute son render) */
    refreshTab(id) {
      const def = this.tabs.get(id);
      if (!def?.view) return;
      const scroller = this.findScrollableAncestor(def.view);
      const st = scroller ? scroller.scrollTop : null;
      const sl = scroller ? scroller.scrollLeft : null;
      const activeId = document.activeElement?.id || null;
      def.view.innerHTML = "";
      try {
        def.render(def.view, this);
      } catch (e) {
        def.view.textContent = String(e);
      }
      if (this.currentId === id) this.switchTo(id);
      this.emit("tab:render", id);
      if (scroller && st != null) {
        requestAnimationFrame(() => {
          try {
            scroller.scrollTop = st;
            scroller.scrollLeft = sl ?? 0;
          } catch {
          }
          if (activeId) {
            const n = document.getElementById(activeId);
            if (n && n.focus) try {
              n.focus();
            } catch {
            }
          }
        });
      }
    }
    findScrollableAncestor(start) {
      function isScrollable(el3) {
        const s = getComputedStyle(el3);
        const oy = s.overflowY || s.overflow;
        return /(auto|scroll)/.test(oy) && el3.scrollHeight > el3.clientHeight;
      }
      let el2 = start;
      while (el2) {
        if (isScrollable(el2)) return el2;
        el2 = el2.parentElement;
      }
      return document.querySelector(".qws-win");
    }
    firstTabId() {
      const it = this.tabs.keys().next();
      return it.done ? null : it.value ?? null;
    }
    _updateAltCursor() {
      if (!this.root) return;
      this.root.classList.toggle("qmm-alt-drag", this._altDown && this._hovering);
    }
    /** Récupère la vue DOM d’un onglet (pratique pour updates ciblées) */
    getTabView(id) {
      return this.tabs.get(id)?.view ?? null;
    }
    /** Retire un onglet */
    removeTab(id) {
      const def = this.tabs.get(id);
      if (!def) return;
      this.tabs.delete(id);
      const btn = this.tabBar?.querySelector(`button[data-id="${cssq(id)}"]`);
      if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
      if (def.view && def.view.parentElement) def.view.parentElement.removeChild(def.view);
      if (this.currentId === id) {
        const first = this.tabs.keys().next().value || null;
        this.switchTo(first);
      }
      this.updateTabsBarVisibility();
    }
    /** Active un onglet (id=null => affiche toutes les vues) */
    switchTo(id) {
      this.currentId = id;
      [...this.tabBar.children].forEach((ch) => ch.classList.toggle("active", ch.dataset.id === id || id === null));
      [...this.views.children].forEach((ch) => ch.classList.toggle("active", ch.dataset.id === id || id === null));
      this.persistActive();
      this.emit("tab:change", id);
    }
    /** Événements */
    on(event, handler) {
      if (!this.events.has(event)) this.events.set(event, /* @__PURE__ */ new Set());
      this.events.get(event).add(handler);
      return () => this.off(event, handler);
    }
    off(event, handler) {
      this.events.get(event)?.delete(handler);
    }
    emit(event, ...args) {
      this.events.get(event)?.forEach((h) => {
        try {
          h(...args);
        } catch {
        }
      });
    }
    // ---------- Helpers UI publics (réutilisables dans tes tabs) ----------
    btn(label2, onClick) {
      const b = el("button", "qmm-btn", `<span class="label">${escapeHtml(label2)}</span>`);
      b.onclick = onClick;
      return b;
    }
    label(text) {
      const l = el("label", "qmm-label");
      l.textContent = text;
      return l;
    }
    row(...children) {
      const r = el("div", "qmm-row");
      children.forEach((c) => r.appendChild(c));
      return r;
    }
    section(title) {
      const s = el("div", "qmm-section");
      s.appendChild(el("div", "qmm-section-title", escapeHtml(title)));
      return s;
    }
    inputNumber(min = 0, max = 9999, step = 1, value = 0) {
      const wrap = el("div", "qmm-input-number");
      const i = el("input", "qmm-input qmm-input-number-input");
      i.type = "number";
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(value);
      i.inputMode = "numeric";
      const spin = el("div", "qmm-spin");
      const up = el("button", "qmm-step qmm-step--up", "\u25B2");
      const down = el("button", "qmm-step qmm-step--down", "\u25BC");
      up.type = down.type = "button";
      const clamp = () => {
        const n = Number(i.value);
        if (Number.isFinite(n)) {
          const lo = Number(i.min), hi = Number(i.max);
          const clamped = Math.max(lo, Math.min(hi, n));
          if (clamped !== n) i.value = String(clamped);
        }
      };
      const bump = (dir) => {
        if (dir < 0) i.stepDown();
        else i.stepUp();
        clamp();
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const addSpin = (btn, dir) => {
        let pressTimer = null;
        let repeatTimer = null;
        let suppressNextClick = false;
        const start = (ev) => {
          suppressNextClick = false;
          pressTimer = window.setTimeout(() => {
            suppressNextClick = true;
            bump(dir);
            repeatTimer = window.setInterval(() => bump(dir), 60);
          }, 300);
          btn.setPointerCapture?.(ev.pointerId);
        };
        const stop = () => {
          if (pressTimer != null) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
          if (repeatTimer != null) {
            clearInterval(repeatTimer);
            repeatTimer = null;
          }
        };
        btn.addEventListener("pointerdown", start);
        ["pointerup", "pointercancel", "pointerleave", "blur"].forEach(
          (ev) => btn.addEventListener(ev, stop)
        );
        btn.addEventListener("click", (e) => {
          if (suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            suppressNextClick = false;
            return;
          }
          bump(dir);
        });
      };
      addSpin(up, 1);
      addSpin(down, -1);
      i.addEventListener("change", clamp);
      spin.append(up, down);
      wrap.append(i, spin);
      i.wrap = wrap;
      return i;
    }
    inputText(placeholder = "", value = "") {
      const i = el("input", "qmm-input");
      i.type = "text";
      i.placeholder = placeholder;
      i.value = value;
      return i;
    }
    checkbox(checked = false) {
      const i = el("input", "qmm-check");
      i.type = "checkbox";
      i.checked = checked;
      return i;
    }
    radio(name, value, checked = false) {
      const i = el("input", "qmm-radio");
      i.type = "radio";
      i.name = name;
      i.value = value;
      i.checked = checked;
      return i;
    }
    slider(min = 0, max = 100, step = 1, value = 0) {
      const i = el("input", "qmm-range");
      i.type = "range";
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(value);
      return i;
    }
    switch(checked = false) {
      const i = this.checkbox(checked);
      i.classList.add("qmm-switch");
      return i;
    }
    // Helpers “tableau simple” pour lister les items
    table(headers, opts) {
      const wrap = document.createElement("div");
      wrap.className = "qmm-table-wrap";
      if (opts?.minimal) wrap.classList.add("qmm-table-wrap--minimal");
      const scroller = document.createElement("div");
      scroller.className = "qmm-table-scroll";
      if (opts?.maxHeight) scroller.style.maxHeight = opts.maxHeight;
      wrap.appendChild(scroller);
      const t = document.createElement("table");
      t.className = "qmm-table";
      if (opts?.minimal) t.classList.add("qmm-table--minimal");
      if (opts?.compact) t.classList.add("qmm-table--compact");
      if (opts?.fixed) t.style.tableLayout = "fixed";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      headers.forEach((h) => {
        const th = document.createElement("th");
        if (typeof h === "string") {
          th.textContent = h;
        } else {
          th.textContent = h.label ?? "";
          if (h.align) th.classList.add(`is-${h.align}`);
          if (h.width) th.style.width = h.width;
        }
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      const tbody = document.createElement("tbody");
      t.append(thead, tbody);
      scroller.appendChild(t);
      return { root: wrap, tbody };
    }
    radioGroup(name, options, selected, onChange) {
      const wrap = el("div", "qmm-radio-group");
      for (const { value, label: label2 } of options) {
        const r = this.radio(name, value, selected === value);
        const lab = document.createElement("label");
        lab.className = "qmm-radio-label";
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(label2));
        r.onchange = () => {
          if (r.checked) onChange(value);
        };
        wrap.appendChild(lab);
      }
      return wrap;
    }
    /** Bind LS: sauvegarde automatique via toStr/parse */
    bindLS(key2, read, write, parse, toStr) {
      try {
        const raw = localStorage.getItem(key2);
        if (raw != null) write(parse(raw));
      } catch {
      }
      return { save: () => {
        try {
          localStorage.setItem(key2, toStr(read()));
        } catch {
        }
      } };
    }
    /* -------------------------- split2 helper -------------------------- */
    /** Crée un layout 2 colonnes (gauche/droite) en CSS Grid.
     *  leftWidth: ex "200px" | "18rem" | "minmax(160px, 30%)" */
    split2(leftWidth = "260px") {
      const root = el("div", "qmm-split");
      root.style.gridTemplateColumns = "minmax(160px, max-content) 1fr";
      const left = el("div", "qmm-split-left");
      const right = el("div", "qmm-split-right");
      root.appendChild(left);
      root.appendChild(right);
      return { root, left, right };
    }
    /* -------------------------- VTabs factory -------------------------- */
    /** Crée des “tabs verticaux” génériques (liste sélectionnable + filtre). */
    vtabs(options = {}) {
      return new VTabs(this, options);
    }
    hotkeyButton(initial, onChange, opts) {
      const emptyLabel = opts?.emptyLabel ?? "None";
      const listeningLabel = opts?.listeningLabel ?? "Press a key\u2026";
      const clearable = opts?.clearable ?? true;
      let hk = initial ?? null;
      let recording = false;
      if (opts?.storageKey) {
        try {
          hk = stringToHotkey(localStorage.getItem(opts.storageKey) || "") ?? initial ?? null;
        } catch {
        }
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qmm-hotkey";
      btn.setAttribute("aria-live", "polite");
      const render = () => {
        btn.classList.toggle("is-recording", recording);
        btn.classList.toggle("is-empty", !hk);
        if (recording) {
          btn.textContent = listeningLabel;
          btn.title = "Listening\u2026 press a key (Esc to cancel, Backspace to clear)";
        } else if (!hk) {
          btn.textContent = emptyLabel;
          btn.title = "No key assigned";
        } else {
          btn.textContent = hotkeyToString(hk);
          btn.title = "Click to rebind \u2022 Right-click to clear";
        }
      };
      const stopRecording = (commit) => {
        recording = false;
        if (!commit) {
          render();
          return;
        }
        render();
      };
      const save = () => {
        if (opts?.storageKey) {
          const str = hotkeyToString(hk);
          try {
            if (str) localStorage.setItem(opts.storageKey, str);
            else localStorage.removeItem(opts.storageKey);
          } catch {
          }
        }
        onChange?.(hk, opts?.storageKey ? hotkeyToString(hk) : void 0);
      };
      const handleKeyDown = (e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          stopRecording(false);
          window.removeEventListener("keydown", handleKeyDown, true);
          return;
        }
        if ((e.key === "Backspace" || e.key === "Delete") && clearable) {
          hk = null;
          save();
          stopRecording(true);
          window.removeEventListener("keydown", handleKeyDown, true);
          return;
        }
        const next = eventToHotkey(e);
        if (!next) {
          return;
        }
        hk = next;
        save();
        stopRecording(true);
        window.removeEventListener("keydown", handleKeyDown, true);
      };
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!recording) {
          recording = true;
          render();
          window.addEventListener("keydown", handleKeyDown, true);
          btn.focus();
        }
      });
      if (clearable) {
        btn.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (hk) {
            hk = null;
            save();
            render();
          }
        });
      }
      render();
      return btn;
    }
    // ---------- internes ----------
    createTabView(id, def) {
      const b = document.createElement("button");
      b.className = "qmm-tab";
      b.dataset.id = id;
      b.innerHTML = `<span class="label">${escapeHtml(def.title)}</span><span class="badge" style="display:none"></span>`;
      const badgeEl = b.querySelector(".badge");
      def.btn = b;
      def.badge = badgeEl;
      b.onclick = () => this.switchTo(id);
      this.tabBar.appendChild(b);
      const view = el("div", "qmm-view");
      view.dataset.id = id;
      def.view = view;
      this.views.appendChild(view);
      try {
        def.render(view, this);
      } catch (e) {
        view.textContent = String(e);
      }
      if (!this.currentId) this.switchTo(id);
    }
    persistActive() {
      if (!this.currentId) return;
      try {
        localStorage.setItem(this.lsKeyActive, this.currentId);
      } catch {
      }
    }
    restoreActive() {
      let id = null;
      try {
        id = localStorage.getItem(this.lsKeyActive);
      } catch {
      }
      if (id && this.tabs.has(id)) this.switchTo(id);
      else if (this.tabs.size) this.switchTo(this.firstTabId());
    }
    updateTabsBarVisibility() {
      if (!this.tabBar || !this.root) return;
      const hasTabs = this.tabs.size > 0;
      if (hasTabs) {
        if (!this.tabBar.parentElement) {
          this.root.insertBefore(this.tabBar, this.views);
        }
        this.tabBar.style.display = "flex";
        this.root.classList.remove("qmm-no-tabs");
      } else {
        if (this.tabBar.parentElement) {
          this.tabBar.parentElement.removeChild(this.tabBar);
        }
        this.root.classList.add("qmm-no-tabs");
      }
    }
    ensureStyles() {
      if (document.getElementById("__qmm_css__")) return;
      const css = `
    /* ================= Modern UI for qmm ================= */
.qmm{
  --qmm-bg:        #0f1318;
  --qmm-bg-soft:   #0b0f13;
  --qmm-panel:     #111823cc;
  --qmm-border:    #ffffff22;
  --qmm-border-2:  #ffffff14;
  --qmm-accent:    #7aa2ff;
  --qmm-accent-2:  #92b2ff;
  --qmm-text:      #e7eef7;
  --qmm-text-dim:  #b9c3cf;
  --qmm-shadow:    0 6px 20px rgba(0,0,0,.35);
  --qmm-blur:      8px;

  display:flex; flex-direction:column; gap:10px; color:var(--qmm-text);
}
.qmm-compact{ gap:6px }

/* ---------- Tabs (pill + underline) ---------- */
.qmm-tabs{
  display:flex; gap:6px; flex-wrap:wrap; align-items:flex-end;
  padding:0 6px 2px 6px; position:relative; isolation:isolate;
  border-bottom:1px solid var(--qmm-border);
  background:linear-gradient(180deg, rgba(255,255,255,.04), transparent);
  border-top-left-radius:10px; border-top-right-radius:10px;
}
.qmm-no-tabs .qmm-views{ margin-top:0 }

.qmm-tab{
  flex:1 1 0; min-width:0; cursor:pointer;
  display:inline-flex; justify-content:center; align-items:center; gap:8px;
  padding:8px 12px; color:var(--qmm-text);
  background:transparent; border:1px solid transparent; border-bottom:none;
  border-top-left-radius:10px; border-top-right-radius:10px;
  position:relative; margin:0; margin-bottom:-1px;
  transition:background .18s ease, color .18s ease, box-shadow .18s ease, transform .12s ease;
}
.qmm-compact .qmm-tab{ padding:6px 10px }
.qmm-tab:hover{ background:rgba(255,255,255,.06) }
.qmm-tab:active{ transform:translateY(1px) }
.qmm-tab:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px; border-radius:10px }

.qmm-tab .badge{
  font-size:11px; line-height:1; padding:2px 6px; border-radius:999px;
  background:#ffffff1a; border:1px solid #ffffff22;
}

.qmm-tab.active{
  background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
  color:#fff; box-shadow:inset 0 -1px 0 #0007;
}
.qmm-tab.active::after{
  content:""; position:absolute; left:10%; right:10%; bottom:-1px; height:2px;
  background:linear-gradient(90deg, transparent, var(--qmm-accent), transparent);
  border-radius:2px; box-shadow:0 0 12px var(--qmm-accent-2);
}

/* ---------- Views panel ---------- */
.qmm-views{
  border:1px solid var(--qmm-border); border-radius:12px; padding:12px;
  background:var(--qmm-panel); backdrop-filter:blur(var(--qmm-blur));
  display:flex; flex-direction:column;
  min-width:0; min-height:0; overflow:auto; box-shadow:var(--qmm-shadow);
}
.qmm-compact .qmm-views{ padding:8px }
.qmm-tabs + .qmm-views{ margin-top:-1px }

.qmm-view{ display:none; min-width:0; min-height:0; }
.qmm-view.active{ display:block; }

/* ---------- Basic controls ---------- */
.qmm-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:6px 0 }
.qmm-section{ margin-top:8px }
.qmm-section-title{ font-weight:650; margin:2px 0 8px 0; color:var(--qmm-text) }

.qmm-label{ opacity:.9 }
.qmm-val{ min-width:24px; text-align:center }

/* Buttons */
.qmm-btn{
  cursor:pointer; border-radius:10px; border:1px solid var(--qmm-border);
  padding:8px 12px; background:linear-gradient(180deg, #ffffff10, #ffffff06);
  color:#fff; box-shadow:0 1px 0 #000 inset, 0 1px 16px rgba(0,0,0,.2);
  transition:transform .1s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
}
.qmm-compact .qmm-btn{ padding:6px 10px }
.qmm-btn:hover{ background:linear-gradient(180deg, #ffffff16, #ffffff08); border-color:#ffffff40 }
.qmm-btn:active{ transform:translateY(1px) }
.qmm-btn:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px; }

/* Button variants (optional utility) */
.qmm-btn.qmm-primary{ background:linear-gradient(180deg, rgba(122,162,255,.35), rgba(122,162,255,.15)); border-color:#9db7ff55 }
.qmm-btn.qmm-danger{  background:linear-gradient(180deg, rgba(255,86,86,.28), rgba(255,86,86,.12));  border-color:#ff6a6a55 }
.qmm-btn.active{
  background:#79a6ff22;
  border-color:#79a6ff66;
  box-shadow: inset 0 0 0 1px #79a6ff33;
}

/* Inputs */
.qmm-input{
  min-width:90px; background:rgba(0,0,0,.42); color:#fff;
  border:1px solid var(--qmm-border); border-radius:10px;
  padding:8px 10px; box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  transition:border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
.qmm-input::placeholder{ color:#cbd6e780 }
.qmm-input:focus{ outline:none; border-color:var(--qmm-accent); background:#0f1521; box-shadow:0 0 0 2px #7aa2ff33 }

/* Number input + spinner (unchanged API) */
.qmm-input-number{ display:inline-flex; align-items:center; gap:6px }
.qmm-input-number-input{ width:70px; text-align:center; padding-right:8px }
.qmm-spin{ display:inline-flex; flex-direction:column; gap:2px }
.qmm-step{
  width:22px; height:16px; font-size:11px; line-height:1;
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:6px; border:1px solid var(--qmm-border);
  background:rgba(255,255,255,.08); color:#fff; cursor:pointer; user-select:none;
  transition:background .18s ease, border-color .18s ease, transform .08s ease;
}
.qmm-step:hover{ background:#ffffff18; border-color:#ffffff40 }
.qmm-step:active{ transform:translateY(1px) }

/* Switch (checkbox) */
.qmm-switch{
  appearance:none; width:42px; height:24px; background:#6c7488aa; border-radius:999px;
  position:relative; outline:none; cursor:pointer; transition:background .18s ease, box-shadow .18s ease;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
}
.qmm-switch::before{
  content:""; position:absolute; top:2px; left:2px; width:20px; height:20px;
  background:#fff; border-radius:50%; transition:transform .2s ease;
  box-shadow:0 2px 8px rgba(0,0,0,.35);
}
.qmm-switch:checked{ background:linear-gradient(180deg, rgba(122,162,255,.9), rgba(122,162,255,.6)) }
.qmm-switch:checked::before{ transform:translateX(18px) }
.qmm-switch:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px }

/* Checkbox & radio (native inputs skinned lightly) */
.qmm-check, .qmm-radio{ transform:scale(1.1); accent-color: var(--qmm-accent) }

/* Slider */
.qmm-range{
  width:180px; appearance:none; background:transparent; height:22px;
}
.qmm-range:focus{ outline:none }
.qmm-range::-webkit-slider-runnable-track{
  height:6px; background:linear-gradient(90deg, var(--qmm-accent), #7aa2ff44);
  border-radius:999px; box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
}
.qmm-range::-moz-range-track{
  height:6px; background:linear-gradient(90deg, var(--qmm-accent), #7aa2ff44);
  border-radius:999px; box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
}
.qmm-range::-webkit-slider-thumb{
  appearance:none; width:16px; height:16px; border-radius:50%; margin-top:-5px;
  background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.35), 0 0 0 2px #ffffff66 inset;
  transition:transform .1s ease;
}
.qmm-range:active::-webkit-slider-thumb{ transform:scale(1.04) }
.qmm-range::-moz-range-thumb{
  width:16px; height:16px; border-radius:50%; background:#fff; border:none;
  box-shadow:0 2px 10px rgba(0,0,0,.35), 0 0 0 2px #ffffff66 inset;
}

/* ---------- Minimal table ---------- */
/* container */
.qmm-table-wrap--minimal{
  border:1px solid #263040; border-radius:8px; background:#0b0f14; box-shadow:none;
}
/* scroller (height cap) */
.qmm-table-scroll{
  overflow:auto; max-height:44vh; /* override via opts.maxHeight */
}

/* base */
.qmm-table--minimal{
  width:100%;
  border-collapse:collapse;
  background:transparent;
  font-size:13px; line-height:1.35; color:var(--qmm-text, #cdd6e3);
}

/* header */
.qmm-table--minimal thead th{
  position:sticky; top:0; z-index:1;
  text-align:left; font-weight:600;
  padding:8px 10px;
  color:#cbd5e1; background:#0f1318;
  border-bottom:1px solid #263040;
  text-transform:none; letter-spacing:0;
}
.qmm-table--minimal thead th.is-center { text-align: center; }
.qmm-table--minimal thead th.is-left   { text-align: left; }   /* d\xE9j\xE0 pr\xE9sent, ok */
.qmm-table--minimal thead th.is-right  { text-align: right; }
.qmm-table--minimal thead th,
.qmm-table--minimal td { vertical-align: middle; }

/* cells */
.qmm-table--minimal td{
  padding:8px 10px; border-bottom:1px solid #1f2937; vertical-align:middle;
}
.qmm-table--minimal tbody tr:hover{ background:#0f1824; }

/* compact variant */
.qmm-table--compact thead th,
.qmm-table--compact td{ padding:6px 8px; font-size:12px }

/* utils */
.qmm-table--minimal td.is-num{ text-align:right; font-variant-numeric:tabular-nums }
.qmm-table--minimal td.is-center{ text-align:center }
.qmm-ellipsis{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.qmm-prewrap{ white-space:pre-wrap; word-break:break-word }


/* ---------- Split panels ---------- */
.qmm-split{
  display:grid; gap:12px;
  grid-template-columns:minmax(180px,260px) minmax(0,1fr);
  align-items:start;
}
.qmm-split-left{ display:flex; flex-direction:column; gap:10px }
.qmm-split-right{
  border:1px solid var(--qmm-border); border-radius:12px; padding:12px;
  display:flex; flex-direction:column; gap:12px;
  background:var(--qmm-panel); backdrop-filter:blur(var(--qmm-blur));
  box-shadow:var(--qmm-shadow);
}

/* ---------- VTabs (vertical list + filter) ---------- */
.qmm-vtabs{ display:flex; flex-direction:column; gap:8px; min-width:0 }
.qmm-vtabs .filter{ display:block }
.qmm-vtabs .filter input{ width:100% }

.qmm-vlist{
  flex:0 0 auto; overflow:visible;
  border:1px solid var(--qmm-border); border-radius:12px; padding:6px;
  background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}

.qmm-vtab{
  width:100%; text-align:left; cursor:pointer;
  display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:10px;
  padding:8px 10px; border-radius:10px; border:1px solid #ffffff18;
  background:rgba(255,255,255,.03); color:inherit;
  transition:background .18s ease, border-color .18s ease, transform .08s ease;
}
.qmm-vtab:hover{ background:rgba(255,255,255,.07); border-color:#ffffff34 }
.qmm-vtab:active{ transform:translateY(1px) }
.qmm-vtab.active{
  background:linear-gradient(180deg, rgba(122,162,255,.18), rgba(122,162,255,.08));
  border-color:#9db7ff55;
  box-shadow:0 1px 14px rgba(122,162,255,.18) inset;
}

.qmm-dot{ width:10px; height:10px; border-radius:50%; justify-self:center; box-shadow:0 0 0 1px #0006 inset }
.qmm-chip{ display:flex; align-items:center; gap:8px; min-width:0 }
.qmm-chip img{
  width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid #4446;
  box-shadow:0 1px 0 rgba(255,255,255,.08) inset;
}
.qmm-chip .t{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.qmm-tag{
  font-size:11px; line-height:1; padding:3px 7px; border-radius:999px;
  background:#ffffff14; border:1px solid #ffffff26;
}

/* ---------- Small helpers (optional) ---------- */
.qmm .qmm-card{
  border:1px solid var(--qmm-border); border-radius:12px; padding:12px;
  background:var(--qmm-panel); backdrop-filter:blur(var(--qmm-blur)); box-shadow:var(--qmm-shadow);
}
  .qmm .qmm-help{ font-size:12px; color:var(--qmm-text-dim) }
  .qmm .qmm-sep{ height:1px; background:var(--qmm-border); width:100%; opacity:.6; }

/* ta poign\xE9e, inchang\xE9 */
.qmm-grab { margin-left:auto; opacity:.8; cursor:grab; user-select:none; }
.qmm-grab:active { cursor:grabbing; }
.qmm-dragging { opacity:.6; }

/* items animables */
.qmm-team-item {
  will-change: transform;
  transition: transform 160ms ease;
}
.qmm-team-item.drag-ghost {
  opacity: .4;
}

.qmm.qmm-alt-drag { cursor: grab; }
.qmm.qmm-alt-drag:active { cursor: grabbing; }

.qws-win.is-hidden { display: none !important; }

.qmm-hotkey{
  cursor:pointer; user-select:none;
  border:1px solid var(--qmm-border); border-radius:10px;
  padding:8px 12px;
  background:linear-gradient(180deg, #ffffff10, #ffffff06);
  color:var(--qmm-text);
  box-shadow:0 1px 0 #000 inset, 0 1px 16px rgba(0,0,0,.18);
  transition:
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease,
    transform .08s ease,
    color .18s ease;
}
.qmm-hotkey{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  white-space:nowrap;
  width: var(--qmm-hotkey-w, 180px); 
}
.qmm-hotkey:hover{ background:linear-gradient(180deg, #ffffff16, #ffffff08); border-color:#ffffff40 }
.qmm-hotkey:active{ transform:translateY(1px) }

.qmm-hotkey:focus-visible{ outline:none }

.qmm-hotkey.is-empty{
  color:var(--qmm-text-dim);
  font-style:italic;
}

.qmm-hotkey.is-recording{
  outline:2px solid var(--qmm-accent);
  outline-offset:2px;
  border-color: var(--qmm-accent);
  background:linear-gradient(180deg, rgba(122,162,255,.25), rgba(122,162,255,.10));
  animation: qmm-hotkey-breathe 1.2s ease-in-out infinite;
}
  
@keyframes qmm-hotkey-breathe{
  0%   { box-shadow: 0 0 0 0 rgba(122,162,255,.55), 0 1px 16px rgba(0,0,0,.25); }
  60%  { box-shadow: 0 0 0 12px rgba(122,162,255,0), 0 1px 16px rgba(0,0,0,.25); }
  100% { box-shadow: 0 0 0 0 rgba(122,162,255,0),  0 1px 16px rgba(0,0,0,.25); }
}
    `;
      const st = document.createElement("style");
      st.id = "__qmm_css__";
      st.textContent = css;
      (document.documentElement || document.body).appendChild(st);
    }
  };
  var VTabs = class {
    constructor(api, opts = {}) {
      this.api = api;
      this.opts = opts;
      __publicField(this, "root");
      __publicField(this, "filterWrap", null);
      __publicField(this, "filterInput", null);
      __publicField(this, "list");
      __publicField(this, "items", []);
      __publicField(this, "selectedId", null);
      __publicField(this, "onSelectCb");
      __publicField(this, "renderItemCustom");
      __publicField(this, "emptyText");
      this.root = el("div", "qmm-vtabs");
      this.root.style.minWidth = "0";
      this.emptyText = opts.emptyText || "Aucun \xE9l\xE9ment.";
      this.renderItemCustom = opts.renderItem;
      if (opts.filterPlaceholder) {
        this.filterWrap = el("div", "filter");
        this.filterInput = document.createElement("input");
        this.filterInput.type = "search";
        this.filterInput.placeholder = opts.filterPlaceholder;
        this.filterInput.className = "qmm-input";
        this.filterInput.oninput = () => this.renderList();
        this.filterWrap.appendChild(this.filterInput);
        this.root.appendChild(this.filterWrap);
      }
      this.list = el("div", "qmm-vlist");
      this.list.style.minWidth = "0";
      if (opts.maxHeightPx) {
        this.list.style.maxHeight = `${opts.maxHeightPx}px`;
        this.list.style.overflow = "auto";
        this.list.style.flex = "1 1 auto";
      }
      this.root.appendChild(this.list);
      this.selectedId = opts.initialId ?? null;
      this.onSelectCb = opts.onSelect;
    }
    setItems(items) {
      this.items = Array.isArray(items) ? items.slice() : [];
      if (this.selectedId && !this.items.some((i) => i.id === this.selectedId)) {
        this.selectedId = this.items[0]?.id ?? null;
      }
      this.renderList();
    }
    getSelected() {
      return this.items.find((i) => i.id === this.selectedId) ?? null;
    }
    select(id) {
      this.selectedId = id;
      this.renderList();
      this.onSelectCb?.(this.selectedId, this.getSelected());
    }
    onSelect(cb) {
      this.onSelectCb = cb;
    }
    setBadge(id, text) {
      const btn = this.list.querySelector(`button[data-id="${cssq(id)}"]`);
      if (!btn) return;
      let tag = btn.querySelector(".qmm-tag");
      if (!tag && text != null) {
        tag = el("span", "qmm-tag");
        btn.appendChild(tag);
      }
      if (!tag) return;
      if (text == null || text === "") tag.style.display = "none";
      else {
        tag.textContent = text;
        tag.style.display = "";
      }
    }
    getFilter() {
      return (this.filterInput?.value || "").trim().toLowerCase();
    }
    renderList() {
      const keepScroll = this.list.scrollTop;
      this.list.innerHTML = "";
      const q = this.getFilter();
      const filtered = q ? this.items.filter((it) => (it.title || "").toLowerCase().includes(q) || (it.subtitle || "").toLowerCase().includes(q)) : this.items;
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.opacity = "0.75";
        empty.textContent = this.emptyText;
        this.list.appendChild(empty);
        return;
      }
      const ul = document.createElement("ul");
      ul.style.listStyle = "none";
      ul.style.margin = "0";
      ul.style.padding = "0";
      ul.style.display = "flex";
      ul.style.flexDirection = "column";
      ul.style.gap = "4px";
      for (const it of filtered) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "qmm-vtab";
        btn.dataset.id = it.id;
        btn.disabled = !!it.disabled;
        if (this.renderItemCustom) {
          this.renderItemCustom(it, btn);
        } else {
          const dot = el("div", "qmm-dot");
          dot.style.background = it.statusColor || "#999a";
          const chip = el("div", "qmm-chip");
          const img = document.createElement("img");
          img.src = it.avatarUrl || "";
          img.alt = it.title;
          const wrap = document.createElement("div");
          wrap.style.display = "flex";
          wrap.style.flexDirection = "column";
          wrap.style.gap = "2px";
          const t = el("div", "t");
          t.textContent = it.title;
          const sub = document.createElement("div");
          sub.textContent = it.subtitle || "";
          sub.style.opacity = "0.7";
          sub.style.fontSize = "12px";
          if (!it.subtitle) sub.style.display = "none";
          wrap.appendChild(t);
          wrap.appendChild(sub);
          chip.appendChild(img);
          chip.appendChild(wrap);
          btn.appendChild(dot);
          btn.appendChild(chip);
          if (it.badge != null) {
            const tag = el("span", "qmm-tag", escapeHtml(String(it.badge)));
            btn.appendChild(tag);
          } else {
            const spacer = document.createElement("div");
            spacer.style.width = "0";
            btn.appendChild(spacer);
          }
        }
        btn.classList.toggle("active", it.id === this.selectedId);
        btn.onclick = () => this.select(it.id);
        li.appendChild(btn);
        ul.appendChild(li);
      }
      this.list.appendChild(ul);
      this.list.scrollTop = keepScroll;
    }
  };
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function cssq(s) {
    return s.replace(/"/g, '\\"');
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
  var _MOD_CODES = /* @__PURE__ */ new Set([
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight"
  ]);
  function eventToHotkey(e) {
    if (_MOD_CODES.has(e.code) || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
      return null;
    }
    return {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };
  }
  function matchHotkey(e, h) {
    if (!h) return false;
    if (!!h.ctrl !== e.ctrlKey) return false;
    if (!!h.shift !== e.shiftKey) return false;
    if (!!h.alt !== e.altKey) return false;
    if (!!h.meta !== e.metaKey) return false;
    return e.code === h.code;
  }
  function hotkeyToString(hk) {
    if (!hk) return "";
    const parts = [];
    if (hk.ctrl) parts.push("Ctrl");
    if (hk.shift) parts.push("Shift");
    if (hk.alt) parts.push("Alt");
    if (hk.meta) parts.push("Meta");
    if (hk.code) parts.push(hk.code);
    return parts.join("+");
  }
  function stringToHotkey(s) {
    if (!s) return null;
    const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const code = parts.pop() || "";
    const hk = { code };
    for (const p of parts) {
      const P = p.toLowerCase();
      if (P === "ctrl" || P === "control") hk.ctrl = true;
      else if (P === "shift") hk.shift = true;
      else if (P === "alt") hk.alt = true;
      else if (P === "meta" || P === "cmd" || P === "command") hk.meta = true;
    }
    return hk.code ? hk : null;
  }

  // src/services/pets.ts
  var LS_TEAMS_KEY = "qws:pets:teams:v1";
  var LS_TEAM_SEARCH_KEY = "qws:pets:teamSearch:v1";
  var LS_TEAM_HK_PREFIX = "qws:hk:petteam:use:";
  var TEAM_HK_MAP = /* @__PURE__ */ new Map();
  var hkKeyForTeam = (id) => `${LS_TEAM_HK_PREFIX}${id}`;
  function setTeamsForHotkeys(teams) {
    TEAM_HK_MAP.clear();
    for (const t of teams) {
      const hk = stringToHotkey(localStorage.getItem(hkKeyForTeam(t.id)) || "");
      if (hk) TEAM_HK_MAP.set(t.id, hk);
    }
  }
  function refreshTeamFromLS(teamId) {
    const hk = stringToHotkey(localStorage.getItem(hkKeyForTeam(teamId)) || "");
    if (hk) TEAM_HK_MAP.set(teamId, hk);
    else TEAM_HK_MAP.delete(teamId);
  }
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(LS_TEAM_HK_PREFIX)) return;
    const teamId = e.key.slice(LS_TEAM_HK_PREFIX.length);
    refreshTeamFromLS(teamId);
  });
  function shouldIgnoreKeydown(e) {
    const el2 = e.target;
    if (!el2) return false;
    return el2.isContentEditable || el2.tagName === "INPUT" || el2.tagName === "TEXTAREA" || el2.tagName === "SELECT";
  }
  function installPetTeamHotkeysOnce(onUseTeam) {
    const FLAG = "__qws_pet_team_hk_installed";
    if (window[FLAG]) return;
    window.addEventListener(
      "keydown",
      (e) => {
        if (shouldIgnoreKeydown(e)) return;
        for (const [teamId, hk] of TEAM_HK_MAP) {
          if (matchHotkey(e, hk)) {
            e.preventDefault();
            e.stopPropagation();
            onUseTeam(teamId);
            break;
          }
        }
      },
      true
    );
    window[FLAG] = true;
  }
  var _AB = petAbilities ?? {};
  function _abilityName(id) {
    const key2 = String(id ?? "");
    const raw = typeof _AB?.[key2]?.name === "string" && _AB[key2].name.trim() ? _AB[key2].name : key2;
    return String(raw);
  }
  function _abilityNameWithoutLevel(id) {
    const key2 = String(id ?? "");
    const raw = typeof _AB?.[key2]?.name === "string" && _AB[key2].name.trim() ? _AB[key2].name : key2;
    return String(raw).replace(/(?:\s+|-)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*$/, "").trim();
  }
  function _parseTeamSearch(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(ab|sp):\s*(.*)$/i);
    if (!m) return { mode: "text", value: s };
    return { mode: m[1].toLowerCase() === "ab" ? "ability" : "species", value: (m[2] || "").trim() };
  }
  async function _abilityNameToPresentIds(name) {
    await _ensureInventoryWatchersStarted();
    const target = String(name || "").toLowerCase().trim().replace(/(?:\s+|-)?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, "");
    const ids = /* @__PURE__ */ new Set();
    if (!target) return ids;
    for (const p of _invPetsCache) {
      const abs = Array.isArray(p.abilities) ? p.abilities : [];
      for (const id of abs) {
        if (_abilityNameWithoutLevel(id).toLowerCase() === target) {
          ids.add(id);
        }
      }
    }
    return ids;
  }
  function _matchesQuery(p, q) {
    if (!q) return true;
    return _s(p.id).includes(q) || _s(p.petSpecies).includes(q) || _s(p.name).includes(q) || Array.isArray(p.abilities) && p.abilities.some((a) => _s(a).includes(q) || _s(_abilityName(a)).includes(q)) || Array.isArray(p.mutations) && p.mutations.some((m) => _s(m).includes(q));
  }
  async function _favoriteIdsSafe() {
    try {
      const fav = await Atoms.inventory.favoriteIds.get().catch(() => []);
      return fav.slice();
    } catch {
      return [];
    }
  }
  function _canonicalSpecies(s) {
    if (!s) return s;
    if (petCatalog[s]) return s;
    const t = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return petCatalog[t] ? t : s;
  }
  function _invPetToRawItem(p) {
    return {
      id: p.id,
      itemType: "Pet",
      petSpecies: _canonicalSpecies(p.petSpecies),
      name: p.name ?? null,
      xp: p.xp,
      hunger: p.hunger,
      mutations: Array.isArray(p.mutations) ? p.mutations.slice() : [],
      targetScale: p.targetScale,
      abilities: Array.isArray(p.abilities) ? p.abilities.slice() : []
    };
  }
  async function clearHandSelection() {
    try {
      await Atoms.inventory.setSelectedIndexToEnd.set(null);
    } catch {
    }
    try {
      await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
    } catch {
    }
    try {
      await PlayerService.setSelectedItem(null);
    } catch {
    }
    try {
      await PlayerService.dropObject();
    } catch {
    }
  }
  async function _waitValidatedInventoryIndex(timeoutMs = 2e4) {
    await clearHandSelection();
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      try {
        const modalVal = await Atoms.ui.activeModal.get();
        if (!isInventoryOpen(modalVal)) return null;
      } catch {
        return null;
      }
      try {
        const v = await Atoms.inventory.myValidatedSelectedItemIndex.get();
        if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
      } catch {
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }
  function loadTeams() {
    try {
      const raw = localStorage.getItem(LS_TEAMS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((t) => ({
        id: String(t?.id || ""),
        name: String(t?.name || "Team"),
        slots: Array.isArray(t?.slots) ? t.slots.slice(0, 3).map((x) => x ? String(x) : null) : [null, null, null]
      })).filter((t) => t.id);
    } catch {
      return [];
    }
  }
  function saveTeams(arr) {
    try {
      localStorage.setItem(LS_TEAMS_KEY, JSON.stringify(arr));
    } catch {
    }
  }
  function _uid() {
    try {
      return crypto.randomUUID();
    } catch {
      return `t_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
    }
  }
  var _teams = loadTeams();
  var _teamSubs = /* @__PURE__ */ new Set();
  function _notifyTeams() {
    const snap = _teams.slice();
    _teamSubs.forEach((fn) => {
      try {
        fn(snap);
      } catch {
      }
    });
  }
  function _loadTeamSearchMap() {
    try {
      const raw = localStorage.getItem(LS_TEAM_SEARCH_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }
  function _saveTeamSearchMap(map2) {
    try {
      localStorage.setItem(LS_TEAM_SEARCH_KEY, JSON.stringify(map2));
    } catch {
    }
  }
  var _teamSearch = _loadTeamSearchMap();
  var _teamSearchSubs = /* @__PURE__ */ new Set();
  function _notifyTeamSearch(teamId) {
    const q = _teamSearch[teamId] || "";
    _teamSearchSubs.forEach((fn) => {
      try {
        fn(teamId, q);
      } catch {
      }
    });
  }
  var _s = (v) => (v ?? "").toLowerCase();
  var _sOpt = (v) => typeof v === "string" ? v : null;
  var _n = (v) => Number.isFinite(v) ? v : 0;
  var _sArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  var _invRaw = null;
  var _activeRaw = [];
  var _invPetsCache = [];
  var _invSubs = /* @__PURE__ */ new Set();
  var _invUnsub = null;
  var _activeUnsub = null;
  var _invSig = null;
  var _activeSig = null;
  function _inventoryItemToPet(x) {
    if (!x || x.itemType !== "Pet") return null;
    const id = _s(x.id);
    if (!id) return null;
    return {
      id,
      itemType: "Pet",
      petSpecies: _s(x.petSpecies ?? x.data?.petSpecies),
      name: _sOpt(x.name ?? x.data?.name ?? null),
      xp: _n(x.xp ?? x.data?.xp),
      hunger: _n(x.hunger ?? x.data?.hunger),
      mutations: _sArr(x.mutations ?? x.data?.mutations),
      targetScale: Number.isFinite(x.targetScale ?? x.data?.targetScale) ? Number(x.targetScale ?? x.data?.targetScale) : void 0,
      abilities: _sArr(x.abilities ?? x.data?.abilities)
    };
  }
  function _activeSlotToPet(entry) {
    const slot = entry?.slot;
    if (!slot || typeof slot !== "object") return null;
    const id = _s(slot.id);
    if (!id) return null;
    return {
      id,
      itemType: "Pet",
      petSpecies: _s(slot.petSpecies),
      name: _sOpt(slot.name ?? null),
      xp: _n(slot.xp),
      hunger: _n(slot.hunger),
      mutations: _sArr(slot.mutations),
      targetScale: Number.isFinite(slot.targetScale) ? Number(slot.targetScale) : void 0,
      abilities: _sArr(slot.abilities)
    };
  }
  function _petSigStableNoXpNoHunger(p) {
    return JSON.stringify({
      id: p.id,
      itemType: "Pet",
      petSpecies: p.petSpecies,
      name: p.name ?? null,
      mutations: Array.isArray(p.mutations) ? p.mutations : [],
      targetScale: Number.isFinite(p.targetScale) ? p.targetScale : null,
      abilities: Array.isArray(p.abilities) ? p.abilities : []
    });
  }
  function _buildInvSigFromInventory(inv) {
    const out = /* @__PURE__ */ new Map();
    const items = Array.isArray(inv?.items) ? inv.items : Array.isArray(inv) ? inv : [];
    for (const it of items) {
      const p = _inventoryItemToPet(it);
      if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
    }
    return out;
  }
  function _buildActiveSig(list) {
    const out = /* @__PURE__ */ new Map();
    const arr = Array.isArray(list) ? list : [];
    for (const e of arr) {
      const p = _activeSlotToPet(e);
      if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
    }
    return out;
  }
  function _mapsEqual(a, b) {
    if (!a) return false;
    if (a.size !== b.size) return false;
    for (const [k, v] of b) if (a.get(k) !== v) return false;
    return true;
  }
  function _rebuildInvPets() {
    const map2 = /* @__PURE__ */ new Map();
    const items = Array.isArray(_invRaw?.items) ? _invRaw.items : Array.isArray(_invRaw) ? _invRaw : [];
    for (const it of items) {
      const p = _inventoryItemToPet(it);
      if (p && p.id) map2.set(p.id, p);
    }
    const act = Array.isArray(_activeRaw) ? _activeRaw : [];
    for (const e of act) {
      const p = _activeSlotToPet(e);
      if (p && p.id) map2.set(p.id, p);
    }
    _invPetsCache = Array.from(map2.values());
    const snap = _invPetsCache.slice();
    _invSubs.forEach((fn) => {
      try {
        fn(snap);
      } catch {
      }
    });
  }
  async function _startInventoryWatcher() {
    const unsub = await (async () => {
      try {
        const cur2 = await Atoms.inventory.myInventory.get();
        _invSig = _buildInvSigFromInventory(cur2);
        _invRaw = cur2;
        _rebuildInvPets();
      } catch {
      }
      return Atoms.inventory.myInventory.onChange((inv) => {
        const nextSig = _buildInvSigFromInventory(inv);
        if (_mapsEqual(_invSig, nextSig)) return;
        _invSig = nextSig;
        _invRaw = inv;
        _rebuildInvPets();
      });
    })();
    _invUnsub = () => {
      try {
        unsub();
      } catch {
      }
    };
  }
  async function _startActivePetsWatcher() {
    const unsub = await (async () => {
      try {
        const cur2 = await Atoms.pets.myPetInfos.get();
        _activeSig = _buildActiveSig(cur2);
        _activeRaw = Array.isArray(cur2) ? cur2 : [];
        _rebuildInvPets();
      } catch {
      }
      return Atoms.pets.myPetInfos.onChange((list) => {
        const nextSig = _buildActiveSig(list);
        if (_mapsEqual(_activeSig, nextSig)) return;
        _activeSig = nextSig;
        _activeRaw = Array.isArray(list) ? list : [];
        _rebuildInvPets();
      });
    })();
    _activeUnsub = () => {
      try {
        unsub();
      } catch {
      }
    };
  }
  async function _ensureInventoryWatchersStarted() {
    if (!_invUnsub) {
      await _startInventoryWatcher();
    }
    if (!_activeUnsub) {
      await _startActivePetsWatcher();
    }
    if (!_invPetsCache.length) {
      try {
        const [inv, active] = await Promise.all([
          Atoms.inventory.myInventory.get(),
          Atoms.pets.myPetInfos.get()
        ]);
        _invSig = _buildInvSigFromInventory(inv);
        _activeSig = _buildActiveSig(active);
        _invRaw = inv;
        _activeRaw = Array.isArray(active) ? active : [];
        _rebuildInvPets();
      } catch {
      }
    }
  }
  var PetsService = {
    getPets() {
      return PlayerService.getPets();
    },
    onPetsChange(cb) {
      return PlayerService.onPetsChange(cb);
    },
    onPetsChangeNow(cb) {
      return PlayerService.onPetsChangeNow(cb);
    },
    getAbilityName(id) {
      return _abilityName(id);
    },
    getAbilityNameWithoutLevel(id) {
      return _abilityNameWithoutLevel(id);
    },
    getAbilityInfo(id) {
      const key2 = String(id ?? "");
      const def = _AB?.[key2];
      return def ? { id: key2, ...def } : null;
    },
    async chooseSlotPet(teamId, slotIndex, searchOverride) {
      const idx = Math.max(0, Math.min(2, Math.floor(slotIndex || 0)));
      const team = this.getTeamById(teamId);
      if (!team) return null;
      const exclude = /* @__PURE__ */ new Set();
      team.slots.forEach((id, i) => {
        if (i !== idx && id) exclude.add(String(id));
      });
      const payload = searchOverride && searchOverride.trim().length ? await this.buildFilteredInventoryByQuery(searchOverride, { excludeIds: exclude }) : await this.buildFilteredInventoryForTeam(teamId, { excludeIds: exclude });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) {
        return null;
      }
      await fakeInventoryShow(payload, { open: true });
      const selIndex = await _waitValidatedInventoryIndex(2e4);
      await closeInventoryPanel();
      if (selIndex == null || selIndex < 0 || selIndex >= items.length) {
        return null;
      }
      const chosenPet = _inventoryItemToPet(items[selIndex]);
      if (!chosenPet) return null;
      const next = team.slots.slice(0, 3);
      next[idx] = String(chosenPet.id);
      this.saveTeam({ id: team.id, slots: next });
      try {
        await clearHandSelection();
      } catch {
      }
      return chosenPet;
    },
    async pickPetViaFakeInventory(search) {
      const payload = await this.buildFilteredInventoryByQuery(search || "");
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) return null;
      await fakeInventoryShow(payload, { open: true });
      const selIndex = await _waitValidatedInventoryIndex(2e4);
      await closeInventoryPanel();
      if (selIndex == null || selIndex < 0 || selIndex >= items.length) return null;
      await clearHandSelection();
      return _inventoryItemToPet(items[selIndex]);
    },
    setTeamsOrder(ids) {
      const byId = new Map(this._teams.map((t) => [t.id, t]));
      const next = [];
      for (const id of ids) {
        const t = byId.get(id);
        if (t) {
          next.push(t);
          byId.delete(id);
        }
      }
      for (const rest of byId.values()) next.push(rest);
      this._teams = next;
      saveTeams(this._teams);
      this._notifyTeamSubs();
    },
    async buildFilteredInventoryForTeam(teamId, opts) {
      await _ensureInventoryWatchersStarted();
      const { mode, value } = _parseTeamSearch(this.getTeamSearch(teamId) || "");
      let list = await this.getInventoryPets();
      if (mode === "ability" && value) {
        const idSet = await _abilityNameToPresentIds(value);
        list = idSet.size ? list.filter((p) => Array.isArray(p.abilities) && p.abilities.some((a) => idSet.has(a))) : [];
      } else if (mode === "species" && value) {
        const vv = value.toLowerCase();
        list = list.filter((p) => (p.petSpecies || "").toLowerCase() === vv);
      } else if (value) {
        list = list.filter((p) => _matchesQuery(p, value));
      }
      if (opts?.excludeIds?.size) {
        const ex = opts.excludeIds;
        list = list.filter((p) => !ex.has(p.id));
      }
      const items = list.map(_invPetToRawItem);
      const favAll = await _favoriteIdsSafe();
      const keep = new Set(list.map((p) => p.id));
      const favoritedItemIds = favAll.filter((id) => keep.has(id));
      return { items, favoritedItemIds };
    },
    async buildFilteredInventoryByQuery(query, opts) {
      await _ensureInventoryWatchersStarted();
      const q = (query || "").toLowerCase().trim();
      let list = await this.getInventoryPets();
      list = list.filter((p) => _matchesQuery(p, q));
      if (opts?.excludeIds?.size) {
        const ex = opts.excludeIds;
        list = list.filter((p) => !ex.has(p.id));
      }
      const items = list.map(_invPetToRawItem);
      const favAll = await _favoriteIdsSafe();
      const keep = new Set(list.map((p) => p.id));
      const favoritedItemIds = favAll.filter((id) => keep.has(id));
      return { items, favoritedItemIds };
    },
    /* --------------------------------- UI-less team APIs -------------------------------- */
    _teams: loadTeams(),
    _teamSubs: /* @__PURE__ */ new Set(),
    _notifyTeamSubs() {
      const snap = this.getTeams();
      this._teamSubs.forEach((fn) => {
        try {
          fn(snap);
        } catch {
        }
      });
    },
    getTeams() {
      return Array.isArray(this._teams) ? this._teams.map((t) => ({ ...t, slots: t.slots.slice(0, 3) })) : [];
    },
    onTeamsChange(cb) {
      this._teamSubs.add(cb);
      try {
        cb(this.getTeams());
      } catch {
      }
      return () => {
        this._teamSubs.delete(cb);
      };
    },
    async onTeamsChangeNow(cb) {
      const unsub = this.onTeamsChange(cb);
      try {
        cb(this.getTeams());
      } catch {
      }
      return unsub;
    },
    createTeam(name) {
      const t = { id: _uid(), name: name?.trim() || `Team ${this._teams.length + 1}`, slots: [null, null, null] };
      this._teams.push(t);
      saveTeams(this._teams);
      this._notifyTeamSubs();
      return t;
    },
    duplicateTeam(teamId) {
      const src = this._teams.find((t) => t.id === teamId);
      if (!src) return null;
      const copy = {
        id: _uid(),
        name: `${src.name} (copy)`,
        slots: src.slots.slice(0, 3)
      };
      this._teams.push(copy);
      saveTeams(this._teams);
      this._notifyTeamSubs();
      return copy;
    },
    deleteTeam(teamId) {
      const i = this._teams.findIndex((t) => t.id === teamId);
      if (i < 0) return false;
      this._teams.splice(i, 1);
      saveTeams(this._teams);
      this._notifyTeamSubs();
      return true;
    },
    saveTeam(patch) {
      const i = this._teams.findIndex((t) => t.id === patch.id);
      if (i < 0) return null;
      const cur2 = this._teams[i];
      const next = {
        id: cur2.id,
        name: typeof patch.name === "string" ? patch.name : cur2.name,
        slots: Array.isArray(patch.slots) ? patch.slots.slice(0, 3) : cur2.slots
      };
      this._teams[i] = next;
      saveTeams(this._teams);
      this._notifyTeamSubs();
      return next;
    },
    updateTeam(teamId, patch) {
      const idx = _teams.findIndex((t) => t.id === teamId);
      if (idx < 0) return null;
      const cur2 = _teams[idx];
      const next = {
        ...cur2,
        ...patch,
        slots: patch.slots ? [...patch.slots] : cur2.slots
      };
      _teams[idx] = next;
      saveTeams(_teams);
      _notifyTeams();
      return next;
    },
    getTeamSearch(teamId) {
      return _teamSearch[teamId] || "";
    },
    setTeamSearch(teamId, q) {
      _teamSearch[teamId] = (q || "").trim();
      _saveTeamSearchMap(_teamSearch);
      _notifyTeamSearch(teamId);
    },
    onTeamSearchChange(cb) {
      _teamSearchSubs.add(cb);
      return () => {
        _teamSearchSubs.delete(cb);
      };
    },
    getTeamById(teamId) {
      const t = this._teams.find((t2) => t2.id === teamId) || null;
      return t ? { ...t, slots: t.slots.slice(0, 3) } : null;
    },
    async getTeamSlotOptions(teamId, slotIndex) {
      await _ensureInventoryWatchersStarted();
      const team = this.getTeamById(teamId);
      const filtered = await this.getTeamFilteredInventoryPets(teamId);
      if (!team) return filtered;
      const idx = Math.max(0, Math.min(2, Math.floor(slotIndex)));
      const current = team.slots[idx] || null;
      const taken = /* @__PURE__ */ new Set();
      team.slots.forEach((id, i) => {
        if (i !== idx && id) taken.add(id);
      });
      let visible = filtered.filter((p) => !taken.has(p.id));
      if (current && !visible.some((p) => p.id === current)) {
        const cur2 = _invPetsCache.find((p) => p.id === current);
        if (cur2) visible = [cur2, ...visible];
      }
      return visible;
    },
    async getTeamFilteredInventoryPets(teamId) {
      await _ensureInventoryWatchersStarted();
      const { mode, value } = _parseTeamSearch(this.getTeamSearch(teamId) || "");
      let list = _invPetsCache.slice();
      if (mode === "ability" && value) {
        const idSet = await _abilityNameToPresentIds(value);
        return idSet.size ? list.filter((p) => p.abilities?.some((a) => idSet.has(a))) : [];
      }
      if (mode === "species" && value) {
        const vv = value.toLowerCase();
        return list.filter((p) => (p.petSpecies || "").toLowerCase() === vv);
      }
      if (value) return list.filter((p) => _matchesQuery(p, value));
      return list;
    },
    //* ============================ Ability Logs (for "Logs" tab) ============================ */
    _logs: [],
    _logsMax: 500,
    _seenPerfByPet: /* @__PURE__ */ new Map(),
    // petId -> last performedAt pushed
    _logSubs: /* @__PURE__ */ new Set(),
    _logsCutoffMs: 0,
    _logsCutoffSkewMs: 1500,
    /** Starts the watcher on myPetSlotInfos and feeds the ring buffer. */
    async startAbilityLogsWatcher() {
      await _ensureInventoryWatchersStarted();
      const indexInfosByPetId = (list) => {
        const out = {};
        const arr = Array.isArray(list) ? list : [];
        for (const e of arr) {
          const id = String(e?.slot?.id ?? e?.id ?? "");
          if (id) out[id] = e;
        }
        return out;
      };
      let myInfosMap = {};
      try {
        const curInfos = await Atoms.pets.myPetInfos.get();
        myInfosMap = indexInfosByPetId(curInfos);
      } catch {
      }
      let stopInfos = null;
      try {
        stopInfos = await Atoms.pets.myPetInfos.onChange((list) => {
          try {
            myInfosMap = indexInfosByPetId(list);
          } catch {
          }
        });
      } catch {
      }
      const extractFlat = (src) => {
        const out = {};
        if (!src || typeof src !== "object") return out;
        const obj = src;
        for (const petId of Object.keys(obj)) {
          const entry = obj[petId] ?? {};
          const lat = entry.lastAbilityTrigger ?? null;
          let rawH = entry.hungerPct ?? entry.hunger_percentage ?? entry.hunger ?? entry.stats?.hungerPct ?? entry.stats?.hunger?.pct ?? entry.stats?.hunger?.percent ?? null;
          if (rawH == null) {
            const info = myInfosMap[petId];
            rawH = info?.hungerPct ?? info?.hunger_percentage ?? info?.hunger ?? info?.slot?.hungerPct ?? info?.slot?.hunger ?? info?.stats?.hungerPct ?? info?.stats?.hunger?.pct ?? info?.stats?.hunger?.percent ?? null;
          }
          let hungerPct = Number.isFinite(Number(rawH)) ? Number(rawH) : null;
          if (hungerPct != null && hungerPct > 0 && hungerPct <= 1) hungerPct *= 100;
          out[petId] = {
            petId,
            abilityId: lat?.abilityId ?? null,
            performedAt: Number.isFinite(lat?.performedAt) ? lat.performedAt : null,
            data: lat?.data ?? null,
            position: entry.position ?? null,
            hungerPct
          };
        }
        return out;
      };
      try {
        const cur2 = await Atoms.pets.myPetSlotInfos.get();
        this._ingestAbilityMap(extractFlat(cur2));
      } catch {
      }
      const stopSlots = await Atoms.pets.myPetSlotInfos.onChange((src) => {
        try {
          this._ingestAbilityMap(extractFlat(src));
        } catch {
        }
      });
      return () => {
        try {
          stopSlots();
        } catch {
        }
        try {
          stopInfos?.();
        } catch {
        }
      };
    },
    /** Returns raw entries (optional filter: abilityIds, since, limit; sorted newest → oldest). */
    getAbilityLogs(opts) {
      const ids = opts?.abilityIds && opts.abilityIds.length ? new Set(opts.abilityIds) : null;
      const since = Number.isFinite(opts?.since) ? opts.since : 0;
      const lim = Math.max(0, Math.floor(opts?.limit ?? 0));
      let arr = this._logs.filter(
        (e) => (since ? e.performedAt >= since : true) && (ids ? ids.has(e.abilityId) : true)
      );
      arr = arr.sort((a, b) => b.performedAt - a.performedAt);
      return lim ? arr.slice(0, lim) : arr;
    },
    /** UI subscription (called whenever a new entry is pushed). */
    onAbilityLogs(cb) {
      this._logSubs.add(cb);
      try {
        cb(this.getAbilityLogs());
      } catch {
      }
      return () => {
        this._logSubs.delete(cb);
      };
    },
    /** Returns the set of seen abilityIds (useful to populate a filter UI). */
    getSeenAbilityIds() {
      const set2 = /* @__PURE__ */ new Set();
      for (const e of this._logs) set2.add(e.abilityId);
      return Array.from(set2).sort();
    },
    /** Clears the ring buffer. */
    clearAbilityLogs() {
      this._logs.length = 0;
      this._seenPerfByPet.clear();
      this._logsCutoffMs = Date.now();
      this._notifyLogSubs();
    },
    // --- internal helpers (logs) ---
    _notifyLogSubs() {
      const snap = this.getAbilityLogs();
      this._logSubs.forEach((fn) => {
        try {
          fn(snap);
        } catch {
        }
      });
    },
    _pushLog(e) {
      this._logs.push(e);
      if (this._logs.length > this._logsMax) {
        this._logs.splice(0, this._logs.length - this._logsMax);
      }
      this._notifyLogSubs();
    },
    /** Ingests a FLAT map keyed by petId. */
    _ingestAbilityMap(map2) {
      if (!map2 || typeof map2 !== "object") return;
      const abilityDisplayName = (abilityId) => {
        const def = petAbilities[abilityId];
        return def?.name && def.name.trim() || abilityId;
      };
      const fmtTime12 = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const fmtInt = (n) => Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString("en-US") : "0";
      const fmtPct0 = (n) => `${Number.isFinite(Number(n)) ? Number(n).toFixed(0) : "0"}%`;
      const fmtMin1 = (n) => `${Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0"} min`;
      const formatDetails = (abilityId, data) => {
        const d = data ?? {};
        const base = petAbilities[abilityId]?.baseParameters ?? {};
        switch (abilityId) {
          case "CoinFinderI":
          case "CoinFinderII":
          case "CoinFinderIII": {
            const coins = d["coinsFound"] ?? base["baseMaxCoinsFindable"];
            return `+${fmtInt(coins)} coins`;
          }
          case "SeedFinderI":
          case "SeedFinderII":
          case "SeedFinderIII":
          case "SeedFinderIV":
            return `Seed found: ${d["seedName"] ?? "\u2014"}`;
          case "SellBoostI":
          case "SellBoostII":
          case "SellBoostIII":
          case "SellBoostIV": {
            if (d["bonusCoins"] != null) return `Sale bonus: +${fmtInt(d["bonusCoins"])} coins`;
            const pct = base["cropSellPriceIncreasePercentage"];
            return pct != null ? `Sale bonus: +${fmtPct0(pct)}` : "Sale bonus";
          }
          case "ProduceRefund": {
            const n = d["numItemsRefunded"];
            return n != null ? `Refunded: ${fmtInt(n)} item(s)` : `Crops refunded`;
          }
          case "DoubleHarvest":
            return `Harvest duplicated`;
          case "ProduceEater": {
            const name = d["cropName"] ?? "\u2014";
            if (d["sellPrice"] != null) return `Eaten: ${name} (value ${fmtInt(d["sellPrice"])})`;
            const pct = base["cropSellPriceIncreasePercentage"];
            return pct != null ? `Eaten: ${name} (+${fmtPct0(pct)} price)` : `Eaten: ${name}`;
          }
          case "EggGrowthBoost":
          case "EggGrowthBoostII":
          case "EggGrowthBoostIII": {
            const mins = d["eggGrowthTimeReductionMinutes"] ?? base["eggGrowthTimeReductionMinutes"];
            return `Eggs faster: -${fmtMin1(mins)}`;
          }
          case "PlantGrowthBoost":
          case "PlantGrowthBoostII": {
            const mins = d["reductionMinutes"] ?? base["plantGrowthReductionMinutes"];
            return `Plants faster: -${fmtMin1(mins)}`;
          }
          case "GoldGranter": {
            const target = d["cropName"] ?? "\u2014";
            return `Gold mutation: ${target}`;
          }
          case "RainbowGranter": {
            const target = d["cropName"] ?? "\u2014";
            return `Rainbow mutation: ${target}`;
          }
          case "ProduceMutationBoost":
          case "ProduceMutationBoostII":
          case "PetMutationBoost":
          case "PetMutationBoostII":
            return "\u2014";
          case "PetXpBoost":
          case "PetXpBoostII": {
            const xp = d["bonusXp"] ?? base["bonusXp"];
            return `+${fmtInt(xp)} XP`;
          }
          case "PetAgeBoost":
          case "PetAgeBoostII": {
            const xp = d["bonusXp"] ?? base["bonusXp"];
            const who = d["petName"] ?? "pet";
            return `+${fmtInt(xp)} XP (${who})`;
          }
          case "PetHatchSizeBoost":
          case "PetHatchSizeBoostII": {
            const who = d["petName"] ?? "pet";
            if (d["strengthIncrease"] != null) return `+${fmtInt(d["strengthIncrease"])} strength (${who})`;
            const pct = base["maxStrengthIncreasePercentage"];
            return pct != null ? `Max strength +${fmtPct0(pct)} (${who})` : `Strength increased (${who})`;
          }
          case "HungerRestore":
          case "HungerRestoreII": {
            const pct = d["hungerRestoredPercentage"] ?? base["hungerRestorePercentage"];
            const who = d["petName"] ?? "pet";
            return `Hunger restored (${who}): ${fmtPct0(pct)}`;
          }
          case "HungerBoost":
          case "HungerBoostII": {
            const pct = base["hungerDepletionRateDecreasePercentage"];
            return pct != null ? `Hunger depletion rate: -${fmtPct0(pct)}` : "Hunger reduced";
          }
          case "PetRefund":
          case "PetRefundII": {
            const egg = d["eggName"] ?? null;
            return egg ? `Refunded: ${egg}` : `Pet refunded as egg`;
          }
          case "Copycat":
            return "\u2014";
          default: {
            const meta = petAbilities[abilityId];
            if (d && typeof d === "object" && Object.keys(d).length) return JSON.stringify(d);
            return meta?.description || "\u2014";
          }
        }
      };
      const EPS = 1e-6;
      for (const petId of Object.keys(map2)) {
        const entry = map2[petId];
        if (!entry || typeof entry !== "object") continue;
        const abilityId = entry.abilityId ?? null;
        const performedAtNum = Number(entry.performedAt) || 0;
        if (!abilityId || !performedAtNum) continue;
        const prev = this._seenPerfByPet.get(petId) || 0;
        if (performedAtNum <= prev) continue;
        if (this._logsCutoffMs && performedAtNum < this._logsCutoffMs - this._logsCutoffSkewMs) {
          this._seenPerfByPet.set(petId, performedAtNum);
          continue;
        }
        let hungerPct = Number.isFinite(Number(entry.hungerPct)) ? Number(entry.hungerPct) : null;
        if (hungerPct != null && hungerPct > 0 && hungerPct <= 1) hungerPct *= 100;
        if (hungerPct != null && hungerPct <= EPS) {
          this._seenPerfByPet.set(petId, performedAtNum);
          continue;
        }
        const pet = _invPetsCache.find((p) => String(p.id) === String(petId)) || null;
        const abilityIdStr = String(abilityId);
        const log = {
          petId,
          species: pet?.petSpecies || void 0,
          name: pet?.name ?? void 0,
          abilityId: abilityIdStr,
          abilityName: abilityDisplayName(abilityId),
          data: formatDetails(abilityIdStr, entry.data),
          performedAt: performedAtNum,
          time12: fmtTime12(performedAtNum)
        };
        this._seenPerfByPet.set(petId, performedAtNum);
        this._pushLog(log);
      }
    },
    /* ============================ Inventory (from myInventoryAtom) ============================ */
    async getInventoryPets() {
      await _ensureInventoryWatchersStarted();
      return _invPetsCache.slice();
    },
    async searchInventoryPets(q) {
      const list = await this.getInventoryPets();
      const s = (v) => (v ?? "").toLowerCase();
      const qq = (q || "").toLowerCase().trim();
      if (!qq) return list;
      return list.filter(
        (p) => s(p.id).includes(qq) || s(p.petSpecies).includes(qq) || s(p.name).includes(qq) || p.abilities.some((a) => s(a).includes(qq)) || p.mutations.some((m) => s(m).includes(qq))
      );
    },
    onInventoryPetsChange(cb) {
      void _ensureInventoryWatchersStarted();
      _invSubs.add(cb);
      try {
        cb(_invPetsCache.slice());
      } catch {
      }
      return () => {
        _invSubs.delete(cb);
      };
    },
    async useTeam(teamId) {
      const t = this.getTeams().find((tt) => tt.id === teamId) || null;
      if (!t) throw new Error("Team not found");
      const targetInvIds = (t.slots || []).filter((x) => typeof x === "string" && x.length > 0).slice(0, 3);
      return _applyTeam(targetInvIds);
    },
    async useTeamSlots(slots) {
      const targetInvIds = (Array.isArray(slots) ? slots : []).filter((x) => typeof x === "string" && x.length > 0).slice(0, 3);
      return _applyTeam(targetInvIds);
    }
  };
  async function _getActivePetSlotIds() {
    try {
      const arr = await PlayerService.getPets();
      const list = Array.isArray(arr) ? arr : [];
      return list.map((p) => String(p?.slot?.id || "")).filter((id) => !!id).slice(0, 3);
    } catch {
      return [];
    }
  }
  async function _applyTeam(targetInvIds) {
    let activeSlots = await _getActivePetSlotIds();
    const targetSet = new Set(targetInvIds);
    const extras = activeSlots.filter((id) => !targetSet.has(id));
    const mustStore = Math.max(0, activeSlots.length - targetInvIds.length);
    if (mustStore > 0) {
      const toStore = extras.slice(0, mustStore);
      for (const itemId of toStore) {
        try {
          await PlayerService.storePet(itemId);
          activeSlots = activeSlots.filter((id) => id !== itemId);
        } catch (e) {
        }
      }
    }
    const alreadyActive = /* @__PURE__ */ new Set();
    for (const invId of targetInvIds) {
      if (activeSlots.includes(invId)) alreadyActive.add(invId);
    }
    let swapped = 0, placed = 0, skipped = 0;
    if (alreadyActive.size) {
      activeSlots = activeSlots.filter((slotId) => !alreadyActive.has(slotId));
      skipped = alreadyActive.size;
    }
    const toDo = targetInvIds.filter((id) => !alreadyActive.has(id));
    for (const invId of toDo) {
      const slotId = activeSlots.shift();
      try {
        if (slotId) {
          await PlayerService.swapPet(slotId, invId);
          swapped++;
        } else {
          await PlayerService.placePet(invId, { x: 0, y: 0 }, "Boardwalk", 64);
          placed++;
        }
      } catch (e) {
      }
    }
    return { swapped, placed, skipped };
  }

  // src/ui/hud.ts
  function mountHUD(opts) {
    const LS_POS = "qws:pos";
    const LS_COLL = "qws:collapsed";
    const LS_HIDDEN = "qws:hidden";
    const MARGIN = 8;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => mountHUD(opts), { once: true });
      return;
    }
    const css = `
  :root{
    --qws-bg:        #0f1318;
    --qws-panel:     #111823cc;
    --qws-border:    #ffffff22;
    --qws-border-2:  #ffffff14;
    --qws-accent:    #7aa2ff;
    --qws-text:      #e7eef7;
    --qws-text-dim:  #b9c3cf;
    --qws-blur:      8px;
    --qws-shadow:    0 10px 36px rgba(0,0,0,.45);
  }

  /* ---------- HUD floating box ---------- */
  .qws2{
    position:fixed; right:16px; bottom:16px; z-index:999998;
    font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color:var(--qws-text);
    background:var(--qws-panel);
    border:1px solid var(--qws-border);
    border-radius:12px;
    padding:10px 12px;
    box-shadow:var(--qws-shadow);
    backdrop-filter:blur(var(--qws-blur));
    min-width:160px;
    display:flex; flex-direction:column; gap:8px;
  }
  .qws2.hidden{ display:none }
  .qws2 .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .qws2 .col{ display:flex; flex-direction:column; gap:4px }
  .qws2 .title{ font-weight:700; letter-spacing:.2px }
  .qws2 .sp{ flex:1 }

  .qws2 .pill{
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 8px; border-radius:999px;
    border:1px solid #ffffff26;
    background:rgba(255,255,255,.06);
    color:var(--qws-text);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
  }
  .qws2 .ok{   background:rgba(36, 161, 72, .20);  border-color:#48d17066 }
  .qws2 .warn{ background:rgba(241, 194, 27, .18); border-color:#ffd65c66 }
  .qws2 .bad{  background:rgba(218, 30, 40, .20);  border-color:#ff7c8666 }

  .qws2 .btn{
    cursor:pointer; border-radius:10px; border:1px solid var(--qws-border);
    padding:6px 10px;
    background:linear-gradient(180deg, #ffffff12, #ffffff06);
    color:#fff;
    transition:transform .1s ease, background .18s ease, border-color .18s ease;
  }
  .qws2 .btn:hover{ background:linear-gradient(180deg, #ffffff18, #ffffff0a); border-color:#ffffff44 }
  .qws2 .btn:active{ transform:translateY(1px) }
  .qws2 .drag{ cursor:move; opacity:.9 }

  .qws2 .mini{ display:none }
  .qws2.min .mini{ display:inline-flex }
  .qws2.min .body{ display:none }

  /* Launcher always shown */
  .qws-launch{ margin-top:4px; border-top:1px solid var(--qws-border); padding-top:6px; display:block }
  .qws-launch .launch-item{ display:flex; align-items:center; gap:8px; margin:4px 0 }
  .qws-launch .launch-item .name{ flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .qws-launch .launch-item .btn.active{
    background:linear-gradient(180deg, rgba(122,162,255,.28), rgba(122,162,255,.12));
    border-color:#9db7ff66;
  }

  /* ---------- Windows ---------- */
  .qws-win{
    position:fixed; z-index:999999; min-width:260px; max-width:900px; max-height:90vh; overflow:auto;
    background:var(--qws-panel); color:var(--qws-text);
    border:1px solid var(--qws-border); border-radius:12px;
    box-shadow:var(--qws-shadow); backdrop-filter:blur(var(--qws-blur));
  }
  .qws-win .w-head{
    display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom:1px solid var(--qws-border); cursor:move;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    border-top-left-radius:12px; border-top-right-radius:12px;
  }
  .qws-win .w-title{ font-weight:700 }
  .qws-win .sp{ flex:1 }
  .qws-win .w-btn{
    cursor:pointer; border-radius:10px; border:1px solid var(--qws-border);
    padding:4px 8px; background:linear-gradient(180deg, #ffffff12, #ffffff06); color:#fff;
  }
  .qws-win .w-btn:hover{ background:linear-gradient(180deg, #ffffff18, #ffffff0a); border-color:#ffffff44 }
  .qws-win .w-body{ padding:12px }

  /* Inputs inside windows */
  .qws-win input[type="text"], .qws-win input[type="number"]{
    width:120px; padding:8px 10px; border-radius:10px;
    border:1px solid var(--qws-border); background:rgba(0,0,0,.42); color:#fff;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  }
  .qws-win .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0 }
  `;
    const st = document.createElement("style");
    st.textContent = css;
    (document.documentElement || document.body).appendChild(st);
    const box = document.createElement("div");
    box.className = "qws2";
    box.innerHTML = `
    <div class="row drag">
      <div class="title">Arie's Mod</div>
      <div class="sp"></div>
      <span id="qws2-status-mini" class="pill warn mini">\u2026</span>
      <button id="qws2-min" class="btn" title="Minimize/Expand">\u2013</button>
      <button id="qws2-hide" class="btn" title="Hide (Alt+X)">\u2715</button>
    </div>

    <!-- Status & store side-by-side (no mode label) -->
    <div class="row" style="margin:2px 0 2px 0;">
      <span id="qws2-status2" class="pill warn">WS: \u2026</span>
      <span id="qws2-store" class="pill warn">store: \u2026</span>
    </div>

    <div class="body">
      <div id="qws-launch" class="qws-launch"></div>
    </div>
  `;
    (document.documentElement || document.body).appendChild(box);
    function clampRect(el2) {
      const rect = el2.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let r = parseFloat(getComputedStyle(el2).right) || vw - rect.right;
      let b = parseFloat(getComputedStyle(el2).bottom) || vh - rect.bottom;
      const maxRight = Math.max(MARGIN, vw - rect.width - MARGIN);
      const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
      r = Math.min(Math.max(r, MARGIN), maxRight);
      b = Math.min(Math.max(b, MARGIN), maxBottom);
      el2.style.right = r + "px";
      el2.style.bottom = b + "px";
    }
    function ensureOnScreen(el2) {
      clampRect(el2);
      const rect = el2.getBoundingClientRect();
      const head = el2.querySelector(".w-head");
      const hrect = head?.getBoundingClientRect() || rect;
      const vw = window.innerWidth, vh = window.innerHeight;
      const M = MARGIN;
      let r = parseFloat(getComputedStyle(el2).right);
      if (Number.isNaN(r)) r = vw - rect.right;
      let b = parseFloat(getComputedStyle(el2).bottom);
      if (Number.isNaN(b)) b = vh - rect.bottom;
      const maxRight = Math.max(M, vw - rect.width - M);
      const maxBottom = Math.max(M, vh - rect.height - M);
      if (hrect.top < M) {
        const delta = M - hrect.top;
        b = Math.max(M, Math.min(maxBottom, b - delta));
      }
      if (rect.left < M) {
        const deltaL = M - rect.left;
        r = Math.max(M, Math.min(maxRight, r - deltaL));
      }
      el2.style.right = r + "px";
      el2.style.bottom = b + "px";
    }
    function resetWinPosDefault(el2) {
      el2.style.right = "16px";
      el2.style.bottom = "16px";
      ensureOnScreen(el2);
    }
    function withTopLocked(el2, mutate) {
      const before = el2.getBoundingClientRect();
      const vh = window.innerHeight;
      let b = parseFloat(getComputedStyle(el2).bottom);
      if (Number.isNaN(b)) b = vh - before.bottom;
      mutate();
      requestAnimationFrame(() => {
        const after = el2.getBoundingClientRect();
        const deltaTop = after.top - before.top;
        let newBottom = b + deltaTop;
        const maxBottom = Math.max(MARGIN, vh - after.height - MARGIN);
        newBottom = Math.min(Math.max(MARGIN, newBottom), maxBottom);
        el2.style.bottom = newBottom + "px";
        ensureOnScreen(el2);
      });
    }
    function saveHUDPos() {
      try {
        const r = parseFloat(box.style.right) || 16;
        const b = parseFloat(box.style.bottom) || 16;
        localStorage.setItem(LS_POS, JSON.stringify({ r, b }));
      } catch {
      }
    }
    try {
      const pos = JSON.parse(localStorage.getItem(LS_POS) || "null");
      if (pos && typeof pos.r === "number" && typeof pos.b === "number") {
        box.style.right = pos.r + "px";
        box.style.bottom = pos.b + "px";
      }
      if (localStorage.getItem(LS_COLL) === "1") {
        box.classList.add("min");
        const btnMin0 = box.querySelector("#qws2-min");
        if (btnMin0) btnMin0.textContent = "+";
      }
      if (localStorage.getItem(LS_HIDDEN) === "1") box.classList.add("hidden");
      requestAnimationFrame(() => clampRect(box));
      window.addEventListener("resize", () => clampRect(box));
    } catch {
    }
    const header = box.querySelector(".drag");
    const btnMin = box.querySelector("#qws2-min");
    const btnHide = box.querySelector("#qws2-hide");
    const sMini = box.querySelector("#qws2-status-mini");
    const sFull = box.querySelector("#qws2-status2");
    const sStore = box.querySelector("#qws2-store");
    const launch = box.querySelector("#qws-launch");
    if (!header || !btnMin || !btnHide || !sMini || !sFull || !sStore || !launch) {
      console.warn("[QuinoaWS] HUD elements missing, abort init");
      return;
    }
    const launchEl = launch;
    (function makeDraggable2() {
      let sx = 0, sy = 0, or = 0, ob = 0, down = false;
      header.addEventListener("mousedown", (e) => {
        down = true;
        sx = e.clientX;
        sy = e.clientY;
        const rect = box.getBoundingClientRect();
        or = parseFloat(getComputedStyle(box).right) || window.innerWidth - rect.right;
        ob = parseFloat(getComputedStyle(box).bottom) || window.innerHeight - rect.bottom;
        document.body.style.userSelect = "none";
      });
      window.addEventListener("mousemove", (e) => {
        if (!down) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        let r = or - dx;
        let b = ob - dy;
        const rect = box.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const maxRight = Math.max(MARGIN, vw - rect.width - MARGIN);
        const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
        r = Math.min(Math.max(r, MARGIN), maxRight);
        b = Math.min(Math.max(b, MARGIN), maxBottom);
        box.style.right = r + "px";
        box.style.bottom = b + "px";
      });
      window.addEventListener("mouseup", () => {
        if (!down) return;
        down = false;
        document.body.style.userSelect = "";
        saveHUDPos();
      });
    })();
    btnMin.onclick = () => {
      withTopLocked(box, () => {
        box.classList.toggle("min");
        btnMin.textContent = box.classList.contains("min") ? "+" : "\u2013";
        try {
          localStorage.setItem(LS_COLL, box.classList.contains("min") ? "1" : "0");
        } catch {
        }
      });
    };
    btnHide.onclick = () => {
      box.classList.add("hidden");
      try {
        localStorage.setItem(LS_HIDDEN, "1");
      } catch {
      }
    };
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      const editing = !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if (editing) return;
      if (e.repeat) return;
      const isX = e.code === "KeyX" || typeof e.key === "string" && (e.key.toLowerCase() === "x" || e.key === "\u2248");
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && isX) {
        e.preventDefault();
        const hidden = box.classList.toggle("hidden");
        try {
          localStorage.setItem(LS_HIDDEN, hidden ? "1" : "0");
        } catch {
        }
      }
    }, true);
    const windows = /* @__PURE__ */ new Map();
    let cascade = 0;
    function openWindow(id, title, render) {
      if (windows.has(id)) {
        const w = windows.get(id);
        w.el.style.display = "";
        bumpZ(w.el);
        setLaunchState(id, true);
        return;
      }
      const win = document.createElement("div");
      win.className = "qws-win";
      win.innerHTML = `
      <div class="w-head">
        <div class="w-title"></div>
        <div class="sp"></div>
        <button class="w-btn" data-act="min" title="Minimize/Expand">\u2013</button>
        <button class="w-btn" data-act="close" title="Close">\u2715</button>
      </div>
      <div class="w-body"></div>
    `;
      (document.documentElement || document.body).appendChild(win);
      const head = win.querySelector(".w-head");
      const titleEl = win.querySelector(".w-title");
      const btnMin2 = win.querySelector('[data-act="min"]');
      const btnClose = win.querySelector('[data-act="close"]');
      const body = win.querySelector(".w-body");
      titleEl.textContent = title;
      const offset = cascade++ % 5 * 24;
      win.style.right = 16 + offset + "px";
      win.style.bottom = 16 + offset + "px";
      clampRect(win);
      bumpZ(win);
      (function dragWin() {
        let sx = 0, sy = 0, or = 0, ob = 0, down = false;
        head.addEventListener("mousedown", (e) => {
          const t = e.target;
          if (t.closest(".w-btn")) return;
          down = true;
          sx = e.clientX;
          sy = e.clientY;
          const rect = win.getBoundingClientRect();
          or = parseFloat(getComputedStyle(win).right) || window.innerWidth - rect.right;
          ob = parseFloat(getComputedStyle(win).bottom) || window.innerHeight - rect.bottom;
          document.body.style.userSelect = "none";
          bumpZ(win);
        });
        window.addEventListener("mousemove", (e) => {
          if (!down) return;
          const dx = e.clientX - sx;
          const dy = e.clientY - sy;
          let r = or - dx;
          let b = ob - dy;
          const rect = win.getBoundingClientRect();
          const vw = window.innerWidth, vh = window.innerHeight;
          const maxRight = Math.max(MARGIN, vw - rect.width - MARGIN);
          const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
          r = Math.min(Math.max(r, MARGIN), maxRight);
          b = Math.min(Math.max(b, MARGIN), maxBottom);
          win.style.right = r + "px";
          win.style.bottom = b + "px";
        });
        window.addEventListener("mouseup", () => {
          down = false;
          document.body.style.userSelect = "";
          saveWinPos(id, win);
        });
      })();
      btnMin2.onclick = () => {
        withTopLocked(win, () => {
          const hidden = body.style.display === "none";
          body.style.display = hidden ? "" : "none";
          btnMin2.textContent = hidden ? "\u2013" : "+";
        });
      };
      btnClose.onclick = () => {
        win.style.display = "none";
        setLaunchState(id, false);
      };
      patchInputsKeyTrap(win);
      try {
        render(body);
      } catch (e) {
        body.textContent = String(e);
      }
      saveWinPos(id, win);
      windows.set(id, { id, el: win, head, body });
      setLaunchState(id, true);
    }
    function isShown(el2) {
      return el2.style.display !== "none";
    }
    function toggleWindow(id, title, render) {
      const existing = windows.get(id);
      if (!existing) {
        openWindow(id, title, (root) => {
          const el2 = root.closest(".qws-win");
          if (el2) restoreWinPos(id, el2);
          render(root);
        });
        return true;
      } else {
        if (isShown(existing.el)) {
          existing.el.style.display = "none";
          setLaunchState(id, false);
          return false;
        } else {
          existing.el.style.display = "";
          bumpZ(existing.el);
          ensureOnScreen(existing.el);
          setLaunchState(id, true);
          return true;
        }
      }
    }
    function bumpZ(el2) {
      let maxZ = 999999;
      windows.forEach((w) => {
        const z = parseInt(getComputedStyle(w.el).zIndex || "999999", 10);
        if (z > maxZ) maxZ = z;
      });
      el2.style.zIndex = String(maxZ + 1);
    }
    function saveWinPos(id, el2) {
      try {
        const r = parseFloat(el2.style.right) || 16;
        const b = parseFloat(el2.style.bottom) || 16;
        localStorage.setItem(`qws:win:${id}:pos`, JSON.stringify({ r, b }));
      } catch {
      }
    }
    function restoreWinPos(id, el2) {
      try {
        const raw = localStorage.getItem(`qws:win:${id}:pos`);
        if (!raw) return;
        const pos = JSON.parse(raw);
        if (typeof pos.r === "number") el2.style.right = pos.r + "px";
        if (typeof pos.b === "number") el2.style.bottom = pos.b + "px";
        ensureOnScreen(el2);
      } catch {
      }
    }
    window.addEventListener("resize", () => {
      windows.forEach((w) => ensureOnScreen(w.el));
    });
    function enableAltDragAnywhere() {
      let st2 = null;
      const pickRoot = (node) => {
        const el2 = node;
        if (!el2) return null;
        return el2.closest?.(".qws-win, .qws2") || null;
      };
      const onDown = (e) => {
        if (!e.altKey || e.button !== 0) return;
        const root = pickRoot(e.target);
        if (!root || root.style.display === "none") return;
        const rect = root.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let or = parseFloat(getComputedStyle(root).right);
        let ob = parseFloat(getComputedStyle(root).bottom);
        if (Number.isNaN(or)) or = vw - rect.right;
        if (Number.isNaN(ob)) ob = vh - rect.bottom;
        st2 = { el: root, sx: e.clientX, sy: e.clientY, or, ob };
        document.body.style.userSelect = "none";
        bumpZ(root);
        e.preventDefault();
        e.stopPropagation();
      };
      const onMove = (e) => {
        if (!st2) return;
        const dx = e.clientX - st2.sx;
        const dy = e.clientY - st2.sy;
        let r = st2.or - dx;
        let b = st2.ob - dy;
        const rect = st2.el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const maxRight = Math.max(MARGIN, vw - rect.width - MARGIN);
        const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
        r = Math.min(Math.max(r, MARGIN), maxRight);
        b = Math.min(Math.max(b, MARGIN), maxBottom);
        st2.el.style.right = `${r}px`;
        st2.el.style.bottom = `${b}px`;
      };
      const stopDrag = () => {
        if (!st2) return;
        document.body.style.userSelect = "";
        clampRect(st2.el);
        const el2 = st2.el;
        let saved = false;
        windows.forEach((w) => {
          if (w.el === el2 && !saved) {
            saveWinPos(w.id, el2);
            saved = true;
          }
        });
        if (!saved && el2 === box) saveHUDPos();
        st2 = null;
      };
      const onUp = () => stopDrag();
      const onKeyUp = (e) => {
        if (e.key === "Alt" || e.key === "AltGraph") stopDrag();
      };
      window.addEventListener("mousedown", onDown, true);
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
      window.addEventListener("keyup", onKeyUp, true);
    }
    function patchInputsKeyTrap(scope) {
      const isEditable = (el2) => {
        if (!el2 || !(el2 instanceof HTMLElement)) return false;
        if (el2 instanceof HTMLTextAreaElement) return true;
        if (el2 instanceof HTMLInputElement) {
          const t = (el2.type || "").toLowerCase();
          return t === "text" || t === "number" || t === "search";
        }
        return el2.isContentEditable === true;
      };
      const handler = (ev) => {
        const target = ev.target;
        const active = document.activeElement;
        const inScope = (node) => !!(node && (scope.contains(node) || node.closest?.(".qws-win") || node.closest?.(".qws2")));
        if (!(inScope(target) && isEditable(target) || inScope(active) && isEditable(active))) return;
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
      };
      const types = ["keydown", "keypress", "keyup"];
      types.forEach((t) => {
        window.addEventListener(t, handler, { capture: true });
        document.addEventListener(t, handler, { capture: true });
        scope.addEventListener(t, handler, { capture: true });
      });
      return () => {
        types.forEach((t) => {
          window.removeEventListener(t, handler, { capture: true });
          document.removeEventListener(t, handler, { capture: true });
          scope.removeEventListener(t, handler, { capture: true });
        });
      };
    }
    const registry2 = [];
    const launchButtons = /* @__PURE__ */ new Map();
    function setLaunchState(id, open) {
      const btn = launchButtons.get(id);
      if (!btn) return;
      btn.textContent = open ? "Close" : "Open";
      btn.dataset.open = open ? "1" : "0";
      if (open) btn.classList.add("active");
      else btn.classList.remove("active");
    }
    function register(id, title, render) {
      registry2.push({ id, title, render });
      addLaunchItem(id, title, render);
    }
    function addLaunchItem(id, title, render) {
      const item = document.createElement("div");
      item.className = "launch-item";
      item.innerHTML = `<div class="name">${escapeHtml2(title)}</div>`;
      const openBtn = document.createElement("button");
      openBtn.className = "btn";
      openBtn.textContent = "Open";
      openBtn.dataset.open = "0";
      launchButtons.set(id, openBtn);
      openBtn.onclick = () => {
        const w = windows.get(id);
        if (w && w.el.style.display !== "none") {
          w.el.style.display = "none";
          setLaunchState(id, false);
        } else {
          openWindow(id, title, (root) => {
            const el2 = root.closest(".qws-win");
            if (el2) restoreWinPos(id, el2);
            render(root);
          });
          setLaunchState(id, true);
        }
      };
      item.appendChild(openBtn);
      launch.appendChild(item);
    }
    try {
      opts?.onRegister?.(register);
    } catch {
    }
    patchInputsKeyTrap(box);
    enableAltDragAnywhere();
    (async () => {
      try {
        await ensureStore();
      } catch {
      }
    })();
    setInterval(() => {
      try {
        const ws = getOpenPageWS();
        sMini.textContent = "OPEN";
        sFull.textContent = "WS: OPEN";
        tag(sMini, "ok");
        tag(sFull, "ok");
      } catch {
        const viaWorker = !!window.__QWS_workerFound || workerFound;
        sMini.textContent = viaWorker ? "Worker" : "none";
        sFull.textContent = "WS: " + (viaWorker ? "via Worker" : "none");
        tag(sMini, viaWorker ? "ok" : "warn");
        tag(sFull, viaWorker ? "ok" : "warn");
      }
      try {
        const captured = isStoreCaptured();
        const info = getCapturedInfo();
        if (captured) {
          sStore.textContent = `store: ${info.via || "ready"}`;
          tag(sStore, "ok");
        } else if (info.via === "polyfill" || info.polyfill) {
          sStore.textContent = "store: polyfill";
          tag(sStore, "warn");
        } else {
          sStore.textContent = "store: none";
          tag(sStore, "bad");
        }
      } catch {
        sStore.textContent = "store: error";
        tag(sStore, "bad");
      }
    }, 800);
    function getOpenPageWS() {
      for (let i = 0; i < sockets.length; i++) {
        if (sockets[i].readyState === NativeWS.OPEN) return sockets[i];
      }
      throw new Error("no page ws");
    }
    function tag(el2, cls) {
      el2.classList.remove("ok", "warn", "bad");
      if (cls) el2.classList.add(cls);
    }
    function escapeHtml2(s) {
      return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
    }
  }
  function initWatchers() {
    (async () => {
      await PetsService.startAbilityLogsWatcher();
    })();
  }

  // src/utils/calculators.ts
  var key = (s) => String(s ?? "").trim();
  function resolveSpeciesKey(species) {
    const wanted = key(species).toLowerCase();
    if (!wanted) return null;
    for (const k of Object.keys(plantCatalog)) {
      if (k.toLowerCase() === wanted) return k;
    }
    return null;
  }
  function findAnySellPriceNode(obj) {
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.baseSellPrice === "number" && Number.isFinite(obj.baseSellPrice)) {
      return obj.baseSellPrice;
    }
    for (const k of ["produce", "crop", "item", "items", "data"]) {
      if (obj[k]) {
        const v = findAnySellPriceNode(obj[k]);
        if (v != null) return v;
      }
    }
    try {
      const seen = /* @__PURE__ */ new Set();
      const stack = [obj];
      while (stack.length) {
        const cur2 = stack.pop();
        if (!cur2 || typeof cur2 !== "object" || seen.has(cur2)) continue;
        seen.add(cur2);
        if (typeof cur2.baseSellPrice === "number") {
          const v = cur2.baseSellPrice;
          if (Number.isFinite(v)) return v;
        }
        for (const v of Object.values(cur2)) if (v && typeof v === "object") stack.push(v);
      }
    } catch {
    }
    return null;
  }
  function defaultGetBasePrice(species) {
    const spKey = resolveSpeciesKey(species);
    if (!spKey) return null;
    const node = plantCatalog[spKey];
    const cands = [
      node?.produce?.baseSellPrice,
      node?.crop?.baseSellPrice,
      node?.item?.baseSellPrice,
      node?.items?.Produce?.baseSellPrice
    ].filter((v) => typeof v === "number" && Number.isFinite(v));
    if (cands.length) return cands[0];
    return findAnySellPriceNode(node);
  }
  function applyRounding(v, mode = "round") {
    switch (mode) {
      case "floor":
        return Math.floor(v);
      case "ceil":
        return Math.ceil(v);
      case "none":
        return v;
      case "round":
      default:
        return Math.round(v);
    }
  }
  function friendBonusMultiplier(playersInRoom) {
    if (!Number.isFinite(playersInRoom)) return 1;
    const n = Math.max(1, Math.min(6, Math.floor(playersInRoom)));
    return 1 + (n - 1) * 0.1;
  }
  var COLOR_MULT = {
    Gold: 25,
    Rainbow: 50
  };
  var WEATHER_MULT = {
    Wet: 2,
    Chilled: 2,
    Frozen: 10
  };
  var TIME_MULT = {
    Dawnlit: 2,
    Dawnbound: 3,
    Amberlit: 5,
    Amberbound: 6
  };
  var WEATHER_TIME_COMBO = {
    "Wet+Dawnlit": 3,
    "Chilled+Dawnlit": 3,
    "Wet+Amberlit": 6,
    "Chilled+Amberlit": 6,
    "Frozen+Dawnlit": 11,
    "Frozen+Dawnbound": 12,
    "Frozen+Amberlit": 14,
    "Frozen+Amberbound": 15
  };
  function isColor(m) {
    return m === "Gold" || m === "Rainbow";
  }
  function isWeather(m) {
    return m === "Wet" || m === "Chilled" || m === "Frozen";
  }
  function isTime(m) {
    return m === "Dawnlit" || m === "Dawnbound" || m === "Amberlit" || m === "Amberbound";
  }
  function normalizeMutationName(m) {
    const s = key(m).toLowerCase();
    if (!s) return "";
    if (s === "amberglow" || s === "ambershine" || s === "amberlight") return "Amberlit";
    if (s === "dawn" || s === "dawnlight") return "Dawnlit";
    if (s === "gold") return "Gold";
    if (s === "rainbow") return "Rainbow";
    if (s === "wet") return "Wet";
    if (s === "chilled") return "Chilled";
    if (s === "frozen") return "Frozen";
    if (s === "dawnlit") return "Dawnlit";
    if (s === "dawnbound") return "Dawnbound";
    if (s === "amberlit") return "Amberlit";
    if (s === "amberbound") return "Amberbound";
    return m;
  }
  function computeColorMultiplier(mutations) {
    if (!Array.isArray(mutations)) return 1;
    let best = 1;
    for (const raw of mutations) {
      const m = normalizeMutationName(raw);
      if (isColor(m)) {
        const mult = COLOR_MULT[m];
        if (mult > best) best = mult;
      }
    }
    return best;
  }
  function pickWeather(mutations) {
    if (!Array.isArray(mutations)) return null;
    let pick = null;
    for (const raw of mutations) {
      const m = normalizeMutationName(raw);
      if (isWeather(m)) {
        if (pick == null) {
          pick = m;
          continue;
        }
        if (WEATHER_MULT[m] > WEATHER_MULT[pick]) pick = m;
      }
    }
    return pick;
  }
  function pickTime(mutations) {
    if (!Array.isArray(mutations)) return null;
    let pick = null;
    for (const raw of mutations) {
      const m = normalizeMutationName(raw);
      if (isTime(m)) {
        if (pick == null) {
          pick = m;
          continue;
        }
        if (TIME_MULT[m] > TIME_MULT[pick]) pick = m;
      }
    }
    return pick;
  }
  function computeWeatherTimeMultiplier(weather, time) {
    if (!weather && !time) return 1;
    if (weather && !time) return WEATHER_MULT[weather];
    if (!weather && time) return TIME_MULT[time];
    const k = `${weather}+${time}`;
    const combo = WEATHER_TIME_COMBO[k];
    if (typeof combo === "number") return combo;
    return Math.max(WEATHER_MULT[weather], TIME_MULT[time]);
  }
  function mutationsMultiplier(mutations) {
    const color = computeColorMultiplier(mutations);
    const weather = pickWeather(mutations);
    const time = pickTime(mutations);
    const wt = computeWeatherTimeMultiplier(weather, time);
    return color * wt;
  }
  function estimateProduceValue(species, scale, mutations, opts) {
    const getBase = opts?.getBasePrice ?? defaultGetBasePrice;
    const sXform = opts?.scaleTransform ?? ((_, s) => s);
    const round = opts?.rounding ?? "round";
    const base = getBase(species);
    if (!(Number.isFinite(base) && base > 0)) return 0;
    const sc = Number(scale);
    if (!Number.isFinite(sc) || sc <= 0) return 0;
    const effScale = sXform(species, sc);
    if (!Number.isFinite(effScale) || effScale <= 0) return 0;
    const mutMult = mutationsMultiplier(mutations);
    const friendsMult = friendBonusMultiplier(opts?.friendPlayers);
    const pre = base * effScale * mutMult * friendsMult;
    const out = Math.max(0, applyRounding(pre, round));
    return out;
  }
  function valueFromInventoryProduce(item, opts, playersInRoom) {
    if (!item || item.itemType !== "Produce") return 0;
    const merged = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
    return estimateProduceValue(item.species, item.scale, item.mutations, merged);
  }
  function valueFromGardenSlot(slot, opts, playersInRoom) {
    if (!slot) return 0;
    const merged = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
    return estimateProduceValue(slot.species, slot.targetScale, slot.mutations, merged);
  }
  function valueFromGardenPlant(plant, opts, playersInRoom) {
    if (!plant || plant.objectType !== "plant" || !Array.isArray(plant.slots)) return 0;
    const merged = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
    let sum = 0;
    for (const s of plant.slots) sum += valueFromGardenSlot(s, merged);
    return sum;
  }
  function sumInventoryValue(items, opts, playersInRoom) {
    if (!Array.isArray(items)) return 0;
    const merged = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
    let sum = 0;
    for (const it of items) {
      if (it?.itemType === "Produce") {
        sum += valueFromInventoryProduce(it, merged);
      }
    }
    return sum;
  }
  function sumGardenValue(garden2, opts, playersInRoom) {
    if (!garden2 || typeof garden2 !== "object") return 0;
    const merged = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
    let sum = 0;
    for (const k of Object.keys(garden2)) {
      const p = garden2[k];
      if (p?.objectType === "plant") {
        sum += valueFromGardenPlant(p, merged);
      }
    }
    return sum;
  }
  var DefaultPricing = Object.freeze({
    getBasePrice: defaultGetBasePrice,
    rounding: "round"
  });

  // src/utils/tooltip.finder.ts
  function findBestTooltipDetailHostInside(root) {
    if (!root) return null;
    const name = root.querySelector?.("p.chakra-text") ?? root.querySelector?.('p[class*="chakra-text"]') ?? root.querySelector?.("p") ?? null;
    if (name) {
      const hasCanvasLocal = (el2) => !!el2.querySelector("canvas");
      let node = name;
      while (node && node !== root) {
        const cs = getComputedStyle(node);
        if (cs.display.includes("flex") && !hasCanvasLocal(node)) {
          const parent = node.parentElement;
          if (parent && Array.from(parent.children).some((ch) => ch !== node && ch instanceof HTMLElement && hasCanvasLocal(ch))) {
            return node;
          }
        }
        node = node.parentElement;
      }
      const mc = name.closest(".McFlex");
      if (mc) return mc;
      if (name.parentElement) return name.parentElement;
    }
    const candidates = Array.from(root.querySelectorAll?.(".McFlex, [class*='McFlex']") ?? []);
    for (const c of candidates) {
      const cs = getComputedStyle(c);
      if (!cs.display.includes("flex")) continue;
      if (c.querySelector("canvas")) continue;
      if (!c.querySelector('p, [class*="chakra-text"]')) continue;
      return c;
    }
    return root || null;
  }

  // src/services/domChanges.ts
  var STYLE_ID = "qws-price-badge-style";
  var ATTR_INJECTED = "data-qws-injected";
  var CLASS_BADGE = "qws-price-badge";
  var USER_SCOPE_ROOT = ".McFlex.css-1wu1jyg";
  var nfUS = new Intl.NumberFormat("en-US");
  var fmtCoins = (n) => nfUS.format(Math.max(0, Math.round(n)));
  var ACTIVE_HOSTS = /* @__PURE__ */ new Set();
  var cur = null;
  var players;
  var sortedIdx = null;
  var selectedIdx = null;
  var isPlantObject = (o) => !!o && o.objectType === "plant";
  var defaultOrder = (n) => Array.from({ length: n }, (_, i) => i);
  var getOrder = () => {
    const n = Array.isArray(cur?.slots) ? cur.slots.length : 0;
    if (!n) return [];
    return Array.isArray(sortedIdx) && sortedIdx.length === n ? sortedIdx : defaultOrder(n);
  };
  var getOrderedSlots = () => {
    if (!isPlantObject(cur)) return [];
    const slots = Array.isArray(cur.slots) ? cur.slots : [];
    const ord = getOrder();
    const out = [];
    for (const i of ord) if (slots[i] != null) out.push(slots[i]);
    return out;
  };
  function selectedOrderedPosition() {
    if (!isPlantObject(cur)) return 0;
    const slots = cur.slots ?? [];
    const n = Array.isArray(slots) ? slots.length : 0;
    if (!n) return 0;
    const raw = Number.isFinite(selectedIdx) ? selectedIdx : 0;
    const clampedRaw = Math.max(0, Math.min(n - 1, raw));
    const ord = getOrder();
    const pos = ord.indexOf(clampedRaw);
    return pos >= 0 ? pos : 0;
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
    .${CLASS_BADGE}{
      position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
      display:inline-flex; gap:6px; align-items:center; justify-content:center;
      padding:4px 10px; border-radius:10px; font:800 12px/1.2 system-ui,sans-serif;
      color:#FFD84D; z-index:1; pointer-events:none; white-space:nowrap;
    }`;
    document.head.appendChild(s);
  }
  var BADGE_RESERVE = 0;
  function measureBadgeReserve() {
    if (BADGE_RESERVE) return BADGE_RESERVE;
    ensureStyle();
    const probe = Object.assign(document.createElement("div"), { className: CLASS_BADGE, textContent: "000,000,000" });
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", left: "-9999px" });
    document.body.appendChild(probe);
    BADGE_RESERVE = Math.max(28, Math.ceil(probe.getBoundingClientRect().height + 10));
    probe.remove();
    return BADGE_RESERVE;
  }
  function collectTooltipRoots() {
    const set2 = /* @__PURE__ */ new Set();
    const userRoot = document.querySelector(USER_SCOPE_ROOT);
    if (userRoot) set2.add(userRoot);
    for (const h of ACTIVE_HOSTS) {
      if (h && h.isConnected) set2.add(h.closest(".McFlex, .css-0") || h);
    }
    if (set2.size === 0) {
      const guess = Array.from(document.querySelectorAll(".McFlex, .css-0, [role='tooltip']")).filter((r) => r.querySelector("canvas") && r.querySelector('p.chakra-text, p[class*="chakra-text"]'));
      guess.slice(0, 3).forEach((r) => set2.add(r));
    }
    return Array.from(set2).filter((r) => r.isConnected);
  }
  function currentSlotValue() {
    if (!isPlantObject(cur)) return null;
    const ordered = getOrderedSlots();
    if (!ordered.length) return null;
    const pos = selectedOrderedPosition();
    const slot = ordered[Math.max(0, Math.min(ordered.length - 1, pos))];
    const val = valueFromGardenSlot(slot, DefaultPricing, players);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  function injectOrUpdateBadge(host) {
    if (!isPlantObject(cur)) {
      removeBadge(host);
      return;
    }
    ensureStyle();
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const reserve = measureBadgeReserve();
    if ((parseFloat(host.style.paddingBottom) || 0) < reserve) host.style.paddingBottom = `${reserve}px`;
    const val = currentSlotValue() ?? (() => {
      const v = valueFromGardenPlant(cur, DefaultPricing, players);
      return Number.isFinite(v) && v > 0 ? v : null;
    })();
    if (val == null) {
      removeBadge(host);
      return;
    }
    let badge = host.querySelector("." + CLASS_BADGE);
    if (!badge) {
      badge = document.createElement("div");
      badge.className = CLASS_BADGE;
      host.appendChild(badge);
      host.setAttribute(ATTR_INJECTED, "1");
    }
    badge.textContent = fmtCoins(val);
  }
  function removeBadge(host) {
    host.querySelectorAll("." + CLASS_BADGE).forEach((n) => n.remove());
    if (host.hasAttribute(ATTR_INJECTED)) {
      host.removeAttribute(ATTR_INJECTED);
      host.style.paddingBottom = "";
    }
  }
  function updateAllBadges() {
    const roots = collectTooltipRoots();
    const found = [];
    for (const root of roots) {
      const host = findBestTooltipDetailHostInside(root);
      if (host) found.push(host);
    }
    for (const host of found) {
      if (!ACTIVE_HOSTS.has(host)) ACTIVE_HOSTS.add(host);
      injectOrUpdateBadge(host);
    }
    for (const host of Array.from(ACTIVE_HOSTS)) {
      if (!document.contains(host) || !found.includes(host)) {
        removeBadge(host);
        ACTIVE_HOSTS.delete(host);
      }
    }
  }
  function clearAllBadges() {
    document.querySelectorAll("." + CLASS_BADGE).forEach((el2) => el2.remove());
    document.querySelectorAll(`[${ATTR_INJECTED}="1"]`).forEach((host) => {
      host.style.paddingBottom = "";
      host.removeAttribute(ATTR_INJECTED);
    });
    ACTIVE_HOSTS.clear();
  }
  function watchTooltipsByXPath() {
    const rescan = () => updateAllBadges();
    rescan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        rescan();
      });
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true });
    return {
      disconnect() {
        mo.disconnect();
        ACTIVE_HOSTS.clear();
      }
    };
  }
  (async () => {
    try {
      cur = await myCurrentGardenObject.get();
    } catch {
    }
    try {
      players = await numPlayers.get();
    } catch {
    }
    try {
      const v = await myCurrentSortedGrowSlotIndices.get();
      sortedIdx = Array.isArray(v) ? v.slice() : null;
    } catch {
    }
    try {
      selectedIdx = await myCurrentGrowSlotIndex.get();
    } catch {
    }
    myCurrentGardenObject.onChange((v) => {
      cur = v;
      isPlantObject(cur) ? updateAllBadges() : clearAllBadges();
    });
    numPlayers.onChange((n) => {
      players = n;
      updateAllBadges();
    });
    myCurrentSortedGrowSlotIndices.onChange((v) => {
      sortedIdx = Array.isArray(v) ? v.slice() : null;
      updateAllBadges();
    });
    myCurrentGrowSlotIndex.onChange((idx) => {
      selectedIdx = Number.isFinite(idx) ? idx : 0;
      updateAllBadges();
    });
    watchTooltipsByXPath();
  })();

  // src/ui/menus/debug-data.ts
  var fmtTime = (ms) => {
    const d = new Date(ms);
    const pad = (n, s = 2) => String(n).padStart(s, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  };
  var escapeLite = (s) => s.replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[m]);
  var FrameBuffer = class {
    constructor(max = 2e3) {
      this.max = max;
      __publicField(this, "arr", []);
    }
    push(f) {
      this.arr.push(f);
      if (this.arr.length > this.max) this.arr.splice(0, this.arr.length - this.max);
    }
    toArray() {
      return this.arr.slice();
    }
    clear() {
      this.arr.length = 0;
    }
  };
  var registry = /* @__PURE__ */ new Map();
  var hookedOnce = false;
  function installWSHookIfNeeded(onFrame) {
    if (!hookedOnce) {
      if (window.WebSocket === NativeWS) {
        window.WebSocket = new Proxy(NativeWS, {
          construct(target, args, newTarget) {
            const ws = Reflect.construct(target, args, newTarget);
            trackSocket(ws, "new", onFrame);
            return ws;
          }
        });
      }
      sockets.forEach((ws) => trackSocket(ws, "existing", onFrame));
      hookedOnce = true;
    } else {
      sockets.forEach((ws) => {
        if (!registry.has(ws)) trackSocket(ws, "late", onFrame);
      });
    }
  }
  function trackSocket(ws, why, onFrame) {
    if (registry.has(ws)) return;
    const id = `WS#${1 + registry.size} (${label(ws.readyState)})`;
    const info = { ws, id, listeners: [] };
    if (!sockets.includes(ws)) sockets.push(ws);
    setQWS?.(ws, why);
    const onMsg = (ev) => {
      let text = "";
      try {
        text = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
      } catch {
        text = String(ev.data);
      }
      onFrame({ t: Date.now(), dir: "in", text, ws });
    };
    ws.addEventListener("message", onMsg);
    info.listeners.push(() => ws.removeEventListener("message", onMsg));
    const onOpen = () => {
      info.id = info.id.replace(/\(.*\)/, `(${label(ws.readyState)})`);
    };
    const onClose = () => {
      info.id = info.id.replace(/\(.*\)/, `(${label(ws.readyState)})`);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    info.listeners.push(() => ws.removeEventListener("open", onOpen));
    info.listeners.push(() => ws.removeEventListener("close", onClose));
    if (!info.sendOrig) {
      const orig = ws.send.bind(ws);
      info.sendOrig = orig;
      ws.send = (data) => {
        try {
          const text = typeof data === "string" ? data : JSON.stringify(data);
          onFrame({ t: Date.now(), dir: "out", text, ws });
        } catch {
          onFrame({ t: Date.now(), dir: "out", text: String(data), ws });
        }
        return orig(data);
      };
    }
    registry.set(ws, info);
  }
  async function renderDebugDataMenu(root) {
    const ui = new Menu({ id: "debug-tools", compact: true });
    ui.mount(root);
    ui.addTab("jotai", "Jotai", (view) => renderJotaiTab(view, ui));
    ui.addTab("websocket", "WebSocket", (view) => renderWSTab(view, ui));
  }
  function renderJotaiTab(view, ui) {
    view.innerHTML = "";
    const head = ui.section("Store");
    const btnCap = ui.btn("Capture store", async () => {
      try {
        await ensureStore();
      } catch {
      }
      capLbl.textContent = `captured: ${String(isStoreCaptured())}`;
      appendOut({ capture: isStoreCaptured() });
    });
    const capLbl = ui.label(`captured: ${String(isStoreCaptured())}`);
    head.appendChild(ui.row(btnCap, capLbl));
    view.appendChild(head);
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    grid.style.gap = "12px";
    view.appendChild(grid);
    {
      const s = ui.section("Find / List atoms");
      const q = ui.inputText("regex label (eg: position|health)", "");
      const btnList = ui.btn("List", () => doList());
      const btnCopy = ui.btn("Copy", () => copy(pre2.textContent || ""));
      const pre2 = document.createElement("pre");
      stylePre(pre2);
      async function doList() {
        const raw = q.value.trim();
        const rx = safeRegex(raw || ".*");
        const all = findAtomsByLabel(/.*/);
        const atoms = all.filter((a) => rx.test(String(a?.debugLabel || a?.label || "")));
        const labels = atoms.map((a) => String(a?.debugLabel || a?.label || "<?>"));
        pre2.textContent = labels.join("\n");
        appendOut({ list: { query: raw || ".*", count: labels.length } });
      }
      s.appendChild(ui.row(q, btnList, btnCopy));
      s.appendChild(pre2);
      grid.appendChild(s);
    }
    {
      const s = ui.section("Get / Subscribe");
      const q = ui.inputText("atom label (eg: positionAtom)", "");
      const btnGet = ui.btn("Get", async () => {
        const atom = getAtomByLabel(q.value.trim());
        if (!atom) {
          pre2.textContent = `Atom "${q.value}" not found`;
          return;
        }
        try {
          setText(pre2, await jGet(atom));
          appendOut({ get: { label: q.value, ok: true } });
        } catch (e) {
          setText(pre2, e?.message || String(e));
          appendOut({ get: { label: q.value, ok: false, error: e?.message } });
        }
      });
      const btnSub = ui.btn("Subscribe", async () => {
        const label2 = q.value.trim();
        if (!label2) return;
        const atom = getAtomByLabel(label2);
        if (!atom) return appendOut(`Atom "${label2}" not found`);
        if (unsubRef) {
          unsubRef();
          unsubRef = null;
          btnSub.textContent = "Subscribe";
          appendOut({ sub: { label: label2, status: "unsubscribed" } });
          return;
        }
        unsubRef = await jSub(atom, async () => {
          try {
            setText(pre2, await jGet(atom));
          } catch {
          }
        });
        btnSub.textContent = "Unsubscribe";
        appendOut({ sub: { label: label2, status: "subscribed" } });
      });
      const btnCopy = ui.btn("Copy", () => copy(pre2.textContent || ""));
      const pre2 = document.createElement("pre");
      stylePre(pre2);
      let unsubRef = null;
      s.appendChild(ui.row(q, btnGet, btnSub, btnCopy));
      s.appendChild(pre2);
      grid.appendChild(s);
    }
    {
      const s = ui.section("Set atom");
      const q = ui.inputText("atom label (eg: activeModalAtom)", "");
      const btnSet = ui.btn("Set", async () => {
        const label2 = q.value.trim();
        const atom = getAtomByLabel(label2);
        if (!atom) return appendOut(`Atom "${label2}" not found`);
        let val;
        try {
          val = JSON.parse(ta.value);
        } catch (e) {
          return toast("Invalid JSON");
        }
        try {
          await jSet(atom, val);
          appendOut({ set: { label: label2, ok: true } });
        } catch (e) {
          appendOut({ set: { label: label2, ok: false, error: e?.message } });
        }
      });
      const btnCopy = ui.btn("Copy json", () => copy(ta.value));
      const ta = document.createElement("textarea");
      ta.className = "qmm-input";
      ta.style.minHeight = "120px";
      ta.style.width = "100%";
      ta.placeholder = `JSON value, eg: "inventory" or { "x": 1, "y": 2 }`;
      s.appendChild(ui.row(q, btnSet, btnCopy));
      s.appendChild(ta);
      grid.appendChild(s);
    }
    const outBox = ui.section("Output");
    const bar = ui.row(
      ui.label("\u2014"),
      (() => {
        const sp = document.createElement("div");
        sp.style.flex = "1";
        return sp;
      })(),
      (() => {
        const b = ui.btn("Copy", () => copy(pre.textContent || ""));
        return b;
      })(),
      (() => {
        const b = ui.btn("Clear", () => pre.textContent = "");
        return b;
      })()
    );
    const pre = document.createElement("pre");
    stylePre(pre);
    outBox.appendChild(bar);
    outBox.appendChild(pre);
    view.appendChild(outBox);
    function appendOut(v) {
      const ts = fmtTime(Date.now());
      try {
        pre.textContent += `[${ts}] ${JSON.stringify(v)}
`;
      } catch {
        pre.textContent += `[${ts}] ${String(v)}
`;
      }
      pre.scrollTop = pre.scrollHeight;
    }
    function setText(el2, v) {
      el2.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    }
    function toast(msg) {
      try {
        window.toastSimple?.(msg, "", "warn");
      } catch {
      }
    }
    function copy(text) {
      const str = String(text ?? "");
      if (!str.length) return;
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = str;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {
        }
        document.body.removeChild(ta);
        try {
          window.toastSimple?.(ok ? "Copied" : "Copy failed", "", ok ? "success" : "error");
        } catch {
        }
      };
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(str).then(() => {
          try {
            window.toastSimple?.("Copied", "", "success");
          } catch {
          }
        }).catch(fallback);
      } else {
        fallback();
      }
    }
    function safeRegex(q) {
      try {
        return new RegExp(q, "i");
      } catch {
        return /.*/i;
      }
    }
    function stylePre(pre2) {
      pre2.style.maxHeight = "260px";
      pre2.style.overflow = "auto";
      pre2.style.background = "#0f1318";
      pre2.style.border = "1px solid #ffffff14";
      pre2.style.borderRadius = "8px";
      pre2.style.padding = "8px";
      pre2.style.margin = "6px 0";
      pre2.style.fontSize = "12px";
      pre2.style.color = "#e7eef7";
    }
  }
  function renderWSTab(view, ui) {
    view.innerHTML = "";
    const frames = new FrameBuffer(2e3);
    const framesMap = /* @__PURE__ */ new Map();
    let seq = 0;
    let paused = false;
    let autoScroll = true;
    let showIn = true;
    let showOut = true;
    let filterText = "";
    let onlyCurrentSocket = false;
    let replayToSource = false;
    let selectedId = null;
    let mutePatterns = [];
    const $spacer = () => {
      const d = document.createElement("div");
      d.style.flex = "1";
      return d;
    };
    const setSelectedRow = (fid) => {
      selectedId = fid;
      [...logWrap.querySelectorAll("[data-fid]")].forEach((row) => {
        row.classList.toggle("selected", String(fid || "") === row.dataset.fid);
      });
      if (fid != null) {
        const f = framesMap.get(fid);
        if (f) ta.value = f.text;
      }
    };
    const matchesMutes = (text) => mutePatterns.some((rx) => rx.test(text));
    function copy(text) {
      const str = String(text ?? "");
      if (!str.length) return;
      const fallback = () => {
        const taTmp = document.createElement("textarea");
        taTmp.value = str;
        taTmp.setAttribute("readonly", "true");
        taTmp.style.position = "fixed";
        taTmp.style.left = "-9999px";
        taTmp.style.opacity = "0";
        document.body.appendChild(taTmp);
        taTmp.focus();
        taTmp.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {
        }
        document.body.removeChild(taTmp);
        try {
          window.toastSimple?.(ok ? "Copied" : "Copy failed", "", ok ? "success" : "error");
        } catch {
        }
      };
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(str).then(() => {
          try {
            window.toastSimple?.("Copied", "", "success");
          } catch {
          }
        }).catch(fallback);
      } else fallback();
    }
    const head = ui.section("Live log");
    const lblConn = ui.label("\u2014");
    const chIn = ui.checkbox(true);
    chIn.addEventListener("change", () => {
      showIn = chIn.checked;
      repaint(true);
    });
    const chOut = ui.checkbox(true);
    chOut.addEventListener("change", () => {
      showOut = chOut.checked;
      repaint(true);
    });
    const inputFilter = ui.inputText("filter text (case-insensitive)", "");
    inputFilter.addEventListener("input", () => {
      filterText = inputFilter.value.trim().toLowerCase();
      repaint(true);
    });
    const chOnlyCurrent = ui.checkbox(false);
    chOnlyCurrent.addEventListener("change", () => {
      onlyCurrentSocket = chOnlyCurrent.checked;
      repaint(true);
    });
    const btnPause = ui.btn("Pause", () => {
      paused = !paused;
      btnPause.textContent = paused ? "Resume" : "Pause";
    });
    const btnClear = ui.btn("Clear", () => {
      frames.clear();
      framesMap.clear();
      setSelectedRow(null);
      repaint(true);
    });
    const btnCopy = ui.btn("Copy visible", () => copyVisible());
    head.appendChild(ui.row(
      lblConn,
      $spacer(),
      chIn,
      ui.label("IN"),
      chOut,
      ui.label("OUT"),
      inputFilter,
      chOnlyCurrent,
      ui.label("Current socket only"),
      btnPause,
      btnClear,
      btnCopy
    ));
    view.appendChild(head);
    const muteSec = ui.section("Mutes (exclude by regex)");
    const muteInput = ui.inputText("add regex (e.g. ping|keepalive)", "");
    const btnAddMute = ui.btn("Add", () => {
      const raw = muteInput.value.trim();
      if (!raw) return;
      try {
        mutePatterns.push(new RegExp(raw, "i"));
        muteInput.value = "";
        repaintMutes();
        repaint(true);
      } catch {
      }
    });
    const mutesWrap = document.createElement("div");
    mutesWrap.style.display = "flex";
    mutesWrap.style.flexWrap = "wrap";
    mutesWrap.style.gap = "6px";
    function repaintMutes() {
      mutesWrap.innerHTML = "";
      mutePatterns.forEach((rx, i) => {
        const chip = document.createElement("button");
        chip.className = "qmm-btn";
        chip.textContent = `/${rx.source}/i \xD7`;
        chip.title = "Remove";
        chip.onclick = () => {
          mutePatterns.splice(i, 1);
          repaintMutes();
          repaint(true);
        };
        mutesWrap.appendChild(chip);
      });
    }
    muteSec.appendChild(ui.row(muteInput, btnAddMute));
    muteSec.appendChild(mutesWrap);
    view.appendChild(muteSec);
    const pickSec = ui.section("Sockets");
    const sel = document.createElement("select");
    sel.className = "qmm-input";
    sel.style.minWidth = "260px";
    pickSec.appendChild(sel);
    view.appendChild(pickSec);
    function refreshSocketPicker() {
      const wsArr = Array.from(registry.values());
      sel.innerHTML = "";
      wsArr.forEach((info, idx) => {
        const op = document.createElement("option");
        op.value = String(idx);
        op.textContent = info.id + (info.ws === quinoaWS ? " \u2022 page" : "");
        sel.appendChild(op);
      });
      if (!sel.value && sel.options.length) sel.value = "0";
      lblConn.textContent = statusText();
    }
    function currentWS() {
      const idx = Number(sel.value);
      const vals = Array.from(registry.values());
      return Number.isFinite(idx) ? vals[idx]?.ws ?? null : null;
    }
    const logWrap = document.createElement("div");
    logWrap.style.border = "1px solid #ffffff14";
    logWrap.style.borderRadius = "10px";
    logWrap.style.background = "#0f1318";
    logWrap.style.padding = "6px";
    logWrap.style.maxHeight = "46vh";
    logWrap.style.overflow = "auto";
    logWrap.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    logWrap.style.fontSize = "12px";
    logWrap.style.lineHeight = "1.3";
    logWrap.style.userSelect = "text";
    const style = document.createElement("style");
    style.textContent = `
    .ws-row{display:grid;grid-template-columns:92px 18px 1fr auto;gap:8px;padding:3px 4px;border-bottom:1px dashed #ffffff12;align-items:start}
    .ws-row .ts{opacity:.8}
    .ws-row .arrow{font-weight:600}
    .ws-row .body{white-space:pre-wrap;word-break:break-word}
    .ws-row .acts{display:none;gap:6px}
    .ws-row:hover .acts{display:flex}
    .ws-row.selected{background:rgba(120,160,255,.12)}
    .ws-row .chip{border:1px solid #ffffff26;background:#ffffff14;border-radius:6px;padding:2px 6px;cursor:pointer}
  `;
    logWrap.appendChild(style);
    view.appendChild(logWrap);
    const sendSec = ui.section("Send");
    const ta = document.createElement("textarea");
    ta.className = "qmm-input";
    ta.style.width = "100%";
    ta.style.minHeight = "120px";
    ta.placeholder = `Select a frame or paste a payload here. Choose Text or JSON below.`;
    const asJson = ui.radioGroup(
      "ws-send-mode",
      [{ value: "text", label: "Text" }, { value: "json", label: "JSON" }],
      "text",
      () => {
      }
    );
    const chUseSource = ui.checkbox(false);
    chUseSource.addEventListener("change", () => {
      replayToSource = chUseSource.checked;
    });
    const btnSend = ui.btn("Send", () => doSend());
    const btnCopyPayload = ui.btn("Copy payload", () => copy(ta.value));
    sendSec.appendChild(ta);
    sendSec.appendChild(ui.row(asJson, chUseSource, ui.label("Use source WS"), btnSend, btnCopyPayload));
    view.appendChild(sendSec);
    installWSHookIfNeeded((f) => {
      if (paused) return;
      const ex = { ...f, id: ++seq };
      frames.push(ex);
      framesMap.set(ex.id, ex);
      lblConn.textContent = statusText();
      appendOne(ex);
    });
    refreshSocketPicker();
    repaint(true);
    const pollId = window.setInterval(() => {
      refreshSocketPicker();
    }, 1e3);
    view.__ws_cleanup__ = () => {
      window.clearInterval(pollId);
    };
    function statusText() {
      const anyOpen = sockets.some((ws) => ws.readyState === WebSocket.OPEN);
      const viaW = workerFound ? "worker" : "page/auto";
      return `status: ${anyOpen ? "OPEN" : "none"} \u2022 mode: ${viaW}`;
    }
    function passesFilters(f) {
      if (f.dir === "in" && !showIn || f.dir === "out" && !showOut) return false;
      if (filterText && !f.text.toLowerCase().includes(filterText)) return false;
      if (onlyCurrentSocket && f.ws && currentWS() && f.ws !== currentWS()) return false;
      if (matchesMutes(f.text)) return false;
      return true;
    }
    function rowActions(fid, f) {
      const acts = document.createElement("div");
      acts.className = "acts";
      const bCopy = document.createElement("button");
      bCopy.className = "qmm-btn";
      bCopy.textContent = "Copy";
      bCopy.onclick = (e) => {
        e.stopPropagation();
        copy(f.text);
      };
      const bToEd = document.createElement("button");
      bToEd.className = "qmm-btn";
      bToEd.textContent = "\u2192 Editor";
      bToEd.onclick = (e) => {
        e.stopPropagation();
        ta.value = f.text;
        setSelectedRow(fid);
      };
      const bReplay = document.createElement("button");
      bReplay.className = "qmm-btn";
      bReplay.textContent = "Replay";
      bReplay.title = "Send right away (to current WS or source WS if enabled)";
      bReplay.onclick = (e) => {
        e.stopPropagation();
        replayFrame(f);
      };
      acts.append(bCopy, bToEd, bReplay);
      return acts;
    }
    function buildRow(f) {
      const row = document.createElement("div");
      row.className = "ws-row";
      row.dataset.fid = String(f.id);
      const ts = document.createElement("div");
      ts.className = "ts";
      ts.textContent = fmtTime(f.t);
      const arrow = document.createElement("div");
      arrow.className = "arrow";
      arrow.textContent = f.dir === "in" ? "\u2190" : "\u2192";
      arrow.style.color = f.dir === "in" ? "#4bd17a" : "#8ab4ff";
      const body = document.createElement("div");
      body.className = "body";
      body.innerHTML = `<code>${escapeLite(f.text)}</code>`;
      const acts = rowActions(f.id, f);
      row.append(ts, arrow, body, acts);
      row.onclick = () => setSelectedRow(f.id);
      row.ondblclick = () => {
        ta.value = f.text;
        setSelectedRow(f.id);
      };
      return row;
    }
    function appendOne(f) {
      if (!passesFilters(f)) return;
      const row = buildRow(f);
      logWrap.appendChild(row);
      if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
    }
    function repaint(full = false) {
      logWrap.querySelectorAll(".ws-row").forEach((n) => n.remove());
      frames.toArray().forEach((f) => {
        if (passesFilters(f)) logWrap.appendChild(buildRow(f));
      });
      if (selectedId != null) setSelectedRow(selectedId);
      if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
    }
    function copyVisible() {
      const lines = frames.toArray().filter((f) => passesFilters(f)).map((f) => `[${fmtTime(f.t)}] ${f.dir === "in" ? "<-" : "->"} ${f.text}`).join("\n");
      copy(lines);
    }
    function replayFrame(f) {
      const wsTarget = replayToSource && f.ws ? f.ws : currentWS();
      if (!wsTarget || wsTarget.readyState !== WebSocket.OPEN) return;
      const mode = asJson.querySelector('input[type="radio"]:checked')?.value || "text";
      if (mode === "json") {
        try {
          wsTarget.send(JSON.parse(f.text));
        } catch {
          wsTarget.send(f.text);
        }
      } else {
        wsTarget.send(f.text);
      }
    }
    function doSend() {
      const ws = currentWS();
      const wsAlt = selectedId != null && replayToSource ? framesMap.get(selectedId)?.ws ?? null : null;
      const target = (replayToSource ? wsAlt : ws) || ws;
      if (!target || target.readyState !== WebSocket.OPEN) return;
      const mode = asJson.querySelector('input[type="radio"]:checked')?.value || "text";
      if (mode === "json") {
        try {
          target.send(JSON.parse(ta.value));
        } catch {
          target.send(ta.value);
        }
      } else {
        target.send(ta.value);
      }
    }
  }

  // src/ui/toast.ts
  async function sendToast(toast) {
    const sendAtom = getAtomByLabel("sendQuinoaToastAtom");
    if (sendAtom) {
      await jSet(sendAtom, toast);
      return;
    }
    const listAtom = getAtomByLabel("quinoaToastsAtom");
    if (!listAtom) throw new Error("Aucun atom de toast trouv\xE9");
    const prev = await jGet(listAtom).catch(() => []);
    const t = { isClosable: true, duration: 1e4, ...toast };
    if ("toastType" in t && t.toastType === "board") {
      t.id = t.id ?? (t.isStackable ? `quinoa-stackable-${Date.now()}-${Math.random()}` : "quinoa-game-toast");
    } else {
      t.id = t.id ?? "quinoa-game-toast";
    }
    await jSet(listAtom, [...prev, t]);
  }
  async function toastSimple(title, description, variant = "info", duration = 3500) {
    await sendToast({ title, description, variant, duration });
  }

  // src/services/players.ts
  function findPlayersDeep(state2) {
    if (!state2 || typeof state2 !== "object") return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const stack = [state2];
    while (stack.length) {
      const cur2 = stack.pop();
      if (!cur2 || typeof cur2 !== "object" || seen.has(cur2)) continue;
      seen.add(cur2);
      for (const k of Object.keys(cur2)) {
        const v = cur2[k];
        if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object")) {
          const looks = v.some((p) => "id" in p && "name" in p);
          if (looks && /player/i.test(k)) out.push(...v);
        }
        if (v && typeof v === "object") stack.push(v);
      }
    }
    const byId = /* @__PURE__ */ new Map();
    for (const p of out) if (p?.id) byId.set(String(p.id), p);
    return [...byId.values()];
  }
  function getPlayersArray(st) {
    const direct = st?.fullState?.data?.players ?? st?.data?.players ?? st?.players;
    return Array.isArray(direct) ? direct : findPlayersDeep(st);
  }
  function getSlotsArray(st) {
    const raw = st?.child?.data?.userSlots ?? st?.fullState?.child?.data?.userSlots ?? st?.data?.userSlots;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      const entries = Object.entries(raw);
      entries.sort((a, b) => {
        const ai = Number(a[0]);
        const bi = Number(b[0]);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
        return a[0].localeCompare(b[0]);
      });
      return entries.map(([, v]) => v);
    }
    return [];
  }
  function extractPosFromSlot(slot) {
    const pos = slot?.data?.position ?? slot?.position ?? slot?.data?.coords ?? slot?.coords;
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  function extractInventoryFromSlot(slot) {
    const inv = slot?.data?.inventory;
    if (!inv || typeof inv !== "object") return null;
    const items = Array.isArray(inv.items) ? inv.items : [];
    const favoritedItemIds = Array.isArray(inv.favoritedItemIds) ? inv.favoritedItemIds : [];
    return { items, favoritedItemIds };
  }
  function extractJournalFromSlot(slot) {
    const j = slot?.data?.journal ?? slot?.journal;
    if (!j || typeof j !== "object") return null;
    const produce = j.produce && typeof j.produce === "object" ? j.produce : void 0;
    const pets = j.pets && typeof j.pets === "object" ? j.pets : void 0;
    const normProduce = produce ? Object.fromEntries(Object.entries(produce).map(([k, v]) => [
      String(k),
      { variantsLogged: Array.isArray(v?.variantsLogged) ? v.variantsLogged : [] }
    ])) : void 0;
    const normPets = pets ? Object.fromEntries(Object.entries(pets).map(([k, v]) => [
      String(k),
      {
        variantsLogged: Array.isArray(v?.variantsLogged) ? v.variantsLogged : [],
        abilitiesLogged: Array.isArray(v?.abilitiesLogged) ? v.abilitiesLogged : []
      }
    ])) : void 0;
    return { produce: normProduce, pets: normPets };
  }
  function extractGardenFromSlot(slot) {
    const g = slot?.data?.garden ?? slot?.garden;
    if (!g || typeof g !== "object") return null;
    const to = g.tileObjects;
    const bto = g.boardwalkTileObjects;
    const tileObjects = to && typeof to === "object" ? to : {};
    const boardwalkTileObjects = bto && typeof bto === "object" ? bto : {};
    return { tileObjects, boardwalkTileObjects };
  }
  function getSlotByPlayerId(st, playerId) {
    for (const s of getSlotsArray(st)) if (String(s?.playerId ?? "") === String(playerId)) return s;
    return null;
  }
  function enrichPlayersWithSlots(players2, st) {
    const byPid = /* @__PURE__ */ new Map();
    for (const slot of getSlotsArray(st)) {
      if (!slot || typeof slot !== "object") continue;
      const pid = slot.playerId != null ? String(slot.playerId) : "";
      if (!pid) continue;
      const pos = extractPosFromSlot(slot);
      const inv = extractInventoryFromSlot(slot);
      byPid.set(pid, { x: pos?.x, y: pos?.y, inventory: inv ?? null });
    }
    return players2.map((p) => {
      const extra = byPid.get(String(p.id));
      return extra ? { ...p, ...extra } : { ...p, inventory: null };
    });
  }
  function orderPlayersBySlots(players2, st) {
    const slots = getSlotsArray(st);
    const mapById = /* @__PURE__ */ new Map();
    for (const p of players2) mapById.set(String(p.id), p);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const s of slots) {
      const pid = s?.playerId != null ? String(s.playerId) : "";
      if (!pid || seen.has(pid)) continue;
      const p = mapById.get(pid);
      if (p) {
        out.push(p);
        seen.add(pid);
      }
    }
    for (const p of players2) {
      const pid = String(p.id);
      if (!seen.has(pid)) {
        out.push(p);
        seen.add(pid);
      }
    }
    return out;
  }
  function clampPlayers(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(6, v));
  }
  async function getPlayersInRoom() {
    try {
      const raw = await Atoms.server.numPlayers.get();
      return clampPlayers(raw);
    } catch {
      return 1;
    }
  }
  var __cachedSpawnTiles = null;
  var __spawnLoadPromise = null;
  async function getSpawnTilesSorted() {
    if (Array.isArray(__cachedSpawnTiles)) return __cachedSpawnTiles;
    if (__spawnLoadPromise) return __spawnLoadPromise;
    __spawnLoadPromise = (async () => {
      try {
        const map2 = await Atoms.root.map.get();
        const arr = map2?.spawnTiles;
        if (Array.isArray(arr) && arr.every((n) => Number.isFinite(n))) {
          __cachedSpawnTiles = [...arr].sort((a, b) => a - b);
          return __cachedSpawnTiles;
        }
      } catch {
      }
      try {
        const st = await Atoms.root.state.get();
        const seen = /* @__PURE__ */ new Set();
        const stack = [st];
        while (stack.length) {
          const cur2 = stack.pop();
          if (!cur2 || typeof cur2 !== "object" || seen.has(cur2)) continue;
          seen.add(cur2);
          const arr = cur2?.spawnTiles;
          if (Array.isArray(arr) && arr.every((n) => Number.isFinite(n))) {
            __cachedSpawnTiles = [...arr].sort((a, b) => a - b);
            return __cachedSpawnTiles;
          }
          for (const k of Object.keys(cur2)) {
            const v = cur2[k];
            if (v && typeof v === "object") stack.push(v);
          }
        }
      } catch {
      }
      __cachedSpawnTiles = [];
      return __cachedSpawnTiles;
    })();
    const res = await __spawnLoadPromise;
    __spawnLoadPromise = null;
    return res;
  }
  async function getMapCols() {
    try {
      const map2 = await Atoms.root.map.get();
      const cols = Number(map2?.cols);
      if (Number.isFinite(cols) && cols > 0) return cols;
    } catch {
    }
    try {
      const st = await Atoms.root.state.get();
      const maybeCols = Number(
        st?.map?.cols ?? st?.child?.data?.map?.cols ?? st?.fullState?.map?.cols
      );
      if (Number.isFinite(maybeCols) && maybeCols > 0) return maybeCols;
    } catch {
    }
    return 81;
  }
  function assignGardenPositions(players2, spawnTilesSorted) {
    if (!players2.length || !spawnTilesSorted.length) {
      return players2.map((p) => ({ ...p, gardenPosition: null }));
    }
    const out = [];
    for (let i = 0; i < players2.length; i++) {
      out.push({ ...players2[i], gardenPosition: spawnTilesSorted[i] ?? null });
    }
    return out;
  }
  function nowTs() {
    return Date.now();
  }
  function normJournal(j) {
    if (!j || typeof j !== "object") return {};
    const out = {};
    if (j.produce && typeof j.produce === "object") out.produce = j.produce;
    if (j.pets && typeof j.pets === "object") out.pets = j.pets;
    return out;
  }
  function hasJournalData(j) {
    if (!j) return false;
    const hasProduce = !!j.produce && Object.values(j.produce).some((s) => (s.variantsLogged?.length ?? 0) > 0);
    const hasPets = !!j.pets && Object.values(j.pets).some((s) => (s.variantsLogged?.length ?? 0) > 0 || (s.abilitiesLogged?.length ?? 0) > 0);
    return hasProduce || hasPets;
  }
  var followingState = {
    currentTargetId: null,
    unsub: null,
    lastPos: null,
    prevPos: null,
    steps: 0
  };
  var PlayersService = {
    async list() {
      const st = await Atoms.root.state.get();
      if (!st) return [];
      const base = enrichPlayersWithSlots(getPlayersArray(st), st);
      const ordered = orderPlayersBySlots(base, st);
      const spawns = await getSpawnTilesSorted();
      return assignGardenPositions(ordered, spawns);
    },
    async onChange(cb) {
      return Atoms.root.state.onChange(async () => {
        try {
          cb(await this.list());
        } catch {
        }
      });
    },
    async getPosition(playerId) {
      const st = await Atoms.root.state.get();
      if (!st) return null;
      const slot = getSlotByPlayerId(st, playerId);
      return extractPosFromSlot(slot);
    },
    async getInventory(playerId) {
      const st = await Atoms.root.state.get();
      if (!st) return null;
      const slot = getSlotByPlayerId(st, playerId);
      return extractInventoryFromSlot(slot);
    },
    async getJournal(playerId) {
      const st = await Atoms.root.state.get();
      if (!st) return null;
      const slot = getSlotByPlayerId(st, playerId);
      const j = extractJournalFromSlot(slot);
      return j ? normJournal(j) : null;
    },
    async getGarden(playerId) {
      const st = await Atoms.root.state.get();
      if (!st) return null;
      const slot = getSlotByPlayerId(st, playerId);
      return extractGardenFromSlot(slot);
    },
    async getGardenPosition(playerId) {
      const list = await this.list();
      const p = list.find((x) => String(x.id) === String(playerId));
      return p?.gardenPosition ?? null;
    },
    async getPlayerNameById(playerId) {
      try {
        const st = await Atoms.root.state.get();
        if (st) {
          const arr = getPlayersArray(st);
          const p = arr.find((x) => String(x?.id) === String(playerId));
          if (p && typeof p.name === "string" && p.name) return p.name;
        }
      } catch {
      }
      try {
        const list = await this.list();
        const p = list.find((x) => String(x.id) === String(playerId));
        return p?.name ?? null;
      } catch {
        return null;
      }
    },
    async teleportToPlayer(playerId) {
      const pos = await this.getPosition(playerId);
      if (!pos) throw new Error("Unknown position for this player");
      PlayerService.teleport(pos.x, pos.y);
      toastSimple("Teleport", `Teleported to ${await this.getPlayerNameById(playerId)}`, "success");
    },
    async teleportToGarden(playerId) {
      const tileId = await this.getGardenPosition(playerId);
      if (tileId == null) {
        await toastSimple("Teleport", "No garden position for this player.", "error");
        return;
      }
      const cols = await getMapCols();
      const x = tileId % cols, y = Math.floor(tileId / cols);
      await PlayerService.teleport(x, y);
      await toastSimple("Teleport", `Teleported to ${await this.getPlayerNameById(playerId)}'s garden`, "success");
    },
    async getInventoryValue(playerId, opts) {
      try {
        const playersInRoom = await getPlayersInRoom();
        const inv = await this.getInventory(playerId);
        const items = Array.isArray(inv?.items) ? inv.items : [];
        if (!items.length) return 0;
        return sumInventoryValue(items, opts, playersInRoom);
      } catch {
        return 0;
      }
    },
    async getGardenValue(playerId, opts) {
      try {
        const playersInRoom = await getPlayersInRoom();
        const garden2 = await this.getGarden(playerId);
        if (!garden2) return 0;
        return sumGardenValue(garden2.tileObjects ?? {}, opts, playersInRoom);
      } catch {
        return 0;
      }
    },
    /** Ouvre l’aperçu d’inventaire (fake modal) avec garde + toasts. */
    async openInventoryPreview(playerId, playerName) {
      try {
        const inv = await this.getInventory(playerId);
        if (!inv) {
          await toastSimple("Inventory", "No inventory object found for this player.", "error");
          return;
        }
        const items = Array.isArray(inv.items) ? inv.items : [];
        if (items.length === 0) {
          await toastSimple("Inventory", "Inventory is empty for this player.", "info");
          return;
        }
        try {
          await fakeInventoryShow({ ...inv, items }, { open: true });
        } catch (err) {
          await toastSimple("Inventory", err?.message || "Failed to open inventory", "error");
          return;
        }
        if (playerName) await toastSimple("Inventory", `${playerName}'s inventory displayed.`, "info");
      } catch (e) {
        await toastSimple("Inventory", e?.message || "Failed to open inventory.", "error");
      }
    },
    /** Ouvre le Journal (produce + pets) avec garde + toasts. */
    async openJournalLog(playerId, playerName) {
      try {
        const journal = await this.getJournal(playerId);
        if (!hasJournalData(journal)) {
          await toastSimple("Journal", "No journal data for this player.", "error");
          return;
        }
        const safe = journal ?? {};
        try {
          await fakeJournalShow(safe, { open: true });
        } catch (err) {
          await toastSimple("Journal", err?.message || "Failed to open journal.", "error");
          return;
        }
        if (playerName) await toastSimple("Journal", `${playerName}'s journal displayed.`, "info");
      } catch (e) {
        await toastSimple("Journal", e?.message || "Failed to open journal.", "error");
      }
    },
    /* ---------------- Ajouts "fake" au journal (UI only, avec gardes) ---------------- */
    async addProduceVariant(playerId, species, variant, createdAt = nowTs()) {
      if (!species || !variant) {
        await toastSimple("Journal", "Missing species or variant.", "error");
        return;
      }
      try {
        await fakeJournalShow({
          produce: {
            [String(species)]: {
              variantsLogged: [{ variant: String(variant), createdAt }]
            }
          }
        }, { open: true });
        const name = await this.getPlayerNameById(playerId);
        await toastSimple("Journal", `Added produce variant "${variant}" for ${name ?? playerId}.`, "success");
      } catch (e) {
        await toastSimple("Journal", e?.message || "Failed to add produce variant.", "error");
      }
    },
    async addPetVariant(playerId, petSpecies, variant, createdAt = nowTs()) {
      if (!petSpecies || !variant) {
        await toastSimple("Journal", "Missing pet species or variant.", "error");
        return;
      }
      try {
        await fakeJournalShow({
          pets: {
            [String(petSpecies)]: {
              variantsLogged: [{ variant: String(variant), createdAt }]
            }
          }
        }, { open: true });
        const name = await this.getPlayerNameById(playerId);
        await toastSimple("Journal", `Added pet variant "${variant}" for ${name ?? playerId}.`, "success");
      } catch (e) {
        await toastSimple("Journal", e?.message || "Failed to add pet variant.", "error");
      }
    },
    async addPetAbility(playerId, petSpecies, ability, createdAt = nowTs()) {
      if (!petSpecies || !ability) {
        await toastSimple("Journal", "Missing pet species or ability.", "error");
        return;
      }
      try {
        await fakeJournalShow({
          pets: {
            [String(petSpecies)]: {
              abilitiesLogged: [{ ability: String(ability), createdAt }]
            }
          }
        }, { open: true });
        const name = await this.getPlayerNameById(playerId);
        await toastSimple("Journal", `Added pet ability "${ability}" for ${name ?? playerId}.`, "success");
      } catch (e) {
        await toastSimple("Journal", e?.message || "Failed to add pet ability.", "error");
      }
    },
    /* ---------------- Follow ---------------- */
    async stopFollowing() {
      if (followingState.unsub) {
        try {
          await followingState.unsub();
        } catch {
        }
      }
      followingState.unsub = null;
      followingState.currentTargetId = null;
      followingState.lastPos = null;
      followingState.prevPos = null;
      followingState.steps = 0;
    },
    isFollowing(playerId) {
      return followingState.currentTargetId === playerId;
    },
    async startFollowing(playerId) {
      if (followingState.unsub) {
        try {
          await followingState.unsub();
        } catch {
        }
        followingState.unsub = null;
      }
      followingState.currentTargetId = playerId;
      followingState.lastPos = null;
      followingState.prevPos = null;
      followingState.steps = 0;
      const pos = await this.getPosition(playerId);
      if (!pos) {
        await toastSimple("Follow", "Unable to retrieve player position.", "error");
        followingState.currentTargetId = null;
        return;
      }
      await PlayerService.teleport(pos.x, pos.y);
      followingState.lastPos = { x: pos.x, y: pos.y };
      followingState.prevPos = null;
      followingState.steps = 0;
      followingState.unsub = await this.onChange(async (players2) => {
        if (followingState.currentTargetId !== playerId) return;
        const target = players2.find((p) => p.id === playerId);
        if (!target || typeof target.x !== "number" || typeof target.y !== "number") {
          await this.stopFollowing();
          await toastSimple("Follow", "The target is no longer trackable (disconnected?).", "error");
          return;
        }
        const cur2 = { x: target.x, y: target.y };
        const last = followingState.lastPos;
        if (!last) {
          followingState.lastPos = cur2;
          return;
        }
        if (cur2.x !== last.x || cur2.y !== last.y) {
          followingState.steps += 1;
          if (followingState.steps >= 2) {
            if (last) {
              PlayerService.move(last.x, last.y);
            }
          }
          followingState.prevPos = followingState.lastPos;
          followingState.lastPos = cur2;
        }
      });
      await toastSimple("Follow", "Follow enabled", "success");
    }
  };

  // src/ui/menus/players.ts
  async function readPlayers() {
    return PlayersService.list();
  }
  var NF_US_INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  function truncateLabel(s, max = 22) {
    if (!s) return "";
    return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
  }
  var vItem = (p) => ({
    id: p.id,
    title: truncateLabel(p.name || p.id, 9),
    subtitle: p.isConnected ? "Online" : "Offline",
    avatarUrl: p.discordAvatarUrl || "",
    statusColor: p.isConnected ? "#48d170" : "#999a"
  });
  function styleBtnFullWidthL(b, text) {
    b.textContent = text;
    b.style.width = "auto";
    b.style.minWidth = "110px";
    b.style.margin = "0";
    b.style.padding = "6px 10px";
    b.style.fontSize = "13px";
    b.style.lineHeight = "1.1";
    b.style.borderRadius = "6px";
    b.style.border = "1px solid #4445";
    b.style.background = "#1f2328";
    b.style.color = "#e7eef7";
    b.style.justifyContent = "center";
    b.onmouseenter = () => b.style.borderColor = "#6aa1";
    b.onmouseleave = () => b.style.borderColor = "#4445";
  }
  function sectionFramed(titleText, content) {
    const s = document.createElement("div");
    s.style.display = "grid";
    s.style.justifyItems = "center";
    s.style.gap = "8px";
    s.style.textAlign = "center";
    s.style.border = "1px solid #4446";
    s.style.borderRadius = "10px";
    s.style.padding = "10px";
    s.style.background = "#0f1318";
    s.style.boxShadow = "0 0 0 1px #0002 inset";
    s.style.width = "min(720px, 100%)";
    const h = document.createElement("div");
    h.textContent = titleText;
    h.style.fontWeight = "600";
    h.style.opacity = "0.95";
    s.append(h, content);
    return s;
  }
  function rowCenter() {
    const r = document.createElement("div");
    r.style.display = "flex";
    r.style.alignItems = "center";
    r.style.justifyContent = "center";
    r.style.flexWrap = "wrap";
    r.style.gap = "6px";
    return r;
  }
  function rowLeft() {
    const r = rowCenter();
    r.style.justifyContent = "flex-start";
    r.style.width = "100%";
    return r;
  }
  function ensureVtabsListScrollable(vtabsRoot) {
    const ul = vtabsRoot.querySelector("ul");
    if (!ul) return;
    let wrap = vtabsRoot.querySelector('[data-scroll-wrap="1"]');
    if (!wrap || !wrap.contains(ul)) {
      wrap = document.createElement("div");
      wrap.dataset.scrollWrap = "1";
      wrap.style.flex = "1 1 auto";
      wrap.style.minHeight = "0";
      wrap.style.overflow = "auto";
      wrap.style.marginTop = "6px";
      const parent = ul.parentElement;
      parent.insertBefore(wrap, ul);
      wrap.appendChild(ul);
    } else {
      wrap.style.flex = "1 1 auto";
      wrap.style.minHeight = "0";
      wrap.style.overflow = "auto";
    }
  }
  async function renderPlayersMenu(root) {
    const ui = new Menu({ id: "players", compact: true, windowSelector: ".qws-win" });
    ui.mount(root);
    const panel = ui.root.querySelector(".qmm-views");
    const { root: split, left, right } = ui.split2("260px");
    panel.appendChild(split);
    split.style.height = "100%";
    split.style.minHeight = "0";
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.minHeight = "0";
    right.style.minHeight = "0";
    right.style.overflow = "auto";
    const vt = ui.vtabs({
      filterPlaceholder: "Find player\u2026",
      onSelect: (_id, item) => renderRight(item?.id || null)
    });
    vt.root.style.display = "flex";
    vt.root.style.flexDirection = "column";
    vt.root.style.flex = "1 1 auto";
    vt.root.style.minHeight = "0";
    left.appendChild(vt.root);
    const filter = vt.root.querySelector(".filter");
    if (filter) {
      filter.style.display = "flex";
      filter.style.alignItems = "center";
      filter.style.gap = "8px";
      const input = filter.querySelector("input");
      if (input) {
        input.style.flex = "1 1 auto";
        input.style.minWidth = "0";
      }
    }
    ensureVtabsListScrollable(vt.root);
    const mo = new MutationObserver(() => ensureVtabsListScrollable(vt.root));
    mo.observe(vt.root, { childList: true, subtree: true });
    async function renderRight(playerId) {
      right.innerHTML = "";
      const p = playerId ? players2.find((x) => x.id === playerId) || null : null;
      if (!p) {
        const empty = document.createElement("div");
        empty.style.opacity = "0.75";
        empty.textContent = "Select a player on the left.";
        right.appendChild(empty);
        return;
      }
      const col = document.createElement("div");
      col.style.display = "grid";
      col.style.gridAutoRows = "min-content";
      col.style.justifyItems = "center";
      col.style.gap = "10px";
      col.style.overflow = "auto";
      right.appendChild(col);
      const prof = document.createElement("div");
      prof.style.display = "grid";
      prof.style.gap = "8px";
      prof.style.justifyItems = "center";
      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.gap = "12px";
      const avatar = document.createElement("img");
      avatar.src = p.discordAvatarUrl || "";
      avatar.alt = p.name;
      avatar.width = 48;
      avatar.height = 48;
      avatar.style.borderRadius = "50%";
      avatar.style.objectFit = "cover";
      avatar.style.border = "1px solid #4446";
      const title = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.textContent = p.name || p.id;
      nameEl.style.fontWeight = "600";
      nameEl.style.fontSize = "16px";
      const sub = document.createElement("div");
      sub.style.opacity = "0.8";
      sub.style.fontSize = "12px";
      sub.textContent = p.isConnected ? "Online" : "Offline";
      title.append(nameEl, sub);
      head.append(avatar, title);
      const info = document.createElement("div");
      info.style.opacity = "0.9";
      prof.append(head, info);
      col.appendChild(prof);
      const infoWrap = document.createElement("div");
      infoWrap.style.display = "grid";
      infoWrap.style.gap = "6px";
      infoWrap.style.justifySelf = "stretch";
      infoWrap.style.width = "100%";
      const invValueRow = rowLeft();
      const invLabel = document.createElement("div");
      invLabel.textContent = "Inventory: ";
      invLabel.style.fontSize = "14px";
      invLabel.style.opacity = "0.85";
      const invValue = document.createElement("div");
      invValue.textContent = "\u2026";
      invValue.style.fontWeight = "700";
      invValueRow.append(invLabel, invValue);
      const gardenValueRow = rowLeft();
      const gardenLabel = document.createElement("div");
      gardenLabel.textContent = "Garden: ";
      gardenLabel.style.fontSize = "14px";
      gardenLabel.style.opacity = "0.85";
      const gardenValue = document.createElement("div");
      gardenValue.textContent = "\u2026";
      gardenValue.style.fontWeight = "700";
      gardenValueRow.append(gardenLabel, gardenValue);
      infoWrap.append(invValueRow, gardenValueRow);
      col.appendChild(sectionFramed("Crops values", infoWrap));
      const teleRow = rowCenter();
      const btnToPlayer = document.createElement("button");
      const btnToGarden = document.createElement("button");
      styleBtnFullWidthL(btnToPlayer, "To player");
      styleBtnFullWidthL(btnToGarden, "To garden");
      btnToPlayer.onclick = async () => {
        try {
          const fn = PlayersService.teleportToPlayer ?? PlayersService.teleportTo;
          await fn.call(PlayersService, p.id);
        } catch (e) {
          await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
        }
      };
      btnToGarden.onclick = async () => {
        try {
          const fn = PlayersService.teleportToGarden ?? PlayersService.tptogarden;
          await fn.call(PlayersService, p.id);
        } catch (e) {
          await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
        }
      };
      teleRow.append(btnToPlayer, btnToGarden);
      col.appendChild(sectionFramed("Teleport", teleRow));
      const invRow = rowCenter();
      const btnInv = document.createElement("button");
      const btnJournal = document.createElement("button");
      styleBtnFullWidthL(btnInv, "Inventory");
      styleBtnFullWidthL(btnJournal, "Journal");
      btnInv.onclick = async () => {
        try {
          ui.setWindowVisible(false);
          await PlayersService.openInventoryPreview(p.id, p.name);
          if (await isInventoryPanelOpen()) {
            await waitInventoryPanelClosed();
          }
        } finally {
          ui.setWindowVisible(true);
        }
      };
      btnJournal.onclick = async () => {
        try {
          ui.setWindowVisible(false);
          await PlayersService.openJournalLog(p.id, p.name);
          if (await isJournalModalOpen()) {
            await waitJournalModalClosed();
          }
        } finally {
          ui.setWindowVisible(true);
        }
      };
      invRow.append(btnInv, btnJournal);
      col.appendChild(sectionFramed("Inspect", invRow));
      const funRow = rowCenter();
      const label2 = document.createElement("div");
      label2.textContent = "Follow";
      label2.style.fontSize = "14px";
      label2.style.opacity = "0.85";
      const sw = ui.switch(PlayersService.isFollowing(p.id));
      sw.addEventListener("change", async () => {
        try {
          if (sw.checked) {
            await PlayersService.startFollowing(p.id);
            await toastSimple("Follow", "Enabled.", "success");
          } else {
            PlayersService.stopFollowing();
            await toastSimple("Follow", "Disable.", "info");
          }
        } catch (e) {
          await toastSimple("Follow", e?.message || "Error", "error");
          sw.checked = !sw.checked;
        }
      });
      funRow.append(label2, sw);
      col.appendChild(sectionFramed("Fun", funRow));
      (async () => {
        try {
          const total = await PlayersService.getInventoryValue(p.id);
          invValue.textContent = `${NF_US_INT.format(Math.round(total))} coins`;
          invValue.title = "Total inventory value";
        } catch {
          invValue.textContent = "\u2014";
        }
        try {
          const total = await PlayersService.getGardenValue(p.id);
          gardenValue.textContent = `${NF_US_INT.format(Math.round(total))} coins`;
          gardenValue.title = "Total garden value";
        } catch {
          gardenValue.textContent = "\u2014";
        }
      })();
    }
    let players2 = [];
    let lastSig = "";
    function signature(ps) {
      return ps.map(
        (p) => `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}|${p.inventory?.items?.length ?? 0}`
      ).join(";");
    }
    async function refreshAll(keepSelection = true) {
      const prevSel = vt.getSelected()?.id ?? null;
      const next = await readPlayers();
      const sig = signature(next);
      if (sig === lastSig) {
        return;
      }
      lastSig = sig;
      players2 = next;
      vt.setItems(players2.map(vItem));
      ensureVtabsListScrollable(vt.root);
      const sel = keepSelection && prevSel && players2.some((p) => p.id === prevSel) ? prevSel : players2[0]?.id ?? null;
      if (sel !== null) vt.select(sel);
      else renderRight(null);
    }
    await PlayersService.onChange(() => {
      refreshAll(true).catch(() => {
      });
    });
    await refreshAll(true);
  }

  // src/ui/menus/pets.ts
  function styleBtnFullWidth(b, text) {
    b.textContent = text;
    b.style.flex = "1";
    b.style.margin = "0";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid #4445";
    b.style.background = "#1f2328";
    b.style.color = "#e7eef7";
    b.style.justifyContent = "center";
    b.onmouseenter = () => b.style.borderColor = "#6aa1";
    b.onmouseleave = () => b.style.borderColor = "#4445";
  }
  function sectionFramed2(titleText, content) {
    const s = document.createElement("div");
    s.style.display = "grid";
    s.style.justifyItems = "center";
    s.style.gap = "8px";
    s.style.textAlign = "center";
    s.style.border = "1px solid #4446";
    s.style.borderRadius = "10px";
    s.style.padding = "10px";
    s.style.background = "#1f2328";
    s.style.boxShadow = "0 0 0 1px #0002 inset";
    s.style.width = "min(720px, 100%)";
    const h = document.createElement("div");
    h.textContent = titleText;
    h.style.fontWeight = "600";
    h.style.opacity = "0.95";
    s.append(h, content);
    return s;
  }
  var fmtTime2 = (ms) => {
    const d = new Date(ms);
    const p = (n, s = 2) => String(n).padStart(s, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(
      d.getMilliseconds()
    ).padStart(3, "0")}`;
  };
  var activeTeamId = null;
  var activePetIdSet = /* @__PURE__ */ new Set();
  function getAbilityChipColors(id) {
    const key2 = String(id || "");
    const base = (PetsService.getAbilityNameWithoutLevel?.(key2) || "").replace(/[\s\-_]+/g, "").toLowerCase();
    const is = (prefix) => key2.startsWith(prefix) || base === prefix.toLowerCase();
    if (is("ProduceScaleBoost")) return { bg: "rgba(34,139,34,0.9)", hover: "rgba(34,139,34,1)" };
    if (is("PlantGrowthBoost")) return { bg: "rgba(0,128,128,0.9)", hover: "rgba(0,128,128,1)" };
    if (is("EggGrowthBoost")) return { bg: "rgba(180,90,240,0.9)", hover: "rgba(180,90,240,1)" };
    if (is("PetAgeBoost")) return { bg: "rgba(147,112,219,0.9)", hover: "rgba(147,112,219,1)" };
    if (is("PetHatchSizeBoost")) return { bg: "rgba(128,0,128,0.9)", hover: "rgba(128,0,128,1)" };
    if (is("PetXpBoost")) return { bg: "rgba(30,144,255,0.9)", hover: "rgba(30,144,255,1)" };
    if (is("HungerBoost")) return { bg: "rgba(255,20,147,0.9)", hover: "rgba(255,20,147,1)" };
    if (is("SellBoost")) return { bg: "rgba(220,20,60,0.9)", hover: "rgba(220,20,60,1)" };
    if (is("CoinFinder")) return { bg: "rgba(180,150,0,0.9)", hover: "rgba(180,150,0,1)" };
    if (is("ProduceMutationBoost")) return { bg: "rgba(138,43,226,0.9)", hover: "rgba(138,43,226,1)" };
    if (is("DoubleHarvest")) return { bg: "rgba(0,120,180,0.9)", hover: "rgba(0,120,180,1)" };
    if (is("ProduceEater")) return { bg: "rgba(255,69,0,0.9)", hover: "rgba(255,69,0,1)" };
    if (is("ProduceRefund")) return { bg: "rgba(255,99,71,0.9)", hover: "rgba(255,99,71,1)" };
    if (is("PetMutationBoost")) return { bg: "rgba(156,65,181,0.9)", hover: "rgba(156,65,181,1)" };
    if (is("HungerRestore")) return { bg: "rgba(255,105,180,0.9)", hover: "rgba(255,105,180,1)" };
    if (is("PetRefund")) return { bg: "rgba(0,80,120,0.9)", hover: "rgba(0,80,120,1)" };
    if (is("Copycat")) return { bg: "rgba(255,140,0,0.9)", hover: "rgba(255,140,0,1)" };
    if (is("GoldGranter")) {
      return {
        bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
        hover: "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)"
      };
    }
    if (is("RainbowGranter")) {
      return {
        bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
        hover: "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))"
      };
    }
    if (is("SeedFinderIV")) {
      return {
        bg: "linear-gradient(130deg, rgba(0,180,216,0.9) 0%, rgba(124,42,232,0.9) 40%, rgba(160,0,126,0.9) 60%, rgba(255,215,0,0.9) 100%)",
        hover: "linear-gradient(130deg, rgba(0,180,216,1) 0%, rgba(124,42,232,1) 40%, rgba(160,0,126,1) 60%, rgba(255,215,0,1) 100%)"
      };
    }
    if (is("SeedFinder")) {
      const lv = key2.replace(/.*?([IVX]+)$/, "$1");
      if (lv === "II") return { bg: "rgba(183,121,31,0.9)", hover: "rgba(183,121,31,1)" };
      if (lv === "III") return { bg: "rgba(139,62,152,0.9)", hover: "rgba(139,62,152,1)" };
      return { bg: "rgba(94,172,70,0.9)", hover: "rgba(94,172,70,1)" };
    }
    return { bg: "rgba(100,100,100,0.9)", hover: "rgba(150,150,150,1)" };
  }
  function renderManagerTab(view, ui) {
    view.innerHTML = "";
    installPetTeamHotkeysOnce(async (teamId) => {
      const t = teams.find((tt) => tt.id === teamId) || null;
      try {
        isApplyingTeam = true;
        if (t) {
          activeTeamId = t.id;
          await refreshTeamList(true);
        }
        await PetsService.useTeam(teamId);
        if (t) await waitForActiveTeam(t);
        await hydrateEditor(getSelectedTeam());
        await refreshTeamList();
      } catch (e) {
        console.warn("[Pets] hotkey useTeam failed:", e);
        await refreshTeamList();
      } finally {
        isApplyingTeam = false;
      }
    });
    const styleBtnFullWidthL2 = (b, text) => {
      b.textContent = text;
      b.style.width = "100%";
      b.style.margin = "0";
      b.style.padding = "10px";
      b.style.borderRadius = "8px";
      b.style.border = "1px solid #4445";
      b.style.background = "#1f2328";
      b.style.color = "#e7eef7";
      b.style.justifyContent = "center";
      b.onmouseenter = () => b.style.borderColor = "#6aa1";
      b.onmouseleave = () => b.style.borderColor = "#4445";
    };
    const framed = (title, content) => sectionFramed2(title, content);
    const row = () => {
      const r = document.createElement("div");
      r.style.display = "flex";
      r.style.alignItems = "center";
      r.style.flexWrap = "wrap";
      r.style.gap = "8px";
      return r;
    };
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "minmax(220px, 280px) minmax(0, 1fr)";
    wrap.style.gap = "10px";
    wrap.style.alignItems = "stretch";
    wrap.style.height = "54vh";
    wrap.style.overflow = "hidden";
    view.appendChild(wrap);
    const left = document.createElement("div");
    left.style.display = "grid";
    left.style.gridTemplateRows = "1fr auto";
    left.style.gap = "8px";
    left.style.minHeight = "0";
    wrap.appendChild(left);
    const teamList = document.createElement("div");
    teamList.style.display = "flex";
    teamList.style.flexDirection = "column";
    teamList.style.gap = "6px";
    teamList.style.overflow = "auto";
    teamList.style.padding = "6px";
    teamList.style.border = "1px solid #4445";
    teamList.style.borderRadius = "10px";
    teamList.style.scrollBehavior = "smooth";
    teamList.style.minHeight = "0";
    left.appendChild(teamList);
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.gap = "6px";
    left.appendChild(footer);
    const btnNew = document.createElement("button");
    btnNew.id = "pets.teams.new";
    const btnDel = document.createElement("button");
    btnDel.id = "pets.teams.delete";
    styleBtnFullWidthL2(btnNew, "New");
    styleBtnFullWidthL2(btnDel, "Delete");
    footer.append(btnNew, btnDel);
    let teams = [];
    let selectedId = null;
    let isApplyingTeam = false;
    let draggingIdx = null;
    let overInsertIdx = null;
    let draggingHeight = 0;
    function getSelectedTeam() {
      return teams.find((t) => t.id === selectedId) || null;
    }
    function computeInsertIndex(clientY) {
      const children = Array.from(teamList.children);
      if (!children.length) return 0;
      const first = children[0].getBoundingClientRect();
      if (clientY < first.top + first.height / 2) return 0;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (clientY < mid) return i;
      }
      return children.length;
    }
    function abilitiesBadge(abilities) {
      const wrap2 = document.createElement("span");
      wrap2.style.display = "inline-flex";
      wrap2.style.alignItems = "center";
      wrap2.style.lineHeight = "1";
      const SPACING_PX = 8;
      const SIZE_PX = 12;
      const RADIUS_PX = 3;
      const ids = Array.isArray(abilities) ? abilities.filter(Boolean) : [];
      if (!ids.length) {
        const empty = document.createElement("span");
        empty.textContent = "No ability";
        empty.style.opacity = "0.75";
        empty.style.fontSize = "12px";
        wrap2.appendChild(empty);
        return wrap2;
      }
      ids.forEach((id, i) => {
        const chip = document.createElement("span");
        const { bg, hover } = getAbilityChipColors(id);
        chip.title = PetsService.getAbilityName(id) || id;
        chip.setAttribute("aria-label", chip.title);
        Object.assign(chip.style, {
          display: "inline-block",
          width: `${SIZE_PX}px`,
          height: `${SIZE_PX}px`,
          borderRadius: `${RADIUS_PX}px`,
          marginRight: i === ids.length - 1 ? "0" : `${SPACING_PX}px`,
          background: bg,
          transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
          cursor: "default"
        });
        chip.onmouseenter = () => {
          chip.style.background = hover;
          chip.style.transform = "scale(1.08)";
          chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff33";
        };
        chip.onmouseleave = () => {
          chip.style.background = bg;
          chip.style.transform = "none";
          chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a";
        };
        wrap2.appendChild(chip);
      });
      return wrap2;
    }
    function applyLiveTransforms() {
      const children = Array.from(teamList.children);
      children.forEach((el2) => el2.style.transform = "");
      if (draggingIdx === null || overInsertIdx === null) return;
      const from = draggingIdx;
      const to = overInsertIdx;
      children.forEach((el2, idx) => {
        el2.style.transition = "transform 120ms ease";
        if (idx === from) return;
        if (to > from && idx > from && idx < to) {
          el2.style.transform = `translateY(${-draggingHeight}px)`;
        }
        if (to < from && idx >= to && idx < from) {
          el2.style.transform = `translateY(${draggingHeight}px)`;
        }
      });
    }
    function clearLiveTransforms() {
      Array.from(teamList.children).forEach((el2) => {
        el2.style.transform = "";
        el2.style.transition = "";
      });
    }
    async function refreshActiveIds() {
      activeTeamId = null;
      activePetIdSet = /* @__PURE__ */ new Set();
      try {
        const pets = await PetsService.getPets();
        const equipIds = Array.isArray(pets) ? pets.map((p) => String(p?.slot?.id || "")).filter(Boolean) : [];
        activePetIdSet = new Set(equipIds);
        for (const t of teams) {
          const tIds = (t.slots || []).filter(Boolean);
          if (tIds.length !== equipIds.length) continue;
          let same = true;
          for (const id of tIds) {
            if (!activePetIdSet.has(id)) {
              same = false;
              break;
            }
          }
          if (same) {
            activeTeamId = t.id;
            break;
          }
        }
      } catch {
      }
    }
    async function refreshTeamList(skipDetectActive = false) {
      if (!skipDetectActive) {
        await refreshActiveIds();
      }
      clearLiveTransforms();
      draggingIdx = null;
      overInsertIdx = null;
      draggingHeight = 0;
      teamList.innerHTML = "";
      if (!teams.length) {
        const empty = document.createElement("div");
        empty.textContent = "No teams yet. Create one!";
        empty.style.opacity = "0.75";
        empty.style.textAlign = "center";
        empty.style.padding = "8px";
        teamList.appendChild(empty);
        hydrateEditor(null);
        return;
      }
      teams.forEach((t, idx) => {
        const item = document.createElement("div");
        const isActive = t.id === activeTeamId;
        item.dataset.index = String(idx);
        item.textContent = "";
        item.style.height = "36px";
        item.style.lineHeight = "36px";
        item.style.padding = "0 10px";
        item.style.border = "1px solid #ffffff15";
        item.style.borderRadius = "6px";
        item.style.cursor = "pointer";
        item.style.fontSize = "13px";
        item.style.overflow = "hidden";
        item.style.whiteSpace = "nowrap";
        item.style.textOverflow = "ellipsis";
        item.style.display = "flex";
        item.style.flex = "0 0 auto";
        item.style.gap = "8px";
        item.style.alignItems = "center";
        item.style.background = t.id === selectedId ? "#2a313a" : "#1f2328";
        const dot = document.createElement("span");
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        dot.style.boxShadow = "0 0 0 1px #0006 inset";
        dot.style.background = isActive ? "#48d170" : "#64748b";
        dot.title = isActive ? "This team is currently active" : "Inactive team";
        const label2 = document.createElement("span");
        label2.textContent = t.name || "(unnamed)";
        label2.style.overflow = "hidden";
        label2.style.textOverflow = "ellipsis";
        label2.style.whiteSpace = "nowrap";
        item.append(dot, label2);
        const grab = document.createElement("span");
        grab.className = "qmm-grab";
        grab.title = "Drag to reorder";
        grab.innerHTML = "&#8942;";
        grab.draggable = true;
        item.onmouseenter = () => item.style.borderColor = "#6aa1";
        item.onmouseleave = () => item.style.borderColor = "#ffffff15";
        item.onclick = (ev) => {
          if (ev.__byDrag) return;
          const changed = selectedId !== t.id;
          if (changed) {
            selectedId = t.id;
            refreshTeamList();
          }
          void hydrateEditor(getSelectedTeam());
        };
        grab.addEventListener("dragstart", (ev) => {
          draggingIdx = idx;
          draggingHeight = item.getBoundingClientRect().height;
          item.classList.add("qmm-dragging");
          ev.dataTransfer?.setData("text/plain", String(idx));
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
          try {
            const ghost = item.cloneNode(true);
            ghost.style.width = `${item.getBoundingClientRect().width}px`;
            ghost.style.position = "absolute";
            ghost.style.top = "-9999px";
            document.body.appendChild(ghost);
            ev.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
            setTimeout(() => document.body.removeChild(ghost), 0);
          } catch {
          }
        });
        grab.addEventListener("dragend", () => {
          item.classList.remove("qmm-dragging");
          clearLiveTransforms();
          draggingIdx = null;
          overInsertIdx = null;
        });
        item.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
          if (draggingIdx === null) return;
          const idxOver = Number(ev.currentTarget.dataset.index || -1);
          if (idxOver < 0) return;
          const rect = item.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const insertIdx = ev.clientY < mid ? idxOver : idxOver + 1;
          const clamped = Math.max(0, Math.min(teams.length, insertIdx));
          if (overInsertIdx !== clamped) {
            overInsertIdx = clamped;
            applyLiveTransforms();
          }
          const edge = 28;
          const listRect = teamList.getBoundingClientRect();
          if (ev.clientY < listRect.top + edge) teamList.scrollTop -= 18;
          else if (ev.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
        });
        item.addEventListener("drop", (ev) => {
          ev.preventDefault();
          ev.__byDrag = true;
          if (draggingIdx === null) return;
          let target = overInsertIdx ?? computeInsertIndex(ev.clientY);
          if (target > draggingIdx) target -= 1;
          target = Math.max(0, Math.min(teams.length - 1, target));
          if (target !== draggingIdx) {
            const a = teams.slice();
            const [it] = a.splice(draggingIdx, 1);
            a.splice(target, 0, it);
            teams = a;
            try {
              PetsService.setTeamsOrder(teams.map((x) => x.id));
            } catch {
            }
          }
          clearLiveTransforms();
          draggingIdx = null;
          overInsertIdx = null;
          draggingHeight = 0;
          refreshTeamList();
        });
        item.onclick = (ev) => {
          if (ev.__byDrag) return;
          const changed = selectedId !== t.id;
          if (changed) {
            selectedId = t.id;
            void refreshTeamList();
          }
          void hydrateEditor(getSelectedTeam());
        };
        item.appendChild(grab);
        teamList.appendChild(item);
      });
    }
    teamList.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (draggingIdx === null) return;
      const idx = computeInsertIndex(e.clientY);
      if (overInsertIdx !== idx) {
        overInsertIdx = idx;
        applyLiveTransforms();
      }
      const edge = 28;
      const listRect = teamList.getBoundingClientRect();
      if (e.clientY < listRect.top + edge) teamList.scrollTop -= 18;
      else if (e.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
    });
    teamList.addEventListener("drop", (e) => {
      e.preventDefault();
      if (draggingIdx === null) return;
      let target = overInsertIdx ?? computeInsertIndex(e.clientY);
      if (target > draggingIdx) target -= 1;
      target = Math.max(0, Math.min(teams.length - 1, target));
      if (target !== draggingIdx) {
        const a = teams.slice();
        const [it] = a.splice(draggingIdx, 1);
        a.splice(target, 0, it);
        teams = a;
        try {
          PetsService.setTeamsOrder(teams.map((x) => x.id));
        } catch {
        }
      }
      clearLiveTransforms();
      draggingIdx = null;
      overInsertIdx = null;
      draggingHeight = 0;
      refreshTeamList();
    });
    btnNew.onclick = () => {
      const created = PetsService.createTeam("New Team");
      selectedId = created.id;
      refreshTeamList();
      hydrateEditor(getSelectedTeam());
    };
    btnDel.onclick = () => {
      if (!selectedId) return;
      const ok = PetsService.deleteTeam(selectedId);
      if (!ok) return;
    };
    let unsubTeams = null;
    (async () => {
      try {
        unsubTeams = await PetsService.onTeamsChangeNow(async (all) => {
          teams = Array.isArray(all) ? all.slice() : [];
          if (selectedId && !teams.some((t) => t.id === selectedId)) {
            selectedId = teams[0]?.id ?? null;
          }
          if (!selectedId && teams.length) selectedId = teams[0].id;
          refreshTeamList();
          setTeamsForHotkeys(teams);
          await PetsService.getInventoryPets();
          await hydrateEditor(getSelectedTeam());
        });
      } catch {
      }
    })();
    const right = document.createElement("div");
    right.style.display = "grid";
    right.style.gridTemplateRows = "auto 1fr";
    right.style.gap = "10px";
    right.style.minHeight = "0";
    wrap.appendChild(right);
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";
    const headerTitle = document.createElement("div");
    headerTitle.textContent = "Team editor \u2014 ";
    headerTitle.style.fontWeight = "700";
    headerTitle.style.fontSize = "14px";
    const btnUseTeam = document.createElement("button");
    btnUseTeam.id = "pets.teams.useThisTeam";
    btnUseTeam.textContent = "Use this team";
    btnUseTeam.style.padding = "6px 10px";
    btnUseTeam.style.borderRadius = "8px";
    btnUseTeam.style.border = "1px solid #4445";
    btnUseTeam.style.background = "#1f2328";
    btnUseTeam.style.color = "#e7eef7";
    btnUseTeam.style.cursor = "pointer";
    btnUseTeam.onmouseenter = () => btnUseTeam.style.borderColor = "#6aa1";
    btnUseTeam.onmouseleave = () => btnUseTeam.style.borderColor = "#4445";
    btnUseTeam.disabled = true;
    const btnSave = document.createElement("button");
    btnSave.id = "pets.teams.save";
    btnSave.textContent = "Save";
    btnSave.style.padding = "6px 10px";
    btnSave.style.borderRadius = "8px";
    btnSave.style.border = "1px solid #4445";
    btnSave.style.background = "#1f2328";
    btnSave.style.color = "#e7eef7";
    btnSave.style.cursor = "pointer";
    btnSave.onmouseenter = () => btnSave.style.borderColor = "#6aa1";
    btnSave.onmouseleave = () => btnSave.style.borderColor = "#4445";
    btnSave.disabled = true;
    header.append(headerTitle, btnUseTeam, btnSave);
    right.appendChild(header);
    const card = document.createElement("div");
    card.style.border = "1px solid #4445";
    card.style.borderRadius = "10px";
    card.style.padding = "10px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "12px";
    card.style.overflow = "auto";
    card.style.minHeight = "0";
    card.style.background = "#0f1318";
    right.appendChild(card);
    const secName = (() => {
      const r = row();
      const nameInput = ui.inputText("Team name", "");
      nameInput.id = "pets.teams.editor.name";
      nameInput.style.minWidth = "260px";
      r.append(nameInput);
      card.appendChild(framed("Team name", r));
      return { nameInput };
    })();
    const secSearch = (() => {
      const wrap2 = document.createElement("div");
      wrap2.style.display = "grid";
      wrap2.style.gap = "10px";
      wrap2.style.justifyItems = "center";
      const radiosRow = document.createElement("div");
      radiosRow.style.display = "flex";
      radiosRow.style.flexWrap = "wrap";
      radiosRow.style.alignItems = "center";
      radiosRow.style.justifyContent = "center";
      radiosRow.style.gap = "10px";
      const mkRadio = (name, value, label2, checked = false) => {
        const lab = document.createElement("label");
        lab.style.display = "inline-flex";
        lab.style.alignItems = "center";
        lab.style.gap = "6px";
        const r = ui.radio(name, value, checked);
        const t = document.createElement("span");
        t.textContent = label2;
        lab.append(r, t);
        return { wrap: lab, input: r };
      };
      const rAbility = mkRadio("pets-search-mode", "ability", "Ability", true);
      const rSpecies = mkRadio("pets-search-mode", "species", "Species", false);
      radiosRow.append(rAbility.wrap, rSpecies.wrap);
      const select2 = document.createElement("select");
      select2.className = "qmm-input";
      select2.id = "pets.teams.filter.select";
      select2.style.minWidth = "260px";
      let currentMode = "ability";
      const getMode = () => currentMode;
      const setMode = (m) => {
        currentMode = m;
        rAbility.input.checked = m === "ability";
        rSpecies.input.checked = m === "species";
        rAbility.input.type = "radio";
        rSpecies.input.type = "radio";
        rAbility.input.name = "pets-search-mode";
        rSpecies.input.name = "pets-search-mode";
      };
      const setOptions = (values) => {
        select2.innerHTML = "";
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = "\u2014 No filter \u2014";
        select2.appendChild(opt0);
        values.forEach((v) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v;
          select2.appendChild(o);
        });
      };
      const rebuildOptionsFromInventory = async () => {
        const inv = await PetsService.getInventoryPets().catch(() => []);
        const mode = getMode();
        if (getMode() === "ability") {
          const nameSet = /* @__PURE__ */ new Set();
          for (const p of inv) {
            const abs = Array.isArray(p?.abilities) ? p.abilities.filter(Boolean) : [];
            for (const id of abs) {
              const baseName = PetsService.getAbilityNameWithoutLevel(id);
              if (baseName) nameSet.add(baseName);
            }
          }
          const names = Array.from(nameSet).sort((a, b) => a.localeCompare(b));
          select2.innerHTML = "";
          const opt0 = document.createElement("option");
          opt0.value = "";
          opt0.textContent = "\u2014 No filter \u2014";
          select2.appendChild(opt0);
          names.forEach((name) => {
            const o = document.createElement("option");
            o.value = name;
            o.textContent = name;
            select2.appendChild(o);
          });
        } else {
          const set2 = /* @__PURE__ */ new Set();
          for (const p of inv) {
            const sp = String(p?.petSpecies || "").trim();
            if (sp) set2.add(sp);
          }
          const values = Array.from(set2).sort((a, b) => a.localeCompare(b));
          select2.innerHTML = "";
          const opt0 = document.createElement("option");
          opt0.value = "";
          opt0.textContent = "\u2014 No filter \u2014";
          select2.appendChild(opt0);
          values.forEach((v) => {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
            select2.appendChild(o);
          });
        }
      };
      const applyFilterToTeam = () => {
        const t = getSelectedTeam();
        if (!t) return;
        const val = (select2.value || "").trim();
        const raw = getMode() === "ability" ? val ? `ab:${val}` : "" : val ? `sp:${val}` : "";
        PetsService.setTeamSearch(t.id, raw);
      };
      rAbility.input.addEventListener("change", async () => {
        if (!rAbility.input.checked) return;
        setMode("ability");
        await rebuildOptionsFromInventory();
        select2.value = "";
        applyFilterToTeam();
      });
      rSpecies.input.addEventListener("change", async () => {
        if (!rSpecies.input.checked) return;
        setMode("species");
        await rebuildOptionsFromInventory();
        select2.value = "";
        applyFilterToTeam();
      });
      select2.addEventListener("change", applyFilterToTeam);
      wrap2.append(radiosRow, select2);
      card.appendChild(framed("Search", wrap2));
      return {
        getMode,
        setMode,
        select: select2,
        rebuild: rebuildOptionsFromInventory,
        apply: applyFilterToTeam,
        setFromSearchString(s) {
          const m = (s || "").match(/^(ab|sp):\s*(.*)$/i);
          if (!m) {
            setMode("ability");
            select2.value = "";
            return;
          }
          const mode = m[1].toLowerCase() === "ab" ? "ability" : "species";
          setMode(mode);
          select2.value = m[2] || "";
        }
      };
    })();
    const secSlots = (() => {
      const grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr";
      grid.style.rowGap = "10px";
      grid.style.justifyItems = "center";
      const mkRow = (idx) => {
        const root = document.createElement("div");
        const BTN = 28;
        root.style.display = "grid";
        root.style.gridTemplateColumns = `minmax(0,1fr) ${BTN}px ${BTN}px`;
        root.style.alignItems = "center";
        root.style.gap = "8px";
        root.style.width = "min(560px, 100%)";
        root.style.border = "1px solid #4445";
        root.style.borderRadius = "10px";
        root.style.padding = "8px 10px";
        root.style.background = "#0f1318";
        const left2 = document.createElement("div");
        left2.style.display = "flex";
        left2.style.flexDirection = "column";
        left2.style.gap = "6px";
        left2.style.minWidth = "0";
        const nameEl = document.createElement("div");
        nameEl.style.fontWeight = "700";
        nameEl.textContent = "None";
        nameEl.style.overflow = "hidden";
        nameEl.style.textOverflow = "ellipsis";
        nameEl.style.whiteSpace = "nowrap";
        let abilitiesEl = abilitiesBadge([]);
        abilitiesEl.style.display = "inline-block";
        left2.append(nameEl, abilitiesEl);
        const btnChoose = document.createElement("button");
        btnChoose.textContent = "+";
        Object.assign(btnChoose.style, {
          width: `${BTN}px`,
          minWidth: `${BTN}px`,
          height: `${BTN}px`,
          padding: "0",
          fontSize: "16px",
          lineHeight: "1",
          borderRadius: "10px",
          boxShadow: "none",
          display: "grid",
          placeItems: "center"
        });
        btnChoose.title = "Choose a pet";
        btnChoose.setAttribute("aria-label", "Choose a pet");
        const btnClear2 = document.createElement("button");
        btnClear2.textContent = "\u2212";
        Object.assign(btnClear2.style, {
          width: `${BTN}px`,
          minWidth: `${BTN}px`,
          height: `${BTN}px`,
          padding: "0",
          fontSize: "16px",
          lineHeight: "1",
          borderRadius: "10px",
          boxShadow: "none",
          display: "grid",
          placeItems: "center"
        });
        btnClear2.title = "Remove this pet";
        btnClear2.setAttribute("aria-label", "Remove this pet");
        root.append(left2, btnChoose, btnClear2);
        function update(p) {
          if (!p) {
            nameEl.textContent = "None";
            const fresh2 = abilitiesBadge([]);
            fresh2.style.display = "inline-block";
            left2.replaceChild(fresh2, left2.children[1]);
            abilitiesEl = fresh2;
            return;
          }
          const speciesLabel = p.petSpecies ? p.petSpecies.charAt(0).toUpperCase() + p.petSpecies.slice(1) : "";
          const n = p.name?.trim() || speciesLabel || "Pet";
          nameEl.textContent = n;
          nameEl.textContent = n;
          const abs = Array.isArray(p.abilities) ? p.abilities.filter(Boolean) : [];
          const fresh = abilitiesBadge(abs);
          fresh.style.display = "inline-block";
          left2.replaceChild(fresh, left2.children[1]);
          abilitiesEl = fresh;
        }
        btnChoose.onclick = async () => {
          const t = getSelectedTeam();
          if (!t) return;
          btnChoose.disabled = true;
          btnClear2.disabled = true;
          ui.setWindowVisible(false);
          try {
            await PetsService.chooseSlotPet(t.id, idx);
            await repaintSlots(getSelectedTeam());
          } finally {
            ui.setWindowVisible(true);
            btnChoose.disabled = false;
            btnClear2.disabled = false;
          }
        };
        btnClear2.onclick = async () => {
          const t = getSelectedTeam();
          if (!t) return;
          const next = t.slots.slice(0, 3);
          next[idx] = null;
          PetsService.saveTeam({ id: t.id, slots: next });
          await repaintSlots(t);
        };
        return { root, nameEl, abilitiesEl, btnChoose, btnClear: btnClear2, update };
      };
      const r0 = mkRow(0);
      const r1 = mkRow(1);
      const r2 = mkRow(2);
      grid.append(r0.root, r1.root, r2.root);
      const extra = document.createElement("div");
      extra.style.display = "flex";
      extra.style.gap = "6px";
      extra.style.justifyContent = "center";
      const btnUseCurrent = document.createElement("button");
      styleBtnFullWidthL2(btnUseCurrent, "Current active");
      btnUseCurrent.id = "pets.teams.useCurrent";
      const btnClear = document.createElement("button");
      styleBtnFullWidthL2(btnClear, "Clear slots");
      btnClear.id = "pets.teams.clearSlots";
      const DARK_BG = "#0f1318";
      extra.append(btnUseCurrent, btnClear);
      Object.assign(btnUseCurrent.style, {
        width: "auto",
        fontSize: "16px",
        borderRadius: "10px",
        background: DARK_BG,
        boxShadow: "none"
      });
      Object.assign(btnClear.style, {
        width: "auto",
        fontSize: "16px",
        borderRadius: "10px",
        background: DARK_BG,
        boxShadow: "none"
      });
      const wrapSlots = document.createElement("div");
      wrapSlots.style.display = "flex";
      wrapSlots.style.flexDirection = "column";
      wrapSlots.style.gap = "8px";
      wrapSlots.append(grid, extra);
      card.appendChild(framed("Active pets (3 slots)", wrapSlots));
      return {
        rows: [r0, r1, r2],
        btnUseCurrent,
        btnClear
      };
    })();
    const secKeybinds = (() => {
      const r = row();
      const holder = document.createElement("span");
      holder.style.display = "inline-block";
      function setTeam(team) {
        holder.innerHTML = "";
        if (!team) return;
        const btn = ui.hotkeyButton(
          null,
          // onChange -> remet à jour la map logique à partir du LS
          () => refreshTeamFromLS(team.id),
          {
            storageKey: hkKeyForTeam(team.id),
            emptyLabel: "None",
            listeningLabel: "Press a key\u2026",
            clearable: true
          }
        );
        holder.appendChild(btn);
      }
      r.append(holder);
      card.appendChild(framed("Quick switch", r));
      return { setTeam };
    })();
    async function repaintSlots(sourceTeam) {
      const t = sourceTeam ?? getSelectedTeam();
      if (!t) return;
      const allInv = await PetsService.getInventoryPets().catch(() => []);
      const idToPet = /* @__PURE__ */ new Map();
      for (const p of allInv) if (p?.id != null) idToPet.set(String(p.id), p);
      [0, 1, 2].forEach((i) => {
        const id = t.slots[i] || "";
        const pet = id ? idToPet.get(id) || null : null;
        secSlots.rows[i].update(pet);
      });
    }
    async function hydrateEditor(team) {
      const has = !!team;
      secName.nameInput.disabled = !has;
      secSlots.btnClear.disabled = !has;
      secSlots.btnUseCurrent.disabled = !has;
      btnUseTeam.disabled = !has;
      btnSave.disabled = !has;
      secKeybinds.setTeam(team);
      secSearch.setMode("ability");
      await secSearch.rebuild();
      if (has) {
        const saved = PetsService.getTeamSearch(team.id) || "";
        secSearch.setFromSearchString(saved);
        secSearch.apply();
      }
      if (!has) {
        secSlots.rows.forEach((r) => r.update(null));
        secName.nameInput.value = "";
        return;
      }
      secName.nameInput.value = String(team.name || "");
      await repaintSlots(team);
    }
    secName.nameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") ev.currentTarget.blur();
    });
    secName.nameInput.addEventListener("blur", () => {
      const t = getSelectedTeam();
      if (!t) return;
      const nextName = secName.nameInput.value.trim();
      if (nextName !== t.name) {
        PetsService.saveTeam({ id: t.id, name: nextName });
      }
    });
    secSlots.btnUseCurrent.onclick = async () => {
      const t = getSelectedTeam();
      if (!t) return;
      try {
        const arr = await PetsService.getPets();
        const list = Array.isArray(arr) ? arr : [];
        const ids = list.map((p) => String(p?.slot?.id || "")).filter((x) => !!x).slice(0, 3);
        const nextSlots = [ids[0] || null, ids[1] || null, ids[2] || null];
        PetsService.saveTeam({ id: t.id, slots: nextSlots });
        await repaintSlots(t);
      } catch {
      }
    };
    secSlots.btnClear.onclick = async () => {
      const t = getSelectedTeam();
      if (!t) return;
      PetsService.saveTeam({ id: t.id, slots: [null, null, null] });
      await repaintSlots(t);
    };
    btnSave.onclick = () => {
      const t = getSelectedTeam();
      if (!t) return;
      const name = secName.nameInput.value.trim();
      const slots = t.slots.slice(0, 3);
      PetsService.saveTeam({ id: t.id, name, slots });
      void repaintSlots(t);
    };
    function sameSet(a, b) {
      if (a.length !== b.length) return false;
      const s = new Set(a);
      for (const x of b) if (!s.has(x)) return false;
      return true;
    }
    async function waitForActiveTeam(team, timeoutMs = 2e3) {
      const target = (team.slots || []).filter(Boolean);
      const t0 = performance.now();
      while (performance.now() - t0 < timeoutMs) {
        const pets = await PetsService.getPets().catch(() => null);
        const equip = Array.isArray(pets) ? pets.map((p) => String(p?.slot?.id || "")).filter(Boolean) : [];
        if (sameSet(equip, target)) return true;
        await new Promise((r) => setTimeout(r, 80));
      }
      return false;
    }
    btnUseTeam.onclick = async () => {
      const t = getSelectedTeam();
      if (!t) return;
      try {
        isApplyingTeam = true;
        activeTeamId = t.id;
        await refreshTeamList(true);
        await PetsService.useTeam(t.id);
        await waitForActiveTeam(t);
        await hydrateEditor(getSelectedTeam());
        await refreshTeamList();
      } catch (e) {
        console.warn("[Pets] Use this team failed:", e);
        await refreshTeamList();
      } finally {
        isApplyingTeam = false;
      }
    };
    let unsubInv = null;
    (async () => {
      try {
        void repaintSlots();
        unsubInv = await PetsService.onInventoryPetsChange(async () => {
          if (isApplyingTeam) return;
          await repaintSlots(getSelectedTeam());
          await refreshTeamList();
        });
      } catch {
      }
    })();
    view.__cleanup__ = (() => {
      const prev = view.__cleanup__;
      return () => {
        try {
          unsubTeams?.();
        } catch {
        }
        try {
          unsubInv?.();
        } catch {
        }
        try {
          prev?.();
        } catch {
        }
      };
    })();
  }
  function renderLogsTab(view, ui) {
    view.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateRows = "auto 1fr";
    wrap.style.gap = "10px";
    wrap.style.height = "54vh";
    view.appendChild(wrap);
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.flexWrap = "wrap";
    header.style.alignItems = "center";
    header.style.gap = "8px";
    header.style.border = "1px solid #4445";
    header.style.borderRadius = "10px";
    header.style.padding = "8px 10px";
    header.style.background = "#0f1318";
    wrap.appendChild(header);
    const selAbility = document.createElement("select");
    selAbility.className = "qmm-input";
    selAbility.style.minWidth = "200px";
    selAbility.id = "pets.logs.filter.ability";
    const selSort = document.createElement("select");
    selSort.className = "qmm-input";
    selSort.style.minWidth = "140px";
    selSort.id = "pets.logs.sort";
    [["desc", "Newest first"], ["asc", "Oldest first"]].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      selSort.appendChild(o);
    });
    selSort.value = "desc";
    const inputSearch = ui.inputText("search (pet / ability / details)", "");
    inputSearch.id = "pets.logs.search";
    inputSearch.style.minWidth = "220px";
    const btnClear = document.createElement("button");
    styleBtnFullWidth(btnClear, "Clear");
    btnClear.id = "pets.logs.clear";
    header.append(
      ui.label("Ability"),
      selAbility,
      ui.label("Sort"),
      selSort,
      inputSearch,
      btnClear
    );
    const card = document.createElement("div");
    card.style.border = "1px solid #4445";
    card.style.borderRadius = "10px";
    card.style.padding = "10px";
    card.style.background = "#0f1318";
    card.style.overflow = "hidden";
    card.style.display = "grid";
    card.style.gridTemplateRows = "auto 1fr";
    card.style.minHeight = "0";
    wrap.appendChild(card);
    const headerGrid = document.createElement("div");
    headerGrid.style.display = "grid";
    headerGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
    headerGrid.style.columnGap = "0";
    headerGrid.style.borderBottom = "1px solid #ffffff1a";
    headerGrid.style.padding = "0 0 6px 0";
    function mkHeadCell(txt, align = "center") {
      const el2 = document.createElement("div");
      el2.textContent = txt;
      el2.style.fontWeight = "600";
      el2.style.opacity = "0.9";
      el2.style.padding = "6px 8px";
      el2.style.textAlign = align;
      return el2;
    }
    headerGrid.append(
      mkHeadCell("Time"),
      mkHeadCell("Pet"),
      mkHeadCell("Ability"),
      mkHeadCell("Details", "left")
    );
    card.appendChild(headerGrid);
    const bodyGrid = document.createElement("div");
    bodyGrid.style.display = "grid";
    bodyGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
    bodyGrid.style.gridAutoRows = "auto";
    bodyGrid.style.alignContent = "start";
    bodyGrid.style.overflow = "auto";
    bodyGrid.style.width = "100%";
    bodyGrid.style.minHeight = "0";
    card.appendChild(bodyGrid);
    let logs = [];
    let abilitySet = /* @__PURE__ */ new Set();
    let abilityFilter = "";
    let sortDir = "desc";
    let q = "";
    const NF_INT = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 });
    function roundNumber(n) {
      return Math.round(n);
    }
    function normalizeNumbersDeep(v) {
      if (typeof v === "number") return roundNumber(v);
      if (v === null || v === void 0) return v;
      if (Array.isArray(v)) return v.map(normalizeNumbersDeep);
      if (typeof v === "object") {
        const o = {};
        for (const k of Object.keys(v)) o[k] = normalizeNumbersDeep(v[k]);
        return o;
      }
      return v;
    }
    function toDisplayString(v, depth = 0) {
      if (v === null || v === void 0) return "";
      if (typeof v === "number") return NF_INT.format(v);
      if (typeof v === "string") return v;
      if (typeof v === "boolean") return String(v);
      if (Array.isArray(v)) {
        return v.map((x) => toDisplayString(x, depth + 1)).join(", ");
      }
      if (typeof v === "object") {
        const entries = Object.entries(v);
        if (!entries.length) return "";
        return entries.map(([k, val]) => {
          if (val !== null && typeof val === "object") {
            try {
              const norm = normalizeNumbersDeep(val);
              return `${k}: ${JSON.stringify(norm)}`;
            } catch {
              return `${k}: ${String(val)}`;
            }
          }
          return `${k}: ${toDisplayString(val, depth + 1)}`;
        }).join(", ");
      }
      return String(v);
    }
    function formatDetails(data) {
      try {
        const norm = normalizeNumbersDeep(data);
        return toDisplayString(norm);
      } catch {
        try {
          return JSON.stringify(data);
        } catch {
          return String(data ?? "");
        }
      }
    }
    function detailsForSearch(data) {
      try {
        return formatDetails(data).toLowerCase();
      } catch {
        try {
          return JSON.stringify(data).toLowerCase();
        } catch {
          return "";
        }
      }
    }
    function rebuildAbilityOptions() {
      const current = selAbility.value;
      selAbility.innerHTML = "";
      const opts = [["", "All abilities"], ...Array.from(abilitySet).sort().map((a) => [a, a])];
      for (const [v, t] of opts) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = t;
        selAbility.appendChild(o);
      }
      selAbility.value = opts.some(([v]) => v === current) ? current : "";
    }
    function cell(txt, align = "center") {
      const el2 = document.createElement("div");
      el2.textContent = txt;
      el2.style.padding = "6px 8px";
      el2.style.textAlign = align;
      el2.style.whiteSpace = align === "left" ? "pre-wrap" : "normal";
      el2.style.wordBreak = align === "left" ? "break-word" : "normal";
      el2.style.borderBottom = "1px solid #ffffff12";
      return el2;
    }
    function row(log) {
      const time = cell(fmtTime2(log.performedAt), "center");
      const timeFrt = cell(log.time12);
      const petLabel = log.petName || log.species || "Pet";
      const pet = cell(petLabel, "center");
      const abId = cell(log.abilityId, "center");
      const abName = cell(log.abilityName, "center");
      const detText = formatDetails(log.data);
      const det = cell(detText, "left");
      bodyGrid.append(timeFrt, pet, abName, det);
    }
    function applyFilters() {
      const normAbilityKey = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/([ivx]+)$/i, "");
      let arr = logs.slice();
      if (abilityFilter && abilityFilter.trim()) {
        const f = normAbilityKey(abilityFilter);
        arr = arr.filter((l) => {
          const idKey = normAbilityKey(l.abilityId);
          const nameKey = normAbilityKey(PetsService.getAbilityNameWithoutLevel(l.abilityId));
          return idKey === f || nameKey === f;
        });
      }
      if (q && q.trim()) {
        const qq = q.toLowerCase();
        arr = arr.filter((l) => {
          const pet = (l.petName || l.species || "").toLowerCase();
          const abName = (PetsService.getAbilityNameWithoutLevel(l.abilityId) || "").toLowerCase();
          const abId = (l.abilityId || "").toLowerCase();
          const det = detailsForSearch(l.data);
          return pet.includes(qq) || abName.includes(qq) || abId.includes(qq) || det.includes(qq) || (l.petId || "").toLowerCase().includes(qq);
        });
      }
      arr.sort(
        (a, b) => sortDir === "asc" ? a.performedAt - b.performedAt : b.performedAt - a.performedAt
      );
      return arr;
    }
    function repaint() {
      bodyGrid.innerHTML = "";
      const arr = applyFilters();
      if (!arr.length) {
        const empty = document.createElement("div");
        empty.textContent = "No logs yet.";
        empty.style.opacity = "0.75";
        empty.style.gridColumn = "1 / -1";
        empty.style.padding = "8px";
        bodyGrid.appendChild(empty);
        return;
      }
      arr.forEach(row);
      bodyGrid.scrollTop = bodyGrid.scrollHeight + 32;
    }
    selAbility.onchange = () => {
      abilityFilter = selAbility.value;
      repaint();
    };
    selSort.onchange = () => {
      sortDir = selSort.value || "desc";
      repaint();
    };
    inputSearch.addEventListener("input", () => {
      q = inputSearch.value.trim();
      repaint();
    });
    btnClear.onclick = () => {
      try {
        PetsService.clearAbilityLogs();
      } catch {
      }
    };
    let unsubLogs = null;
    (async () => {
      try {
        abilitySet = new Set(PetsService.getSeenAbilityIds());
        rebuildAbilityOptions();
        unsubLogs = PetsService.onAbilityLogs((all) => {
          logs = all.map((e) => ({
            petId: e.petId,
            petName: e.name ?? null,
            species: e.species ?? null,
            abilityId: e.abilityId,
            abilityName: e.abilityName,
            data: e.data,
            performedAt: e.performedAt,
            time12: e.time12
          }));
          abilitySet = new Set(PetsService.getSeenAbilityIds());
          rebuildAbilityOptions();
          repaint();
        });
      } catch {
      }
    })();
    view.__cleanup__ = () => {
      try {
        unsubLogs?.();
      } catch {
      }
    };
    repaint();
  }
  function renderPetsMenu(root) {
    const ui = new Menu({ id: "pets", compact: true, windowSelector: ".qws-win" });
    ui.mount(root);
    ui.addTab("manager", "Manager", (view) => renderManagerTab(view, ui));
    ui.addTab("logs", "Logs", (view) => renderLogsTab(view, ui));
  }

  // src/services/misc.ts
  var LS_GHOST_KEY = "qws:player:ghostMode";
  var LS_DELAY_KEY = "qws:ghost:delayMs";
  var DEFAULT_DELAY_MS = 50;
  var readGhostEnabled = (def = false) => {
    try {
      return localStorage.getItem(LS_GHOST_KEY) === "1";
    } catch {
      return def;
    }
  };
  var writeGhostEnabled = (v) => {
    try {
      localStorage.setItem(LS_GHOST_KEY, v ? "1" : "0");
    } catch {
    }
  };
  var getGhostDelayMs = () => {
    try {
      const n = Math.floor(Number(localStorage.getItem(LS_DELAY_KEY)) || DEFAULT_DELAY_MS);
      return Math.max(5, n);
    } catch {
      return DEFAULT_DELAY_MS;
    }
  };
  var setGhostDelayMs = (n) => {
    const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
    try {
      localStorage.setItem(LS_DELAY_KEY, String(v));
    } catch {
    }
  };
  function createGhostController() {
    let DELAY_MS = getGhostDelayMs();
    const KEYS = /* @__PURE__ */ new Set();
    const onKeyDownCapture = (e) => {
      const k = e.key.toLowerCase();
      const isMove = k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isMove) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      KEYS.add(k);
    };
    const onKeyUpCapture = (e) => {
      const k = e.key.toLowerCase();
      const isMove = k === "z" || k === "q" || k === "s" || k === "d" || k === "w" || k === "a" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isMove) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      KEYS.delete(k);
    };
    const onBlur = () => {
      KEYS.clear();
    };
    const onVisibility = () => {
      if (document.hidden) KEYS.clear();
    };
    function getDir() {
      let dx = 0, dy = 0;
      if (KEYS.has("z") || KEYS.has("w") || KEYS.has("arrowup")) dy -= 1;
      if (KEYS.has("s") || KEYS.has("arrowdown")) dy += 1;
      if (KEYS.has("q") || KEYS.has("a") || KEYS.has("arrowleft")) dx -= 1;
      if (KEYS.has("d") || KEYS.has("arrowright")) dx += 1;
      if (dx) dx = dx > 0 ? 1 : -1;
      if (dy) dy = dy > 0 ? 1 : -1;
      return { dx, dy };
    }
    let rafId = null;
    let lastTs = 0, accMs = 0, inMove = false;
    async function step(dx, dy) {
      let cur2;
      try {
        cur2 = await PlayerService.getPosition();
      } catch {
      }
      const cx = Math.round(cur2?.x ?? 0), cy = Math.round(cur2?.y ?? 0);
      try {
        await PlayerService.move(cx + dx, cy + dy);
      } catch {
      }
    }
    const CAPTURE = { capture: true };
    function frame(ts) {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;
      const { dx, dy } = getDir();
      accMs += dt;
      if (dx === 0 && dy === 0) {
        accMs = Math.min(accMs, DELAY_MS * 4);
        rafId = requestAnimationFrame(frame);
        return;
      }
      if (accMs >= DELAY_MS && !inMove) {
        accMs -= DELAY_MS;
        inMove = true;
        (async () => {
          try {
            await step(dx, dy);
          } finally {
            inMove = false;
          }
        })();
      }
      accMs = Math.min(accMs, DELAY_MS * 4);
      rafId = requestAnimationFrame(frame);
    }
    return {
      start() {
        if (rafId !== null) return;
        lastTs = 0;
        accMs = 0;
        inMove = false;
        window.addEventListener("keydown", onKeyDownCapture, CAPTURE);
        window.addEventListener("keyup", onKeyUpCapture, CAPTURE);
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibility);
        rafId = requestAnimationFrame(frame);
      },
      stop() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        KEYS.clear();
        window.removeEventListener("keydown", onKeyDownCapture, CAPTURE);
        window.removeEventListener("keyup", onKeyUpCapture, CAPTURE);
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVisibility);
      },
      setSpeed(n) {
        const v = Math.max(5, Math.floor(n || DEFAULT_DELAY_MS));
        DELAY_MS = v;
        setGhostDelayMs(v);
      },
      getSpeed() {
        return DELAY_MS;
      }
    };
  }
  var selectedMap = /* @__PURE__ */ new Map();
  var seedStockByName = /* @__PURE__ */ new Map();
  var seedSourceCache = [];
  var NF_US = new Intl.NumberFormat("en-US");
  var formatNum = (n) => NF_US.format(Math.max(0, Math.floor(n || 0)));
  async function clearUiSelectionAtoms() {
    try {
      await Atoms.inventory.mySelectedItemName.set(null);
    } catch {
    }
    try {
      await Atoms.inventory.myValidatedSelectedItemIndex.set(null);
    } catch {
    }
    try {
      await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
    } catch {
    }
  }
  var OVERLAY_ID = "qws-seeddeleter-overlay";
  var LIST_ID = "qws-seeddeleter-list";
  var SUMMARY_ID = "qws-seeddeleter-summary";
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function buildDisplayNameToSpeciesFromCatalog() {
    const map2 = /* @__PURE__ */ new Map();
    try {
      const cat = plantCatalog;
      for (const species of Object.keys(cat || {})) {
        const seedName = cat?.[species]?.seed?.name && String(cat?.[species]?.seed?.name) || `${species} Seed`;
        const arr = map2.get(seedName) ?? [];
        arr.push(species);
        map2.set(seedName, arr);
      }
    } catch {
    }
    return map2;
  }
  async function buildSpeciesStockFromInventory() {
    const inv = await getMySeedInventory();
    const stock = /* @__PURE__ */ new Map();
    for (const it of inv) {
      const q = Math.max(0, Math.floor(it.quantity || 0));
      if (q > 0) stock.set(it.species, (stock.get(it.species) ?? 0) + q);
    }
    return stock;
  }
  function allocateForRequestedName(requested, nameToSpecies, speciesStock) {
    let remaining = Math.max(0, Math.floor(requested.qty || 0));
    let candidates = nameToSpecies.get(requested.name) ?? [];
    if (!candidates.length && / seed$/i.test(requested.name)) {
      const fallbackSpecies = requested.name.replace(/\s+seed$/i, "");
      if (plantCatalog?.[fallbackSpecies]) candidates = [fallbackSpecies];
    }
    if (!candidates.length || remaining <= 0) return [];
    const ranked = candidates.map((sp) => ({ sp, available: speciesStock.get(sp) ?? 0 })).filter((x) => x.available > 0).sort((a, b) => b.available - a.available);
    const out = [];
    for (const { sp, available } of ranked) {
      if (remaining <= 0) break;
      const take = Math.min(available, remaining);
      if (take > 0) {
        out.push({ species: sp, qty: take });
        remaining -= take;
      }
    }
    return out;
  }
  var _seedDeleteAbort = null;
  var _seedDeleteBusy = false;
  async function deleteSelectedSeeds(opts = {}) {
    if (_seedDeleteBusy) {
      await toastSimple("Seed deleter", "Deletion already in progress.", "info");
      return;
    }
    const batchSize = Math.max(1, Math.floor(opts.batchSize ?? 25));
    const delayMs = Math.max(0, Math.floor(opts.delayMs ?? 16));
    const selection = (opts.selection && Array.isArray(opts.selection) ? opts.selection : Array.from(selectedMap.values())).map((s) => ({ name: s.name, qty: Math.max(0, Math.floor(s.qty || 0)) })).filter((s) => s.qty > 0);
    if (selection.length === 0) {
      await toastSimple("Seed deleter", "No seeds selected.", "info");
      return;
    }
    const nameToSpecies = buildDisplayNameToSpeciesFromCatalog();
    const speciesStock = await buildSpeciesStockFromInventory();
    const allocatedBySpecies = /* @__PURE__ */ new Map();
    let requestedTotal = 0, cappedTotal = 0;
    for (const req of selection) {
      requestedTotal += req.qty;
      const chunks = allocateForRequestedName(req, nameToSpecies, speciesStock);
      const okForThis = chunks.reduce((a, c) => a + c.qty, 0);
      cappedTotal += okForThis;
      for (const c of chunks) {
        allocatedBySpecies.set(c.species, (allocatedBySpecies.get(c.species) ?? 0) + c.qty);
      }
    }
    if (cappedTotal <= 0) {
      await toastSimple("Seed deleter", "Nothing to delete (not in inventory).", "info");
      return;
    }
    if (cappedTotal < requestedTotal) {
      await toastSimple(
        "Seed deleter",
        `Requested ${formatNum(requestedTotal)} but only ${formatNum(cappedTotal)} available. Proceeding.`,
        "info"
      );
    }
    const tasks = Array.from(allocatedBySpecies.entries()).map(([species, qty]) => ({ species, qty: Math.max(0, Math.floor(qty || 0)) })).filter((t) => t.qty > 0);
    const total = tasks.reduce((acc, t) => acc + t.qty, 0);
    if (total <= 0) {
      await toastSimple("Seed deleter", "Nothing to delete.", "info");
      return;
    }
    _seedDeleteBusy = true;
    const abort = new AbortController();
    _seedDeleteAbort = abort;
    try {
      await toastSimple("Seed deleter", `Deleting ${formatNum(total)} seeds across ${tasks.length} species...`, "info");
      let done = 0;
      for (const t of tasks) {
        let remaining = t.qty;
        while (remaining > 0) {
          if (abort.signal.aborted) throw new Error("Deletion cancelled.");
          const n = Math.min(batchSize, remaining);
          for (let i = 0; i < n; i++) {
            try {
              await PlayerService.wish(t.species);
            } catch {
            }
          }
          done += n;
          remaining -= n;
          try {
            opts.onProgress?.({ done, total, species: t.species, remainingForSpecies: remaining });
            window.dispatchEvent(new CustomEvent("qws:seeddeleter:progress", {
              detail: { done, total, species: t.species, remainingForSpecies: remaining }
            }));
          } catch {
          }
          if (delayMs > 0 && remaining > 0) await sleep(delayMs);
        }
      }
      if (!opts.keepSelection) selectedMap.clear();
      try {
        window.dispatchEvent(new CustomEvent("qws:seeddeleter:done", { detail: { total, speciesCount: tasks.length } }));
      } catch {
      }
      await toastSimple("Seed deleter", `Deleted ${formatNum(total)} seeds (${tasks.length} species).`, "success");
    } catch (e) {
      const msg = e?.message || "Deletion failed.";
      try {
        window.dispatchEvent(new CustomEvent("qws:seeddeleter:error", { detail: { message: msg } }));
      } catch {
      }
      await toastSimple("Seed deleter", msg, "error");
    } finally {
      _seedDeleteBusy = false;
      _seedDeleteAbort = null;
    }
  }
  function cancelSeedDeletion() {
    try {
      _seedDeleteAbort?.abort();
    } catch {
    }
  }
  function isSeedDeletionRunning() {
    return _seedDeleteBusy;
  }
  try {
    window.addEventListener("qws:seeddeleter:apply", async (e) => {
      try {
        const selection = Array.isArray(e?.detail?.selection) ? e.detail.selection : void 0;
        await deleteSelectedSeeds({ selection, batchSize: 25, delayMs: 16, keepSelection: false });
      } catch {
      }
    });
  } catch {
  }
  function seedDisplayNameFromSpecies(species) {
    try {
      const node = plantCatalog?.[species];
      const n = node?.seed?.name;
      if (typeof n === "string" && n) return n;
    } catch {
    }
    return `${species} Seed`;
  }
  function normalizeSeedItem(x, _idx) {
    if (!x || typeof x !== "object") return null;
    const species = typeof x.species === "string" ? x.species.trim() : "";
    const itemType = x.itemType === "Seed" ? "Seed" : null;
    const quantity = Number.isFinite(x.quantity) ? Math.max(0, Math.floor(x.quantity)) : 0;
    if (!species || itemType !== "Seed" || quantity <= 0) return null;
    return { species, itemType: "Seed", quantity, id: `seed:${species}` };
  }
  async function getMySeedInventory() {
    try {
      const raw = await Atoms.inventory.mySeedInventory.get();
      if (!Array.isArray(raw)) return [];
      const out = [];
      raw.forEach((x, i) => {
        const s = normalizeSeedItem(x, i);
        if (s) out.push(s);
      });
      return out;
    } catch {
      return [];
    }
  }
  function buildInventoryShapeFrom(items) {
    return { items, favoritedItemIds: [] };
  }
  function setStyles(el2, styles) {
    Object.assign(el2.style, styles);
  }
  function styleOverlayBox(div) {
    div.id = OVERLAY_ID;
    setStyles(div, {
      position: "fixed",
      left: "12px",
      top: "12px",
      zIndex: "999999",
      display: "grid",
      gridTemplateRows: "auto auto 1px 1fr auto",
      gap: "6px",
      minWidth: "320px",
      maxWidth: "420px",
      maxHeight: "52vh",
      padding: "8px",
      border: "1px solid #39424c",
      borderRadius: "10px",
      background: "rgba(22,27,34,0.92)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      backdropFilter: "blur(2px)",
      userSelect: "none",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "12px",
      lineHeight: "1.25"
    });
    div.dataset["qwsSeedDeleter"] = "1";
  }
  function makeDraggable(root, handle) {
    let dragging = false;
    let ox = 0, oy = 0;
    const onDown = (e) => {
      dragging = true;
      const r = root.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, { once: true });
    };
    const onMove = (e) => {
      if (!dragging) return;
      const nx = Math.max(4, e.clientX - ox);
      const ny = Math.max(4, e.clientY - oy);
      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
    };
    handle.addEventListener("mousedown", onDown);
  }
  function createButton(label2, styleOverride) {
    const b = document.createElement("button");
    b.textContent = label2;
    setStyles(b, {
      padding: "4px 8px",
      borderRadius: "8px",
      border: "1px solid #4446",
      background: "#161b22",
      color: "#E7EEF7",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "12px",
      ...styleOverride
    });
    b.onmouseenter = () => b.style.borderColor = "#6aa1";
    b.onmouseleave = () => b.style.borderColor = "#4446";
    return b;
  }
  var overlayKeyGuardsOn = false;
  function isInsideOverlay(el2) {
    return !!(el2 && el2.closest?.(`#${OVERLAY_ID}`));
  }
  function keyGuardCapture(e) {
    const ae = document.activeElement;
    if (!isInsideOverlay(ae)) return;
    const tag = (ae?.tagName || "").toLowerCase();
    const isEditable = tag === "input" || tag === "textarea" || ae && ae.isContentEditable;
    if (!isEditable) return;
    if (/^[0-9]$/.test(e.key)) {
      e.stopImmediatePropagation();
    }
  }
  function installOverlayKeyGuards() {
    if (overlayKeyGuardsOn) return;
    window.addEventListener("keydown", keyGuardCapture, { capture: true });
    overlayKeyGuardsOn = true;
  }
  function removeOverlayKeyGuards() {
    if (!overlayKeyGuardsOn) return;
    window.removeEventListener("keydown", keyGuardCapture, { capture: true });
    overlayKeyGuardsOn = false;
  }
  async function closeSeedInventoryPanel() {
    try {
      await fakeInventoryHide();
    } catch {
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      } catch {
      }
    }
  }
  function createSeedOverlay() {
    const box = document.createElement("div");
    styleOverlayBox(box);
    const header = document.createElement("div");
    setStyles(header, { display: "flex", alignItems: "center", gap: "4px", cursor: "move" });
    const title = document.createElement("div");
    title.textContent = "Seed deleter - Selection mode";
    setStyles(title, { fontWeight: "700", fontSize: "13px" });
    const hint = document.createElement("div");
    hint.textContent = "Click seeds in inventory to toggle selection.";
    setStyles(hint, { opacity: "0.8", fontSize: "11px" });
    const hr = document.createElement("div");
    setStyles(hr, { height: "1px", background: "#2d333b" });
    const list = document.createElement("div");
    list.id = LIST_ID;
    setStyles(list, {
      minHeight: "44px",
      maxHeight: "26vh",
      overflow: "auto",
      padding: "4px",
      border: "1px dashed #39424c",
      borderRadius: "8px",
      background: "rgba(15,19,24,0.84)",
      userSelect: "text"
    });
    const actions = document.createElement("div");
    setStyles(actions, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });
    const summary = document.createElement("div");
    summary.id = SUMMARY_ID;
    setStyles(summary, { fontWeight: "600" });
    summary.textContent = "Selected: 0 species \xB7 0 seeds";
    const btnClear = createButton("Clear");
    btnClear.title = "Clear selection";
    btnClear.onclick = async () => {
      selectedMap.clear();
      refreshList();
      updateSummary();
      await clearUiSelectionAtoms();
      await repatchFakeSeedInventoryWithSelection();
    };
    _btnConfirm = createButton("Confirm", { background: "#1F2328CC" });
    _btnConfirm.disabled = true;
    _btnConfirm.onclick = async () => {
      await closeSeedInventoryPanel();
    };
    header.append(title);
    actions.append(summary, btnClear, _btnConfirm);
    box.append(header, hint, hr, list, actions);
    makeDraggable(box, header);
    return box;
  }
  function showSeedOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const el2 = createSeedOverlay();
    document.body.appendChild(el2);
    installOverlayKeyGuards();
    refreshList();
    updateSummary();
  }
  function hideSeedOverlay() {
    const el2 = document.getElementById(OVERLAY_ID);
    if (el2) el2.remove();
    removeOverlayKeyGuards();
  }
  var _btnConfirm = null;
  var unsubSelectedName = null;
  function renderListRow(item) {
    const row = document.createElement("div");
    setStyles(row, {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      gap: "6px",
      padding: "4px 6px",
      borderBottom: "1px dashed #2d333b"
    });
    const name = document.createElement("div");
    name.textContent = item.name;
    setStyles(name, {
      fontSize: "12px",
      fontWeight: "600",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
    const controls = document.createElement("div");
    setStyles(controls, { display: "flex", alignItems: "center", gap: "6px" });
    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.max = String(Math.max(1, item.maxQty));
    qty.step = "1";
    qty.value = String(item.qty);
    qty.className = "qmm-input";
    setStyles(qty, {
      width: "68px",
      height: "28px",
      border: "1px solid #4446",
      borderRadius: "8px",
      background: "rgba(15,19,24,0.90)",
      padding: "0 8px",
      fontSize: "12px"
    });
    const swallowDigits = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    qty.addEventListener("keydown", swallowDigits);
    qty.onchange = () => {
      const v = Math.min(item.maxQty, Math.max(1, Math.floor(Number(qty.value) || 1)));
      qty.value = String(v);
      const cur2 = selectedMap.get(item.name);
      if (!cur2) return;
      cur2.qty = v;
      selectedMap.set(item.name, cur2);
      updateSummary();
    };
    qty.oninput = qty.onchange;
    const remove = createButton("Remove", { background: "transparent" });
    remove.onclick = async () => {
      selectedMap.delete(item.name);
      refreshList();
      updateSummary();
      await repatchFakeSeedInventoryWithSelection();
    };
    controls.append(qty, remove);
    row.append(name, controls);
    return row;
  }
  function refreshList() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    list.innerHTML = "";
    const entries = Array.from(selectedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No seeds selected.";
      empty.style.opacity = "0.8";
      list.appendChild(empty);
      return;
    }
    for (const it of entries) list.appendChild(renderListRow(it));
  }
  function totalSelected() {
    let species = 0, qty = 0;
    for (const it of selectedMap.values()) {
      species += 1;
      qty += it.qty;
    }
    return { species, qty };
  }
  function updateSummary() {
    const { species, qty } = totalSelected();
    const el2 = document.getElementById(SUMMARY_ID);
    if (el2) el2.textContent = `Selected: ${species} species \xB7 ${formatNum(qty)} seeds`;
    if (_btnConfirm) {
      _btnConfirm.textContent = "Confirm";
      _btnConfirm.disabled = qty <= 0;
      _btnConfirm.style.opacity = qty <= 0 ? "0.6" : "1";
      _btnConfirm.style.cursor = qty <= 0 ? "not-allowed" : "pointer";
    }
  }
  async function repatchFakeSeedInventoryWithSelection() {
    const selectedNames = new Set(Array.from(selectedMap.keys()));
    const filtered = (Array.isArray(seedSourceCache) ? seedSourceCache : []).filter((s) => {
      const disp = seedDisplayNameFromSpecies(s.species);
      return !selectedNames.has(disp);
    });
    try {
      await fakeInventoryShow({ items: filtered, favoritedItemIds: [] }, { open: false });
    } catch {
    }
  }
  async function beginSelectedNameListener() {
    if (unsubSelectedName) return;
    const unsub = await Atoms.inventory.mySelectedItemName.onChange(async (name) => {
      const n = (name || "").trim();
      if (!n) return;
      if (selectedMap.has(n)) {
        selectedMap.delete(n);
      } else {
        const max = Math.max(1, seedStockByName.get(n) ?? 1);
        selectedMap.set(n, { name: n, qty: max, maxQty: max });
      }
      refreshList();
      updateSummary();
      await clearUiSelectionAtoms();
      await repatchFakeSeedInventoryWithSelection();
    });
    unsubSelectedName = typeof unsub === "function" ? unsub : null;
  }
  async function endSelectedNameListener() {
    const fn = unsubSelectedName;
    unsubSelectedName = null;
    try {
      await fn?.();
    } catch {
    }
  }
  async function openSeedInventoryPreview() {
    try {
      const src = await getMySeedInventory();
      if (!src.length) {
        await toastSimple("Seed inventory", "No seeds to display.", "info");
        return;
      }
      await fakeInventoryShow(buildInventoryShapeFrom(src), { open: true });
    } catch (e) {
      await toastSimple("Seed inventory", e?.message || "Failed to open seed inventory.", "error");
    }
  }
  async function openSeedSelectorFlow(setWindowVisible) {
    try {
      setWindowVisible?.(false);
      seedSourceCache = await getMySeedInventory();
      seedStockByName = /* @__PURE__ */ new Map();
      for (const s of seedSourceCache) {
        const display = seedDisplayNameFromSpecies(s.species);
        seedStockByName.set(display, Math.max(1, Math.floor(s.quantity || 0)));
      }
      selectedMap.clear();
      showSeedOverlay();
      await beginSelectedNameListener();
      await fakeInventoryShow(buildInventoryShapeFrom(seedSourceCache), { open: true });
      if (await isInventoryPanelOpen()) {
        await waitInventoryPanelClosed();
      }
    } catch (e) {
      await toastSimple("Seed inventory", e?.message || "Failed to open seed selector.", "error");
    } finally {
      await endSelectedNameListener();
      hideSeedOverlay();
      seedSourceCache = [];
      seedStockByName.clear();
      setWindowVisible?.(true);
    }
  }
  var MiscService = {
    // ghost
    readGhostEnabled,
    writeGhostEnabled,
    getGhostDelayMs,
    setGhostDelayMs,
    createGhostController,
    // seeds
    getMySeedInventory,
    openSeedInventoryPreview,
    openSeedSelectorFlow,
    //delete
    deleteSelectedSeeds,
    cancelSeedDeletion,
    isSeedDeletionRunning,
    getCurrentSeedSelection() {
      return Array.from(selectedMap.values());
    },
    clearSeedSelection() {
      selectedMap.clear();
    }
  };

  // src/ui/menus/misc.ts
  function sectionFramed3(titleText, content, maxW = 440) {
    const s = document.createElement("div");
    s.style.display = "grid";
    s.style.gap = "6px";
    s.style.textAlign = "left";
    s.style.border = "1px solid #4446";
    s.style.borderRadius = "10px";
    s.style.padding = "10px";
    s.style.background = "#1f2328";
    s.style.boxShadow = "0 0 0 1px #0002 inset";
    s.style.width = `min(${maxW}px, 100%)`;
    const h = document.createElement("div");
    h.textContent = titleText;
    h.style.fontWeight = "700";
    h.style.textAlign = "center";
    h.style.opacity = "0.95";
    h.style.fontSize = "14px";
    s.append(h, content);
    return s;
  }
  function formGrid() {
    const g = document.createElement("div");
    g.style.display = "grid";
    g.style.gridTemplateColumns = "max-content 1fr";
    g.style.columnGap = "6px";
    g.style.rowGap = "6px";
    g.style.alignItems = "center";
    return g;
  }
  function actionsBox() {
    const d = document.createElement("div");
    d.style.display = "flex";
    d.style.justifyContent = "flex-start";
    d.style.alignItems = "center";
    d.style.gap = "6px";
    d.style.flexWrap = "wrap";
    return d;
  }
  function applyNeutralKind(b, kind) {
    b.style.border = "1px solid #4446";
    b.style.color = "#E7EEF7";
    if (kind === "primary") {
      b.style.background = "#1F2328CC";
    } else {
      b.style.background = "#161b22";
    }
  }
  function hoverNeutralKind(b, kind) {
    b.style.borderColor = "#6aa1";
    b.style.background = kind === "primary" ? "#23282dcc" : "#1b2026";
  }
  function styleButton(b, kind = "secondary") {
    b.dataset.kind = kind;
    b.style.padding = "4px 10px";
    b.style.borderRadius = "8px";
    b.style.cursor = "pointer";
    b.style.fontSize = "13px";
    b.style.fontWeight = "600";
    b.style.transition = "background 120ms, border-color 120ms, opacity 120ms, filter 120ms";
    applyNeutralKind(b, kind);
    b.onmouseenter = () => {
      if (!b.disabled) hoverNeutralKind(b, kind);
    };
    b.onmouseleave = () => {
      if (!b.disabled) applyNeutralKind(b, kind);
    };
  }
  function setButtonEnabled(b, enabled) {
    b.disabled = !enabled;
    if (enabled) {
      b.style.opacity = "1";
      b.style.cursor = "pointer";
      b.style.filter = "none";
      applyNeutralKind(b, b.dataset.kind || "secondary");
    } else {
      b.style.opacity = "0.6";
      b.style.cursor = "not-allowed";
      b.style.filter = "grayscale(10%)";
    }
  }
  var NF_US2 = new Intl.NumberFormat("en-US");
  var formatNum2 = (n) => NF_US2.format(Math.max(0, Math.floor(n || 0)));
  async function renderMiscMenu(container) {
    const ui = new Menu({ id: "misc", compact: true });
    ui.mount(container);
    const view = ui.root.querySelector(".qmm-views");
    view.innerHTML = "";
    view.style.display = "grid";
    view.style.gap = "8px";
    view.style.minHeight = "0";
    view.style.justifyItems = "center";
    const secPlayer = (() => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "12px";
      row.style.flexWrap = "wrap";
      const pair = (labelText, controlEl, labelId) => {
        const wrap = document.createElement("div");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        const lab = ui.label(labelText);
        lab.style.fontSize = "13px";
        lab.style.margin = "0";
        lab.style.justifySelf = "start";
        if (labelId) lab.id = labelId;
        wrap.append(lab, controlEl);
        return wrap;
      };
      const ghostSwitch = ui.switch(MiscService.readGhostEnabled(false));
      ghostSwitch.id = "player.ghostMode";
      const ghostPair = pair("Ghost", ghostSwitch, "label.ghost");
      const delayInput = ui.inputNumber(10, 1e3, 5, 50);
      delayInput.id = "player.moveDelay";
      const delayWrap = delayInput.wrap ?? delayInput;
      delayWrap.style && (delayWrap.style.margin = "0");
      delayInput.style && (delayInput.style.width = "84px");
      const delayPair = pair("Delay (ms)", delayWrap, "label.delay");
      row.append(ghostPair, delayPair);
      const ghost = MiscService.createGhostController();
      delayInput.value = String(MiscService.getGhostDelayMs());
      delayInput.addEventListener("change", () => {
        const v = Math.max(10, Math.min(1e3, Math.floor(Number(delayInput.value) || 50)));
        delayInput.value = String(v);
        ghost.setSpeed?.(v);
        MiscService.setGhostDelayMs(v);
      });
      if (ghostSwitch.checked) ghost.start();
      ghostSwitch.onchange = () => {
        const on = !!ghostSwitch.checked;
        MiscService.writeGhostEnabled(on);
        on ? ghost.start() : ghost.stop();
      };
      row.__cleanup__ = () => {
        try {
          ghost.stop();
        } catch {
        }
      };
      return sectionFramed3("Player controls", row, 440);
    })();
    const secSeed = (() => {
      const grid = formGrid();
      const selLabel = ui.label("Selected");
      selLabel.style.fontSize = "13px";
      selLabel.style.margin = "0";
      selLabel.style.justifySelf = "start";
      const selValue = document.createElement("div");
      selValue.id = "misc.seedDeleter.summary";
      selValue.style.fontSize = "13px";
      selValue.style.opacity = "0.9";
      selValue.textContent = "0 species \xB7 0 seeds";
      grid.append(selLabel, selValue);
      const actLabel = ui.label("Actions");
      actLabel.style.fontSize = "13px";
      actLabel.style.margin = "0";
      actLabel.style.justifySelf = "start";
      const actions = actionsBox();
      const btnSelect = document.createElement("button");
      btnSelect.textContent = "Select seeds";
      styleButton(btnSelect, "primary");
      const btnDelete = document.createElement("button");
      btnDelete.textContent = "Delete";
      styleButton(btnDelete, "secondary");
      setButtonEnabled(btnDelete, false);
      const btnClear = document.createElement("button");
      btnClear.textContent = "Clear";
      styleButton(btnClear, "secondary");
      setButtonEnabled(btnClear, false);
      actions.append(btnSelect, btnDelete, btnClear);
      grid.append(actLabel, actions);
      function readSelection() {
        const sel = MiscService.getCurrentSeedSelection?.() || [];
        const speciesCount = sel.length;
        let totalQty = 0;
        for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
        return { sel, speciesCount, totalQty };
      }
      function updateSummaryUI() {
        const { speciesCount, totalQty } = readSelection();
        selValue.textContent = `${speciesCount} species \xB7 ${formatNum2(totalQty)} seeds`;
        const has = speciesCount > 0 && totalQty > 0;
        setButtonEnabled(btnDelete, has);
        setButtonEnabled(btnClear, has);
      }
      btnSelect.onclick = async () => {
        await MiscService.openSeedSelectorFlow(ui.setWindowVisible.bind(ui));
        updateSummaryUI();
      };
      btnClear.onclick = () => {
        try {
          MiscService.clearSeedSelection?.();
        } catch {
        }
        updateSummaryUI();
      };
      btnDelete.onclick = async () => {
        await MiscService.deleteSelectedSeeds();
        updateSummaryUI();
      };
      return sectionFramed3("Seed deleter", grid, 440);
    })();
    const content = document.createElement("div");
    content.style.display = "grid";
    content.style.gap = "8px";
    content.style.justifyItems = "center";
    content.append(secPlayer, secSeed);
    view.appendChild(content);
    view.__cleanup__ = () => {
      try {
        secPlayer.__cleanup__?.();
      } catch {
      }
      try {
        secSeed.__cleanup__?.();
      } catch {
      }
    };
  }

  // src/utils/antiafk.ts
  function createAntiAfkController(deps) {
    const STOP_EVENTS = ["visibilitychange", "blur", "focus", "focusout", "pagehide", "freeze", "resume", "mouseleave", "mouseenter"];
    const listeners = [];
    function swallowAll() {
      const add = (target, t) => {
        const h = (e) => {
          e.stopImmediatePropagation();
          e.preventDefault?.();
        };
        target.addEventListener(t, h, { capture: true });
        listeners.push({ t, h, target });
      };
      STOP_EVENTS.forEach((t) => {
        add(document, t);
        add(window, t);
      });
    }
    function unswallowAll() {
      for (const { t, h, target } of listeners) try {
        target.removeEventListener(t, h, { capture: true });
      } catch {
      }
      listeners.length = 0;
    }
    const docProto = Object.getPrototypeOf(document);
    const saved = {
      hidden: Object.getOwnPropertyDescriptor(docProto, "hidden"),
      visibilityState: Object.getOwnPropertyDescriptor(docProto, "visibilityState"),
      hasFocus: document.hasFocus ? document.hasFocus.bind(document) : null
    };
    function patchProps() {
      try {
        Object.defineProperty(docProto, "hidden", { configurable: true, get() {
          return false;
        } });
      } catch {
      }
      try {
        Object.defineProperty(docProto, "visibilityState", { configurable: true, get() {
          return "visible";
        } });
      } catch {
      }
      try {
        document.hasFocus = () => true;
      } catch {
      }
    }
    function restoreProps() {
      try {
        if (saved.hidden) Object.defineProperty(docProto, "hidden", saved.hidden);
      } catch {
      }
      try {
        if (saved.visibilityState) Object.defineProperty(docProto, "visibilityState", saved.visibilityState);
      } catch {
      }
      try {
        if (saved.hasFocus) document.hasFocus = saved.hasFocus;
      } catch {
      }
    }
    let audioCtx = null;
    let osc = null;
    let gain = null;
    const resumeIfSuspended = () => {
      if (audioCtx && audioCtx.state !== "running") audioCtx.resume?.().catch(() => {
      });
    };
    function startAudioKeepAlive() {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
        gain = audioCtx.createGain();
        gain.gain.value = 1e-5;
        osc = audioCtx.createOscillator();
        osc.frequency.value = 1;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        document.addEventListener("visibilitychange", resumeIfSuspended, { capture: true });
        window.addEventListener("focus", resumeIfSuspended, { capture: true });
      } catch {
        stopAudioKeepAlive();
      }
    }
    function stopAudioKeepAlive() {
      try {
        osc?.stop();
      } catch {
      }
      try {
        osc?.disconnect();
        gain?.disconnect();
      } catch {
      }
      try {
        audioCtx?.close?.();
      } catch {
      }
      document.removeEventListener("visibilitychange", resumeIfSuspended, { capture: true });
      window.removeEventListener("focus", resumeIfSuspended, { capture: true });
      osc = null;
      gain = null;
      audioCtx = null;
    }
    let hb = null;
    function startHeartbeat() {
      const targetEl = document.querySelector("canvas") || document.body || document.documentElement;
      hb = window.setInterval(() => {
        try {
          targetEl.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 1, clientY: 1 }));
        } catch {
        }
      }, 25e3);
    }
    function stopHeartbeat() {
      if (hb !== null) {
        clearInterval(hb);
        hb = null;
      }
    }
    let pingTimer = null;
    async function pingPosition() {
      try {
        const cur2 = await deps.getPosition();
        if (!cur2) return;
        await deps.move(Math.round(cur2.x), Math.round(cur2.y));
      } catch {
      }
    }
    function startPing() {
      pingTimer = window.setInterval(pingPosition, 6e4);
      void pingPosition();
    }
    function stopPing() {
      if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    }
    return {
      start() {
        patchProps();
        swallowAll();
        startAudioKeepAlive();
        startHeartbeat();
        startPing();
      },
      stop() {
        stopPing();
        stopHeartbeat();
        stopAudioKeepAlive();
        unswallowAll();
        restoreProps();
      }
    };
  }

  // src/main.ts
  (async function() {
    "use strict";
    installPageWebSocketHook();
    mountHUD({
      onRegister(register) {
        register("players", "Players", renderPlayersMenu);
        register("pets", "Pets", renderPetsMenu);
        register("misc", "Misc", renderMiscMenu);
        register("debug-data", "Debug Data", renderDebugDataMenu);
      }
    });
    initWatchers();
    const antiAfk = createAntiAfkController({
      getPosition: () => PlayerService.getPosition(),
      move: (x, y) => PlayerService.move(x, y)
    });
    antiAfk.start();
  })();
})();
