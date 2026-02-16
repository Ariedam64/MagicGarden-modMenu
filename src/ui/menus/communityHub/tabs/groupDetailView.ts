import {
  fetchGroupDetails,
  deleteGroup,
  leaveGroup,
  joinGroup,
  removeGroupMember,
  changeGroupMemberRole,
  addGroupMember,
  updateGroupName,
  updateGroupVisibility,
  getCurrentPlayerId,
  getCachedFriendsWithViews,
} from "../../../../ariesModAPI";
import type { GroupSummary, GroupDetails, GroupMember, GroupRole, PlayerView } from "../../../../ariesModAPI";
import { toastSimple } from "../../../toast";
import { style, ensureSharedStyles, formatRelativeTime, createKeyBlocker, CH_EVENTS, createRoomBadge } from "../shared";

// ── Types ────────────────────────────────────────────────────────────────────

type GroupDetailViewParams = {
  group: GroupSummary;
  onBack: () => void;
};

type MemberRef = {
  onlineDot: HTMLElement;
  meta: HTMLElement;
  member: GroupMember;
};

// ── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const ROLE_ICON_SVG: Record<string, string> = {
  // Crown
  owner: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.98 10l-2.1-5.08c-.31-.77-1.18-1.14-1.95-.83-.53.22-.88.68-.98 1.2L8.78 10l-5.25-1.42c-.8-.22-1.63.26-1.84 1.06-.12.46 0 .93.3 1.27l5.28 5.83h10.46l5.28-5.83c.3-.34.42-.81.3-1.27z"/></svg>`,
  // Shield with star
  admin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l1.45 2.94L16.5 8.5l-2.12 2.06.5 2.94L12 12l-2.88 1.5.5-2.94L7.5 8.5l3.05-.56L12 5z"/></svg>`,
  // User
  member: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  admin: { bg: "rgba(139,92,246,0.15)", color: "#a78bfa" },
  member: { bg: "rgba(94,234,212,0.15)", color: "#5eead4" },
};

function createRoleBadge(role: string): HTMLElement {
  const badge = document.createElement("div");
  const colors = ROLE_COLORS[role] || ROLE_COLORS.member;
  const icon = ROLE_ICON_SVG[role] || ROLE_ICON_SVG.member;
  style(badge, {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    background: colors.bg,
    color: colors.color,
  });
  badge.innerHTML = icon;
  badge.title = role.charAt(0).toUpperCase() + role.slice(1);
  return badge;
}

// ── SVG icons ────────────────────────────────────────────────────────────────

