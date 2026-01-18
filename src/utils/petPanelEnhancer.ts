import { onAdded } from "../core/dom";
import { Atoms } from "../store/atoms";
import { PetsService, clearHandSelection } from "../services/pets";
import { PlayerService, type PetInfo } from "../services/player";
import { closeInventoryPanel, fakeInventoryShow, isInventoryOpen } from "../services/fakeModal";
import { readAriesPath, writeAriesPath } from "./localStorage";
import { toastSimple } from "../ui/toast";

const PANEL_SELECTOR = ".css-1rszi55";
const LOG_BUTTON_CLASS = "tm-pet-log-crops-btn";
const FEED_BUTTON_CLASS = "tm-feed-from-inventory-btn";
const FEED_FROM_INVENTORY_BUTTON_CLASS = "tm-feed-from-inventory-select-btn";
const FEED_ROW_CLASS = "tm-feed-from-inventory-row";
const LOG_ROW_CLASS = "tm-pet-log-row";
const PATH_PETS_PANEL_BUTTONS = "pets.panelButtons";

type PetPanelButtonsSettings = {
  instantFeed: boolean;
  feedFromInventory: boolean;
};

const DEFAULT_PANEL_BUTTONS: PetPanelButtonsSettings = {
  instantFeed: true,
  feedFromInventory: true,
};

let started = false;

export function startPetPanelEnhancer(): void {
  if (started) return;
  started = true;

  if (typeof document === "undefined") {
    return;
  }

  onAdded(PANEL_SELECTOR, (node) => {
    if (!(node instanceof HTMLElement)) return;
    enhancePanel(node);
  });
}

export function getPetPanelButtonSettings(): PetPanelButtonsSettings {
  const raw = readAriesPath<Partial<PetPanelButtonsSettings>>(PATH_PETS_PANEL_BUTTONS);
  return {
    instantFeed: raw?.instantFeed !== false,
    feedFromInventory: raw?.feedFromInventory !== false,
  };
}

export function setPetPanelButtonSettings(patch: Partial<PetPanelButtonsSettings>): PetPanelButtonsSettings {
  const merged: PetPanelButtonsSettings = {
    ...DEFAULT_PANEL_BUTTONS,
    ...getPetPanelButtonSettings(),
    ...(patch || {}),
  };
  writeAriesPath(PATH_PETS_PANEL_BUTTONS, merged);
  return merged;
}

export function applyPetPanelButtonVisibility(scope?: ParentNode): void {
  if (typeof document === "undefined") return;
  const root = scope ?? document;
  const { instantFeed, feedFromInventory } = getPetPanelButtonSettings();

  const instantBtn = root.querySelector<HTMLElement>(`.${FEED_BUTTON_CLASS}`);
  if (instantBtn) instantBtn.style.display = instantFeed ? "" : "none";

  const inventoryBtn = root.querySelector<HTMLElement>(`.${FEED_FROM_INVENTORY_BUTTON_CLASS}`);
  if (inventoryBtn) inventoryBtn.style.display = feedFromInventory ? "" : "none";

  const row = root.querySelector<HTMLElement>(`.${FEED_ROW_CLASS}`);
  if (row) row.style.display = instantFeed || feedFromInventory ? "" : "none";
}

function enhancePanel(root: HTMLElement): void {
  try {
    ensureFeedButton(root);
  } catch (err) {
    console.warn("[PetPanel] Failed to inject feed button", err);
  }
}

