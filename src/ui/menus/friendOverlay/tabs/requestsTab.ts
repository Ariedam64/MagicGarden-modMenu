import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  cancelFriendRequest,
  fetchFriendRequests,
  fetchPlayersView,
  getAudioUrlSafe,
  openFriendRequestsStream,
  respondFriendRequest,
  type FriendRequestIncoming,
  type FriendRequestOutgoing,
  type FriendRequestStreamRemoved,
  type PlayerView,
  type StreamHandle,
} from "../../../../utils/supabase";
import { createButton, createFlexRow } from "../ui";
import { audioPlayer } from "../../../../core/audioPlayer";
import { getFriendSettings } from "../../../../utils/friendSettings";

const FRIEND_REQUEST_NOTIFICATION_URL = "https://cdn.pixabay.com/audio/2024/01/11/audio_e374973afd.mp3";

type EnrichedIncoming = FriendRequestIncoming & { view?: PlayerView | null };
type EnrichedOutgoing = FriendRequestOutgoing & { view?: PlayerView | null };

type RequestsTabHandle = {
  root: HTMLDivElement;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  destroy: () => void;
};

const FRIEND_REMOVED_EVENT = "qws-friend-removed";

const dispatchFriendRemoved = (removerId: string) => {
  try {
    window.dispatchEvent(new CustomEvent(FRIEND_REMOVED_EVENT, { detail: { playerId: removerId } }));
  } catch {
    // ignore
  }
};

type RequestsTabOptions = {
  onCountChange?: (count: number) => void;
  onAccept?: () => void;
  onRemoved?: (payload: FriendRequestStreamRemoved) => void;
};

const FRIENDS_REFRESH_EVENT = "qws-friends-refresh";

const dispatchFriendsRefresh = () => {
  try {
    window.dispatchEvent(new CustomEvent(FRIENDS_REFRESH_EVENT));
  } catch {
    // ignore
  }
};

