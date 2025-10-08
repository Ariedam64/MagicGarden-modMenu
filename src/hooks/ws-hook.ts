// src/hooks/ws-hook.ts
import { NativeWS, sockets, setQWS } from "../core/state";
import { pageWindow, readSharedGlobal, shareGlobal } from "../utils/page-context";
import { parseWSData } from "../core/parse";
import { Atoms } from "../store/atoms";
import { lockerService } from "../services/locker";
import type { GardenState, PlantSlotTiming } from "../store/atoms";

export function installPageWebSocketHook() {
  if (!pageWindow || !NativeWS) return;

  function WrappedWebSocket(this: any, url: string | URL, protocols?: string | string[]) {
    const ws: WebSocket =
      protocols !== undefined
        ? new NativeWS(url as any, protocols)
        : new NativeWS(url as any);
    sockets.push(ws);

    ws.addEventListener("open", () => {
      setTimeout(() => {
        if ((ws as any).readyState === NativeWS.OPEN) setQWS(ws, "open-fallback");
      }, 800);
    });

    ws.addEventListener("message", async (ev: MessageEvent) => {
      const j = await parseWSData(ev.data);
      if (!j) return;
      if (
        !hasSharedQuinoaWS() &&
        (j.type === "Welcome" || j.type === "Config" || j.fullState || j.config)
      ) {
        setQWS(ws, "message:" + (j.type || "state"));
      }
    });
    return ws;
  }

  (WrappedWebSocket as any).prototype = NativeWS.prototype;
  try { (WrappedWebSocket as any).OPEN = (NativeWS as any).OPEN; } catch {}
  try { (WrappedWebSocket as any).CLOSED = (NativeWS as any).CLOSED; } catch {}
  try { (WrappedWebSocket as any).CLOSING = (NativeWS as any).CLOSING; } catch {}
  try { (WrappedWebSocket as any).CONNECTING = (NativeWS as any).CONNECTING; } catch {}

  (pageWindow as any).WebSocket = WrappedWebSocket as any;
  if (pageWindow !== window) {
    try { (window as any).WebSocket = WrappedWebSocket as any; } catch {}
  }

  function hasSharedQuinoaWS() {
    const existing = readSharedGlobal<WebSocket | null>("quinoaWS");
    return !!existing;
  }

  installHarvestCropInterceptor();
}

type ConnectionCtor = {
  sendMessage?: (message: unknown, ...rest: any[]) => unknown;
  prototype?: ConnectionCtor;
};

type ResolvedSendMessage =
  | { kind: "static" | "proto"; fn: (message: unknown, ...rest: any[]) => unknown }
  | null;

export type MessageInterceptorContext = {
  thisArg: unknown;
  args: any[];
};

export type MessageInterceptorResult =
  | void
  | { kind: "drop" }
  | { kind: "replace"; message: any };

export type MessageInterceptor = (
  message: any,
  context: MessageInterceptorContext
) => MessageInterceptorResult;

const interceptorsByType = new Map<string, MessageInterceptor[]>();

type AppliedInterceptorResult = { message: any; drop: boolean };

type InterceptorHookStatus = "idle" | "installing" | "installed";
let interceptorStatus: InterceptorHookStatus = readSharedGlobal<boolean>(
  "__tmMessageHookInstalled"
)
  ? "installed"
  : "idle";

let interceptorPoll: number | null = null;
let interceptorTimeout: number | null = null;

export function registerMessageInterceptor(
  type: string,
  interceptor: MessageInterceptor
): () => void {
  const list = interceptorsByType.get(type);
  if (list) {
    list.push(interceptor);
  } else {
    interceptorsByType.set(type, [interceptor]);
  }

  ensureMessageInterceptorInstalled();

  return () => {
    const current = interceptorsByType.get(type);
    if (!current) return;
    const index = current.indexOf(interceptor);
    if (index !== -1) current.splice(index, 1);
    if (current.length === 0) interceptorsByType.delete(type);
  };
}

function ensureMessageInterceptorInstalled() {
  if (interceptorStatus === "installed" || interceptorStatus === "installing") return;

  interceptorStatus = "installing";

  const tryInstall = () => {
    const Conn: ConnectionCtor | undefined =
      (pageWindow as any).MagicCircle_RoomConnection ||
      readSharedGlobal<ConnectionCtor>("MagicCircle_RoomConnection");
    if (!Conn) return false;

    const original = resolveSendMessage(Conn);
    if (!original) return false;

    const wrap = function (this: unknown, message: any, ...rest: any[]) {
      let currentMessage = message;

      try {
        const type = currentMessage?.type;
        if (type && interceptorsByType.size > 0) {
          const context: MessageInterceptorContext = { thisArg: this, args: rest };
          const result = applyInterceptors(type, currentMessage, context);
          if (result.drop) return;
          currentMessage = result.message;
        }
      } catch (error) {
        console.error("[MG-mod] Erreur dans le hook WS :", error);
      }

      return original.fn.call(this, currentMessage, ...rest);
    };

    if (original.kind === "static") {
      (Conn as any).sendMessage = wrap;
    } else {
      (Conn as any).prototype.sendMessage = wrap;
    }

    interceptorStatus = "installed";
    shareGlobal("__tmMessageHookInstalled", true);

    if (interceptorPoll !== null) {
      clearInterval(interceptorPoll);
      interceptorPoll = null;
    }
    if (interceptorTimeout !== null) {
      clearTimeout(interceptorTimeout);
      interceptorTimeout = null;
    }

    return true;
  };

  if (tryInstall()) return;

  interceptorPoll = window.setInterval(() => {
    if (tryInstall()) {
      if (interceptorPoll !== null) {
        clearInterval(interceptorPoll);
        interceptorPoll = null;
      }
    }
  }, 200);

  interceptorTimeout = window.setTimeout(() => {
    if (interceptorPoll !== null) {
      clearInterval(interceptorPoll);
      interceptorPoll = null;
    }
    if (interceptorStatus !== "installed") {
      interceptorStatus = "idle";
    }
    interceptorTimeout = null;
  }, 20000);
}

