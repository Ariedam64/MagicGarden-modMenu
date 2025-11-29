// src/services/lockerRestrictions.ts
export type LockerRestrictionsState = {
  /** Minimum players in room (1-6) required to allow selling crops. */
  minRequiredPlayers: number;
  /** Per-egg lock map: true means hatching is blocked. */
  eggLocks: Record<string, boolean>;
};

const LS_KEY = "qws:locker:restrictions.v1";

const clampPercent = (value: number): number => Math.max(0, Math.min(50, Math.round(value)));

const roundToStep = (value: number, step: number): number =>
  Math.round(value / step) * step;

const DEFAULT_STATE: LockerRestrictionsState = {
  minRequiredPlayers: 1,
  eggLocks: {},
};

export const FRIEND_BONUS_STEP = 10;
export const FRIEND_BONUS_MAX = 50;

const sanitizePercent = (value: number): number => {
  const clamped = clampPercent(value);
  return Math.max(0, Math.min(FRIEND_BONUS_MAX, roundToStep(clamped, FRIEND_BONUS_STEP)));
};

const sanitizePlayers = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(6, Math.round(value)));
};

const sanitizeEggLocks = (raw: any): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, any>)) {
    if (!key) continue;
    out[key] = value === true;
  }
  return out;
};

export function friendBonusPercentFromMultiplier(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;

  // Some sources expose the bonus as 1.0 -> 1.5, others as 1 -> 6 (players count).
  if (n > 0 && n <= 2) {
    return clampPercent(Math.round((n - 1) * 100));
  }

  const clamped = Math.max(1, Math.min(6, Math.round(n)));
  return clampPercent((clamped - 1) * 10);
}

export function friendBonusPercentFromPlayers(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(1, Math.min(6, Math.round(n)));
  return clampPercent((clamped - 1) * 10);
}

export function percentToRequiredFriendCount(percent: number): number {
  const pct = sanitizePercent(percent);
  return Math.max(1, Math.min(6, Math.round(pct / 10) + 1));
}

const requiredPercentFromPlayers = (players: number): number =>
  sanitizePercent((sanitizePlayers(players) - 1) * 10);

class LockerRestrictionsService {
  private state: LockerRestrictionsState = { ...DEFAULT_STATE };
  private listeners = new Set<(state: LockerRestrictionsState) => void>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      this.state = { ...DEFAULT_STATE };
      return;
    }

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        this.state = { ...DEFAULT_STATE };
        return;
      }
      const parsed = JSON.parse(raw);
      const players = sanitizePlayers(Number(parsed?.minRequiredPlayers ?? parsed?.minFriendBonusPct));
      const eggLocks = sanitizeEggLocks(parsed?.eggLocks);
      this.state = { minRequiredPlayers: players, eggLocks };
    } catch {
      this.state = { ...DEFAULT_STATE };
    }
  }

  private save(): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch {
        /* ignore */
      }
    }
  }

  getState(): LockerRestrictionsState {
    return { ...this.state };
  }

  setMinRequiredPlayers(value: number): void {
    const players = sanitizePlayers(value);
    if (players === this.state.minRequiredPlayers) return;
    this.state = { ...this.state, minRequiredPlayers: players };
    this.save();
    this.emit();
  }

  setEggLock(eggId: string, locked: boolean): void {
    if (!eggId) return;
    const nextLocks = { ...this.state.eggLocks, [eggId]: !!locked };
    this.state = { ...this.state, eggLocks: nextLocks };
    this.save();
    this.emit();
  }

  isEggLocked(eggId: string | null | undefined): boolean {
    if (!eggId) return false;
    return this.state.eggLocks?.[eggId] === true;
  }

  allowsCropSale(currentFriendBonusPercent: number | null | undefined): boolean {
    const required = requiredPercentFromPlayers(this.state.minRequiredPlayers);
    if (required <= 0) return true;
    if (!Number.isFinite(currentFriendBonusPercent as number)) return false;
    const current = clampPercent(Number(currentFriendBonusPercent));
    return current + 0.0001 >= required;
  }

  getRequiredPercent(): number {
    return requiredPercentFromPlayers(this.state.minRequiredPlayers);
  }

  subscribe(listener: (state: LockerRestrictionsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const lockerRestrictionsService = new LockerRestrictionsService();
