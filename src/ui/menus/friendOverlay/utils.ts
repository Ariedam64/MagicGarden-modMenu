export function normalizeQuery(term: string): string {
  return term.trim().toLowerCase();
}

export function formatLastSeen(timestamp?: string | null): string | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (deltaSeconds < 60) {
    return deltaSeconds <= 15 ? "just now" : `${deltaSeconds}s`;
  }
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatCoinAmount(value: number | string | null): string | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric == null || !Number.isFinite(numeric)) return null;
  const abs = Math.abs(numeric);
  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  for (const { threshold, suffix } of units) {
    if (abs >= threshold) {
      const normalized = numeric / threshold;
      return `${normalized.toFixed(2)}${suffix}`;
    }
  }
  return numeric.toLocaleString("en-US");
}
