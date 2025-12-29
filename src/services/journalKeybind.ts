import { Atoms } from "../store/atoms";
import { JOURNAL_MODAL_ID } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.journal";

let journalKeybindsInstalled = false;

async function toggleJournalModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    const next = current === JOURNAL_MODAL_ID ? null : JOURNAL_MODAL_ID;
    await Atoms.ui.activeModal.set(next);
  } catch {
    // ignore errors
  }
}

export function installJournalKeybindsOnce(): void {
  if (journalKeybindsInstalled || typeof window === "undefined") return;
  journalKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleJournalModal();
    },
    true
  );
}
