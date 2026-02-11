import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  fetchLeaderboardCoins,
  fetchLeaderboardEggsHatched,
  fetchLeaderboardCoinsRank,
  fetchLeaderboardEggsHatchedRank,
  setImageSafe,
  type LeaderboardRow,
  type LeaderboardRankResponse,
} from "../../../../utils/supabase";

type LeaderboardCategory = "coins" | "eggs";

type LeaderboardState = {
  rows: LeaderboardRow[];
  rank: LeaderboardRankResponse | null;
  loading: boolean;
  loaded: boolean;
  rankLoading: boolean;
  error: string | null;
};

export type LeaderboardTabHandle = {
  root: HTMLDivElement;
  show: () => void;
  hide: () => void;
  refresh: () => void;
  destroy: () => void;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const COIN_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const normalizeLeaderboardId = (value: unknown): string | null => {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
};

const formatCoinsValue = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const abs = Math.abs(num);
  const units = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];
  for (const unit of units) {
    if (abs >= unit.value) {
      const scaled = num / unit.value;
      return `${scaled.toFixed(2)}${unit.suffix}`;
    }
  }
  return COIN_FORMATTER.format(num);
};

const formatLeaderboardValue = (value: unknown, category: LeaderboardCategory): string => {
  if (category === "coins") return formatCoinsValue(value);
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return NUMBER_FORMATTER.format(num);
};

const isAnonymousRow = (row: LeaderboardRow): boolean => {
  const name = (row.playerName ?? "").trim().toLowerCase();
  const id = normalizeLeaderboardId(row.playerId);
  return name === "anonymous" || !id;
};

const createAnonymousAvatar = (): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.className = "qws-fo-leaderboard-anon";
  wrap.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" fill="currentColor"/>' +
    '<path d="M4 20a8 8 0 0 1 16 0v.5H4V20Z" fill="currentColor" opacity="0.7"/>' +
    "</svg>";
  return wrap;
};