function ensureFeedButton(root: HTMLElement): void {
  if (root.querySelector(`.${FEED_BUTTON_CLASS}`)) {
    applyPetPanelButtonVisibility(root);
    return;
  }

  const templateBtn = root.querySelector<HTMLButtonElement>("button.chakra-button");
  const btn = createStyledButton(templateBtn, "INSTANT FEED");
  btn.classList.add(FEED_BUTTON_CLASS);
  btn.setAttribute("aria-label", "Feed pet from inventory");
  btn.title = "Feed pet from inventory";
  btn.style.width = "100%";
  btn.style.minWidth = "100%";
  btn.style.alignContent = "center";
  btn.style.alignItems = "center";
  btn.style.padding = "6px 14px";
  btn.style.fontSize = "13px";
  btn.style.border = "2px solid #FFC83D";
  btn.style.color = "rgb(205 200 193)";
  btn.style.borderRadius = "10px";
  btn.style.height = "40px"

  btn.addEventListener("click", () => {
    void handleFeedClick(btn);
  });

  const row = document.createElement("div");
  row.classList.add("McFlex", FEED_ROW_CLASS);
  row.style.marginTop = "8px";
  row.style.justifyContent = "center";
  row.style.width = "100%";
  row.style.flexDirection = "column";
  row.style.alignItems = "stretch";
  row.style.gap = "8px";
  row.appendChild(btn);

  const feedFromInventoryBtn = createStyledButton(
    templateBtn,
    "FEED FROM INVENTORY",
  );
  feedFromInventoryBtn.classList.add(FEED_FROM_INVENTORY_BUTTON_CLASS);
  feedFromInventoryBtn.style.width = "100%";
  feedFromInventoryBtn.style.minWidth = "100%";
  feedFromInventoryBtn.style.alignContent = "center";
  feedFromInventoryBtn.style.alignItems = "center";
  feedFromInventoryBtn.style.marginTop = "8px";
  feedFromInventoryBtn.style.padding = "6px 14px";
  feedFromInventoryBtn.style.fontSize = "13px";
  feedFromInventoryBtn.style.border = "2px solid #BA5E1E";
  feedFromInventoryBtn.style.color = "rgb(205 200 193)";
  feedFromInventoryBtn.style.borderRadius = "10px";
  feedFromInventoryBtn.style.height = "40px"

  row.appendChild(feedFromInventoryBtn);

  feedFromInventoryBtn.addEventListener("click", () => {
    void handleInventoryPreviewClick(feedFromInventoryBtn);
  });

  const actions = root.querySelector(".McFlex.css-cabebk");
  const abilities = root.querySelector(".McFlex.css-1hd05pq");

  if (actions && abilities && abilities.parentElement === actions.parentElement) {
    abilities.parentElement!.insertBefore(row, abilities);
  } else if (actions?.parentElement) {
    actions.parentElement.insertBefore(row, actions.nextSibling);
  } else {
    root.appendChild(row);
  }

  applyPetPanelButtonVisibility(root);
}

function createStyledButton(template: HTMLButtonElement | null, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";

  if (template?.className) {
    btn.className = template.className;
  } else {
    btn.className = "chakra-button";
  }

  const wrapper = document.createElement("div");
  wrapper.className = template?.firstElementChild instanceof HTMLElement
    ? template.firstElementChild.className
    : "McFlex";

  const textEl = document.createElement("p");
  const templateText = template?.querySelector(".chakra-text");
  textEl.className = templateText instanceof HTMLElement ? templateText.className : "chakra-text";
  textEl.textContent = label;

  wrapper.appendChild(textEl);
  btn.appendChild(wrapper);

  return btn;
}

async function handleLogClick(btn: HTMLButtonElement): Promise<void> {
  const prevDisabled = btn.disabled;
  btn.disabled = true;
  try {
    const petId = await getExpandedPetId();
    if (!petId) {
      await toastSimple("Pet crops", "No expanded pet detected.", "error");
      return;
    }

    const pet = await findPetById(petId);
    if (!pet) {
      await toastSimple("Pet crops", "Unable to resolve expanded pet.", "error");
      return;
    }

    const species = String(pet?.slot?.petSpecies || "");
    const crops = PetsService.getCompatibleCropsForSpecies(species);
    console.log(
      `[Pet panel] Compatible crops for pet ${petId} (${species || "unknown"})`,
      crops,
    );

    const label = species || pet?.slot?.name || "pet";
    await toastSimple(
      "Pet crops",
      `Logged ${crops.length} crop(s) for ${label}.`,
      "info",
    );
  } catch (err) {
    console.error("[Pet panel] Failed to log crops", err);
    await toastSimple("Pet crops", "Failed to log compatible crops.", "error");
  } finally {
    btn.disabled = prevDisabled;
  }
}

