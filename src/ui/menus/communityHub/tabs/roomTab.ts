import { fetchAvailableRooms, getCachedPublicRooms, onWelcome } from "../../../../ariesModAPI";
import type { Room } from "../../../../ariesModAPI";
import { style, ensureSharedStyles, formatTimestamp } from "../shared";

export function createRoomTab() {
  ensureSharedStyles();

  const root = document.createElement("div");
  style(root, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "12px",
  });

  // Top controls (filter select + refresh button)
  const controlsContainer = document.createElement("div");
  style(controlsContainer, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  });

  // Filter select
  const filterSelect = document.createElement("select");
  filterSelect.innerHTML = `
    <option value="5">5 Players</option>
    <option value="4">4 Players</option>
    <option value="3-1">3-1 Players</option>
    <option value="all">All Rooms</option>
  `;
  style(filterSelect, {
    flex: "1",
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
    transition: "border-color 150ms ease",
  });

  // Refresh button
  const refreshButton = document.createElement("button");
  refreshButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  `;
  style(refreshButton, {
    padding: "10px 16px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(94,234,212,0.12)",
    color: "#5eead4",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });

  refreshButton.onmouseenter = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.2)",
      borderColor: "rgba(94,234,212,0.35)",
    });
  };

  refreshButton.onmouseleave = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.12)",
      borderColor: "rgba(255,255,255,0.12)",
    });
  };

  controlsContainer.append(filterSelect, refreshButton);

  // State variables
  let allRooms: Room[] = [];
  let isLoading = false;
  let lastRefreshTime: Date | null = null;
  let hasLoadedInitial = false;

  // Helper: Truncate long room IDs
  const truncateRoomId = (roomId: string): string => {
    if (roomId.length <= 30) return roomId;
    return roomId.substring(0, 27) + "...";
  };

  // Footer with last refresh timestamp
  const footer = document.createElement("div");
  style(footer, {
    padding: "8px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    fontSize: "11px",
    color: "rgba(226,232,240,0.4)",
    textAlign: "center",
  });

  const updateFooterTimestamp = () => {
    if (lastRefreshTime) {
      footer.textContent = formatTimestamp(lastRefreshTime);
    } else {
      footer.textContent = "—";
    }
  };

  updateFooterTimestamp();

  // Rooms list container
  const roomsList = document.createElement("div");
  roomsList.className = "qws-ch-scrollable";
  style(roomsList, {
    flex: "1",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    paddingRight: "8px",
  });

  // Filter rooms based on player count
  const filterRooms = (rooms: Room[], filter: string): Room[] => {
    if (filter === "all") return rooms;

    if (filter === "5") {
      return rooms.filter(r => r.playersCount === 5);
    }
    if (filter === "4") {
      return rooms.filter(r => r.playersCount === 4);
    }
    if (filter === "3-1") {
      return rooms.filter(r => r.playersCount >= 1 && r.playersCount <= 3);
    }

    return rooms;
  };

  // Render rooms list
  const renderRooms = (rooms: Room[]) => {
    roomsList.innerHTML = "";

    if (isLoading) {
      const loading = document.createElement("div");
      style(loading, {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "12px",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      loading.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(94,234,212,0.5)" stroke-width="2" stroke-dasharray="15 5" fill="none"/>
        </svg>
        <div>Loading rooms...</div>
      `;
      roomsList.appendChild(loading);
      return;
    }

    if (rooms.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      empty.textContent = "No rooms found";
      roomsList.appendChild(empty);
      return;
    }

    for (const room of rooms) {
      roomsList.appendChild(createRoomCard(room));
    }
  };

  // Create a room card
  const createRoomCard = (room: Room): HTMLElement => {
    const card = document.createElement("div");
    style(card, {
      padding: "12px",
      background: "rgba(255,255,255,0.02)",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      transition: "all 120ms ease",
    });

    card.onmouseenter = () => {
      style(card, {
        background: "rgba(255,255,255,0.04)",
        borderColor: "rgba(94,234,212,0.15)",
      });
    };

    card.onmouseleave = () => {
      style(card, {
        background: "rgba(255,255,255,0.02)",
        borderColor: "rgba(255,255,255,0.06)",
      });
    };

    // Wrapper for room info + avatars
    const leftWrapper = document.createElement("div");
    style(leftWrapper, {
      display: "flex",
      gap: "8px",
      flex: "1",
      alignItems: "center",
    });

    // Room ID
    const roomId = document.createElement("div");
    style(roomId, {
      fontSize: "12px",
      fontWeight: "600",
      color: "#e7eef7",
      whiteSpace: "nowrap",
    });
    roomId.textContent = truncateRoomId(room.id);
    roomId.title = room.id; // Full ID on hover

    // Avatars container
    const avatarsContainer = document.createElement("div");
    style(avatarsContainer, {
      display: "flex",
      gap: "4px",
      flex: "1",
    });

    // Create avatar slots (max 6)
    const maxSlots = 6;
    const userSlots = room.userSlots || [];
    for (let i = 0; i < maxSlots; i++) {
      const avatarSlot = document.createElement("div");
      const slotData = userSlots[i] as any;

      // Accept both avatarUrl (camelCase from API) and avatar_url (snake_case from welcome event)
      const avatarUrl = slotData?.avatarUrl || slotData?.avatar_url;

      if (slotData && avatarUrl) {
        // Player present with avatar
        style(avatarSlot, {
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: `url(${avatarUrl}) center/cover`,
          border: "2px solid rgba(94,234,212,0.3)",
          flexShrink: "0",
        });
        avatarSlot.title = slotData.name || "Player";
      } else if (i < room.playersCount) {
        // Player present but no avatar data
        style(avatarSlot, {
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(94,234,212,0.2), rgba(59,130,246,0.2))",
          border: "2px solid rgba(94,234,212,0.3)",
          flexShrink: "0",
        });
      } else {
        // Empty slot
        style(avatarSlot, {
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.03)",
          border: "2px dashed rgba(255,255,255,0.1)",
          flexShrink: "0",
        });
      }

      avatarsContainer.appendChild(avatarSlot);
    }

    leftWrapper.append(roomId, avatarsContainer);

    // Counter
    const counter = document.createElement("div");
    style(counter, {
      fontSize: "11px",
      color: "rgba(226,232,240,0.5)",
      fontWeight: "500",
      whiteSpace: "nowrap",
      minWidth: "40px",
      textAlign: "right",
    });
    counter.textContent = `${room.playersCount}/6`;

    // Join button
    const joinButton = document.createElement("button");
    const isFull = room.playersCount >= 6;
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

      joinButton.onclick = (e) => {
        e.stopPropagation();
        window.location.href = `https://magicgarden.gg/r/${room.id}`;
      };
    }

    card.append(leftWrapper, counter, joinButton);
    return card;
  };

  // Load rooms from API or cache
  const loadRooms = async (forceRefresh = false) => {
    isLoading = true;
    renderRooms([]);

    try {
      let rooms: Room[];

      // On initial load (not force refresh), try to use cached rooms from welcome event
      if (!forceRefresh) {
        const cachedRooms = getCachedPublicRooms();
        if (cachedRooms && cachedRooms.length > 0) {
          rooms = cachedRooms;
        } else {
          rooms = await fetchAvailableRooms(500);
        }
      } else {
        // Force refresh always fetches from API
        rooms = await fetchAvailableRooms(500);
      }

      allRooms = rooms;

      // Apply current filter
      const filter = filterSelect.value;
      const filtered = filterRooms(rooms, filter);

      isLoading = false;

      // Update last refresh timestamp
      lastRefreshTime = new Date();
      updateFooterTimestamp();

      renderRooms(filtered);
    } catch (error) {
      console.error("[Rooms] Failed to load rooms:", error);
      isLoading = false;
      renderRooms([]);
    }
  };

  // Refresh button click (force refresh from API)
  refreshButton.onclick = () => {
    loadRooms(true);
  };

  // Filter select change
  filterSelect.onchange = () => {
    const filter = filterSelect.value;
    const filtered = filterRooms(allRooms, filter);
    renderRooms(filtered);
  };

  // Subscribe to welcome event for initial rooms load
  const unsubscribeWelcome = onWelcome((data) => {
    // Only use welcome data for initial load (not for refreshes)
    if (!hasLoadedInitial && data.publicRooms && data.publicRooms.length > 0) {
      hasLoadedInitial = true;

      allRooms = data.publicRooms;
      const filter = filterSelect.value;
      const filtered = filterRooms(data.publicRooms, filter);

      lastRefreshTime = new Date();
      updateFooterTimestamp();

      renderRooms(filtered);
    } else if (!hasLoadedInitial) {
      // No public rooms in welcome, fetch from API
      hasLoadedInitial = true;
      loadRooms(false);
    }
  });

  root.append(controlsContainer, roomsList, footer);

  return {
    id: "room" as const,
    root,
    show: () => style(root, { display: "flex" }),
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      unsubscribeWelcome();
      root.remove();
    },
  };
}
