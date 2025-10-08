// src/utils/keyboard.ts

/**
 * Determines whether a keyboard event should be ignored because the user is typing
 * inside an editable element.
 */
export function shouldIgnoreKeydown(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}