async function handleFeedClick(btn: HTMLButtonElement): Promise<void> {
  const prevDisabled = btn.disabled;
  btn.disabled = true;
  try {
    const petId = await getExpandedPetId();
    if (!petId) {
      await toastSimple("Feed from inventory", "No expanded pet detected.", "error");
      return;
    }

    const pet = await findPetById(petId);
    if (!pet) {
      await toastSimple("Feed from inventory", "Unable to resolve expanded pet.", "error");
      return;
    }

    const species = String(pet?.slot?.petSpecies || "");
    const allowed = PetsService.getInstantFeedAllowedCrops(species);

    if (!allowed.size) {
      await toastSimple(
        "Feed from inventory",
        "No allowed crops for this pet. Check the Feeding tab.",
        "info",
      );
      return;
    }

    const inventory = await PlayerService.getCropInventoryState();
    const items = Array.isArray(inventory) ? inventory : [];
    const favoriteSet = await PlayerService.getFavoriteIdSet().catch(() => new Set<string>());

    const chosen = items.find((item) => {
      const speciesId = String((item as any)?.species || "");
      if (!speciesId || !allowed.has(speciesId)) return false;
      const id = String((item as any)?.id || "");
      return id && !favoriteSet.has(id);
    }) as any;

    const chosenId = String(chosen?.id || "");
    if (!chosenId) {
      await toastSimple(
        "Feed from inventory",
        "No compatible crops in inventory (excluding favorites).",
        "info",
      );
      return;
    }

    const previousHungerPct = getHungerPctForPet(pet);

    await PlayerService.feedPet(petId, chosenId);

    const hungerPct = await waitForHungerIncrease(petId, previousHungerPct, {
      initialDelay: 150,
    });
    const hungerSuffix =
      hungerPct != null ? ` Hunger: ${formatHungerPct(hungerPct)}%.` : "";

    const cropName = String(chosen?.species || "crop");
    const petLabel = pet?.slot?.name || species || petId;
    await toastSimple(
      "Feed from inventory",
      `Fed ${petLabel} with ${cropName}.${hungerSuffix}`,
      "success",
    );
  } catch (err) {
    console.error("[Pet panel] Failed to feed pet from inventory", err);
    await toastSimple(
      "Feed from inventory",
      err instanceof Error ? err.message : "Failed to feed pet.",
      "error",
    );
  } finally {
    btn.disabled = prevDisabled;
  }
}

