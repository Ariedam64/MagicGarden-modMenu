// ariesModAPI/optimistic.ts
// Helper générique pour les mises à jour optimistes du cache

import { toastSimple } from "../ui/toast";

/** Dispatche une liste de CustomEvents sur window */
function dispatchEvents(events?: string[]): void {
  if (!events) return;
  for (const name of events) {
    window.dispatchEvent(new CustomEvent(name));
  }
}

/** Vérifie si une valeur indique un échec (null, false, undefined) */
function isFailure(value: unknown): boolean {
  return value === null || value === false || value === undefined;
}

/**
 * Exécute une action avec mise à jour optimiste du cache.
 *
 * 1. `apply()` est appelé synchronement (mutation du cache)
 * 2. Les `events` sont dispatchés (le UI se rafraîchit instantanément)
 * 3. `request()` est exécuté (appel HTTP)
 * 4. Si échec → `revert()` + re-dispatch events + toast d'erreur
 *
 * @returns Le résultat de request() en cas de succès, null en cas d'échec
 */
export async function optimistic<T>(opts: {
  /** Mutation optimiste à appliquer immédiatement sur le cache */
  apply: () => void;
  /** Restaure le cache à son état précédent si la requête échoue */
  revert: () => void;
  /** Appel HTTP — doit throw ou retourner null/false/undefined si échec */
  request: () => Promise<T>;
  /** CustomEvents à dispatcher après apply et après revert */
  events?: string[];
  /** Message de toast affiché en cas d'échec */
  onError?: string;
}): Promise<T | null> {
  const { apply, revert, request, events, onError } = opts;

  // 1. Apply optimistic mutation
  apply();

  // 2. Dispatch events → UI refreshes instantly
  dispatchEvents(events);

  // 3. Execute the request
  try {
    const result = await request();

    // 4a. Check for failure return values
    if (isFailure(result)) {
      revert();
      dispatchEvents(events);
      if (onError) toastSimple("Error", onError, "error");
      return null;
    }

    return result;
  } catch (err) {
    // 4b. Exception → revert
    console.error("[optimistic] request failed:", err);
    revert();
    dispatchEvents(events);
    if (onError) toastSimple("Error", onError, "error");
    return null;
  }
}
