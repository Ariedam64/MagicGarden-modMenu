import type { PlayerView } from "../../../../ariesModAPI";
import { removeFriend, fetchPlayerDetailsComplete } from "../../../../ariesModAPI";
import {
  viewGarden,
  viewInventory,
  viewStats,
  viewActivityLog,
  viewJournal,
} from "./playerViewActions";
import { createAvatarElement } from "./playerAvatar";
import { style, ensureSharedStyles, CH_EVENTS } from "../shared";
import { formatPrice } from "../../../../utils/format";

type PlayerDetailViewOptions = {
  player: PlayerView;
  onBack: () => void | Promise<void>;
};

const displayNumber = (n: number): string => formatPrice(n) ?? String(n);

export async function createPlayerDetailView(options: PlayerDetailViewOptions): Promise<HTMLElement> {
  const { player, onBack } = options;
  ensureSharedStyles();

  const container = document.createElement("div");
  container.className = "qws-ch-scrollable";
  style(container, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    gap: "16px",
    paddingRight: "8px",
    paddingBottom: "16px",
  });

  // Header with back button
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  });

  const backButton = document.createElement("button");
  backButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display: block;">
      <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  style(backButton, {
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

  backButton.onmouseenter = () => {
    style(backButton, {
      background: "rgba(255,255,255,0.06)",
      borderColor: "rgba(94,234,212,0.25)",
    });
  };

  backButton.onmouseleave = () => {
    style(backButton, {
      background: "rgba(255,255,255,0.03)",
      borderColor: "rgba(255,255,255,0.08)",
    });
  };

  backButton.onclick = onBack;

  const headerTitle = document.createElement("div");
  style(headerTitle, {
    fontSize: "16px",
    fontWeight: "700",
    color: "#e7eef7",
    flex: "1",
  });
  headerTitle.textContent = "Player Details";

  // Chat button
  const chatButton = document.createElement("button");
  chatButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display: block;">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  style(chatButton, {
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

  chatButton.onmouseenter = () => {
    style(chatButton, {
      background: "rgba(94,234,212,0.2)",
      borderColor: "rgba(94,234,212,0.35)",
    });
  };

  chatButton.onmouseleave = () => {
    style(chatButton, {
      background: "rgba(94,234,212,0.12)",
      borderColor: "rgba(255,255,255,0.08)",
    });
  };

  chatButton.onclick = () => {
    // Dispatch event to open friend chat
    window.dispatchEvent(
      new CustomEvent(CH_EVENTS.OPEN_FRIEND_CHAT, {
        detail: { playerId: player.playerId },
      })
    );
  };

  // Remove friend button (icon)
  const removeButton = document.createElement("button");
  removeButton.title = "Remove Friend";
  removeButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display: block;">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="17" y1="11" x2="23" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
  style(removeButton, {
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

  removeButton.onmouseenter = () => {
    style(removeButton, {
      background: "rgba(239,68,68,0.18)",
      borderColor: "rgba(239,68,68,0.4)",
    });
  };

  removeButton.onmouseleave = () => {
    style(removeButton, {
      background: "rgba(239,68,68,0.08)",
      borderColor: "rgba(239,68,68,0.2)",
    });
  };

  removeButton.onclick = async () => {
    onBack();
    await removeFriend(player.playerId);
  };

  header.append(backButton, headerTitle, chatButton, removeButton);

  // Player info section (await for avatar to load)
  let playerInfo = await createPlayerInfoSection(player);

  // Action buttons section
  let currentActionsSection = createActionsSection(player);

  // Stats and buttons section
  let statsSection = createStatsSection(player);

  container.append(header, playerInfo, currentActionsSection, statsSection);

  // Re-fetch and re-render sections when privacy or room changes for this player.
  // Debounced because backend sends privacy_updated + room_changed back-to-back.
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleRefetch = () => {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(async () => {
      if (!container.isConnected) return;

      const fresh = await fetchPlayerDetailsComplete(player.playerId);
      if (!fresh || !container.isConnected) return;

      // Re-create sections with fresh data
      const newPlayerInfo = await createPlayerInfoSection(fresh);
      const newActionsSection = createActionsSection(fresh);
      const newStatsSection = createStatsSection(fresh);

      playerInfo.replaceWith(newPlayerInfo);
      currentActionsSection.replaceWith(newActionsSection);
      statsSection.replaceWith(newStatsSection);

      playerInfo = newPlayerInfo;
      currentActionsSection = newActionsSection;
      statsSection = newStatsSection;
    }, 300);
  };

  const handlePlayerEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail || detail.playerId !== player.playerId) return;

    if (!container.isConnected) {
      window.removeEventListener(CH_EVENTS.PRIVACY_UPDATED, handlePlayerEvent);
      window.removeEventListener(CH_EVENTS.ROOM_CHANGED, handlePlayerEvent);
      if (refetchTimer) clearTimeout(refetchTimer);
      return;
    }

    scheduleRefetch();
  };

  window.addEventListener(CH_EVENTS.PRIVACY_UPDATED, handlePlayerEvent);
  window.addEventListener(CH_EVENTS.ROOM_CHANGED, handlePlayerEvent);

  return container;
}

async function createPlayerInfoSection(player: PlayerView): Promise<HTMLElement> {
  const section = document.createElement("div");
  style(section, {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
  });

  // Avatar and basic info
  const topRow = document.createElement("div");
  style(topRow, {
    display: "flex",
    gap: "16px",
    alignItems: "center",
  });

  const avatar = document.createElement("div");
  style(avatar, {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    background: player.avatarUrl
      ? `url(${player.avatarUrl}) center/cover`
      : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
    border: "3px solid rgba(255,255,255,0.1)",
    flexShrink: "0",
  });

  const infoColumn = document.createElement("div");
  style(infoColumn, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: "1",
  });

  const name = document.createElement("div");
  style(name, {
    fontSize: "20px",
    fontWeight: "700",
    color: "#e7eef7",
  });
  name.textContent = player.playerName || "Unknown Player";

  const playerId = document.createElement("div");
  style(playerId, {
    fontSize: "12px",
    color: "rgba(226,232,240,0.5)",
    fontFamily: "monospace",
  });
  playerId.textContent = `ID: ${player.playerId}`;

  const statusRow = document.createElement("div");
  style(statusRow, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  const statusIndicator = document.createElement("div");
  style(statusIndicator, {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: player.isOnline ? "#10b981" : "#ef4444",
    boxShadow: player.isOnline ? "0 0 8px rgba(16,185,129,0.6)" : "0 0 6px rgba(239,68,68,0.4)",
  });

  const statusText = document.createElement("div");
  style(statusText, {
    fontSize: "13px",
    color: player.isOnline ? "#5eead4" : "rgba(226,232,240,0.5)",
    fontWeight: "500",
  });
  statusText.textContent = player.isOnline ? "Online" : "Offline";

  statusRow.append(statusIndicator, statusText);
  infoColumn.append(name, playerId, statusRow);
  topRow.append(avatar, infoColumn);

  // Add game avatar (cosmetics) if available - WAIT for it to load
  const playerData = player as any;

  // Cosmetics are in player.avatar directly
  if (playerData.avatar && Array.isArray(playerData.avatar) && playerData.avatar.length > 0) {
    const cosmetics = playerData.avatar;

    try {
      // Wait for avatar to load completely before adding to page
      const gameAvatar = await createAvatarElement(cosmetics, 110);

      // Create wrapper only after avatar is ready
      const avatarWrapper = document.createElement("div");
      Object.assign(avatarWrapper.style, {
        width: "80px",
        height: "80px",
        overflow: "hidden",
        position: "relative",
        flexShrink: "0",
        borderRadius: "12px",
      });

      // Centrer l'avatar plus grand dans le wrapper (décalé vers le bas)
      Object.assign(gameAvatar.style, {
        position: "absolute",
        top: "62%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });

      avatarWrapper.appendChild(gameAvatar);
      topRow.appendChild(avatarWrapper);
    } catch (error) {
      console.error("[PlayerDetailView] Failed to create game avatar:", error);
      // Show error placeholder on failure
      const avatarWrapper = document.createElement("div");
      Object.assign(avatarWrapper.style, {
        width: "80px",
        height: "80px",
        overflow: "hidden",
        position: "relative",
        flexShrink: "0",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });
      const errorText = document.createElement("div");
      errorText.textContent = "?";
      errorText.style.color = "rgba(255,255,255,0.3)";
      errorText.style.fontSize = "12px";
      avatarWrapper.appendChild(errorText);
      topRow.appendChild(avatarWrapper);
    }
  } else {
    console.warn("[PlayerDetailView] No cosmetics found for player");
  }

  section.appendChild(topRow);

  // Inline info row: Coins | Mod Version
  const hasCoins = player.coins !== null && player.coins !== undefined;
  const hasMod = player.hasModInstalled && player.modVersion;

  if (hasCoins || hasMod) {
    const infoRow = document.createElement("div");
    style(infoRow, {
      display: "flex",
      alignItems: "center",
      gap: "0",
      padding: "8px 12px",
      background: "rgba(255,255,255,0.02)",
      borderRadius: "8px",
    });

    if (hasCoins) {
      infoRow.appendChild(createInfoCell("Coins", displayNumber(player.coins!)));
    }
    if (hasCoins && hasMod) {
      infoRow.appendChild(createInfoSeparator());
    }
    if (hasMod) {
      infoRow.appendChild(createInfoCell("Mod Version", player.modVersion!));
    }

    section.appendChild(infoRow);
  }

  // Room info (below)
  if (player.room && typeof player.room === "object" && "id" in player.room) {
    const roomInfo = player.room as any;
    const playersCount = Number(roomInfo.players_count) || 0;
    const maxPlayers = 6;
    section.appendChild(createRoomSection(roomInfo.id, playersCount, maxPlayers, roomInfo.user_slots || []));
  } else if (player.room && typeof player.room === "string") {
    const roomRow = createInfoRow("Room", player.room);
    section.appendChild(roomRow);
  }

  return section;
}

function createInfoCell(label: string, value: string): HTMLElement {
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

function createInfoSeparator(): HTMLElement {
  const sep = document.createElement("div");
  style(sep, { width: "1px", height: "28px", background: "rgba(255,255,255,0.08)", flexShrink: "0" });
  return sep;
}

function createInfoRow(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  style(row, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "8px",
  });

  const labelEl = document.createElement("div");
  style(labelEl, {
    fontSize: "12px",
    color: "rgba(226,232,240,0.6)",
    fontWeight: "500",
  });
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.setAttribute("data-value", "true");
  style(valueEl, {
    fontSize: "13px",
    color: "#e7eef7",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
  });
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function createRoomSection(roomId: string, playersCount: number, maxPlayers: number, players: any[]): HTMLElement {
  const section = document.createElement("div");
  style(section, {
    padding: "14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  });

  // Room name
  const roomName = document.createElement("div");
  style(roomName, {
    fontSize: "14px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "120px",
    flexShrink: "1",
  });
  roomName.textContent = roomId;
  roomName.title = roomId; // Show full ID on hover

  // Avatar container
  const avatarsContainer = document.createElement("div");
  style(avatarsContainer, {
    display: "flex",
    gap: "4px",
    flex: "1",
  });

  // Create avatar slots (always show 6 slots)
  for (let i = 0; i < maxPlayers; i++) {
    const avatarSlot = document.createElement("div");
    const playerData = players[i];

    if (playerData && playerData.avatar_url) {
      // Player present with avatar
      style(avatarSlot, {
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        background: `url(${playerData.avatar_url}) center/cover`,
        border: "2px solid rgba(94,234,212,0.3)",
        flexShrink: "0",
      });
    } else if (i < playersCount) {
      // Player present but no avatar data
      style(avatarSlot, {
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        background: "linear-gradient(135deg, rgba(94,234,212,0.2), rgba(59,130,246,0.2))",
        border: "2px solid rgba(94,234,212,0.3)",
        flexShrink: "0",
      });
    } else {
      // Empty slot
      style(avatarSlot, {
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.03)",
        border: "2px dashed rgba(255,255,255,0.1)",
        flexShrink: "0",
      });
    }

    avatarsContainer.appendChild(avatarSlot);
  }

  // Counter (more discrete)
  const counter = document.createElement("div");
  style(counter, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.4)",
    fontWeight: "500",
    whiteSpace: "nowrap",
    flexShrink: "0",
  });
  counter.textContent = `${playersCount}/${maxPlayers}`;

  // Join button
  const joinButton = document.createElement("button");
  const isFull = playersCount >= maxPlayers;
  joinButton.textContent = isFull ? "Full" : "Join";
  joinButton.disabled = isFull;

  style(joinButton, {
    padding: "6px 14px",
    border: isFull ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(94,234,212,0.3)",
    borderRadius: "6px",
    background: isFull ? "rgba(255,255,255,0.03)" : "rgba(94,234,212,0.1)",
    color: isFull ? "rgba(226,232,240,0.4)" : "#5eead4",
    fontSize: "12px",
    fontWeight: "600",
    cursor: isFull ? "not-allowed" : "pointer",
    transition: "all 120ms ease",
    flexShrink: "0",
    opacity: isFull ? "0.5" : "1",
  });

  if (!isFull) {
    joinButton.onmouseenter = () => {
      style(joinButton, {
        background: "rgba(94,234,212,0.2)",
        borderColor: "rgba(94,234,212,0.5)",
      });
    };

    joinButton.onmouseleave = () => {
      style(joinButton, {
        background: "rgba(94,234,212,0.1)",
        borderColor: "rgba(94,234,212,0.3)",
      });
    };

    joinButton.onclick = () => {
      // TODO: Implement join room logic
    };
  }

  section.append(roomName, avatarsContainer, counter, joinButton);

  return section;
}

function createStatsSection(player: PlayerView): HTMLElement {
  const section = document.createElement("div");
  style(section, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  });

  const title = document.createElement("div");
  style(title, {
    fontSize: "14px",
    fontWeight: "700",
    color: "#e7eef7",
    paddingLeft: "4px",
  });
  title.textContent = "Leaderboard";

  section.appendChild(title);

  const leaderboard = player.leaderboard as any;
  if (!leaderboard) {
    const emptyState = document.createElement("div");
    style(emptyState, {
      padding: "24px",
      textAlign: "center",
      color: "rgba(226,232,240,0.5)",
      fontSize: "13px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.02)",
    });
    emptyState.textContent = "No leaderboard data available";
    section.appendChild(emptyState);
    return section;
  }

  const statsGrid = document.createElement("div");
  style(statsGrid, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  });

  // Coins leaderboard
  if (leaderboard.coins && leaderboard.coins.rank !== null) {
    const coinsTotal = leaderboard.coins.total ? displayNumber(leaderboard.coins.total) : "";
    statsGrid.appendChild(
      createStatCard("Coins Rank", `#${leaderboard.coins.rank}`, coinsTotal, leaderboard.coins.rankChange ?? null)
    );
  }

  // Eggs hatched leaderboard
  if (leaderboard.eggsHatched && leaderboard.eggsHatched.rank !== null) {
    const eggsTotal = leaderboard.eggsHatched.total ? displayNumber(leaderboard.eggsHatched.total) : "";
    statsGrid.appendChild(
      createStatCard("Eggs Rank", `#${leaderboard.eggsHatched.rank}`, eggsTotal, leaderboard.eggsHatched.rankChange ?? null)
    );
  }

  if (statsGrid.children.length > 0) {
    section.appendChild(statsGrid);
  } else {
    const emptyState = document.createElement("div");
    style(emptyState, {
      padding: "24px",
      textAlign: "center",
      color: "rgba(226,232,240,0.5)",
      fontSize: "13px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.02)",
    });
    emptyState.textContent = "No leaderboard data available";
    section.appendChild(emptyState);
  }

  return section;
}

function createStatCard(label: string, rank: string, total: string, rankChange: number | null = null): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    padding: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });

  const labelEl = document.createElement("div");
  style(labelEl, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.6)",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  labelEl.textContent = label;

  const valueRow = document.createElement("div");
  style(valueRow, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "8px",
  });

  // Left side: rank with optional rankChange indicator
  const leftSide = document.createElement("div");
  style(leftSide, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  // RankChange indicator (if present and not 0)
  if (rankChange !== null && rankChange !== 0) {
    const rankChangeIndicator = document.createElement("div");
    style(rankChangeIndicator, {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      fontSize: "11px",
      fontWeight: "700",
      flexShrink: "0",
      lineHeight: "1",
    });

    if (rankChange > 0) {
      rankChangeIndicator.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; transform: translateY(-1px);">
          <path d="M8 3L8 13M8 3L4 7M8 3L12 7" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="color: #10b981; line-height: 1;">${rankChange}</span>
      `;
    } else {
      rankChangeIndicator.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; transform: translateY(-1px);">
          <path d="M8 13L8 3M8 13L12 9M8 13L4 9" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="color: #ef4444; line-height: 1;">${Math.abs(rankChange)}</span>
      `;
    }
    leftSide.appendChild(rankChangeIndicator);
  }

  const rankEl = document.createElement("div");
  style(rankEl, {
    fontSize: "20px",
    fontWeight: "700",
    color: "#5eead4",
  });
  rankEl.textContent = rank;

  leftSide.appendChild(rankEl);

  const totalEl = document.createElement("div");
  style(totalEl, {
    fontSize: "12px",
    color: "rgba(226,232,240,0.5)",
    fontWeight: "500",
  });
  totalEl.textContent = total;

  valueRow.append(leftSide, totalEl);
  card.append(labelEl, valueRow);
  return card;
}

