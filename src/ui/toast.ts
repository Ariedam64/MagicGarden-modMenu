// src/ui/toast.ts
import { getAtomByLabel, jGet, jSet } from "../store/jotai";

export type ToastVariant = "success" | "error" | "info" | "warn";
export type SimpleToast = { title: any; description?: any; variant?: ToastVariant };

type BoardToast = {
  toastType: "board";
  title: any;
  subtitle?: any;
  strokeColor?: string;
  backgroundImage?: string;
  isStackable?: boolean;
  duration?: number | null;
  id?: string;
};

type AnyToast = SimpleToast | BoardToast;

export async function sendToast(toast: AnyToast): Promise<void> {
  const sendAtom = getAtomByLabel("sendQuinoaToastAtom");
  if (sendAtom) { await jSet(sendAtom, toast); return; }

  const listAtom = getAtomByLabel("quinoaToastsAtom");
  if (!listAtom) throw new Error("Aucun atom de toast trouvé");

  const prev = await jGet<any[]>(listAtom).catch(() => []) as any[];
  const t: any = { isClosable: true, duration: 10000, ...toast };

  if ("toastType" in t && t.toastType === "board") {
    t.id = t.id ?? (t.isStackable ? `quinoa-stackable-${Date.now()}-${Math.random()}` : "quinoa-game-toast");
  } else {
    t.id = t.id ?? "quinoa-game-toast";
  }
  await jSet(listAtom, [...prev, t]);
}

export async function toastSimple(
  title: any, description?: any, variant: ToastVariant = "info", duration = 3500
) {
  await sendToast({ title, description, variant, duration });
}

export async function toastBoard(
  title: any, subtitle: any, backgroundImage: string,
  strokeColor = "Blue.Magic", duration = 5000, opts: Partial<BoardToast> = {}
) {
  await sendToast({ toastType: "board", title, subtitle, backgroundImage, strokeColor, isStackable: true, duration, ...opts });
}

export async function clearToasts() {
  const listAtom = getAtomByLabel("quinoaToastsAtom");
  if (listAtom) await jSet(listAtom, []);
}
