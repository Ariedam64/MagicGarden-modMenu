import {
  getFriendSettings,
  onFriendSettingsChange,
  patchFriendSettings,
  type FriendSettings,
} from "../../../../utils/friendSettings";
import { player, playerDatabaseUserId } from "../../../../store/atoms";
import { createCard, createToggle, getToggleInput } from "../ui";

type SettingsTabHandle = {
  root: HTMLDivElement;
  destroy: () => void;
};

export function createSettingsTab(): SettingsTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-tab qws-fo-tab-settings";

  const settings = getFriendSettings();
  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";
  layout.style.height = "100%";
  layout.style.minHeight = "0";
  layout.style.overflowY = "auto";
  layout.style.paddingRight = "4px";
  layout.style.flex = "1";

  const profileCard = createCard("My profile");
  profileCard.body.style.display = "flex";
  profileCard.body.style.alignItems = "center";
  profileCard.body.style.gap = "12px";

  const avatarWrapper = document.createElement("div");
  avatarWrapper.style.width = "54px";
  avatarWrapper.style.height = "54px";
  avatarWrapper.style.borderRadius = "14px";
  avatarWrapper.style.background = "rgba(255, 255, 255, 0.05)";
  avatarWrapper.style.display = "flex";
  avatarWrapper.style.alignItems = "center";
  avatarWrapper.style.justifyContent = "center";
  avatarWrapper.style.overflow = "hidden";
  avatarWrapper.style.border = "1px solid rgba(255, 255, 255, 0.08)";

  const avatarImg = document.createElement("img");
  avatarImg.alt = "Player avatar";
  avatarImg.style.width = "100%";
  avatarImg.style.height = "100%";
  avatarImg.style.objectFit = "cover";
  avatarImg.style.display = "none";

  const avatarFallback = document.createElement("span");
  avatarFallback.style.fontSize = "18px";
  avatarFallback.style.fontWeight = "700";
  avatarFallback.style.color = "#f8fafc";
  avatarFallback.style.display = "block";
  avatarWrapper.append(avatarImg, avatarFallback);

  const profileText = document.createElement("div");
  profileText.style.display = "grid";
  profileText.style.gap = "4px";
  profileText.style.minWidth = "0";

  const profileNameLabel = document.createElement("div");
  profileNameLabel.textContent = "Loading profile...";
  profileNameLabel.style.fontSize = "14px";
  profileNameLabel.style.fontWeight = "700";
  profileNameLabel.style.whiteSpace = "nowrap";
  profileNameLabel.style.overflow = "hidden";
  profileNameLabel.style.textOverflow = "ellipsis";

  const profileIdLabel = document.createElement("div");
  profileIdLabel.textContent = "Loading player ID...";
  profileIdLabel.style.fontSize = "12px";
  profileIdLabel.style.opacity = "0.75";

  profileText.append(profileNameLabel, profileIdLabel);
  profileCard.body.append(avatarWrapper, profileText);

  const globalCard = createCard("Global settings");
  globalCard.body.style.display = "grid";
  globalCard.body.style.gap = "12px";

  const privacyCard = createCard("Privacy");
  privacyCard.body.style.display = "grid";
  privacyCard.body.style.gap = "12px";

  const applyPatch = (patch: Partial<FriendSettings>) => patchFriendSettings(patch);

  const buildToggleRow = (
    label: string,
    checked: boolean,
    description: string | undefined,
    onToggle: (next: boolean) => void,
  ) => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "12px";

    const text = document.createElement("div");
    text.style.display = "grid";
    text.style.gap = "2px";

    const labelEl = document.createElement("div");
    labelEl.textContent = label;
    labelEl.style.fontWeight = "600";
    labelEl.style.fontSize = "13px";

    if (description) {
      const descriptionEl = document.createElement("div");
      descriptionEl.textContent = description;
      descriptionEl.style.fontSize = "12px";
      descriptionEl.style.opacity = "0.7";
      text.append(labelEl, descriptionEl);
    } else {
      text.append(labelEl);
    }

    const toggle = createToggle(checked);
    const input = getToggleInput(toggle);
    if (input) {
      input.addEventListener("input", () => {
        onToggle(input.checked);
      });
    }

    row.append(text, toggle);
    return row;
  };

  globalCard.body.append(
    buildToggleRow(
      "Show online friends only",
      settings.showOnlineFriendsOnly,
      undefined,
      (next) => applyPatch({ showOnlineFriendsOnly: next }),
    ),
    buildToggleRow(
      "Make my room private",
      settings.hideRoomFromPublicList,
      "Prevents friends from joining and hides your room from the public list.",
      (next) => applyPatch({ hideRoomFromPublicList: next }),
    ),
    buildToggleRow(
      "Message notification sound",
      settings.messageSoundEnabled,
      "Plays a sound when you receive a new message.",
      (next) => applyPatch({ messageSoundEnabled: next }),
    ),
    buildToggleRow(
      "Friend request notification sound",
      settings.friendRequestSoundEnabled,
      "Plays a sound when you receive a friend request.",
      (next) => applyPatch({ friendRequestSoundEnabled: next }),
    ),
  );

  privacyCard.body.append(
    buildToggleRow(
      "Friends can view my garden",
      settings.showGarden,
      undefined,
      (next) => applyPatch({ showGarden: next }),
    ),
    buildToggleRow(
      "Friends can view my inventory",
      settings.showInventory,
      undefined,
      (next) => applyPatch({ showInventory: next }),
    ),
    buildToggleRow(
      "Friends can see my coins",
      settings.showCoins,
      undefined,
      (next) => applyPatch({ showCoins: next }),
    ),
    buildToggleRow(
      "Friends can see my activity log",
      settings.showActivityLog,
      undefined,
      (next) => applyPatch({ showActivityLog: next }),
    ),
    buildToggleRow(
      "Friends can view my journal",
      settings.showJournal,
      undefined,
      (next) => applyPatch({ showJournal: next }),
    ),
    buildToggleRow(
      "Friends can see my stats",
      settings.showStats,
      undefined,
      (next) => applyPatch({ showStats: next }),
    ),
  );

  layout.append(profileCard.root, globalCard.root, privacyCard.root);
  root.appendChild(layout);

  const updateProfileInfo = async () => {
    const [resolved, playerInfo] = await Promise.all([
      playerDatabaseUserId.get(),
      player.get(),
    ]);
    const displayName = (playerInfo?.name ?? "").trim();
    profileNameLabel.textContent = displayName || "Your profile";
    profileIdLabel.textContent = resolved
      ? `Player ID: ${resolved}`
      : "Player ID unavailable.";

    const avatarUrl = (playerInfo?.discordAvatarUrl ?? "").trim();
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "";
      avatarFallback.style.display = "none";
    } else {
      avatarImg.src = "";
      avatarImg.style.display = "none";
      const fallbackLabel = (displayName || resolved || "P").trim();
      avatarFallback.textContent = fallbackLabel
        ? fallbackLabel.charAt(0).toUpperCase()
        : "P";
      avatarFallback.style.display = "";
    }
  };

  void updateProfileInfo();

  let unsubscribePlayerId: (() => void) | null = null;
  let unsubscribePlayer: (() => void) | null = null;

  playerDatabaseUserId
    .onChangeNow(() => {
      void updateProfileInfo();
    })
    .then((unsub) => {
      unsubscribePlayerId = unsub;
    })
    .catch(() => {});

  player
    .onChangeNow(() => {
      void updateProfileInfo();
    })
    .then((unsub) => {
      unsubscribePlayer = unsub;
    })
    .catch(() => {});

  const unsubscribeSettings = onFriendSettingsChange(() => {
    // UI will re-render next time tab is opened; settings updates are
    // propagated through the store already, so no need for extra work here.
  });

  return {
    root,
    destroy: () => {
      unsubscribeSettings();
      try {
        unsubscribePlayerId?.();
      } catch {}
      try {
        unsubscribePlayer?.();
      } catch {}
    },
  };
}