async function handleInventoryPreviewClick(btn: HTMLButtonElement): Promise<void> {
  const prevDisabled = btn.disabled;
  let shouldCloseInventory = false;
  btn.disabled = true;
  try {
    const petId = await getExpandedPetId();
    if (!petId) {
      await toastSimple("Feed from inventory", "No expanded pet detected.", "error");
      return;
    }

    const pet = await findPetById(petId);
    if (!pet) {
      await toastSimple("Feed from inventory", "Unable to resolve expanded pet.", "error");
      return;
    }

    const species = String(pet?.slot?.petSpecies || "");
    let lastKnownHungerPct = getHungerPctForPet(pet);
    const allowed = await getAllowedCrops(petId, species);
    if (!allowed.size) {
      await toastSimple("Feed from inventory", "No compatible crops for this pet.", "info");
      return;
    }

    const inventory = await PlayerService.getCropInventoryState();
    const items = Array.isArray(inventory) ? inventory : [];
    const favoriteSet = await PlayerService.getFavoriteIdSet().catch(() => new Set<string>());

    const filtered = items.filter((item) => {
      const speciesId = String((item as any)?.species || "");
      if (!speciesId || !allowed.has(speciesId)) return false;
      const id = String((item as any)?.id || "");
      return id && !favoriteSet.has(id);
    });

    if (!filtered.length) {
      await toastSimple("Feed from inventory", "No compatible crops in inventory.", "info");
      return;
    }

    const computeFavoritedIds = (items: any[]) => {
      const allowedIds = new Set<string>();
      for (const item of items) {
        const id = String((item as any)?.id || "");
        if (id) allowedIds.add(id);
      }
      return Array.from(favoriteSet).filter((id) => allowedIds.has(id));
    };

    await clearHandSelection().catch(() => {});
    let visibleItems = filtered.slice();
    let favoritedItemIds = computeFavoritedIds(visibleItems);

    await fakeInventoryShow({ items: visibleItems, favoritedItemIds }, { open: true });

    const label = pet?.slot?.name || species || petId;
    await toastSimple(
      "Feed from inventory",
      `Showing ${visibleItems.length} compatible crop(s) for ${label}. Select a crop to feed it immediately.`,
      "info",
    );

    while (true) {
      const selectedIndex = await waitForFakeInventorySelection(20000);
      if (selectedIndex == null) {
        await toastSimple("Feed from inventory", "No crop selected.", "info");
        break;
      }
      if (selectedIndex < 0 || selectedIndex >= visibleItems.length) {
        await toastSimple("Feed from inventory", "Invalid crop selection.", "error");
        await clearHandSelection().catch(() => {});
        continue;
      }

      const chosen = visibleItems[selectedIndex] as any;
      const chosenId = String(chosen?.id || "");
      if (!chosenId) {
        await toastSimple("Feed from inventory", "Invalid crop selection.", "error");
        await clearHandSelection().catch(() => {});
        continue;
      }

      const hungerPctBeforeFeed = lastKnownHungerPct;

      await PlayerService.feedPet(petId, chosenId);

      const hungerPct = await waitForHungerIncrease(petId, hungerPctBeforeFeed, {
        initialDelay: 200,
      });

      if (hungerPct != null) {
        lastKnownHungerPct = hungerPct;
      }
      const hungerSuffix =
        hungerPct != null ? ` Hunger: ${formatHungerPct(hungerPct)}%.` : "";

      const cropName = String(chosen?.species || "crop");
      const petLabel = pet?.slot?.name || species || petId;
      await toastSimple(
        "Feed from inventory",
        `Fed ${petLabel} with ${cropName}.${hungerSuffix}`,
        "success",
      );

      const hungerFull = hungerPct != null && hungerPct >= 99.9;
      if (hungerFull) {
        shouldCloseInventory = true;
        try { await closeInventoryPanel(); } catch {}
        break;
      }

      let invItems: any[] | null = null;
      try {
        const nextInventory = await PlayerService.getCropInventoryState();
        invItems = Array.isArray(nextInventory) ? nextInventory : null;
      } catch {
        invItems = null;
      }

      let nextVisible = invItems?.filter((item) => {
        const speciesId = String((item as any)?.species || "");
        if (!speciesId || !allowed.has(speciesId)) return false;
        const id = String((item as any)?.id || "");
        return id && !favoriteSet.has(id);
      }) ?? null;

      const removeChosenLocally = () =>
        visibleItems.filter((item) => String((item as any)?.id || "") !== chosenId);

      if (!nextVisible) {
        nextVisible = removeChosenLocally();
      } else {
        const stillContainsChosen = nextVisible.some(
          (item) => String((item as any)?.id || "") === chosenId,
        );
        if (stillContainsChosen) {
          nextVisible = removeChosenLocally();
        }
      }

      visibleItems = nextVisible;

      if (!visibleItems.length) {
        await toastSimple("Feed from inventory", "No compatible crops in inventory.", "info");
        shouldCloseInventory = true;
        try { await closeInventoryPanel(); } catch {}
        break;
      }

      favoritedItemIds = computeFavoritedIds(visibleItems);
      await fakeInventoryShow({ items: visibleItems, favoritedItemIds }, { open: false });
      await clearHandSelection().catch(() => {});
    }
  } catch (err) {
    console.error("[Pet panel] Failed to handle inventory feed", err);
    await toastSimple(
      "Feed from inventory",
      err instanceof Error ? err.message : "Failed to feed pet from inventory.",
      "error",
    );
  } finally {
    try { await clearHandSelection(); } catch {}
    if (shouldCloseInventory) {
      try { await closeInventoryPanel(); } catch {}
    }
    btn.disabled = prevDisabled;
  }
}

