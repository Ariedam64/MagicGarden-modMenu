// src/services/player.ts
// Service central des actions liées au joueur (position, téléportation, listeners)

import { sendToGame } from "../core/webSocketBridge";
import { Atoms, onFavoriteIds, onFavoriteIdsNow, getFavoriteIdSet } from "../store/atoms";

export type XY = { x: number; y: number };

/* ============================== Types Garden ============================== */

export type GardenState = {
  tileObjects: Record<string, any>;
  boardwalkTileObjects: Record<string, any>;
};

export type GardenDiff = {
  added: number[];
  updated: number[];
  removed: number[];
  changes: SlotChange[];
};

type SlotChange =
  | { kind: "added"; slot: number; next: any }
  | { kind: "removed"; slot: number; prev: any }
  | { kind: "updated"; slot: number; prev: any; next: any };

function slotSig(o: any): string {
  if (!o) return "∅";
  return [
    o.objectType ?? o.type ?? "",
    o.species ?? o.seedSpecies ?? o.plantSpecies ?? o.eggId ?? o.decorId ?? "",
    o.plantedAt ?? o.startTime ?? 0,
    o.maturedAt ?? o.endTime ?? 0,
  ].join("|");
}

function diffGarden(prev: GardenState | null, next: GardenState | null): GardenDiff {
  const p = prev?.tileObjects ?? {};
  const n = next?.tileObjects ?? {};
  const added: number[] = [];
  const updated: number[] = [];
  const removed: number[] = [];
  const changes: SlotChange[] = [];

  const seen = new Set<string>();

  for (const k of Object.keys(n)) {
    seen.add(k);
    if (!(k in p)) {
      added.push(+k);
      changes.push({ kind: "added", slot: +k, next: n[k] });
    } else if (slotSig(p[k]) !== slotSig(n[k])) {
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

/* ============================== Types Pets ============================== */

export type PetSlot = {
  id: string;
  petSpecies: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
};

export type PetInfo = {
  slot: PetSlot;
  position?: XY | null;
};

export type PetState = PetInfo[] | null;

export type PetsChange =
  | { kind: "added"; id: string }
  | { kind: "removed"; id: string }
  | { kind: "updated"; id: string };

export type PetsDiff = {
  added: string[];
  updated: string[];
  removed: string[];
  changes: PetsChange[];
};

// signature stable d’un pet (id -> string compacte)
function petSig(p: PetInfo): string {
  const s = p?.slot ?? ({} as PetSlot);
  const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
  const ab   = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
  const name = s.name ?? "";
  const species = s.petSpecies ?? "";
  const xp = Number.isFinite(s.xp as number) ? Math.round((s.xp as number)) : 0;
  const hunger = Number.isFinite(s.hunger as number) ? Math.round((s.hunger as number) * 1000) : 0;
  const scale  = Number.isFinite(s.targetScale as number) ? Math.round((s.targetScale as number) * 1000) : 0;

  const x = Number.isFinite(p?.position?.x as number) ? Math.round((p!.position!.x as number)) : 0;
  const y = Number.isFinite(p?.position?.y as number) ? Math.round((p!.position!.y as number)) : 0;

  return `${species}|${name}|xp:${xp}|hg:${hunger}|sc:${scale}|m:${muts}|a:${ab}|pos:${x},${y}`;
}

type PetsSnapshot = Map<string, string>;

function snapshotPets(state: PetState): PetsSnapshot {
  const snap = new Map<string, string>();
  const arr = Array.isArray(state) ? state : [];
  for (const it of arr) {
    const id = String(it?.slot?.id ?? "");
    if (!id) continue;
    snap.set(id, petSig(it));
  }
  return snap;
}

function diffPetsSnapshot(prev: PetsSnapshot, next: PetsSnapshot): PetsDiff {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const changes: PetsChange[] = [];

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

/* =========================== Types Crop Inventory ========================= */

export type CropItem = {
  id: string;
  species?: string;
  itemType?: string;
  scale?: number;
  mutations?: string[];
};

export type CropInventoryState = CropItem[] | null;

export type InventoryChange =
  | { kind: "added"; key: string }
  | { kind: "removed"; key: string }
  | { kind: "updated"; key: string };

export type InventoryDiff = {
  added: string[];
  updated: string[];
  removed: string[];
  changes: InventoryChange[];
};

function cropSig(it: CropItem): string {
  const muts = Array.isArray(it.mutations) ? it.mutations.slice().sort().join(",") : "";
  const scale = Number.isFinite(it.scale) ? Math.round((it.scale as number) * 1000) : 0;
  return `${it.species ?? ""}|${it.itemType ?? ""}|${scale}|${muts}`;
}

type InvSnapshot = Map<string, string>;

function snapshotInventory(inv: CropInventoryState): InvSnapshot {
  const snap = new Map<string, string>();
  const arr = Array.isArray(inv) ? inv : [];
  for (const it of arr) {
    const id = String((it as any)?.id ?? "");
    if (!id) continue;
    snap.set(id, cropSig(it));
  }
  return snap;
}

function diffCropInventorySnapshot(prev: InvSnapshot, next: InvSnapshot): InventoryDiff {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const changes: InventoryChange[] = [];

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

/* ================================ Player API =============================== */

export const PlayerService = {
  /* ------------------------- Position / Déplacement ------------------------- */

  getPosition(): Promise<XY | undefined> {
    return Atoms.player.position.get();
  },

  onPosition(cb: (pos: XY) => void) {
    return Atoms.player.position.onChange(cb);
  },

  onPositionNow(cb: (pos: XY) => void) {
    return Atoms.player.position.onChangeNow(cb);
  },

  async setPosition(x: number, y: number) {
    await Atoms.player.position.set({ x, y });
  },

  async teleport(x: number, y: number) {
    try { await this.setPosition(x, y); } catch (err) {  }
    try { sendToGame({ type: "Teleport", position: { x, y } }); } catch (err) {  }
  },

  async move(x: number, y: number) {
    try { await this.setPosition(x, y); } catch (err) {  }
    try { sendToGame({ type: "PlayerPosition", position: { x, y } }); } catch (err) {  }
  },

  /* ------------------------------ Actions jeu ------------------------------ */

  async plantSeed(slot: number, species: string) {
    try { sendToGame({ type: "PlantSeed", slot, species }); } catch (err) {  }
  },

  async sellAllCrops() {
    try { sendToGame({ type: "SellAllCrops" }); } catch (err) {  }
  },

  async sellPet(itemId: string) {
    try { sendToGame({ type: "SellPet", itemId }); } catch (err) {  }
  },

  async waterPlant(slot: number) {
    try { sendToGame({ type: "WaterPlant", slot }); } catch (err) {  }
  },

  async setSelectedItem(itemIndex: any) {
    try { sendToGame({ type: "SetSelectedItem", itemIndex }); } catch (err) { }
  },

  async pickupObject() {
    try { sendToGame({ type: "PickupObject" }); } catch (err) {  }
  },

  async dropObject() {
    try { sendToGame({ type: "DropObject" }); } catch (err) { }
  },

  async harvestCrop(slot: number, slotsIndex: number) {
    try { sendToGame({ type: "HarvestCrop", slot, slotsIndex }); } catch (err) {  }
  },

  async feedPet(petItemId: string, cropItemId: string) {
    try { sendToGame({ type: "FeedPet", petItemId, cropItemId }); } catch (err) {  }
  },

  async hatchEgg(slot: number) {
    try { sendToGame({ type: "HatchEgg", slot }); } catch (err) {  }
  },

  async placeDecor(tileType: "Dirt" | "Boardwalk", localTileIndex: number, decorId: string) {
    try { sendToGame({ type: "PlaceDecor", tileType, localTileIndex, decorId }); } catch (err) {  }
  },

  async swapPet(petSlotId: string, petInventoryId: string) {
    try { sendToGame({ type: "SwapPet", petSlotId, petInventoryId }); } catch (err) {  }
  },

  async placePet(itemId: string, position: { x: 0; y: 0 }, tileType: "Boardwalk", localTileIndex: 64) {
    try { sendToGame({ type: "PlacePet", itemId, position, tileType, localTileIndex }); } catch (err) {  }
  },

  async petPositions(petPositions: Record<string, XY | null | undefined>) {
    const entries = Object.entries(petPositions ?? {});
    if (!entries.length) {
      return;
    }

    const sanitized: Record<string, { x: number; y: number }> = {};

    for (const [id, pos] of entries) {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sanitized[String(id)] = { x, y };
    }

    const validCount = Object.keys(sanitized).length;
    if (!validCount) {
      return;
    }

    try { sendToGame({ type: "PetPositions", petPositions: sanitized }); } catch (err) { }
  },

  async storePet(itemId: string) {
    try { sendToGame({ type: "StorePet", itemId }); } catch (err) {  }
  },

  async wish(itemId: string) {
    try { sendToGame({ type: "Wish", itemId }); } catch (err) {  }
  },

  async purchaseSeed(species: string) {
    try { sendToGame({ type: "PurchaseSeed", species }); } catch (err) {  }
  },

  async purchaseDecor(decorId: string) {
    try { sendToGame({ type: "PurchaseDecor", decorId }); } catch (err) {  }
  },

  async purchaseEgg(eggId: string) {
    try { sendToGame({ type: "PurchaseEgg", eggId }); } catch (err) {  }
  },

  async purchaseTool(toolId: string) {
    try { sendToGame({ type: "PurchaseTool", toolId }); } catch (err) {  }
  },

  async triggerAnimation(playerId: string, animation: string){
    Atoms.player.avatarTriggerAnimationAtom.set({playerId, animation})
  },

  /* -------------------------------- Favorites ------------------------------ */

  async toggleFavoriteItem(itemId: string) {
    try { sendToGame({ type: "ToggleFavoriteItem", itemId }); } catch (err) {  }
  },

  async getFavoriteIds(): Promise<string[]> {
    const ids = await Atoms.inventory.favoriteIds.get();
    return Array.isArray(ids) ? ids.slice() : [];
  },

  async getFavoriteIdSet(): Promise<Set<string>> {
    return getFavoriteIdSet();
  },

  async isFavoriteItem(itemId: string): Promise<boolean> {
    const set = await getFavoriteIdSet();
    return set.has(itemId);
  },

  async ensureFavoriteItem(itemId: string, shouldBeFavorite: boolean): Promise<boolean> {
    const cur = await this.isFavoriteItem(itemId);
    if (cur !== shouldBeFavorite) {
      await this.toggleFavoriteItem(itemId);
      return shouldBeFavorite;
    }
    return cur;
  },

  async ensureFavorites(items: Iterable<string>, shouldBeFavorite: boolean): Promise<void> {
    const set = await getFavoriteIdSet();
    for (const id of items) {
      const cur = set.has(id);
      if (cur !== shouldBeFavorite) {
        try { await this.toggleFavoriteItem(id); } catch {}
      }
    }
  },

  onFavoriteIdsChange(cb: (ids: string[]) => void) {
    return onFavoriteIds((ids) => cb(Array.isArray(ids) ? ids : []));
  },

  async onFavoriteIdsChangeNow(cb: (ids: string[]) => void) {
    return onFavoriteIdsNow((ids) => cb(Array.isArray(ids) ? ids : []));
  },

  onFavoriteSetChange(cb: (ids: Set<string>) => void) {
    return onFavoriteIds((ids) => cb(new Set(Array.isArray(ids) ? ids : [])));
  },

  async onFavoriteSetChangeNow(cb: (ids: Set<string>) => void) {
    const cur = await getFavoriteIdSet();
    cb(cur);
    return onFavoriteIds((ids) => cb(new Set(Array.isArray(ids) ? ids : [])));
  },

  /* --------------------------------- Garden -------------------------------- */

  async getGardenState(): Promise<GardenState | null> {
    return (await Atoms.data.garden.get()) ?? null;
  },

  onGardenChange(cb: (g: GardenState | null) => void) {
    return Atoms.data.garden.onChange(cb);
  },

  onGardenChangeNow(cb: (g: GardenState | null) => void) {
    return Atoms.data.garden.onChangeNow(cb);
  },

  onGardenDiff(cb: (g: GardenState | null, diff: GardenDiff) => void) {
    let prev: GardenState | null = null;
    return Atoms.data.garden.onChange((g) => {
      const d = diffGarden(prev, g);
      if (d.added.length || d.updated.length || d.removed.length || g !== prev) {
        prev = g;
        cb(g, d);
      }
    });
  },

  async onGardenDiffNow(cb: (g: GardenState | null, d: GardenDiff) => void) {
    let prev: GardenState | null = (await Atoms.data.garden.get()) ?? null;
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

  async getPets(): Promise<PetState> {
    const arr = await Atoms.pets.myPetInfos.get();
    return Array.isArray(arr) ? (arr as PetInfo[]) : null;
  },

  onPetsChange(cb: (pets: PetState) => void) {
    let prev: PetState = null;
    return Atoms.pets.myPetInfos.onChange((next) => {
      if (next !== prev) {
        prev = next as PetState;
        cb(prev);
      }
    });
  },

  async onPetsChangeNow(cb: (pets: PetState) => void) {
    let prev: PetState = await this.getPets();
    cb(prev);
    return Atoms.pets.myPetInfos.onChange((next) => {
      if (next !== prev) {
        prev = next as PetState;
        cb(prev);
      }
    });
  },

  onPetsDiff(cb: (pets: PetState, diff: PetsDiff) => void) {
    let prevSnap: PetsSnapshot = snapshotPets(null);
    return Atoms.pets.myPetInfos.onChange((state) => {
      const nextSnap = snapshotPets(state as PetState);
      const d = diffPetsSnapshot(prevSnap, nextSnap);
      if (d.added.length || d.updated.length || d.removed.length) {
        cb(state as PetState, d);
        prevSnap = nextSnap;
      }
    });
  },

  async onPetsDiffNow(cb: (pets: PetState, diff: PetsDiff) => void) {
    let cur: PetState = await this.getPets();
    let prevSnap: PetsSnapshot = snapshotPets(null);
    let nextSnap: PetsSnapshot = snapshotPets(cur);

    const first = diffPetsSnapshot(prevSnap, nextSnap);
    cb(cur, first);

    prevSnap = nextSnap;

    return Atoms.pets.myPetInfos.onChange((state) => {
      nextSnap = snapshotPets(state as PetState);
      const d = diffPetsSnapshot(prevSnap, nextSnap);
      if (d.added.length || d.updated.length || d.removed.length) {
        cb(state as PetState, d);
        prevSnap = nextSnap;
      }
    });
  },

  /* ------------------------- Crop Inventory (crops) ------------------------- */

  async getCropInventoryState(): Promise<CropInventoryState> {
    return Atoms.inventory.myCropInventory.get();
  },

  onCropInventoryChange(cb: (inv: CropInventoryState) => void) {
    let prev: CropInventoryState = null;
    return Atoms.inventory.myCropInventory.onChange((inv) => {
      if (inv !== prev) {
        prev = inv;
        cb(inv);
      }
    });
  },

  async onCropInventoryChangeNow(cb: (inv: CropInventoryState) => void) {
    let prev: CropInventoryState = await Atoms.inventory.myCropInventory.get();
    cb(prev);
    return Atoms.inventory.myCropInventory.onChange((inv) => {
      if (inv !== prev) {
        prev = inv;
        cb(inv);
      }
    });
  },

  onCropInventoryDiff(cb: (inv: CropInventoryState, diff: InventoryDiff) => void) {
    let prevSnap: InvSnapshot = snapshotInventory(null);
    return Atoms.inventory.myCropInventory.onChange((inv) => {
      const nextSnap = snapshotInventory(inv);
      const d = diffCropInventorySnapshot(prevSnap, nextSnap);
      if (d.added.length || d.updated.length || d.removed.length) {
        cb(inv, d);
        prevSnap = nextSnap;
      }
    });
  },

  async onCropInventoryDiffNow(cb: (inv: CropInventoryState, diff: InventoryDiff) => void) {
    let cur: CropInventoryState = await Atoms.inventory.myCropInventory.get();
    let prevSnap: InvSnapshot = snapshotInventory(null);
    let nextSnap: InvSnapshot = snapshotInventory(cur);

    const firstDiff = diffCropInventorySnapshot(prevSnap, nextSnap);
    cb(cur, firstDiff);

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

  async getNumPlayers(): Promise<number> {
    const n = await Atoms.server.numPlayers.get();
    return typeof n === "number" ? n : 0;
  },

  onNumPlayersChange(cb: (n: number) => void) {
    let prev: number | undefined = undefined;
    return Atoms.server.numPlayers.onChange((n) => {
      if (n !== prev) {
        prev = n;
        cb(n);
      }
    });
  },

  async onNumPlayersChangeNow(cb: (n: number) => void) {
    let prev = await this.getNumPlayers();
    cb(prev);
    return Atoms.server.numPlayers.onChange((n) => {
      if (n !== prev) {
        prev = n;
        cb(n);
      }
    });
  },
};