function createActionsSection(player: PlayerView): HTMLElement {
  const section = document.createElement("div");
  style(section, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  });

  const title = document.createElement("div");
  style(title, {
    fontSize: "14px",
    fontWeight: "700",
    color: "#e7eef7",
    paddingLeft: "4px",
  });
  title.textContent = "View";

  section.appendChild(title);

  const privacy = player.privacy;
  const state = player.state as any;

  const buttonsGrid = document.createElement("div");
  style(buttonsGrid, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  });

  const actionIcons: Record<string, string> = {
    garden: `<svg width="16" height="16" viewBox="0 -0.5 17 17" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: middle;">
      <path d="M14.779,12.18 L11.795,8.501 C11.795,8.501 13.396,8.937 13.57,8.937 C14.035,8.937 13.765,8.42 13.57,8.223 L11.185,5.192 C11.185,5.192 12.333,4.918 12.75,4.918 C13.168,4.918 12.947,4.401 12.75,4.204 L9.4,0.061 C9.203,-0.136 8.883,-0.136 8.686,0.061 L5.291,4.161 C5.093,4.358 4.805,4.876 5.291,4.876 C5.777,4.876 6.913,5.192 6.913,5.192 L4.325,8.079 C4.127,8.276 3.768,8.793 4.325,8.793 C4.644,8.793 6.275,8.502 6.275,8.502 L3.317,12.189 C3.12,12.385 2.76,12.903 3.317,12.903 C3.874,12.903 8.008,11.896 8.008,11.896 L8.008,14.941 C8.008,15.478 8.444,15.914 8.983,15.914 C9.52,15.914 9.998,15.478 9.998,14.941 L9.998,11.896 C9.998,11.896 14.373,12.895 14.778,12.895 C15.183,12.895 14.976,12.376 14.779,12.18 L14.779,12.18 Z" fill="currentColor" opacity="0.8"/>
    </svg>`,
    inventory: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: middle;">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>`,
    stats: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: middle;">
      <path d="M3 13h4v8H3v-8zm6-8h4v16h-4V5zm6 4h4v12h-4V9z" fill="currentColor" opacity="0.7"/>
    </svg>`,
    activityLog: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: middle;">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
      <path d="M12 6v6l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    journal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: middle;">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" fill="currentColor"/>
      <path d="M7 10h10M7 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
    </svg>`,
  };

  const actions = [
    { key: "garden", label: "Garden", available: privacy?.showGarden && state?.garden },
    { key: "inventory", label: "Inventory", available: privacy?.showInventory && state?.inventory },
    { key: "stats", label: "Stats", available: privacy?.showStats && state?.stats },
    { key: "activityLog", label: "Activity", available: privacy?.showActivityLog && state?.activityLog },
    { key: "journal", label: "Journal", available: privacy?.showJournal && state?.journal },
  ];

  for (const action of actions) {
    if (!action.available) continue;

    const button = document.createElement("button");
    button.innerHTML = actionIcons[action.key] + action.label;
    style(button, {
      padding: "12px 16px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.03)",
      color: "#e7eef7",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 120ms ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });

    button.onmouseenter = () => {
      style(button, {
        background: "rgba(94,234,212,0.1)",
        borderColor: "rgba(94,234,212,0.3)",
        color: "#5eead4",
      });
    };

    button.onmouseleave = () => {
      style(button, {
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.08)",
        color: "#e7eef7",
      });
    };

    button.onclick = async () => {
      // Disable button and show loading state
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px; vertical-align: middle;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="15 5" fill="none"/>
      </svg>Loading...`;
      style(button, {
        opacity: "0.6",
        cursor: "not-allowed",
      });

      try {
        switch (action.key) {
          case "garden":
            await viewGarden(player);
            break;
          case "inventory":
            await viewInventory(player);
            break;
          case "stats":
            await viewStats(player);
            break;
          case "activityLog":
            await viewActivityLog(player);
            break;
          case "journal":
            await viewJournal(player);
            break;
          default:
            console.warn(`[PlayerDetail] Unknown action: ${action.key}`);
        }
        // Re-enable button after success (in case user comes back from preview)
        button.disabled = false;
        button.innerHTML = originalText;
        style(button, {
          opacity: "1",
          cursor: "pointer",
        });
      } catch (error) {
        console.error(`[PlayerDetail] Error viewing ${action.key}:`, error);
        // Re-enable button on error
        button.disabled = false;
        button.innerHTML = originalText;
        style(button, {
          opacity: "1",
          cursor: "pointer",
        });
      }
    };

    buttonsGrid.appendChild(button);
  }

  if (buttonsGrid.children.length > 0) {
    section.appendChild(buttonsGrid);
  } else {
    const emptyState = document.createElement("div");
    style(emptyState, {
      padding: "24px",
      textAlign: "center",
      color: "rgba(226,232,240,0.5)",
      fontSize: "13px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.02)",
    });
    emptyState.textContent = "No sections available to view";
    section.appendChild(emptyState);
  }

  return section;
}