async function getExpandedPetId(): Promise<string | null> {
  try {
    const raw = await Atoms.pets.expandedPetSlotId.get();
    const id = typeof raw === "string" ? raw.trim() : "";
    return id.length ? id : null;
  } catch {
    return null;
  }
}

async function findPetById(petId: string) {
  try {
    const list = await PetsService.getPets();
    const arr = Array.isArray(list) ? list : [];
    return arr.find((p) => String(p?.slot?.id || "") === petId) ?? null;
  } catch (err) {
    console.warn("[Pet panel] Failed to fetch pets", err);
    return null;
  }
}

async function getAllowedCrops(petId: string, species: string): Promise<Set<string>> {

  const defaults = PetsService.getCompatibleCropsForSpecies(species) ?? [];
  return new Set(defaults);
}

function formatHungerPct(pct: number): string {
  if (!Number.isFinite(pct)) return "";
  const clamped = Math.max(0, Math.min(100, pct));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const HUNGER_EPSILON = 0.05;
const HUNGER_TIMEOUT_MS = 4000;
const HUNGER_POLL_INTERVAL_MS = 120;

function isPetInfo(value: unknown): value is PetInfo {
  if (!value || typeof value !== "object") return false;
  const slot = (value as { slot?: unknown }).slot;
  return !!slot && typeof slot === "object";
}

function getHungerPctForPet(pet: unknown): number | null {
  if (!isPetInfo(pet)) return null;
  try {
    const hungerPct = PetsService.getHungerPctFor(pet);
    return typeof hungerPct === "number" && Number.isFinite(hungerPct)
      ? hungerPct
      : null;
  } catch {
    return null;
  }
}

async function getPetHungerPct(petId: string): Promise<number | null> {
  try {
    const updatedPet = await findPetById(petId);
    return getHungerPctForPet(updatedPet);
  } catch {
    return null;
  }
}

async function waitForHungerIncrease(
  petId: string,
  previousPct: number | null,
  options: { initialDelay?: number; timeout?: number; interval?: number } = {},
): Promise<number | null> {
  const { initialDelay = 0, timeout = HUNGER_TIMEOUT_MS, interval = HUNGER_POLL_INTERVAL_MS } = options;

  if (initialDelay > 0) {
    await delay(initialDelay);
  }

  const start = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

  let lastResult: number | null = null;

  while (true) {
    const pct = await getPetHungerPct(petId);
    if (pct != null) {
      lastResult = pct;
      if (
        previousPct == null ||
        pct >= Math.min(100, previousPct + HUNGER_EPSILON) ||
        pct >= 99.9
      ) {
        return pct;
      }
    }

    const now = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    if (now - start >= timeout) {
      return lastResult;
    }

    if (interval > 0) {
      await delay(interval);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFakeInventorySelection(timeoutMs = 20000): Promise<number | null> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    try {
      const modalVal = await Atoms.ui.activeModal.get();
      if (!isInventoryOpen(modalVal)) return null;
    } catch {
      return null;
    }
    try {
      const value = await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.get();
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        return value;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return null;
}
