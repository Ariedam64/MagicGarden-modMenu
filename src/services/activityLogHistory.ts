// src/services/activityLogHistory.ts
import { ACTIVITY_LOG_MODAL_ID, fakeActivityLogShow } from "./fakeModal";
import { Atoms, myActivityLog } from "../store/atoms";

type ActivityLogEntry = {
  timestamp: number;
  action?: string | null;
  parameters?: any;
  [key: string]: any;
};

const HISTORY_STORAGE_KEY = "qws:activityLogs:history:v1";
const HISTORY_LIMIT = 500;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeEntry(raw: any): ActivityLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number((raw as any).timestamp);
  if (!Number.isFinite(ts)) return null;
  const action =
    typeof (raw as any).action === "string" && (raw as any).action.trim()
      ? String((raw as any).action)
      : null;
  const entry: ActivityLogEntry = {
    ...raw,
    timestamp: ts,
  };
  if (action !== null) entry.action = action;
  return entry;
}

function loadHistory(): ActivityLogEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ActivityLogEntry[] = [];
    for (const item of parsed) {
      const norm = normalizeEntry(item);
      if (norm) out.push(norm);
    }
    return out;
  } catch {
    return [];
  }
}

function saveHistory(entries: ActivityLogEntry[]) {
  const storage = getStorage();
  if (!storage) return;
  const sorted = entries
    .slice()
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  if (sorted.length > HISTORY_LIMIT) {
    sorted.splice(0, sorted.length - HISTORY_LIMIT);
  }
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
  }
}

function mergeHistory(current: ActivityLogEntry[], incoming: any[]): ActivityLogEntry[] {
  const map = new Map<string, ActivityLogEntry>();
  const push = (entry: ActivityLogEntry | null) => {
    if (!entry) return;
    // Allow multiple entries with same timestamp+action but different payloads.
    // We build the key with a lightweight, stable JSON of the entry (sorted props would be overkill here;
    // stringify on normalized objects is stable enough for our use case).
    const key = `${entry.timestamp}|${entry.action ?? ""}|${JSON.stringify(entry)}`;
    map.set(key, entry);
  };
  current.forEach(push);
  (Array.isArray(incoming) ? incoming : []).forEach((raw) => push(normalizeEntry(raw)));
  return Array.from(map.values());
}

async function appendHistory(logs: any[]) {
  const history = loadHistory();
  const merged = mergeHistory(history, logs);
  saveHistory(merged);
}

async function reopenFakeActivityLogFromHistory() {
  try {
    const history = loadHistory();
    await fakeActivityLogShow(history, { open: true });
  } catch {
  }
}

export function getActivityLogHistory(): ActivityLogEntry[] {
  return loadHistory();
}

export async function startActivityLogHistoryWatcher(): Promise<() => void> {
  const stops: Array<() => void | Promise<void>> = [];

  const ingest = async (logs: any) => {
    try {
      await appendHistory(Array.isArray(logs) ? logs : []);
    } catch {
    }
  };

  try {
    const initial = await myActivityLog.get();
    await ingest(initial);
  } catch {
  }

  try {
    const unsub = await myActivityLog.onChange((next) => { void ingest(next); });
    stops.push(() => { try { unsub(); } catch {} });
  } catch {
  }

  let lastModal: string | null = null;
  try {
    const cur = await Atoms.ui.activeModal.get();
    lastModal = cur ?? null;
  } catch {
  }

  const onModalChange = async (modalId: string | null) => {
    const cur = modalId ?? null;
    if (cur === ACTIVITY_LOG_MODAL_ID && lastModal !== ACTIVITY_LOG_MODAL_ID) {
      await reopenFakeActivityLogFromHistory();
    }
    lastModal = cur;
  };

  try {
    const unsubModal = await Atoms.ui.activeModal.onChange(onModalChange);
    stops.push(() => { try { unsubModal(); } catch {} });
  } catch {
  }

  return async () => {
    for (const stop of stops) {
      try { await stop(); } catch {}
    }
  };
}