function applyInterceptors(
  type: string,
  initialMessage: any,
  context: MessageInterceptorContext
): AppliedInterceptorResult {
  const interceptors = interceptorsByType.get(type);
  if (!interceptors || interceptors.length === 0) {
    return { message: initialMessage, drop: false };
  }

  let currentMessage = initialMessage;
  for (const interceptor of [...interceptors]) {
    try {
      const result = interceptor(currentMessage, context);
      if (!result) continue;
      if (result.kind === "drop") {
        return { message: currentMessage, drop: true };
      }
      if (result.kind === "replace") {
        currentMessage = result.message;
      }
    } catch (error) {
    }
  }

  return { message: currentMessage, drop: false };
}

function installHarvestCropInterceptor() {
  if (readSharedGlobal<boolean>("__tmHarvestHookInstalled")) return;

  let latestGardenState: GardenState | null = null;

  void (async () => {
    try {
      latestGardenState = (await Atoms.data.garden.get()) ?? null;
    } catch {}
    try {
      await Atoms.data.garden.onChange((next) => {
        latestGardenState = (next as GardenState | null) ?? null;
      });
    } catch {}
  })();

  registerMessageInterceptor("HarvestCrop", (message) => {
    const lockerEnabled = (() => {
      try {
        return lockerService.getState().enabled;
      } catch {
        return false;
      }
    })();

    if (!lockerEnabled) {
      return;
    }

    const slot = message.slot;
    const slotsIndex = message.slotsIndex;

    if (!Number.isInteger(slot as number) || !Number.isInteger(slotsIndex as number)) {
      return;
    }

    const garden = latestGardenState;
    const tileObjects = garden?.tileObjects;
    const tile = tileObjects ? (tileObjects[String(slot)] as any) : undefined;

    if (!tile || typeof tile !== "object" || tile.objectType !== "plant") {
      return;
    }

    const slots = Array.isArray(tile.slots) ? tile.slots : [];
    const cropSlot = slots[slotsIndex];

    if (!cropSlot || typeof cropSlot !== "object") {
      return;
    }

    const seedKey = extractSeedKey(tile);
    const sizePercent = extractSizePercent(cropSlot as PlantSlotTiming);
    const mutations = sanitizeMutations((cropSlot as PlantSlotTiming)?.mutations);

    let harvestAllowed = true;

    try {
      harvestAllowed = lockerService.allowsHarvest({
        seedKey,
        sizePercent,
        mutations,
      });
    } catch {
      harvestAllowed = true;
    }

    if (!harvestAllowed) {
      console.log("[HarvestCrop] Blocked by locker", {
        slot,
        slotsIndex,
        seedKey,
        sizePercent,
        mutations,
      });
      return { kind: "drop" };
    }

    void (async () => {
      try {
        const garden = await Atoms.data.garden.get();
        const tileObjects = (garden as any)?.tileObjects ?? null;
        const tile = tileObjects ? tileObjects[String(slot)] : undefined;
        const cropSlot = Array.isArray(tile?.slots) ? tile.slots?.[slotsIndex] : undefined;
        console.log("[HarvestCrop]", {
          slot,
          slotsIndex,
          cropSlot,
        });
      } catch (error) {
        console.error("[HarvestCrop] Unable to log crop slot", error);
      }
    })();

    //return { kind: "drop" };
  });

  shareGlobal("__tmHarvestHookInstalled", true);
}

function extractSeedKey(tile: any): string | null {
  if (!tile || typeof tile !== "object") return null;
  if (typeof tile.seedKey === "string" && tile.seedKey) return tile.seedKey;
  if (typeof tile.species === "string" && tile.species) return tile.species;
  const fallbacks = ["seedSpecies", "plantSpecies", "cropSpecies", "speciesId"];
  for (const key of fallbacks) {
    const value = tile[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function extractSizePercent(slot: PlantSlotTiming | undefined): number {
  if (!slot || typeof slot !== "object") return 100;
  const direct = Number(
    (slot as any).sizePercent ?? (slot as any).sizePct ?? (slot as any).size ?? (slot as any).percent ?? (slot as any).progressPercent
  );
  if (Number.isFinite(direct)) {
    return clampPercent(Math.round(direct), 0, 100);
  }
  const scale = Number((slot as any).targetScale ?? (slot as any).scale);
  if (Number.isFinite(scale)) {
    if (scale > 1 && scale <= 2) {
      const pct = 50 + ((scale - 1) / 1) * 50;
      return clampPercent(Math.round(pct), 50, 100);
    }
    const pct = Math.round(scale * 100);
    return clampPercent(pct, 0, 100);
  }
  return 100;
}

function sanitizeMutations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (typeof value === "string") {
      if (value) out.push(value);
    } else if (value != null) {
      const str = String(value);
      if (str) out.push(str);
    }
  }
  return out;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveSendMessage(Conn: ConnectionCtor): ResolvedSendMessage {
  const isFn = (value: unknown): value is (...args: any[]) => any =>
    typeof value === "function";

  if (isFn(Conn.sendMessage)) {
    return { kind: "static" as const, fn: Conn.sendMessage.bind(Conn) };
  }

  if (Conn.prototype && isFn(Conn.prototype.sendMessage)) {
    return { kind: "proto" as const, fn: Conn.prototype.sendMessage };
  }

  return null;
}