const ICON_BACK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_ADD_MEMBER = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const ICON_GLOBE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="currentColor" stroke-width="2"/></svg>`;

const ICON_LOCK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const ICON_CLOSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_DISSOLVE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_LEAVE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_JOIN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_CHAT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ── Main export ──────────────────────────────────────────────────────────────

export async function createGroupDetailView(params: GroupDetailViewParams): Promise<HTMLElement> {
  ensureSharedStyles();

  const { group, onBack } = params;
  const groupId = String(group.id);
  const myPlayerId = getCurrentPlayerId() || "";
  const isMember = !!group.role;
  const myRole: GroupRole = group.role || "member";

  const root = document.createElement("div");
  root.className = "qws-ch-scrollable";
  style(root, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    gap: "16px",
    paddingRight: "8px",
    paddingBottom: "16px",
    position: "relative",
  });

  // Track current members for the add-member modal
  let currentMembers: GroupMember[] = [];
  let modalCleanup: (() => void) | null = null;

  // Member DOM refs for in-place presence/room updates (avoids full re-fetch)
  const memberRefs = new Map<string, MemberRef>();

  const updateMemberInPlace = (playerId: string, updates: {
    isOnline?: boolean;
    roomId?: string | null;
    lastEventAt?: string | null;
  }) => {
    const entry = memberRefs.get(playerId);
    if (!entry) return;
    if (updates.isOnline !== undefined) entry.member.isOnline = updates.isOnline;
    if (updates.roomId !== undefined) entry.member.roomId = updates.roomId;
    if (updates.lastEventAt !== undefined) entry.member.lastEventAt = updates.lastEventAt;

    const isOnline = entry.member.isOnline ?? false;
    style(entry.onlineDot, { background: isOnline ? "#10b981" : "#6b7280" });

    entry.meta.innerHTML = "";
    style(entry.meta, { color: isOnline ? "#5eead4" : "rgba(226,232,240,0.5)" });
    if (isOnline) {
      entry.meta.appendChild(createRoomBadge(entry.member.roomId));
    } else {
      entry.meta.textContent = entry.member.lastEventAt
        ? `Last seen ${formatRelativeTime(entry.member.lastEventAt)}`
        : "";
    }
  };

  const showAddMemberModal = () => {
    const memberIds = new Set(currentMembers.map((m) => m.playerId));
    const scrollTop = root.scrollTop;

    const closeModal = () => {
      if (modalCleanup) { modalCleanup(); modalCleanup = null; }
      overlay.remove();
      root.style.overflow = "auto";
    };

    const { overlay, cleanup } = buildAddMemberModal(groupId, memberIds, closeModal);
    modalCleanup = cleanup;
    style(overlay, { top: scrollTop + "px", height: root.clientHeight + "px" });
    root.style.overflow = "hidden";
    root.appendChild(overlay);
  };

  // ── Header (rebuilt on join) ─────────────────────────────────────────────
  let currentIsMember = isMember;

  const rebuildHeader = () => {
    const newHeader = buildHeader(onBack, showAddMemberModal, currentIsMember ? myRole : undefined, groupId, currentIsMember, onJoinSuccess, group.name);
    header.replaceWith(newHeader);
    header = newHeader;
  };

  const onJoinSuccess = () => {
    currentIsMember = true;
    group.role = "member";
    rebuildHeader();
    refreshContent();
    window.dispatchEvent(new CustomEvent(CH_EVENTS.GROUPS_REFRESH));
  };

  let header = buildHeader(onBack, showAddMemberModal, myRole, groupId, isMember, onJoinSuccess, group.name);
  root.appendChild(header);

  // ── Content zone (rebuilt on refresh) ────────────────────────────────────
  const contentZone = document.createElement("div");
  style(contentZone, { display: "flex", flexDirection: "column", flex: "1", gap: "16px", overflow: "hidden" });
  root.appendChild(contentZone);

  // Track key blocker for cleanup
  let currentKeyBlockerCleanup: (() => void) | null = null;

  // Search filter preserved across refreshes
  let searchFilter = "";

  /**
   * Fetches group details from server and rebuilds the content zone.
   * This is called on initial load and on every GROUPS_REFRESH event.
   */
  const refreshContent = async () => {
    if (!root.isConnected) return;

    const details = await fetchGroupDetails(groupId);

    if (!root.isConnected) return;

    // Clean up previous key blocker
    if (currentKeyBlockerCleanup) {
      currentKeyBlockerCleanup();
      currentKeyBlockerCleanup = null;
    }

    contentZone.innerHTML = "";

    if (!details || !details.group) {
      contentZone.appendChild(buildErrorView("Failed to load group details", onBack));
      return;
    }

    const members = details.members || [];
    currentMembers = members;

    // Info card
    contentZone.appendChild(buildInfoCard(details, myRole, members));

    // Members section
    memberRefs.clear();
    const { section: membersSection, keyBlockerCleanup } = buildMembersSection(
      details,
      members,
      myRole,
      myPlayerId,
      groupId,
      searchFilter,
      (newFilter) => { searchFilter = newFilter; },
      memberRefs,
    );
    currentKeyBlockerCleanup = keyBlockerCleanup;
    contentZone.appendChild(membersSection);
  };

  // ── Initial load ─────────────────────────────────────────────────────────
  const loadingView = buildLoadingView();
  contentZone.appendChild(loadingView);

  const initialDetails = await fetchGroupDetails(groupId);
  loadingView.remove();

  if (!initialDetails || !initialDetails.group) {
    contentZone.appendChild(buildErrorView("Failed to load group details", onBack));
  } else {
    const members = initialDetails.members || [];
    currentMembers = members;
    contentZone.appendChild(buildInfoCard(initialDetails, myRole, members));

    memberRefs.clear();
    const { section: membersSection, keyBlockerCleanup } = buildMembersSection(
      initialDetails,
      members,
      myRole,
      myPlayerId,
      groupId,
      searchFilter,
      (newFilter) => { searchFilter = newFilter; },
      memberRefs,
    );
    currentKeyBlockerCleanup = keyBlockerCleanup;
    contentZone.appendChild(membersSection);
  }

  // ── Listen for GROUPS_REFRESH (debounced full re-fetch for structural changes)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const onGroupsRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshContent();
    }, 500);
  };
  window.addEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);

  // ── Lightweight in-place updates (no API call) ─────────────────────────
  const onPresenceUpdated = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.playerId) {
      updateMemberInPlace(d.playerId, {
        isOnline: d.online ?? false,
        roomId: d.roomId ?? null,
        lastEventAt: d.lastEventAt ?? null,
      });
    }
  };
  window.addEventListener(CH_EVENTS.PRESENCE_UPDATED, onPresenceUpdated);

  const onRoomChanged = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.playerId) {
      updateMemberInPlace(d.playerId, { roomId: d.roomId ?? null });
    }
  };
  window.addEventListener(CH_EVENTS.ROOM_CHANGED, onRoomChanged);

  const onPrivacyUpdated = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.playerId && d?.privacy?.hideRoomFromPublicList) {
      updateMemberInPlace(d.playerId, { roomId: null });
    }
  };
  window.addEventListener(CH_EVENTS.PRIVACY_UPDATED, onPrivacyUpdated);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  (root as any).__cleanup = () => {
    window.removeEventListener(CH_EVENTS.GROUPS_REFRESH, onGroupsRefresh);
    window.removeEventListener(CH_EVENTS.PRESENCE_UPDATED, onPresenceUpdated);
    window.removeEventListener(CH_EVENTS.ROOM_CHANGED, onRoomChanged);
    window.removeEventListener(CH_EVENTS.PRIVACY_UPDATED, onPrivacyUpdated);
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (currentKeyBlockerCleanup) {
      currentKeyBlockerCleanup();
      currentKeyBlockerCleanup = null;
    }
    if (modalCleanup) {
      modalCleanup();
      modalCleanup = null;
    }
  };

  return root;
}

// ── Header builder ───────────────────────────────────────────────────────────

function buildHeader(
  onBack: () => void,
  onAddMember: (() => void) | undefined,
  myRole: GroupRole | undefined,
  groupId: string | undefined,
  isMember: boolean,
  onJoinSuccess?: () => void,
  groupName?: string,
): HTMLElement {
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  });

  const backBtn = document.createElement("button");
  backBtn.innerHTML = ICON_BACK;
  style(backBtn, {
    padding: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.03)",
    color: "#e7eef7",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });
  backBtn.onmouseenter = () =>
    style(backBtn, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(94,234,212,0.25)" });
  backBtn.onmouseleave = () =>
    style(backBtn, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });
  backBtn.onclick = onBack;

  const title = document.createElement("div");
  style(title, { fontSize: "16px", fontWeight: "700", color: "#e7eef7", flex: "1" });
  title.textContent = "Group Details";

  header.append(backBtn, title);

  if (isMember) {
    // ── Member view: Chat + Add Member + Dissolve/Leave ──
    const chatBtn = document.createElement("button");
    chatBtn.innerHTML = ICON_CHAT;
    chatBtn.title = "Group Chat";
    style(chatBtn, {
      padding: "8px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "8px",
      background: "rgba(94,234,212,0.12)",
      color: "#5eead4",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 120ms ease",
    });
    chatBtn.onmouseenter = () =>
      style(chatBtn, { background: "rgba(94,234,212,0.2)", borderColor: "rgba(94,234,212,0.35)" });
    chatBtn.onmouseleave = () =>
      style(chatBtn, { background: "rgba(94,234,212,0.12)", borderColor: "rgba(255,255,255,0.08)" });
    chatBtn.onclick = () => {
      window.dispatchEvent(
        new CustomEvent(CH_EVENTS.OPEN_GROUP_CHAT, {
          detail: { groupId, groupName },
        }),
      );
    };
    header.appendChild(chatBtn);

    const addBtn = document.createElement("button");
    addBtn.innerHTML = ICON_ADD_MEMBER;
    addBtn.title = "Add Member";
    style(addBtn, {
      padding: "8px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "8px",
      background: "rgba(94,234,212,0.12)",
      color: "#5eead4",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 120ms ease",
    });
    addBtn.onmouseenter = () =>
      style(addBtn, { background: "rgba(94,234,212,0.2)", borderColor: "rgba(94,234,212,0.35)" });
    addBtn.onmouseleave = () =>
      style(addBtn, { background: "rgba(94,234,212,0.12)", borderColor: "rgba(255,255,255,0.08)" });
    addBtn.onclick = () => onAddMember?.();
    header.appendChild(addBtn);

    // Dissolve (owner) / Leave (non-owner)
    if (groupId) {
      const isOwner = myRole === "owner";
      const actionBtn = document.createElement("button");
      actionBtn.innerHTML = isOwner ? ICON_DISSOLVE : ICON_LEAVE;
      actionBtn.title = isOwner ? "Dissolve Group" : "Leave Group";
      style(actionBtn, {
        padding: "8px",
        border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: "8px",
        background: "rgba(239,68,68,0.08)",
        color: "#ef4444",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 120ms ease",
      });
      actionBtn.onmouseenter = () =>
        style(actionBtn, { background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.4)" });
      actionBtn.onmouseleave = () =>
        style(actionBtn, { background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" });
      actionBtn.onclick = async () => {
        // Navigate back immediately (optimistic)
        onBack();
        // Endpoint handles cache update + revert + toast on failure
        if (isOwner) {
          await deleteGroup({ groupId });
        } else {
          await leaveGroup({ groupId });
        }
      };
      header.appendChild(actionBtn);
    }
  } else if (groupId) {
    // ── Non-member view: Join button ──
    const joinBtn = document.createElement("button");
    joinBtn.innerHTML = ICON_JOIN;
    joinBtn.title = "Join Group";
    style(joinBtn, {
      padding: "8px",
      border: "1px solid rgba(94,234,212,0.2)",
      borderRadius: "8px",
      background: "rgba(94,234,212,0.12)",
      color: "#5eead4",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 120ms ease",
    });
    joinBtn.onmouseenter = () =>
      style(joinBtn, { background: "rgba(94,234,212,0.2)", borderColor: "rgba(94,234,212,0.4)" });
    joinBtn.onmouseleave = () =>
      style(joinBtn, { background: "rgba(94,234,212,0.12)", borderColor: "rgba(94,234,212,0.2)" });
    joinBtn.onclick = async () => {
      // Endpoint handles optimistic cache update + revert on failure
      const success = await joinGroup({ groupId });
      if (success) {
        onJoinSuccess?.();
      }
    };
    header.appendChild(joinBtn);
  }

  return header;
}

// ── Group info card builder ──────────────────────────────────────────────────

function buildInfoCard(details: GroupDetails, myRole: GroupRole, members: GroupMember[]): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
  });

  // Name row: group name + edit button (owner only)
  const nameRow = document.createElement("div");
  style(nameRow, { display: "flex", alignItems: "center", gap: "8px" });

  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "20px",
    fontWeight: "700",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: "1",
  });
  nameEl.textContent = details.group?.name || "Unnamed Group";
  nameRow.appendChild(nameEl);

  if (myRole === "owner") {
    const groupId = String(details.group?.id || "");
    nameRow.appendChild(buildRenameButton(nameEl, groupId));
  }

  // Info row: Owner | Members | Visibility — all on one line
  const infoRow = document.createElement("div");
  style(infoRow, {
    display: "flex",
    alignItems: "center",
    gap: "0",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "8px",
  });

  const ownerMember = members.find((m) => m.role === "owner");
  infoRow.appendChild(buildInfoCell("Owner", ownerMember?.name || details.group?.ownerId || "Unknown"));
  infoRow.appendChild(buildInfoSeparator());
  infoRow.appendChild(buildInfoCell("Members", String(members.length)));
  infoRow.appendChild(buildInfoSeparator());

  // Visibility toggle
  const groupId = String(details.group?.id || "");
  const isPublic = details.group?.isPublic ?? false;
  infoRow.appendChild(buildVisibilityCell(isPublic, myRole === "owner", groupId));

  card.append(nameRow, infoRow);
  return card;
}

const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function buildRenameButton(nameEl: HTMLElement, groupId: string): HTMLElement {
  const btn = document.createElement("button");
  btn.innerHTML = ICON_EDIT;

  const btnBaseStyle: Record<string, string> = {
    padding: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.03)",
    color: "rgba(226,232,240,0.6)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
    flexShrink: "0",
  };
  style(btn, btnBaseStyle);

  const setEditMode = () => {
    btn.innerHTML = ICON_CHECK;
    style(btn, { background: "rgba(94,234,212,0.15)", borderColor: "rgba(94,234,212,0.35)", color: "#5eead4" });
    btn.onmouseenter = () => style(btn, { background: "rgba(94,234,212,0.25)", borderColor: "rgba(94,234,212,0.5)" });
    btn.onmouseleave = () => style(btn, { background: "rgba(94,234,212,0.15)", borderColor: "rgba(94,234,212,0.35)" });
  };

  const setNormalMode = () => {
    btn.innerHTML = ICON_EDIT;
    style(btn, btnBaseStyle);
    btn.onmouseenter = () => style(btn, { background: "rgba(94,234,212,0.1)", borderColor: "rgba(94,234,212,0.3)", color: "#5eead4" });
    btn.onmouseleave = () => style(btn, btnBaseStyle);
  };

  // Initial hover
  btn.onmouseenter = () => style(btn, { background: "rgba(94,234,212,0.1)", borderColor: "rgba(94,234,212,0.3)", color: "#5eead4" });
  btn.onmouseleave = () => style(btn, btnBaseStyle);

  let editing = false;
  let activeInput: HTMLInputElement | null = null;

  const finishEdit = async (save: boolean) => {
    if (!editing || !activeInput) return;
    const input = activeInput;
    activeInput = null;
    editing = false;

    // Remove listeners before DOM swap to avoid re-entry via blur
    input.onkeydown = null;
    input.onblur = null;

    setNormalMode();

    const currentName = input.getAttribute("data-original") || "";
    const newName = input.value.trim();

    if (save && newName && newName !== currentName) {
      nameEl.textContent = newName;
      input.replaceWith(nameEl);
      // Endpoint handles optimistic cache update + revert + toast on failure
      await updateGroupName({ groupId, name: newName });
    } else {
      input.replaceWith(nameEl);
    }
  };

  btn.onclick = () => {
    if (editing) {
      // Click save
      finishEdit(true);
      return;
    }

    editing = true;
    setEditMode();

    const currentName = nameEl.textContent || "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.setAttribute("data-original", currentName);
    activeInput = input;

    style(input, {
      fontSize: "20px",
      fontWeight: "700",
      color: "#e7eef7",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(94,234,212,0.35)",
      borderRadius: "6px",
      padding: "2px 8px",
      outline: "none",
      width: "100%",
      fontFamily: "inherit",
    });

    // Block game keys while editing, but allow Enter and Escape through
    const blockHandler = (e: KeyboardEvent) => {
      if (document.activeElement !== input) return;
      if (e.key === "Enter" || e.key === "Escape") return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", blockHandler, true);
    window.addEventListener("keyup", blockHandler, true);

    const cleanup = () => {
      window.removeEventListener("keydown", blockHandler, true);
      window.removeEventListener("keyup", blockHandler, true);
    };

    const origFinish = finishEdit;
    const wrappedFinish = async (save: boolean) => {
      cleanup();
      await origFinish(save);
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); wrappedFinish(true); }
      if (e.key === "Escape") { e.preventDefault(); wrappedFinish(false); }
    };
    input.onblur = () => wrappedFinish(true);

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  };

  return btn;
}

function buildInfoCell(label: string, value: string): HTMLElement {
  const cell = document.createElement("div");
  style(cell, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    flex: "1",
  });

  const labelEl = document.createElement("div");
  style(labelEl, { fontSize: "10px", color: "rgba(226,232,240,0.5)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" });
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  style(valueEl, { fontSize: "13px", color: "#e7eef7", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" });
  valueEl.textContent = value;

  cell.append(labelEl, valueEl);
  return cell;
}

function buildInfoSeparator(): HTMLElement {
  const sep = document.createElement("div");
  style(sep, { width: "1px", height: "28px", background: "rgba(255,255,255,0.08)", flexShrink: "0" });
  return sep;
}

function buildVisibilityCell(isPublic: boolean, isOwner: boolean, groupId: string): HTMLElement {
  const cell = document.createElement("div");
  style(cell, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    flex: "1",
  });

  const labelEl = document.createElement("div");
  style(labelEl, { fontSize: "10px", color: "rgba(226,232,240,0.5)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" });
  labelEl.textContent = "Visibility";

  // Toggle buttons
  const toggle = document.createElement("div");
  style(toggle, {
    display: "flex",
    borderRadius: "5px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  });

  const publicBtn = document.createElement("button");
  const privateBtn = document.createElement("button");

  const applyToggleStyles = (currentIsPublic: boolean) => {
    const activeStyle = { background: "rgba(94,234,212,0.15)", color: "#5eead4" };
    const inactiveStyle = { background: "rgba(255,255,255,0.02)", color: "rgba(226,232,240,0.4)" };
    Object.assign(publicBtn.style, currentIsPublic ? activeStyle : inactiveStyle);
    Object.assign(privateBtn.style, !currentIsPublic ? activeStyle : inactiveStyle);
  };

  const btnBase: Record<string, string> = {
    padding: "3px 8px",
    border: "none",
    fontSize: "10px",
    fontWeight: "600",
    cursor: isOwner ? "pointer" : "default",
    transition: "all 120ms ease",
    display: "flex",
    alignItems: "center",
    gap: "3px",
  };

  publicBtn.innerHTML = `${ICON_GLOBE} Public`;
  style(publicBtn, btnBase);

  privateBtn.innerHTML = `${ICON_LOCK} Private`;
  style(privateBtn, { ...btnBase, borderLeft: "1px solid rgba(255,255,255,0.1)" });

  applyToggleStyles(isPublic);

  if (isOwner) {
    let currentState = isPublic;
    publicBtn.onclick = async () => {
      if (currentState) return;
      // Optimistic: update UI immediately
      currentState = true;
      applyToggleStyles(true);
      // Endpoint handles cache update + revert + toast on failure
      const ok = await updateGroupVisibility({ groupId, isPublic: true });
      if (!ok) { currentState = false; applyToggleStyles(false); }
    };
    privateBtn.onclick = async () => {
      if (!currentState) return;
      // Optimistic: update UI immediately
      currentState = false;
      applyToggleStyles(false);
      // Endpoint handles cache update + revert + toast on failure
      const ok = await updateGroupVisibility({ groupId, isPublic: false });
      if (!ok) { currentState = true; applyToggleStyles(true); }
    };
  } else {
    publicBtn.style.opacity = "0.6";
    privateBtn.style.opacity = "0.6";
  }

  toggle.append(publicBtn, privateBtn);
  cell.append(labelEl, toggle);
  return cell;
}

function dot(): HTMLElement {
  const d = document.createElement("span");
  style(d, { color: "rgba(226,232,240,0.3)" });
  d.textContent = "\u2022";
  return d;
}

// ── Members section builder ──────────────────────────────────────────────────

function buildMembersSection(
  details: GroupDetails,
  members: GroupMember[],
  myRole: GroupRole,
  myPlayerId: string,
  groupId: string,
  initialFilter: string,
  onFilterChange: (filter: string) => void,
  memberRefs?: Map<string, MemberRef>,
): { section: HTMLElement; keyBlockerCleanup: () => void } {
  const section = document.createElement("div");
  style(section, { flex: "1", display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" });

  const titleEl = document.createElement("div");
  style(titleEl, { fontSize: "14px", fontWeight: "700", color: "#e7eef7", paddingLeft: "4px" });
  titleEl.textContent = "Members";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search members...";
  searchInput.value = initialFilter;
  style(searchInput, {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 120ms ease",
  });
  searchInput.onfocus = () => style(searchInput, { borderColor: "rgba(94,234,212,0.4)" });
  searchInput.onblur = () => style(searchInput, { borderColor: "rgba(255,255,255,0.1)" });

  const keyBlocker = createKeyBlocker(() => document.activeElement === searchInput);
  keyBlocker.attach();

  const listContainer = document.createElement("div");
  listContainer.className = "qws-ch-scrollable";
  style(listContainer, {
    flex: "1",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingRight: "4px",
  });

  // Sort: online first, then by role (owner > admin > member)
  const sortedMembers = [...members].sort((a, b) => {
    const onlineA = a.isOnline ? 0 : 1;
    const onlineB = b.isOnline ? 0 : 1;
    if (onlineA !== onlineB) return onlineA - onlineB;
    return (ROLE_ORDER[a.role || "member"] ?? 2) - (ROLE_ORDER[b.role || "member"] ?? 2);
  });

  const renderMembers = (filter: string) => {
    listContainer.innerHTML = "";
    memberRefs?.clear();
    const query = filter.toLowerCase().trim();

    for (const member of sortedMembers) {
      if (query && !(member.name || "").toLowerCase().includes(query)) continue;
      listContainer.appendChild(buildMemberRow(member, myRole, myPlayerId, groupId, memberRefs));
    }

    if (listContainer.children.length === 0) {
      const empty = document.createElement("div");
      style(empty, { padding: "24px", textAlign: "center", color: "rgba(226,232,240,0.4)", fontSize: "12px" });
      empty.textContent = query ? "No members match your search" : "No members";
      listContainer.appendChild(empty);
    }
  };

  searchInput.oninput = () => {
    onFilterChange(searchInput.value);
    renderMembers(searchInput.value);
  };
  renderMembers(initialFilter);

  section.append(titleEl, searchInput, listContainer);
  return { section, keyBlockerCleanup: () => keyBlocker.detach() };
}

// ── Member row builder ───────────────────────────────────────────────────────

function buildMemberRow(
  member: GroupMember,
  myRole: GroupRole,
  myPlayerId: string,
  groupId: string,
  memberRefs?: Map<string, MemberRef>,
): HTMLElement {
  const row = document.createElement("div");
  style(row, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    transition: "background 120ms ease",
  });
  row.onmouseenter = () => style(row, { background: "rgba(255,255,255,0.05)" });
  row.onmouseleave = () => style(row, { background: "rgba(255,255,255,0.03)" });

  const isOnline = member.isOnline ?? false;

  // Avatar with online indicator
  const avatarWrapper = document.createElement("div");
  style(avatarWrapper, { position: "relative", flexShrink: "0" });

  const avatar = document.createElement("div");
  style(avatar, {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: member.avatarUrl
      ? `url(${member.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
  });

  const onlineDot = document.createElement("div");
  style(onlineDot, {
    position: "absolute",
    bottom: "0",
    right: "0",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: isOnline ? "#10b981" : "#6b7280",
    border: "2px solid #0f141e",
  });

  avatarWrapper.append(avatar, onlineDot);

  // Info
  const info = document.createElement("div");
  style(info, { flex: "1", display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" });

  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  nameEl.textContent = member.name || "Unknown";

  const meta = document.createElement("div");
  style(meta, {
    fontSize: "11px",
    color: isOnline ? "#5eead4" : "rgba(226,232,240,0.5)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  if (isOnline) {
    meta.appendChild(createRoomBadge(member.roomId));
  } else {
    meta.textContent = member.lastEventAt ? `Last seen ${formatRelativeTime(member.lastEventAt)}` : "";
  }

  info.append(nameEl, meta);

  // Store refs for in-place presence/room updates
  memberRefs?.set(member.playerId, { onlineDot, meta, member });

  // Role badge first (left of avatar)
  const roleBadge = createRoleBadge(member.role || "member");

  row.append(roleBadge, avatarWrapper, info);

  // Action buttons (right side)
  const isMe = member.playerId === myPlayerId;
  if (!isMe) {
    const actions = buildMemberActions(member, myRole, groupId, row, roleBadge);
    if (actions) row.appendChild(actions);
  }

  return row;
}

// ── Member action buttons ────────────────────────────────────────────────────
// Actions just call the API. The server will send SSE events which trigger
// GROUPS_REFRESH, and the view will re-fetch + rebuild automatically.

// SVG icons for member actions
const ICON_PROMOTE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`;
const ICON_DEMOTE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>`;
const ICON_KICK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`;

function buildMemberActions(
  member: GroupMember,
  myRole: GroupRole,
  groupId: string,
  row: HTMLElement,
  roleBadge: HTMLElement,
): HTMLElement | null {
  const memberRole = member.role || "member";
  const actions = document.createElement("div");
  style(actions, { display: "flex", gap: "6px", flexShrink: "0" });

  let hasButtons = false;

  if (myRole === "owner" && memberRole !== "owner") {
    const isAdmin = memberRole === "admin";
    const promoteBtn = buildIconActionBtn(
      isAdmin ? ICON_DEMOTE : ICON_PROMOTE,
      isAdmin ? "Demote to member" : "Promote to admin",
      isAdmin ? "rgba(94,234,212," : "rgba(139,92,246,",
      isAdmin ? "#5eead4" : "#a78bfa",
      async () => {
        const newRole: GroupRole = isAdmin ? "member" : "admin";
        const willBeAdmin = newRole === "admin";

        // Optimistic: swap role badge immediately
        const newBadge = createRoleBadge(newRole);
        roleBadge.replaceWith(newBadge);

        // Optimistic: swap button appearance
        const oldIcon = promoteBtn.innerHTML;
        const oldTitle = promoteBtn.title;
        const oldColorBase = isAdmin ? "rgba(94,234,212," : "rgba(139,92,246,";
        const oldIconColor = isAdmin ? "#5eead4" : "#a78bfa";
        const newColorBase = willBeAdmin ? "rgba(94,234,212," : "rgba(139,92,246,";
        const newIconColor = willBeAdmin ? "#5eead4" : "#a78bfa";

        promoteBtn.innerHTML = willBeAdmin ? ICON_DEMOTE : ICON_PROMOTE;
        promoteBtn.title = willBeAdmin ? "Demote to member" : "Promote to admin";
        style(promoteBtn, { border: `1px solid ${newColorBase}0.2)`, background: `${newColorBase}0.08)`, color: newIconColor });
        promoteBtn.onmouseenter = () => style(promoteBtn, { background: `${newColorBase}0.2)`, borderColor: `${newColorBase}0.4)`, transform: "scale(1.1)" });
        promoteBtn.onmouseleave = () => style(promoteBtn, { background: `${newColorBase}0.08)`, borderColor: `${newColorBase}0.2)`, transform: "scale(1)" });
        promoteBtn.style.pointerEvents = "none";

        const success = await changeGroupMemberRole({ groupId, memberId: member.playerId, role: newRole });
        promoteBtn.style.pointerEvents = "auto";
        if (!success) {
          // Revert badge
          newBadge.replaceWith(roleBadge);
          // Revert button
          promoteBtn.innerHTML = oldIcon;
          promoteBtn.title = oldTitle;
          style(promoteBtn, { border: `1px solid ${oldColorBase}0.2)`, background: `${oldColorBase}0.08)`, color: oldIconColor });
          promoteBtn.onmouseenter = () => style(promoteBtn, { background: `${oldColorBase}0.2)`, borderColor: `${oldColorBase}0.4)`, transform: "scale(1.1)" });
          promoteBtn.onmouseleave = () => style(promoteBtn, { background: `${oldColorBase}0.08)`, borderColor: `${oldColorBase}0.2)`, transform: "scale(1)" });
          toastSimple(`Failed to ${isAdmin ? "demote" : "promote"} member.`, "", "error");
        }
      },
    );
    actions.appendChild(promoteBtn);
    hasButtons = true;

    const kickBtn = buildIconActionBtn(ICON_KICK, "Kick from group", "rgba(239,68,68,", "#ef4444", async () => {
      // Optimistic: hide the row immediately
      row.style.display = "none";

      const success = await removeGroupMember({ groupId, memberId: member.playerId });
      if (!success) {
        // Revert: show the row again
        row.style.display = "flex";
        toastSimple("Failed to remove member.", "", "error");
      }
    });
    actions.appendChild(kickBtn);
    hasButtons = true;
  } else if (myRole === "admin" && memberRole === "member") {
    const kickBtn = buildIconActionBtn(ICON_KICK, "Kick from group", "rgba(239,68,68,", "#ef4444", async () => {
      // Optimistic: hide the row immediately
      row.style.display = "none";

      const success = await removeGroupMember({ groupId, memberId: member.playerId });
      if (!success) {
        // Revert: show the row again
        row.style.display = "flex";
        toastSimple("Failed to remove member.", "", "error");
      }
    });
    actions.appendChild(kickBtn);
    hasButtons = true;
  }

  return hasButtons ? actions : null;
}

function buildIconActionBtn(
  icon: string,
  tooltip: string,
  colorBase: string,
  iconColor: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.innerHTML = icon;
  btn.title = tooltip;
  style(btn, {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: `1px solid ${colorBase}0.2)`,
    background: `${colorBase}0.08)`,
    color: iconColor,
    cursor: "pointer",
    transition: "all 120ms ease",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
  });
  btn.onmouseenter = () =>
    style(btn, { background: `${colorBase}0.2)`, borderColor: `${colorBase}0.4)`, transform: "scale(1.1)" });
  btn.onmouseleave = () =>
    style(btn, { background: `${colorBase}0.08)`, borderColor: `${colorBase}0.2)`, transform: "scale(1)" });
  btn.onclick = onClick;
  return btn;
}


// ── Loading / Error views ────────────────────────────────────────────────────

function buildLoadingView(): HTMLElement {
  const view = document.createElement("div");
  style(view, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "rgba(226,232,240,0.7)",
    fontSize: "13px",
  });
  view.textContent = "Loading group details...";
  return view;
}

function buildErrorView(message: string, onBack: () => void): HTMLElement {
  const view = document.createElement("div");
  style(view, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "12px",
  });

  const text = document.createElement("div");
  style(text, { fontSize: "13px", color: "rgba(226,232,240,0.7)" });
  text.textContent = message;

  const backBtn = document.createElement("button");
  style(backBtn, {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(94,234,212,0.3)",
    background: "rgba(94,234,212,0.1)",
    color: "#5eead4",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  });
  backBtn.textContent = "Go Back";
  backBtn.onclick = onBack;

  view.append(text, backBtn);
  return view;
}

// ── Add Member modal ──────────────────────────────────────────────────────

function buildAddMemberModal(
  groupId: string,
  memberIds: Set<string>,
  onClose: () => void,
): { overlay: HTMLElement; cleanup: () => void } {
  const invitedIds = new Set<string>();

  // Overlay (backdrop)
  const overlay = document.createElement("div");
  style(overlay, {
    position: "absolute",
    left: "0",
    right: "0",
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "10",
    padding: "20px",
    boxSizing: "border-box",
  });
  overlay.onclick = (e: MouseEvent) => {
    if (e.target === overlay) onClose();
  };

  // Modal card
  const modal = document.createElement("div");
  style(modal, {
    width: "100%",
    maxHeight: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#1a1f2e",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "16px",
    overflow: "hidden",
  });

  // Header
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: "0",
  });

  const title = document.createElement("div");
  style(title, { fontSize: "15px", fontWeight: "700", color: "#e7eef7" });
  title.textContent = "Add Member";

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = ICON_CLOSE;
  style(closeBtn, {
    padding: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.03)",
    color: "#e7eef7",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });
  closeBtn.onmouseenter = () =>
    style(closeBtn, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.15)" });
  closeBtn.onmouseleave = () =>
    style(closeBtn, { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" });
  closeBtn.onclick = onClose;

  header.append(title, closeBtn);

  // Search
  const searchWrapper = document.createElement("div");
  style(searchWrapper, {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    flexShrink: "0",
  });

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search friends...";
  style(searchInput, {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 120ms ease",
  });
  searchInput.onfocus = () => style(searchInput, { borderColor: "rgba(94,234,212,0.4)" });
  searchInput.onblur = () => style(searchInput, { borderColor: "rgba(255,255,255,0.1)" });

  const keyBlocker = createKeyBlocker(() => document.activeElement === searchInput);
  keyBlocker.attach();

  searchWrapper.appendChild(searchInput);

  // Friends list
  const list = document.createElement("div");
  list.className = "qws-ch-scrollable";
  style(list, {
    flex: "1",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "12px 16px",
  });

  const renderFriends = (filter: string) => {
    list.innerHTML = "";
    const friends = getCachedFriendsWithViews();
    const query = filter.toLowerCase().trim();

    const filtered = friends.filter(
      (f) => !query || (f.playerName || "").toLowerCase().includes(query),
    );

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        padding: "24px",
        textAlign: "center",
        color: "rgba(226,232,240,0.4)",
        fontSize: "12px",
      });
      empty.textContent = query ? "No friends match your search" : "No friends yet";
      list.appendChild(empty);
      return;
    }

    for (const friend of filtered) {
      const isMember = memberIds.has(friend.playerId);
      const isInvited = invitedIds.has(friend.playerId);
      list.appendChild(
        buildFriendInviteRow(friend, isMember, isInvited, groupId, invitedIds, () =>
          renderFriends(searchInput.value),
        ),
      );
    }
  };

  searchInput.oninput = () => renderFriends(searchInput.value);
  renderFriends("");

  modal.append(header, searchWrapper, list);
  overlay.appendChild(modal);

  return { overlay, cleanup: () => keyBlocker.detach() };
}

function buildFriendInviteRow(
  friend: PlayerView,
  isMember: boolean,
  isInvited: boolean,
  groupId: string,
  invitedIds: Set<string>,
  reRender: () => void,
): HTMLElement {
  const row = document.createElement("div");
  style(row, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "8px",
    transition: "background 120ms ease",
  });
  row.onmouseenter = () => style(row, { background: "rgba(255,255,255,0.04)" });
  row.onmouseleave = () => style(row, { background: "transparent" });

  // Avatar with online indicator
  const avatarWrapper = document.createElement("div");
  style(avatarWrapper, { position: "relative", flexShrink: "0" });

  const avatar = document.createElement("div");
  style(avatar, {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: friend.avatarUrl
      ? `url(${friend.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "2px solid rgba(255,255,255,0.1)",
  });

  const onlineDot = document.createElement("div");
  style(onlineDot, {
    position: "absolute",
    bottom: "0",
    right: "0",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: friend.isOnline ? "#10b981" : "#6b7280",
    border: "2px solid #1a1f2e",
  });

  avatarWrapper.append(avatar, onlineDot);

  // Name
  const name = document.createElement("div");
  style(name, {
    flex: "1",
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  name.textContent = friend.playerName || "Unknown";

  row.append(avatarWrapper, name);

  // Action: In group / Invited / Invite button
  if (isMember) {
    const badge = document.createElement("div");
    style(badge, {
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "600",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(226,232,240,0.4)",
      flexShrink: "0",
    });
    badge.textContent = "In group";
    row.appendChild(badge);
  } else if (isInvited) {
    const badge = document.createElement("div");
    style(badge, {
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "600",
      background: "rgba(16,185,129,0.12)",
      color: "#10b981",
      flexShrink: "0",
    });
    badge.textContent = "Invited";
    row.appendChild(badge);
  } else {
    const btn = document.createElement("button");
    btn.textContent = "Invite";
    style(btn, {
      padding: "4px 12px",
      borderRadius: "6px",
      border: "1px solid rgba(94,234,212,0.3)",
      background: "rgba(94,234,212,0.1)",
      color: "#5eead4",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 120ms ease",
      flexShrink: "0",
    });
    btn.onmouseenter = () =>
      style(btn, { background: "rgba(94,234,212,0.2)", borderColor: "rgba(94,234,212,0.5)" });
    btn.onmouseleave = () =>
      style(btn, { background: "rgba(94,234,212,0.1)", borderColor: "rgba(94,234,212,0.3)" });
    btn.onclick = async () => {
      // Optimistic: mark as invited immediately
      invitedIds.add(friend.playerId);
      reRender();

      // Call API in background
      const success = await addGroupMember({ groupId, memberId: friend.playerId });
      if (!success) {
        // Revert on failure
        invitedIds.delete(friend.playerId);
        reRender();
        toastSimple("Failed to invite member", "", "error");
      }
    };
    row.appendChild(btn);
  }

  return row;
}
