import { fetchAvailableRooms, setImageSafe, type Room as SupabaseRoom } from "../../../../utils/supabase";
import { RoomService } from "../../../../services/room";
import { createButton, setButtonEnabled } from "../ui";

type RoomTabHandle = {
  root: HTMLDivElement;
  show: () => void;
  hide: () => void;
  refresh: () => void;
  destroy: () => void;
};

type RoomListEntry = {
  id: string;
  category: "Discord" | "Web";
  players: number;
  capacity: number;
  isFull: boolean;
  lastUpdatedAt: number;
  userSlots: Array<{ name: string; avatarUrl: string | null }>;
};

const ROOM_CAPACITY = 6;
// Discord room IDs follow the shape `I-<19 digits>-<type>-<18+ digits>[-<18+ digits>]`.
const DISCORD_ROOM_ID_REGEX = /^I-\d{17,19}-[A-Z]{2,3}-\d{17,19}(?:-\d{17,19})?$/i;

const getRoomCategory = (roomId: string): RoomListEntry["category"] =>
  DISCORD_ROOM_ID_REGEX.test(roomId) ? "Discord" : "Web";

const normalizeRooms = (rooms: SupabaseRoom[]): RoomListEntry[] => {
  const now = Date.now();
  return rooms
    .filter((room) => !room.isPrivate && Boolean(room.id))
    .map((room) => {
      const rawCount = Number.isFinite(room.playersCount) ? Math.floor(room.playersCount) : 0;
      const players = Math.max(0, Math.min(ROOM_CAPACITY, rawCount));
      const timestamp = Number.isFinite(Date.parse(room.lastUpdatedAt))
        ? Date.parse(room.lastUpdatedAt)
        : now;
      return {
        id: room.id,
        category: getRoomCategory(room.id),
        players,
        capacity: ROOM_CAPACITY,
        isFull: players >= ROOM_CAPACITY,
        lastUpdatedAt: timestamp,
        userSlots: Array.isArray(room.userSlots) ? room.userSlots.map((slot) => ({
          name: slot.name,
          avatarUrl: slot.avatarUrl ?? null,
        })) : [],
      };
    })
    .sort((a, b) => {
      const priority = (room: RoomListEntry) => {
        if (room.players === 5) return 0;
        if (room.players === 6) return 1;
        if (room.players === 4) return 2;
        if (room.players === 3) return 3;
        if (room.players === 2) return 4;
        if (room.players === 1) return 5;
        return 6;
      };
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      if (b.players !== a.players) return b.players - a.players;
      return b.lastUpdatedAt - a.lastUpdatedAt;
    });
};

const createAvatar = (slot: { name: string; avatarUrl: string | null } | null) => {
  const avatar = document.createElement("div");
  avatar.className = "qws-fo-room-avatar";
  if (!slot) {
    avatar.classList.add("is-empty");
    avatar.textContent = "";
    return avatar;
  }

  const label = slot.name?.trim() || "?";
  avatar.title = slot.name?.trim() || "Unknown player";

  if (slot.avatarUrl) {
    const img = document.createElement("img");
    img.alt = label;
    img.decoding = "async";
    setImageSafe(img, slot.avatarUrl);
    avatar.appendChild(img);
  } else {
    avatar.textContent = label.slice(0, 1).toUpperCase();
  }
  return avatar;
};

const formatRefreshLabel = (date: Date | null) => {
  if (!date) return "Last refresh: —";
  return `Last refresh: ${date.toLocaleString()}`;
};