export function createRequestsTab(options: RequestsTabOptions = {}): RequestsTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-community-panel qws-fo-community-requests";

  const card = document.createElement("div");
  card.className = "qws-fo-card";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.height = "100%";
  card.style.minHeight = "0";

  const cardHead = document.createElement("div");
  cardHead.className = "qws-fo-card__head";
  cardHead.textContent = "Friend requests";
  card.appendChild(cardHead);

  const body = document.createElement("div");
  body.className = "qws-fo-card__body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "8px";
  body.style.flex = "1";
  body.style.minHeight = "0";
  body.style.overflow = "auto";
  card.appendChild(body);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "6px";
  list.style.alignContent = "start";
  body.appendChild(list);

  root.appendChild(card);

  // --- State ---
  let myId: string | null = null;
  let incoming: EnrichedIncoming[] = [];
  let outgoing: EnrichedOutgoing[] = [];
  let loading = false;
  let destroyed = false;
  const actionInProgress = new Set<string>();
  let unsubscribePlayerId: (() => void) | null = null;
  let stream: StreamHandle | null = null;
  let suppressSoundUntil = Date.now() + 10000; // Bloquer le son pendant 10s au démarrage

  const updateBadge = () => {
    options.onCountChange?.(incoming.length);
  };

  const renderPlaceholder = (text: string) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.opacity = "0.6";
    el.style.fontSize = "12px";
    el.style.textAlign = "center";
    el.style.padding = "12px 0";
    list.appendChild(el);
  };

  const renderRow = (
    playerId: string,
    view: PlayerView | null | undefined,
    kind: "received" | "sent",
    actionsEl: HTMLElement,
  ) => {
    const displayName = view?.playerName ?? playerId ?? "Unknown";

    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "36px 1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "8px 10px";
    row.style.borderRadius = "10px";
    row.style.background = "rgba(255,255,255,0.03)";
    row.style.border = "1px solid rgba(255,255,255,0.05)";

    const avatar = document.createElement("div");
    avatar.style.width = "36px";
    avatar.style.height = "36px";
    avatar.style.borderRadius = "50%";
    avatar.style.display = "grid";
    avatar.style.placeItems = "center";
    avatar.style.background = "rgba(255,255,255,0.06)";
    avatar.style.overflow = "hidden";
    avatar.style.fontSize = "13px";
    avatar.style.fontWeight = "700";
    avatar.style.flexShrink = "0";

    if (view?.avatarUrl) {
      const img = document.createElement("img");
      img.src = view.avatarUrl;
      img.alt = displayName;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      avatar.appendChild(img);
    } else {
      avatar.textContent = displayName.charAt(0).toUpperCase();
    }

    const info = document.createElement("div");
    info.style.display = "flex";
    info.style.flexDirection = "column";
    info.style.gap = "3px";
    info.style.minWidth = "0";

    const nameEl = document.createElement("div");
    nameEl.textContent = displayName;
    nameEl.style.fontWeight = "600";
    nameEl.style.fontSize = "13px";
    nameEl.style.overflow = "hidden";
    nameEl.style.textOverflow = "ellipsis";
    nameEl.style.whiteSpace = "nowrap";

    const kindBadge = document.createElement("span");
    kindBadge.textContent = kind === "received" ? "Received" : "Sent";
    kindBadge.style.fontSize = "10px";
    kindBadge.style.fontWeight = "600";
    kindBadge.style.padding = "1px 6px";
    kindBadge.style.borderRadius = "999px";
    kindBadge.style.display = "inline-block";
    kindBadge.style.width = "fit-content";
    if (kind === "received") {
      kindBadge.style.background = "rgba(59,130,246,0.18)";
      kindBadge.style.color = "#93c5fd";
      kindBadge.style.border = "1px solid rgba(59,130,246,0.3)";
    } else {
      kindBadge.style.background = "rgba(148,163,184,0.12)";
      kindBadge.style.color = "rgba(148,163,184,0.9)";
      kindBadge.style.border = "1px solid rgba(148,163,184,0.2)";
    }

    info.append(nameEl, kindBadge);
    row.append(avatar, info, actionsEl);
    list.appendChild(row);
  };

  const renderAll = () => {
    if (destroyed) return;

    list.innerHTML = "";

    if (loading && !incoming.length && !outgoing.length) {
      renderPlaceholder("Loading...");
      updateBadge();
      return;
    }

    if (!incoming.length && !outgoing.length) {
      renderPlaceholder("No pending friend requests.");
      updateBadge();
      return;
    }

    for (const req of incoming) {
      const actionsRow = createFlexRow({ gap: 4, align: "center", wrap: false });
      const rejectBtn = createButton("Reject", { size: "sm" });
      rejectBtn.title = "Reject request";
      const acceptBtn = createButton("Accept", { size: "sm", variant: "primary" });
      acceptBtn.title = "Accept request";

      const handleAction = (action: "accept" | "reject") => async () => {
        if (!myId || !req.fromPlayerId) return;
        if (actionInProgress.has(req.fromPlayerId)) return;
        actionInProgress.add(req.fromPlayerId);
        rejectBtn.disabled = true;
        acceptBtn.disabled = true;
        try {
          await respondFriendRequest({ otherPlayerId: req.fromPlayerId, action });
        } catch (e) {
          console.error("[RequestsTab] respondFriendRequest", e);
        } finally {
          actionInProgress.delete(req.fromPlayerId);
          await loadRequests({ force: true });
          dispatchFriendsRefresh();
          if (action === "accept") options.onAccept?.();
        }
      };

      rejectBtn.addEventListener("click", () => void handleAction("reject")());
      acceptBtn.addEventListener("click", () => void handleAction("accept")());
      actionsRow.append(rejectBtn, acceptBtn);
      renderRow(req.fromPlayerId, req.view, "received", actionsRow);
    }

    for (const req of outgoing) {
      const actionsRow = createFlexRow({ gap: 4, align: "center", wrap: false });
      const cancelBtn = createButton("Cancel", { size: "sm", variant: "danger" });
      cancelBtn.title = "Cancel request";

      const handleCancel = async () => {
        if (!myId || !req.toPlayerId) return;
        if (actionInProgress.has(req.toPlayerId)) return;
        actionInProgress.add(req.toPlayerId);
        cancelBtn.disabled = true;
        try {
          await cancelFriendRequest(req.toPlayerId);
        } catch (e) {
          console.error("[RequestsTab] cancelFriendRequest", e);
        } finally {
          actionInProgress.delete(req.toPlayerId);
          await loadRequests({ force: true });
          dispatchFriendsRefresh();
        }
      };

      cancelBtn.addEventListener("click", () => void handleCancel());
      actionsRow.appendChild(cancelBtn);
      renderRow(req.toPlayerId, req.view, "sent", actionsRow);
    }

    updateBadge();
  };

  async function loadRequests(opts?: { force?: boolean }) {
    if (destroyed) return;
    if (!myId) {
      incoming = [];
      outgoing = [];
      renderAll();
      return;
    }

    loading = true;
    renderAll();

    try {
      const result = await fetchFriendRequests(myId);

      const allIds = [
        ...result.incoming.map((r) => r.fromPlayerId),
        ...result.outgoing.map((r) => r.toPlayerId),
      ].filter(Boolean);

      const views =
        allIds.length > 0 ? await fetchPlayersView(allIds, { sections: ["profile"] }) : [];

      const viewMap = new Map<string, PlayerView>();
      for (const v of views) {
        if (v.playerId) viewMap.set(v.playerId, v);
      }

      incoming = result.incoming.map((r) => ({ ...r, view: viewMap.get(r.fromPlayerId) ?? null }));
      outgoing = result.outgoing.map((r) => ({ ...r, view: viewMap.get(r.toPlayerId) ?? null }));
    } catch (e) {
      console.error("[RequestsTab] loadRequests", e);
      incoming = [];
      outgoing = [];
    } finally {
      loading = false;
      renderAll();
      // Débloquer le son après le premier chargement des demandes
      suppressSoundUntil = 0;
    }
  }

  const resetStream = () => {
    if (stream) {
      try {
        stream.close();
      } catch {}
      stream = null;
    }
    if (!myId) return;
    stream = openFriendRequestsStream(myId, {
      onRequest: () => {
        if (getFriendSettings().friendRequestSoundEnabled && Date.now() >= suppressSoundUntil) {
          void getAudioUrlSafe(FRIEND_REQUEST_NOTIFICATION_URL).then((url) => {
            audioPlayer.playAt(url, 0.2);
          });
        }
        void loadRequests({ force: true });
      },
      onResponse: (payload) => {
        void loadRequests({ force: true });
        if (payload.action === "accept") options.onAccept?.();
      },
      onCancelled: () => void loadRequests({ force: true }),
      onRemoved: (payload) => {
        dispatchFriendsRefresh();
        dispatchFriendRemoved(payload.removerId);
        options.onRemoved?.(payload);
      },
      onError: () => {},
    });
  };

  playerDatabaseUserId
    .onChangeNow((next) => {
      myId = next ? String(next) : null;
      if (myId) {
        resetStream();
        void loadRequests({ force: true });
      } else {
        incoming = [];
        outgoing = [];
        renderAll();
      }
    })
    .then((unsub) => {
      unsubscribePlayerId = unsub;
    })
    .catch(() => {});

  return {
    root,
    refresh: (opts?: { force?: boolean }) => loadRequests(opts),
    destroy: () => {
      destroyed = true;
      try {
        unsubscribePlayerId?.();
      } catch {}
      if (stream) {
        try {
          stream.close();
        } catch {}
        stream = null;
      }
    },
  };
}
