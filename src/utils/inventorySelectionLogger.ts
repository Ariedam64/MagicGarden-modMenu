import { Atoms } from "../store/atoms";

type InventoryItems = any[];

type InventorySnapshot = {
  items?: InventoryItems;
};

let started = false;
let cachedItems: InventoryItems = [];
let currentIndex: number | null = null;
let lastLoggedQuantity: number | null | undefined = undefined;
let desiredButtonQuantity: number | null = null;

let buttonDiscoveryObserver: MutationObserver | null = null;
let buttonVisibilityObserver: IntersectionObserver | null = null;

function getActionButton(): HTMLButtonElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLButtonElement>(
    "button.chakra-button.css-1f6o5y1",
  );
}

function applyQuantityToButton(
  button: HTMLButtonElement,
  quantity: number | null,
): void {
  const quantityContainer = button.querySelector<HTMLElement>(".css-telpzl");

  const ensureBaseLabel = (): string => {
    const existing = button.dataset.baseLabel;
    if (existing) return existing;

    const clone = button.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".css-telpzl").forEach((element) => element.remove());
    const baseLabel = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
    if (baseLabel) {
      button.dataset.baseLabel = baseLabel;
    }
    return baseLabel;
  };

  const setButtonLabel = (label: string) => {
    const contentNode = Array.from(button.childNodes).find((node) => {
      if (quantityContainer && node === quantityContainer) return false;
      const text = node.textContent ?? "";
      return text.trim().length > 0;
    });

    if (contentNode) {
      contentNode.textContent = label;
      return;
    }

    const referenceNode = quantityContainer ?? button.firstChild;
    button.insertBefore(document.createTextNode(label), referenceNode ?? null);
  };

  const baseLabel = ensureBaseLabel();

  if (quantityContainer) {
    quantityContainer.textContent = "";
    quantityContainer.style.marginLeft = "";
    quantityContainer.style.display = "none";
  }

  if (quantity == null) {
    setButtonLabel(baseLabel);
    return;
  }

  const labelWithQuantity = baseLabel ? `${baseLabel} ×${quantity}` : `×${quantity}`;
  setButtonLabel(labelWithQuantity);
}

function ensureButtonVisibilityObserver(button: HTMLButtonElement): void {
  if (typeof IntersectionObserver === "undefined") return;

  if (!buttonVisibilityObserver) {
    buttonVisibilityObserver = new IntersectionObserver((entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => {
          applyQuantityToButton(entry.target as HTMLButtonElement, desiredButtonQuantity);
        });
    });
  } else {
    buttonVisibilityObserver.disconnect();
  }
  buttonVisibilityObserver.observe(button);
}

function ensureButtonDiscoveryObserver(): void {
  if (typeof document === "undefined") return;
  if (buttonDiscoveryObserver || typeof MutationObserver === "undefined") return;

  const target = document.body;
  if (!target) return;

  buttonDiscoveryObserver = new MutationObserver(() => {
    const button = getActionButton();
    if (!button) return;

    ensureButtonVisibilityObserver(button);
    applyQuantityToButton(button, desiredButtonQuantity);
  });

  buttonDiscoveryObserver.observe(target, { childList: true, subtree: true });
}

function updateButtonQuantity(quantity: number | null) {
  if (typeof document === "undefined") return;

  desiredButtonQuantity = quantity;

  const button = getActionButton();
  if (!button) {
    ensureButtonDiscoveryObserver();
    return;
  }

  ensureButtonVisibilityObserver(button);
  applyQuantityToButton(button, quantity);
}

function normalizeItems(snapshot: InventorySnapshot | null | undefined): InventoryItems {
  if (!snapshot || !Array.isArray(snapshot.items)) return [];
  return snapshot.items.slice();
}

function extractQuantity(index: number | null): number | null {
  if (index == null || index < 0 || index >= cachedItems.length) return null;
  const raw = cachedItems[index];
  if (!raw) return null;
  const qty = Number((raw as any).quantity);
  return Number.isFinite(qty) ? qty : null;
}

function logQuantity(force: boolean = false) {
  if (currentIndex == null) {
    updateButtonQuantity(null);
    lastLoggedQuantity = null;
    return;
  }
  const qty = extractQuantity(currentIndex);
  if (!force && qty === lastLoggedQuantity) return;
  updateButtonQuantity(qty);
  lastLoggedQuantity = qty;
}

async function readInventory(): Promise<InventorySnapshot | null> {
  try {
    return await Atoms.inventory.myInventory.get();
  } catch (error) {
    return null;
  }
}

async function readSelectedIndex(): Promise<number | null> {
  try {
    const value = await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.get();
    return typeof value === "number" ? value : null;
  } catch (error) {
    return null;
  }
}

export async function startSelectedInventoryQuantityLogger(): Promise<void> {
  if (started) return;
  started = true;

  cachedItems = normalizeItems(await readInventory());
  currentIndex = await readSelectedIndex();
  logQuantity(true);

  try {
    await Atoms.inventory.myInventory.onChange((next) => {
      cachedItems = normalizeItems(next);
      logQuantity();
    });
  } catch (error) {
  }

  try {
    await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.onChange((next) => {
      if (typeof next === "number") {
        currentIndex = next;
      } else {
        currentIndex = null;
      }
      lastLoggedQuantity = null;
      logQuantity(true);
    });
  } catch (error) {
  }
}