export function createLeaderboardTab(): LeaderboardTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-tab qws-fo-tab-leaderboard";

  const card = document.createElement("div");
  card.className = "qws-fo-card qws-fo-leaderboard-card";
  const head = document.createElement("div");
  head.className = "qws-fo-card__head qws-fo-leaderboard-head";
  const headTitle = document.createElement("div");
  headTitle.className = "qws-fo-leaderboard-head-title";
  headTitle.textContent = "Leaderboard";
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "qws-fo-btn qws-fo-btn--sm qws-fo-leaderboard-refresh";
  refreshBtn.textContent = "Refresh";
  head.append(headTitle, refreshBtn);
  const body = document.createElement("div");
  body.className = "qws-fo-card__body qws-fo-leaderboard-body";
  card.append(head, body);
  root.appendChild(card);

  const tabsRow = document.createElement("div");
  tabsRow.className = "qws-fo-leaderboard-tabs";
  const coinsBtn = document.createElement("button");
  coinsBtn.type = "button";
  coinsBtn.className = "qws-fo-leaderboard-tab";
  coinsBtn.textContent = "Coins";
  const eggsBtn = document.createElement("button");
  eggsBtn.type = "button";
  eggsBtn.className = "qws-fo-leaderboard-tab";
  eggsBtn.textContent = "Eggs hatched";
  tabsRow.append(coinsBtn, eggsBtn);

  const hintEl = document.createElement("div");
  hintEl.className = "qws-fo-leaderboard-hint";

  const statusEl = document.createElement("div");
  statusEl.className = "qws-fo-leaderboard-status";

  const list = document.createElement("div");
  list.className = "qws-fo-leaderboard-list";

  const footer = document.createElement("div");
  footer.className = "qws-fo-leaderboard-footer";

  body.append(tabsRow, hintEl, statusEl, list, footer);

  let myId: string | null = null;
  let visible = false;
  let activeCategory: LeaderboardCategory = "coins";
  let unsubscribePlayerId: (() => void) | null = null;

  const stateByCategory: Record<LeaderboardCategory, LeaderboardState> = {
    coins: {
      rows: [],
      rank: null,
      loading: false,
      loaded: false,
      rankLoading: false,
      error: null,
    },
    eggs: {
      rows: [],
      rank: null,
      loading: false,
      loaded: false,
      rankLoading: false,
      error: null,
    },
  };

  const renderPlaceholder = (text: string) => {
    const empty = document.createElement("div");
    empty.className = "qws-fo-leaderboard-empty";
    empty.textContent = text;
    list.appendChild(empty);
  };

  const buildRow = (row: LeaderboardRow, rank: number, markMe: boolean, isFooter = false) => {
    const rowEl = document.createElement("div");
    rowEl.className = "qws-fo-leaderboard-row";
    if (markMe) rowEl.classList.add("is-me");
    if (isFooter) rowEl.classList.add("is-footer");

    const rankEl = document.createElement("div");
    rankEl.className = "qws-fo-leaderboard-rank";
    rankEl.textContent = `#${rank}`;
    if (rank === 1) rankEl.classList.add("is-top1");
    if (rank === 2) rankEl.classList.add("is-top2");
    if (rank === 3) rankEl.classList.add("is-top3");

    const avatar = document.createElement("div");
    avatar.className = "qws-fo-leaderboard-avatar";
    const anon = isAnonymousRow(row);
    const displayName = anon ? "Anonymous" : (row.playerName ?? "Unknown");
    if (row.avatarUrl && !anon) {
      const img = document.createElement("img");
      img.alt = displayName;
      img.decoding = "async";
      setImageSafe(img, row.avatarUrl);
      avatar.appendChild(img);
    } else if (anon) {
      avatar.classList.add("is-anon");
      avatar.appendChild(createAnonymousAvatar());
    } else {
      const fallback = displayName.trim().slice(0, 1).toUpperCase() || "?";
      avatar.textContent = fallback;
    }

    const name = document.createElement("div");
    name.className = "qws-fo-leaderboard-name";
    name.textContent = displayName;

    const value = document.createElement("div");
    value.className = `qws-fo-leaderboard-value ${activeCategory === "coins" ? "is-coins" : "is-eggs"}`;
    const rawValue = activeCategory === "coins" ? row.coins : row.eggsHatched;
    value.textContent = formatLeaderboardValue(rawValue, activeCategory);
    if (activeCategory === "coins") {
      const abs = Math.abs(Number(rawValue));
      if (Number.isFinite(abs)) {
        if (abs >= 1e12) value.classList.add("is-coin-trillion");
        else if (abs >= 1e9) value.classList.add("is-coin-billion");
        else if (abs >= 1e6) value.classList.add("is-coin-million");
        else value.classList.add("is-coin-base");
      }
    }

    rowEl.append(rankEl, avatar, name, value);
    return rowEl;
  };

  const renderFooter = (state: LeaderboardState) => {
    footer.innerHTML = "";
    footer.style.display = "flex";

    const renderNote = (text: string) => {
      const note = document.createElement("div");
      note.className = "qws-fo-leaderboard-footer-note";
      note.textContent = text;
      footer.appendChild(note);
    };

    if (!myId) {
      renderNote("Sign in to see your rank.");
      return;
    }
    if (state.rankLoading) {
      renderNote("Loading your rank...");
      return;
    }
    if (!state.rank || typeof state.rank.rank !== "number") {
      renderNote("Rank unavailable.");
      return;
    }
    if (state.rank.rank <= 10) {
      footer.style.display = "none";
      return;
    }

    const fallbackRow: LeaderboardRow = {
      playerId: myId,
      playerName: "You",
      avatarUrl: null,
      avatar: null,
      coins: null,
      eggsHatched: null,
      lastEventAt: null,
    };
    const row = state.rank.row ?? fallbackRow;
    footer.appendChild(buildRow(row, state.rank.rank, true, true));
  };

  const render = () => {
    const state = stateByCategory[activeCategory];
    coinsBtn.classList.toggle("active", activeCategory === "coins");
    eggsBtn.classList.toggle("active", activeCategory === "eggs");
    refreshBtn.disabled = state.loading;
    refreshBtn.classList.toggle("is-disabled", state.loading);
    refreshBtn.textContent = state.loading ? "Refreshing..." : "Refresh";
    hintEl.textContent = activeCategory === "coins"
      ? "Players who hide coin privacy in My profile appear as Anonymous on this leaderboard"
      : "Players who hide stats privacy in My profile appear as Anonymous on this leaderboard";

    statusEl.textContent = "";
    list.innerHTML = "";

    if (state.loading && !state.rows.length) {
      renderPlaceholder("Loading leaderboard...");
      renderFooter(state);
      return;
    }

    if (state.error && !state.rows.length) {
      renderPlaceholder(state.error);
      renderFooter(state);
      return;
    }

    if (!state.rows.length) {
      renderPlaceholder("No leaderboard data yet.");
      renderFooter(state);
      return;
    }

    if (state.loading) {
      statusEl.textContent = "Refreshing leaderboard...";
    }

    state.rows.slice(0, 10).forEach((row, index) => {
      const rowId = normalizeLeaderboardId(row.playerId);
      const isMe = rowId && myId ? rowId === myId : false;
      list.appendChild(buildRow(row, index + 1, isMe));
    });

    renderFooter(state);
  };

  const loadCategory = async (category: LeaderboardCategory, force = false) => {
    const state = stateByCategory[category];
    if (state.loading) return;
    if (state.loaded && !force) {
      render();
      return;
    }
    state.loading = true;
    state.error = null;
    state.rankLoading = Boolean(myId);
    render();

    try {
      const listPromise =
        category === "coins"
          ? fetchLeaderboardCoins(10, 0)
          : fetchLeaderboardEggsHatched(10, 0);
      const rankPromise = myId
        ? (category === "coins"
          ? fetchLeaderboardCoinsRank(myId)
          : fetchLeaderboardEggsHatchedRank(myId))
        : Promise.resolve(null);
      const [rows, rank] = await Promise.all([listPromise, rankPromise]);
      state.rows = Array.isArray(rows) ? rows.slice(0, 10) : [];
      state.rank = rank;
      state.loaded = true;
    } catch {
      state.error = "Unable to load leaderboard.";
    } finally {
      state.loading = false;
      state.rankLoading = false;
      render();
    }
  };

  const loadRank = async (category: LeaderboardCategory) => {
    const state = stateByCategory[category];
    if (!myId || state.rankLoading) {
      render();
      return;
    }
    state.rankLoading = true;
    renderFooter(state);
    try {
      const rank =
        category === "coins"
          ? await fetchLeaderboardCoinsRank(myId)
          : await fetchLeaderboardEggsHatchedRank(myId);
      state.rank = rank;
    } catch {
      state.rank = null;
    } finally {
      state.rankLoading = false;
      renderFooter(state);
    }
  };

  const setCategory = (category: LeaderboardCategory) => {
    if (activeCategory === category) return;
    activeCategory = category;
    render();
    if (visible) {
      void loadCategory(category);
    }
  };

  const setPlayerId = (id: string | null) => {
    const normalized = id ? String(id) : null;
    if (myId === normalized) return;
    myId = normalized;
    render();
    if (visible) {
      void loadRank(activeCategory);
    }
  };

  coinsBtn.addEventListener("click", () => setCategory("coins"));
  eggsBtn.addEventListener("click", () => setCategory("eggs"));
  refreshBtn.addEventListener("click", () => {
    void loadCategory(activeCategory, true);
  });

  playerDatabaseUserId
    .onChangeNow((next) => setPlayerId(next ? String(next) : null))
    .then((unsub) => {
      unsubscribePlayerId = unsub;
    })
    .catch(() => {});

  render();

  return {
    root,
    show: () => {
      visible = true;
      void loadCategory(activeCategory);
    },
    hide: () => {
      visible = false;
    },
    refresh: () => {
      if (!visible) return;
      void loadCategory(activeCategory, true);
    },
    destroy: () => {
      try {
        unsubscribePlayerId?.();
      } catch {}
    },
  };
}
