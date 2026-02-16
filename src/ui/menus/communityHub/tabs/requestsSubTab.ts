import {
  getCachedIncomingRequestsWithViews,
  getCachedOutgoingRequests,
  respondFriendRequest,
  cancelFriendRequest,
} from "../../../../ariesModAPI";
import type { PlayerView } from "../../../../ariesModAPI";
import { style, CH_EVENTS, formatRelativeTime } from "../shared";

export function createRequestsSubTab() {
  const container = document.createElement("div");
  style(container, { display: "flex", flexDirection: "column", height: "100%", gap: "16px", overflow: "auto" });

  // Incoming Requests Section
  const incomingSection = document.createElement("div");
  style(incomingSection, { display: "flex", flexDirection: "column", gap: "10px" });

  const incomingHeader = document.createElement("div");
  style(incomingHeader, {
    fontSize: "14px",
    fontWeight: "700",
    color: "#e7eef7",
    paddingBottom: "4px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  });
  incomingHeader.textContent = "Incoming Requests";

  const incomingList = document.createElement("div");
  style(incomingList, { display: "flex", flexDirection: "column", gap: "8px" });

  // Outgoing Requests Section
  const outgoingSection = document.createElement("div");
  style(outgoingSection, { display: "flex", flexDirection: "column", gap: "10px" });

  const outgoingHeader = document.createElement("div");
  style(outgoingHeader, {
    fontSize: "14px",
    fontWeight: "700",
    color: "#e7eef7",
    paddingBottom: "4px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  });
  outgoingHeader.textContent = "Outgoing Requests";

  const outgoingList = document.createElement("div");
  style(outgoingList, { display: "flex", flexDirection: "column", gap: "8px" });

  // Render function
  const renderRequests = () => {
    const incomingRequests = getCachedIncomingRequestsWithViews();
    const outgoingRequests = getCachedOutgoingRequests();

    incomingList.innerHTML = "";
    if (incomingRequests.length === 0) {
      const empty = document.createElement("div");
      style(empty, { padding: "20px", textAlign: "center", color: "rgba(226,232,240,0.5)", fontSize: "12px" });
      empty.textContent = "No incoming requests";
      incomingList.appendChild(empty);
    } else {
      for (const request of incomingRequests) {
        incomingList.appendChild(createIncomingRequestCard(request));
      }
    }

    outgoingList.innerHTML = "";
    if (outgoingRequests.length === 0) {
      const empty = document.createElement("div");
      style(empty, { padding: "20px", textAlign: "center", color: "rgba(226,232,240,0.5)", fontSize: "12px" });
      empty.textContent = "No outgoing requests";
      outgoingList.appendChild(empty);
    } else {
      for (const request of outgoingRequests) {
        outgoingList.appendChild(createOutgoingRequestCard(request));
      }
    }
  };

  // Listen for cache updates
  const onRequestsRefresh = () => renderRequests();
  window.addEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRequestsRefresh);

  // Initial render
  renderRequests();

  incomingSection.append(incomingHeader, incomingList);
  outgoingSection.append(outgoingHeader, outgoingList);
  container.append(incomingSection, outgoingSection);

  return {
    root: container,
    destroy() {
      window.removeEventListener(CH_EVENTS.FRIEND_REQUESTS_REFRESH, onRequestsRefresh);
    },
  };
}

function createIncomingRequestCard(request: PlayerView & { createdAt: string }): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    transition: "all 120ms ease",
  });

  card.onmouseenter = () => style(card, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)" });
  card.onmouseleave = () => style(card, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });

  // Avatar
  const avatar = document.createElement("div");
  style(avatar, {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: request.avatarUrl
      ? `url(${request.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
    flexShrink: "0",
  });

  // Info
  const info = document.createElement("div");
  style(info, { flex: "1", display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" });

  const name = document.createElement("div");
  style(name, { fontSize: "13px", fontWeight: "600", color: "#e7eef7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  name.textContent = request.playerName || "Unknown";

  const time = document.createElement("div");
  style(time, { fontSize: "11px", color: "rgba(226,232,240,0.5)" });
  time.textContent = formatRelativeTime(request.createdAt);

  info.append(name, time);

  // Buttons
  const buttonsContainer = document.createElement("div");
  style(buttonsContainer, { display: "flex", gap: "8px", flexShrink: "0" });

  const acceptButton = document.createElement("button");
  acceptButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  style(acceptButton, {
    padding: "8px 12px",
    border: "1px solid rgba(16,185,129,0.35)",
    borderRadius: "8px",
    background: "rgba(16,185,129,0.12)",
    color: "#10b981",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });

  acceptButton.onmouseenter = () => style(acceptButton, { background: "rgba(16,185,129,0.2)", borderColor: "rgba(16,185,129,0.5)" });
  acceptButton.onmouseleave = () => style(acceptButton, { background: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.35)" });

  const declineButton = document.createElement("button");
  declineButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  style(declineButton, {
    padding: "8px 12px",
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: "8px",
    background: "rgba(239,68,68,0.12)",
    color: "#ef4444",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });

  declineButton.onmouseenter = () => style(declineButton, { background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.5)" });
  declineButton.onmouseleave = () => style(declineButton, { background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)" });

  acceptButton.onclick = async (e) => {
    e.stopPropagation();
    acceptButton.disabled = true;
    declineButton.disabled = true;
    style(acceptButton, { cursor: "not-allowed", opacity: "0.6" });
    style(declineButton, { cursor: "not-allowed", opacity: "0.6" });

    const success = await respondFriendRequest({ otherPlayerId: request.playerId, action: "accept" });
    if (!success) {
      console.error(`[Requests] Failed to accept friend request from ${request.playerName}`);
      acceptButton.disabled = false;
      declineButton.disabled = false;
      style(acceptButton, { cursor: "pointer", opacity: "1" });
      style(declineButton, { cursor: "pointer", opacity: "1" });
    }
  };

  declineButton.onclick = async (e) => {
    e.stopPropagation();
    acceptButton.disabled = true;
    declineButton.disabled = true;
    style(acceptButton, { cursor: "not-allowed", opacity: "0.6" });
    style(declineButton, { cursor: "not-allowed", opacity: "0.6" });

    const success = await respondFriendRequest({ otherPlayerId: request.playerId, action: "reject" });
    if (!success) {
      console.error(`[Requests] Failed to decline friend request from ${request.playerName}`);
      acceptButton.disabled = false;
      declineButton.disabled = false;
      style(acceptButton, { cursor: "pointer", opacity: "1" });
      style(declineButton, { cursor: "pointer", opacity: "1" });
    }
  };

  buttonsContainer.append(acceptButton, declineButton);
  card.append(avatar, info, buttonsContainer);
  return card;
}

function createOutgoingRequestCard(request: {
  toPlayerId: string;
  playerName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    transition: "all 120ms ease",
  });

  card.onmouseenter = () => style(card, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)" });
  card.onmouseleave = () => style(card, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });

  // Avatar
  const avatar = document.createElement("div");
  style(avatar, {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: request.avatarUrl
      ? `url(${request.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
    flexShrink: "0",
  });

  // Info
  const info = document.createElement("div");
  style(info, { flex: "1", display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" });

  const name = document.createElement("div");
  style(name, { fontSize: "13px", fontWeight: "600", color: "#e7eef7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  name.textContent = request.playerName || "Unknown";

  const time = document.createElement("div");
  style(time, { fontSize: "11px", color: "rgba(226,232,240,0.5)" });
  time.textContent = formatRelativeTime(request.createdAt);

  info.append(name, time);

  // Cancel button
  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  style(cancelButton, {
    padding: "8px 16px",
    border: "1px solid rgba(251,191,36,0.35)",
    borderRadius: "8px",
    background: "rgba(251,191,36,0.12)",
    color: "#fbbf24",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    flexShrink: "0",
    transition: "all 120ms ease",
  });

  cancelButton.onmouseenter = () => style(cancelButton, { background: "rgba(251,191,36,0.2)", borderColor: "rgba(251,191,36,0.5)" });
  cancelButton.onmouseleave = () => style(cancelButton, { background: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.35)" });

  cancelButton.onclick = async (e) => {
    e.stopPropagation();
    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelling...";
    style(cancelButton, { cursor: "not-allowed", opacity: "0.6" });

    const success = await cancelFriendRequest(request.toPlayerId);
    if (!success) {
      console.error(`[Requests] Failed to cancel friend request to ${request.playerName}`);
      cancelButton.disabled = false;
      cancelButton.textContent = "Cancel";
      style(cancelButton, { cursor: "pointer", opacity: "1" });
    }
  };

  card.append(avatar, info, cancelButton);
  return card;
}
