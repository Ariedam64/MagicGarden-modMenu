// src/features/inventory/fakeInventory.ts
// ⇒ Générique "fakeModal" + helpers spécifiques "inventory" & "journal"
// Fix: un seul patch partagé sur myData (merge générique) pour éviter les conflits
// quand on alterne Inventaire ⇄ Journal.

import { fakeShow, fakeHide, type FakeConfig } from "./fakeAtoms";
import { Atoms } from "../store/atoms";

/* --------------------------------- Types -------------------------------- */
export type ModalId = string;
export type ModalPayload = any;
export type InvPayload = { items?: any[]; favoritedItemIds?: string[] } | any;

export type FakeModalOptions = {
  /** Ouvre la modale (activeModal) automatiquement. Par défaut: true */
  open?: boolean;
  /** Auto-restore (désactive le fake) après N ms. */
  autoRestoreMs?: number;
};

/* ------------------------------- Modal I/O ------------------------------- */

export async function openModal(modalId: ModalId) {
  try {
    await Atoms.ui.activeModal.set(modalId);
  } catch (err) {
  }
}

export async function closeModal(_modalId?: ModalId) {
  // NB: activeModal est unique -> on le remet juste à null
  try {
    await Atoms.ui.activeModal.set(null);
  } catch (err) {
  }
}

export function isModalOpen(value: any, modalId: ModalId) {
  return value === modalId;
}

export async function isModalOpenAsync(modalId: ModalId): Promise<boolean> {
  try {
    const v = await Atoms.ui.activeModal.get();
    return isModalOpen(v, modalId);
  } catch (err) {
    return false;
  }
}

export async function waitModalClosed(modalId: ModalId, timeoutMs = 120000): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const v = await Atoms.ui.activeModal.get();
      if (!isModalOpen(v, modalId)) return true;
    } catch {
      // si l'atom n'est pas lisible, on considère "fermée"
      return true;
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
}

/* --------------------------- Helpers de gate ---------------------------- */

function gateForModal(modalId: ModalId) {
  return {
    label: Atoms.ui.activeModal.label,
    isOpen: (v: any) => isModalOpen(v, modalId),
    openAction: () => openModal(modalId),
    closeAction: () => closeModal(modalId),
    autoDisableOnClose: true,
  };
}

function withModalGate<T>(cfg: FakeConfig<T>, modalId: ModalId): FakeConfig<T> {
  // On injecte/écrase la gate pour qu’elle cible CETTE modalId
  return { ...cfg, gate: gateForModal(modalId) };
}

/* ------------------------------- API générique ------------------------------- */
/** Utilitaire générique (gardé pour compat) : applique une liste de FakeConfig à une modal. */
export async function fakeModalShow<T = ModalPayload>(
  modalId: ModalId,
  payload: T,
  configs: FakeConfig<any>[],
  opts?: FakeModalOptions
) {
  const shouldOpen = opts?.open !== false;

  for (const baseCfg of configs) {
    const cfg = withModalGate(baseCfg, modalId);
    await fakeShow(cfg, payload, {
      openGate: false,
      autoRestoreMs: opts?.autoRestoreMs,
    });
  }

  if (shouldOpen) await openModal(modalId);
}

/** Désactive tous les fakes liés (ne ferme pas forcément la modale). */
export async function fakeModalHide(_modalId: ModalId, configs: FakeConfig<any>[]) {
  for (const cfg of configs) {
    try {
      await fakeHide(cfg.label);
    } catch (err) {
    }
  }
}

/* ============================ Patchs partagés / spécifiques ============================ */
/**
 * Patch PARTAGÉ sur myData:
 *  - merge générique: { ...real, ...patch }
 *  - gate: actif si inventory **ou** journal est ouvert
 *  => plus de conflit de merge quand on switch.
 */
const SHARED_MYDATA_PATCH: FakeConfig<any> = {
  label: Atoms.data.myData.label,
  merge: (real: any, patch: any) => {
    const base = real && typeof real === "object" ? real : {};
    const add  = patch && typeof patch === "object" ? patch : {};
    return { ...base, ...add };
  },
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => v === "inventory" || v === "journal",
    autoDisableOnClose: true,
  },
};

/** Patch SPÉCIFIQUE sur myInventoryAtom (utile pour l’UI inventaire). */
const INVENTORY_ATOM_PATCH: FakeConfig<any> = {
  label: Atoms.inventory.myInventory.label,
  merge: (_real: any, fake: any) => fake,
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => v === "inventory",
    autoDisableOnClose: true,
  },
};

/* ============================ Spécifique INVENTORY ============================ */

const INVENTORY_MODAL_ID: ModalId = "inventory";

export async function openInventoryPanel() {
  return openModal(INVENTORY_MODAL_ID);
}

export async function closeInventoryPanel() {
  return closeModal(INVENTORY_MODAL_ID);
}

export function isInventoryOpen(v: any) {
  return isModalOpen(v, INVENTORY_MODAL_ID);
}

export async function isInventoryPanelOpen(): Promise<boolean> {
  return isModalOpenAsync(INVENTORY_MODAL_ID);
}

export async function waitInventoryPanelClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(INVENTORY_MODAL_ID, timeoutMs);
}

/** Active les fakes d’inventaire et ouvre la modale si demandé. */
export async function fakeInventoryShow(
  payload: InvPayload,
  opts?: { open?: boolean; autoRestoreMs?: number }
) {
  const shouldOpen = opts?.open !== false;

  // 1) Patch partagé dans myData → { inventory: payload }
  await fakeShow(SHARED_MYDATA_PATCH, { inventory: payload }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  // 2) Patch spécifique dans myInventoryAtom
  await fakeShow(INVENTORY_ATOM_PATCH, payload, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openInventoryPanel();
}

/** Désactive les fakes d’inventaire. */
export async function fakeInventoryHide() {
  await fakeHide(INVENTORY_ATOM_PATCH.label);
  await fakeHide(SHARED_MYDATA_PATCH.label);
  await closeInventoryPanel();
}

/* =============================== Spécifique JOURNAL =============================== */

export const JOURNAL_MODAL_ID: ModalId = "journal";

export async function openJournalModal() {
  return openModal(JOURNAL_MODAL_ID);
}

export async function closeJournalModal() {
  return closeModal(JOURNAL_MODAL_ID);
}

export function isJournalOpen(v: any) {
  return isModalOpen(v, JOURNAL_MODAL_ID);
}

export async function isJournalModalOpen(): Promise<boolean> {
  return isModalOpenAsync(JOURNAL_MODAL_ID);
}

export async function waitJournalModalClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(JOURNAL_MODAL_ID, timeoutMs);
}

/** Active le fake du journal (via patch partagé myData) et ouvre la modale si demandé. */
export async function fakeJournalShow(
  payload?: any,
  opts?: { open?: boolean; autoRestoreMs?: number }
) {
  const shouldOpen = opts?.open !== false;

  // Par sécurité: on s'assure que le patch inventaire spécifique ne reste pas actif
  await fakeHide(INVENTORY_ATOM_PATCH.label);

  await fakeShow(SHARED_MYDATA_PATCH, { journal: payload ?? {} }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openJournalModal();
}

export async function fakeJournalHide() {
  await fakeHide(SHARED_MYDATA_PATCH.label);
  await closeJournalModal();
}
