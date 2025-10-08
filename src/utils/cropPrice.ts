// cropPrice.ts
import {
  myCurrentGardenObject,
  myCurrentSortedGrowSlotIndices,
  myCurrentGrowSlotIndex,
  numPlayers,
  type CurrentGardenObject,
} from "../store/atoms";
import {
  valueFromGardenSlot,
  valueFromGardenPlant,
  DefaultPricing,
} from "../utils/calculators";

type CGO = CurrentGardenObject & { objectType?: string; slots?: any[] };
const isPlantObject = (o: CGO | null | undefined): o is CGO & { objectType: "plant" } =>
  !!o && o.objectType === "plant";

const defaultOrder = (n: number) => Array.from({ length: n }, (_, i) => i);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface CropPriceWatcher {
  get(): number | null;
  onChange(cb: () => void): () => void;
  stop(): void;
}

/** Notifie sur: myCurrentGardenObject **et** myCurrentGrowSlotIndex */
export function startCropPriceWatcherViaGardenObject(): CropPriceWatcher {
  let cur: CurrentGardenObject = null;
  let players: number | undefined = undefined;
  let sortedIdx: number[] | null = null;
  let selectedIdx: number | null = null;
  let lastPrice: number | null = null;

  const listeners = new Set<() => void>();
  const notify = () => { for (const fn of listeners) try { fn(); } catch {} };

  // petit throttle pour coalescer plusieurs changements rapprochés
  let scheduled = false;
  const scheduleRecomputeAndNotify = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; recomputeAndNotify(); });
  };

  function getOrder(): number[] {
    const n = Array.isArray((cur as CGO)?.slots) ? (cur as CGO).slots!.length : 0;
    if (!n) return [];
    return Array.isArray(sortedIdx) && sortedIdx.length === n ? sortedIdx! : defaultOrder(n);
  }
  function selectedOrderedPosition(): number {
    if (!isPlantObject(cur)) return 0;
    const slots = (cur as CGO).slots ?? [];
    const n = Array.isArray(slots) ? slots.length : 0;
    if (!n) return 0;
    const raw = Number.isFinite(selectedIdx as number) ? (selectedIdx as number) : 0;
    const clampedRaw = clamp(raw, 0, n - 1);
    const ord = getOrder();
    const pos = ord.indexOf(clampedRaw);
    return pos >= 0 ? pos : 0;
  }
  function getOrderedSlots(): any[] {
    if (!isPlantObject(cur)) return [];
    const slots = Array.isArray((cur as CGO).slots) ? (cur as CGO).slots! : [];
    const ord = getOrder();
    const out: any[] = [];
    for (const i of ord) if (slots[i] != null) out.push(slots[i]);
    return out;
  }
  function computeSelectedSlotPrice(): number | null {
    if (!isPlantObject(cur)) return null;
    const ordered = getOrderedSlots();
    if (!ordered.length) return null;
    const pos = selectedOrderedPosition();
    const slot = ordered[clamp(pos, 0, ordered.length - 1)];
    const val = valueFromGardenSlot(slot, DefaultPricing, players);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  function computeWholePlantPrice(): number | null {
    if (!isPlantObject(cur)) return null;
    const v = valueFromGardenPlant(cur as any, DefaultPricing, players);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  function recomputeAndNotify() {
    const slotVal = computeSelectedSlotPrice();
    const next = (slotVal ?? computeWholePlantPrice()) ?? null;
    if (next !== lastPrice) { lastPrice = next; notify(); }
  }

  (async () => {
    try { cur = await myCurrentGardenObject.get(); } catch {}
    try { players = await numPlayers.get(); } catch {}
    try {
      const v = await myCurrentSortedGrowSlotIndices.get();
      sortedIdx = Array.isArray(v) ? v.slice() : null;
    } catch {}
    try { selectedIdx = await myCurrentGrowSlotIndex.get(); } catch {}

    // silencieux (pas de notify)
    numPlayers.onChange((n) => { players = n as number; });
    myCurrentSortedGrowSlotIndices.onChange((v) => { sortedIdx = Array.isArray(v) ? v.slice() : null; });

    // ✅ TRIGGERS
    myCurrentGardenObject.onChange((v) => { cur = v; scheduleRecomputeAndNotify(); });
    myCurrentGrowSlotIndex.onChange((idx) => {
      selectedIdx = Number.isFinite(idx as number) ? (idx as number) : 0;
      scheduleRecomputeAndNotify(); // ⬅️ maintenant on notifie aussi sur changement d'index
    });

    // 1er calcul
    recomputeAndNotify();
  })();

  return {
    get() { return lastPrice; },
    onChange(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); },
    stop() { listeners.clear(); },
  };
}
