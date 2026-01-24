import { Atoms } from "../store/atoms";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.seed-silo";
const SEED_SILO_MODAL_ID = "seedSilo";

let seedSiloKeybindsInstalled = false;

async function toggleSeedSiloModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    const next = current === SEED_SILO_MODAL_ID ? null : SEED_SILO_MODAL_ID;
    await Atoms.ui.activeModal.set(next);
  } catch {
    // ignore failures
  }
}

export function installSeedSiloKeybindsOnce(): void {
  if (seedSiloKeybindsInstalled || typeof window === "undefined") return;
  seedSiloKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleSeedSiloModal();
    },
    true
  );
}
