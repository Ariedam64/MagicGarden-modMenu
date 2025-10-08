// src/services/shops.ts
// Service d'accès aux shops (Seeds / Tools / Eggs / Decor) + helpers d'achats et d'inventaire.

import { Atoms } from "../store/atoms";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";


export type Kind = "seeds" | "tools" | "eggs" | "decor";

type ShopModalId = "seedShop" | "eggShop" | "decorShop" | "toolShop";
type ShopKeybindId = Extract<
  KeybindId,
  "shops.seeds" | "shops.eggs" | "shops.decors" | "shops.tools"
>;

const SHOP_KEYBINDS: { id: ShopKeybindId; modal: ShopModalId }[] = [
  { id: "shops.seeds", modal: "seedShop" },
  { id: "shops.eggs", modal: "eggShop" },
  { id: "shops.decors", modal: "decorShop" },
  { id: "shops.tools", modal: "toolShop" },
];

let shopKeybindsInstalled = false;

export function installShopKeybindsOnce(): void {
  if (shopKeybindsInstalled || typeof window === "undefined") return;
  shopKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;

      for (const { id, modal } of SHOP_KEYBINDS) {
        if (!eventMatchesKeybind(id, event)) continue;

        event.preventDefault();
        event.stopPropagation();
        void Atoms.ui.activeModal.set(modal);
        break;
      }
    },
    true,
  );
}

type AnyItem = Record<string, any>;