export function createRoomTab(): RoomTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-tab qws-fo-tab-room";

  const layout = document.createElement("div");
  layout.className = "qws-fo-room";

  const shell = document.createElement("div");
  shell.className = "qws-fo-room-shell";

  const body = document.createElement("div");
  body.className = "qws-fo-room-body";

  const panel = document.createElement("div");
  panel.className = "qws-fo-room-panel active";

  const header = document.createElement("div");
  header.className = "qws-fo-room-header";
  const headerTitle = document.createElement("div");
  headerTitle.className = "qws-fo-room-header-title";
  headerTitle.textContent = "Public rooms";
  const headerControls = document.createElement("div");
  headerControls.className = "qws-fo-room-header-controls";

  const filterWrap = document.createElement("div");
  filterWrap.className = "qws-fo-room-filter";
  const filterLabel = document.createElement("span");
  filterLabel.textContent = "Players";
  const filterSelect = document.createElement("select");
  filterSelect.className = "qws-fo-room-select";

  const filterOptions: Array<{ value: string; label: string }> = [
    { value: "5", label: "5 players" },
    { value: "4", label: "4 players" },
    { value: "3-1", label: "3-1 players" },
    { value: "all", label: "All" },
  ];

  filterOptions.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    filterSelect.appendChild(option);
  });

  filterWrap.append(filterLabel, filterSelect);

  const refreshBtn = createButton("Refresh", { size: "sm", variant: "ghost", icon: "🔄" });
  refreshBtn.classList.add("qws-fo-room-refresh");

  headerControls.append(filterWrap, refreshBtn);
  header.append(headerTitle, headerControls);

  const discordNotice = document.createElement("div");
  discordNotice.className = "qws-fo-room-alert";
  discordNotice.textContent =
    "You are using Discord: joining rooms is disabled. Open the website to join.";

  const listWrap = document.createElement("div");
  listWrap.className = "qws-fo-room-list";
  const list = document.createElement("div");
  list.className = "qws-fo-room-list-inner";
  listWrap.appendChild(list);

  const footer = document.createElement("div");
  footer.className = "qws-fo-room-footer";
  const footerLeft = document.createElement("span");
  footerLeft.textContent = "powered by aries mod";
  const footerRight = document.createElement("span");
  footerRight.textContent = formatRefreshLabel(null);
  footer.append(footerLeft, footerRight);

  panel.append(header);
  if (RoomService.isDiscordActivity()) {
    panel.appendChild(discordNotice);
  }
  panel.append(listWrap, footer);

  body.appendChild(panel);
  shell.append(body);
  layout.appendChild(shell);
  root.appendChild(layout);

  let destroyed = false;
  let requestCounter = 0;
  let isRefreshing = false;
  let currentRooms: RoomListEntry[] = [];
  filterSelect.value = "5";
  let selectedFilter: string = filterSelect.value;
  let lastRefresh: Date | null = null;

  const setListMessage = (message: string) => {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "qws-fo-room-empty";
    empty.textContent = message;
    list.appendChild(empty);
  };

  const updateFooter = () => {
    footerRight.textContent = formatRefreshLabel(lastRefresh);
  };

  const renderRooms = () => {
    list.innerHTML = "";
    const visible = currentRooms.filter((room) => {
      switch (selectedFilter) {
        case "5":
          return room.players === 5;
        case "4":
          return room.players === 4;
        case "3-1":
          return room.players >= 1 && room.players <= 3;
        case "all":
        default:
          return true;
      }
    });

    if (!visible.length) {
      setListMessage(currentRooms.length
        ? "No rooms match this filter."
        : "No public rooms available.");
      return;
    }

    const isDiscord = RoomService.isDiscordActivity();

    for (const room of visible) {
      const card = document.createElement("div");
      card.className = "qws-fo-room-card";

      const badge = document.createElement("span");
      badge.className = "qws-fo-room-badge";
      badge.classList.add(room.category === "Discord" ? "is-discord" : "is-web");
      badge.textContent = room.category;

      const id = document.createElement("div");
      id.className = "qws-fo-room-id";
      id.textContent = room.id;
      id.title = room.id;

      const avatars = document.createElement("div");
      avatars.className = "qws-fo-room-avatars";
      const slots = room.userSlots.slice(0, ROOM_CAPACITY);
      for (const slot of slots) {
        avatars.appendChild(createAvatar(slot));
      }
      for (let i = slots.length; i < ROOM_CAPACITY; i++) {
        avatars.appendChild(createAvatar(null));
      }

      const count = document.createElement("div");
      count.className = "qws-fo-room-count";
      count.textContent = `${room.players}/${room.capacity}`;

      const joinBtn = createButton("Join", { size: "sm", variant: "primary" });
      joinBtn.classList.add("qws-fo-room-join");
      const canJoin = !isDiscord && !room.isFull;
      setButtonEnabled(joinBtn, canJoin);
      joinBtn.title = canJoin
        ? "Join room"
        : isDiscord
          ? "Joining rooms is disabled on Discord"
          : room.isFull
            ? "Room is full"
            : "Unable to join this room";
      joinBtn.addEventListener("click", () => {
        if (!canJoin) return;
        RoomService.joinPublicRoom({ idRoom: room.id });
      });

      const actions = document.createElement("div");
      actions.className = "qws-fo-room-actions";
      actions.append(count, joinBtn);

      card.append(badge, id, avatars, actions);
      list.appendChild(card);
    }
  };

  const updateRefreshState = () => {
    const enabled = !destroyed && !isRefreshing;
    setButtonEnabled(refreshBtn, enabled);
    refreshBtn.setAttribute("aria-busy", isRefreshing ? "true" : "false");
  };

  const refreshRooms = async () => {
    if (destroyed) return;
    const reqId = ++requestCounter;
    isRefreshing = true;
    updateRefreshState();
    setListMessage("Loading rooms...");

    try {
      const rooms = await fetchAvailableRooms(100);
      if (destroyed || reqId !== requestCounter) return;
      currentRooms = normalizeRooms(rooms);
      lastRefresh = new Date();
      updateFooter();
      renderRooms();
    } catch (error) {
      if (destroyed || reqId !== requestCounter) return;
      setListMessage(`Failed to load rooms: ${String((error as Error)?.message || error)}`);
    } finally {
      if (reqId === requestCounter) {
        isRefreshing = false;
        updateRefreshState();
      }
    }
  };

  filterSelect.addEventListener("change", () => {
    selectedFilter = filterSelect.value;
    renderRooms();
  });

  refreshBtn.addEventListener("click", () => {
    void refreshRooms();
  });

  updateRefreshState();
  setListMessage("Loading rooms...");

  return {
    root,
    show: () => {
      void refreshRooms();
    },
    hide: () => {},
    refresh: () => {
      void refreshRooms();
    },
    destroy: () => {
      destroyed = true;
    },
  };
}
