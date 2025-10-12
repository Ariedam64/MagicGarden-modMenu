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
  const primaryButton = document.querySelector<HTMLButtonElement>(
    "button.chakra-button.css-1f6o5y1",
  );
  if (primaryButton) return primaryButton;

  const growButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "button.chakra-button.css-h3d7a8",
    ),
  );

  return (
    growButtons.find((button) =>
      (button.textContent ?? "").includes("Grow"),
    ) ?? null
  );
}

function applyQuantityToButton(
  button: HTMLButtonElement,
  quantity: number | null,
): void {
  const quantityContainer = button.querySelector<HTMLElement>(".css-telpzl");

  const readButtonLabel = (): string => {
    const clone = button.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".css-telpzl").forEach((element) => element.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  };

  const ensureBaseLabel = (): string => {
    const existing = button.dataset.baseLabel ?? "";
    const lastQuantity = button.dataset.lastQuantity;
    const currentLabel = readButtonLabel();

    const normalizedCurrentLabel = (() => {
      if (!currentLabel) return "";
      if (lastQuantity && lastQuantity.length > 0) {
        const withSpace = ` ×${lastQuantity}`;
        if (currentLabel.endsWith(withSpace)) {
          return currentLabel.slice(0, -withSpace.length).replace(/\s+$/, "");
        }
        const withoutSpace = `×${lastQuantity}`;
        if (currentLabel.endsWith(withoutSpace)) {
          return currentLabel.slice(0, -withoutSpace.length).replace(/\s+$/, "");
        }
      }
      return currentLabel;
    })();

    if (normalizedCurrentLabel && normalizedCurrentLabel !== existing) {
      button.dataset.baseLabel = normalizedCurrentLabel;
      return normalizedCurrentLabel;
    }

    if (!existing && normalizedCurrentLabel) {
      button.dataset.baseLabel = normalizedCurrentLabel;
      return normalizedCurrentLabel;
    }

    return existing;
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
    button.dataset.lastQuantity = "";
    setButtonLabel(baseLabel);
    return;
  }

  const labelWithQuantity = baseLabel ? `${baseLabel} ×${quantity}` : `×${quantity}`;
  button.dataset.lastQuantity = String(quantity);
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
  if (qty == null) {
    console.log(`[InventorySelection] Quantité inconnue pour l'index ${currentIndex}.`);
  } else {
    console.log(`[InventorySelection] Quantité de l'item sélectionné (${currentIndex}) : ${qty}`);
  }
  updateButtonQuantity(qty);
  lastLoggedQuantity = qty;
}

async function readInventory(): Promise<InventorySnapshot | null> {
  try {
    return await Atoms.inventory.myInventory.get();
  } catch (error) {
    console.warn("[InventorySelection] Impossible de récupérer l'inventaire", error);
    return null;
  }
}

async function readSelectedIndex(): Promise<number | null> {
  try {
    const value = await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.get();
    return typeof value === "number" ? value : null;
  } catch (error) {
    console.warn("[InventorySelection] Impossible de récupérer l'index sélectionné", error);
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
    console.warn("[InventorySelection] Échec de l'abonnement à myInventory", error);
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
    console.warn("[InventorySelection] Échec de l'abonnement à myPossiblyNoLongerValidSelectedItemIndex", error);
  }
}
