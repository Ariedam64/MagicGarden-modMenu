import { getCachedMyProfile, updateCachedMyProfilePrivacy } from "../../../../ariesModAPI/cache/welcome";
import { onWelcome, updatePrivacy } from "../../../../ariesModAPI";
import type { PlayerPrivacyPayload } from "../../../../ariesModAPI/types";
import { createAvatarElement } from "./playerAvatar";
import { style, createPlayerBadges } from "../shared";

const ICON_GLOBE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="currentColor" stroke-width="2"/></svg>`;
const ICON_LOCK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from "../notificationSound";

export function createMyProfileTab() {
  const container = document.createElement("div");
  style(container, {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    height: "100%",
    overflow: "auto",
  });

  // Header section with avatar and player info
  const createProfileHeader = async () => {
    const myProfile = getCachedMyProfile();
    if (!myProfile) {
      const placeholder = document.createElement("div");
      style(placeholder, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      placeholder.textContent = "Profile not loaded yet...";
      return placeholder;
    }

    const header = document.createElement("div");
    style(header, {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
    });

    // Top row: Discord avatar + Info + Game avatar
    const topRow = document.createElement("div");
    style(topRow, {
      display: "flex",
      gap: "12px",
      alignItems: "center",
    });

    // Discord avatar
    const discordAvatar = document.createElement("div");
    style(discordAvatar, {
      width: "64px",
      height: "64px",
      borderRadius: "50%",
      background: myProfile.avatarUrl
        ? `url(${myProfile.avatarUrl}) center/cover`
        : "rgba(255,255,255,0.05)",
      flexShrink: "0",
    });

    // Info column (name + player ID)
    const infoColumn = document.createElement("div");
    style(infoColumn, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      flex: "1",
    });

    const nameRow = document.createElement("div");
    style(nameRow, { display: "flex", alignItems: "center", gap: "8px" });

    const name = document.createElement("div");
    style(name, {
      fontSize: "18px",
      fontWeight: "700",
      color: "#e7eef7",
    });
    name.textContent = myProfile.name;

    nameRow.appendChild(name);
    const badgesEl = createPlayerBadges(myProfile.badges);
    if (badgesEl) {
      style(badgesEl, { flexShrink: "0" });
      nameRow.appendChild(badgesEl);
    }

    const playerId = document.createElement("div");
    style(playerId, {
      fontSize: "11px",
      color: "rgba(226,232,240,0.4)",
      fontFamily: "monospace",
    });
    playerId.textContent = myProfile.playerId;

    infoColumn.append(nameRow, playerId);
    topRow.append(discordAvatar, infoColumn);

    // Game avatar (cosmetics) - if available
    if (myProfile.avatar && Array.isArray(myProfile.avatar) && myProfile.avatar.length > 0) {
      try {
        const gameAvatar = await createAvatarElement(myProfile.avatar, 110);
        const avatarWrapper = document.createElement("div");
        Object.assign(avatarWrapper.style, {
          width: "80px",
          height: "80px",
          overflow: "hidden",
          position: "relative",
          flexShrink: "0",
          borderRadius: "12px",
        });

        Object.assign(gameAvatar.style, {
          position: "absolute",
          top: "62%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        });

        avatarWrapper.appendChild(gameAvatar);
        topRow.appendChild(avatarWrapper);
      } catch (error) {
        console.error("[MyProfile] Failed to create game avatar:", error);
      }
    }

    header.appendChild(topRow);
    return header;
  };

  // Notifications settings section
  const createNotificationsSection = () => {
    const section = document.createElement("div");
    style(section, {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
    });

    // Section title
    const title = document.createElement("div");
    style(title, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#e7eef7",
    });
    title.textContent = "Notifications";

    // Description
    const description = document.createElement("div");
    style(description, {
      fontSize: "12px",
      color: "rgba(226,232,240,0.6)",
      lineHeight: "1.5",
    });
    description.textContent =
      "Configure how you receive notifications when new messages or friend requests arrive.";

    // Settings list
    const settingsList = document.createElement("div");
    style(settingsList, {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    });

    // Notification sound toggle
    const soundRow = createNotificationSoundSetting();
    settingsList.appendChild(soundRow);

    section.append(title, description, settingsList);
    return section;
  };

  // Create notification sound setting row
  const createNotificationSoundSetting = () => {
    const row = document.createElement("div");
    style(row, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      transition: "all 120ms ease",
    });

    row.onmouseenter = () => {
      style(row, {
        background: "rgba(255,255,255,0.04)",
        borderColor: "rgba(94,234,212,0.15)",
      });
    };

    row.onmouseleave = () => {
      style(row, {
        background: "rgba(255,255,255,0.02)",
        borderColor: "rgba(255,255,255,0.06)",
      });
    };

    const labelEl = document.createElement("div");
    style(labelEl, {
      flex: "1",
      fontSize: "13px",
      fontWeight: "600",
      color: "#e7eef7",
    });
    labelEl.textContent = "Notification Sound";

    // Toggle switch
    const toggle = createToggleSwitch(isNotificationSoundEnabled(), (newValue) => {
      setNotificationSoundEnabled(newValue);
    });

    row.append(labelEl, toggle);
    return row;
  };

  // Privacy settings section
  const createPrivacySection = () => {
    const myProfile = getCachedMyProfile();
    if (!myProfile) return document.createElement("div");

    const section = document.createElement("div");
    style(section, {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
    });

    // Section title
    const title = document.createElement("div");
    style(title, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#e7eef7",
    });
    title.textContent = "Privacy Settings";

    // Description
    const description = document.createElement("div");
    style(description, {
      fontSize: "12px",
      color: "rgba(226,232,240,0.6)",
      lineHeight: "1.5",
    });
    description.textContent =
      "Control what your friends can see on your profile and whether you appear in public leaderboards.";

    // Privacy settings list
    const settingsList = document.createElement("div");
    style(settingsList, {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    });

    // Room Visibility uses a dedicated Public/Private segmented control
    settingsList.appendChild(createRoomVisibilitySetting(myProfile.privacy.hideRoomFromPublicList as boolean));

    const privacySettings = [
      { key: "showGarden", label: "Garden" },
      { key: "showInventory", label: "Inventory" },
      { key: "showCoins", label: "Coins" },
      { key: "showActivityLog", label: "Activity Log" },
      { key: "showJournal", label: "Journal" },
      { key: "showStats", label: "Stats" },
    ];

    for (const setting of privacySettings) {
      const settingRow = createPrivacySetting(
        setting.label,
        myProfile.privacy[setting.key as keyof typeof myProfile.privacy] as boolean,
        setting.key
      );
      settingsList.appendChild(settingRow);
    }

    section.append(title, description, settingsList);
    return section;
  };

  // Create a single privacy setting row with toggle
  const createPrivacySetting = (
    label: string,
    initialValue: boolean,
    key: string
  ) => {
    const row = document.createElement("div");
    style(row, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      transition: "all 120ms ease",
    });

    row.onmouseenter = () => {
      style(row, {
        background: "rgba(255,255,255,0.04)",
        borderColor: "rgba(94,234,212,0.15)",
      });
    };

    row.onmouseleave = () => {
      style(row, {
        background: "rgba(255,255,255,0.02)",
        borderColor: "rgba(255,255,255,0.06)",
      });
    };

    const labelEl = document.createElement("div");
    style(labelEl, {
      flex: "1",
      fontSize: "13px",
      fontWeight: "600",
      color: "#e7eef7",
    });
    labelEl.textContent = label;

    // Toggle switch
    const toggle = createToggleSwitch(initialValue, async (newValue) => {
      const result = await updatePrivacy({
        [key]: newValue,
      } as Partial<PlayerPrivacyPayload>);
      if (result) {
        updateCachedMyProfilePrivacy(result);
      }
    });

    row.append(labelEl, toggle);
    return row;
  };

  // Create toggle switch component
  const createToggleSwitch = (initialValue: boolean, onChange: (value: boolean) => void) => {
    let isOn = initialValue;

    const container = document.createElement("div");
    style(container, {
      position: "relative",
      width: "44px",
      height: "24px",
      borderRadius: "12px",
      background: isOn ? "rgba(94,234,212,0.3)" : "rgba(255,255,255,0.1)",
      border: isOn ? "1px solid rgba(94,234,212,0.5)" : "1px solid rgba(255,255,255,0.15)",
      cursor: "pointer",
      transition: "all 200ms ease",
      flexShrink: "0",
    });

    const knob = document.createElement("div");
    style(knob, {
      position: "absolute",
      top: "2px",
      left: isOn ? "22px" : "2px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      background: isOn ? "#5eead4" : "rgba(255,255,255,0.6)",
      transition: "all 200ms ease",
    });

    container.appendChild(knob);

    const updateVisuals = () => {
      style(container, {
        background: isOn ? "rgba(94,234,212,0.3)" : "rgba(255,255,255,0.1)",
        borderColor: isOn ? "rgba(94,234,212,0.5)" : "rgba(255,255,255,0.15)",
      });
      style(knob, {
        left: isOn ? "22px" : "2px",
        background: isOn ? "#5eead4" : "rgba(255,255,255,0.6)",
      });
    };

    container.onclick = () => {
      isOn = !isOn;
      updateVisuals();
      onChange(isOn);
    };

    return container;
  };

  // Room Visibility segmented control (Public / Private)
  // hideRoomFromPublicList = true → Private, false → Public
  const createRoomVisibilitySetting = (initialIsHidden: boolean) => {
    const row = document.createElement("div");
    style(row, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      transition: "all 120ms ease",
    });

    row.onmouseenter = () => style(row, { background: "rgba(255,255,255,0.04)", borderColor: "rgba(94,234,212,0.15)" });
    row.onmouseleave = () => style(row, { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" });

    const labelEl = document.createElement("div");
    style(labelEl, { flex: "1", fontSize: "13px", fontWeight: "600", color: "#e7eef7" });
    labelEl.textContent = "Room Visibility";

    // Segmented control
    const toggle = document.createElement("div");
    style(toggle, {
      display: "flex",
      borderRadius: "6px",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.1)",
      flexShrink: "0",
    });

    const publicBtn = document.createElement("button");
    const privateBtn = document.createElement("button");

    const ACTIVE = { background: "rgba(94,234,212,0.15)", color: "#5eead4" };
    const INACTIVE = { background: "rgba(255,255,255,0.02)", color: "rgba(226,232,240,0.4)" };

    const applyStyles = (isHidden: boolean) => {
      style(publicBtn, isHidden ? INACTIVE : ACTIVE);
      style(privateBtn, isHidden ? ACTIVE : INACTIVE);
    };

    const BASE_BTN: Partial<CSSStyleDeclaration> = {
      padding: "5px 10px",
      border: "none",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 120ms ease",
      display: "flex",
      alignItems: "center",
    };

    publicBtn.innerHTML = `${ICON_GLOBE}Public`;
    style(publicBtn, BASE_BTN);

    privateBtn.innerHTML = `${ICON_LOCK}Private`;
    style(privateBtn, { ...BASE_BTN, borderLeft: "1px solid rgba(255,255,255,0.1)" });

    let currentIsHidden = initialIsHidden;
    applyStyles(currentIsHidden);

    publicBtn.onclick = async () => {
      if (!currentIsHidden) return;
      currentIsHidden = false;
      applyStyles(false);
      const result = await updatePrivacy({ hideRoomFromPublicList: false } as Partial<PlayerPrivacyPayload>);
      if (result) { updateCachedMyProfilePrivacy(result); } else { currentIsHidden = true; applyStyles(true); }
    };

    privateBtn.onclick = async () => {
      if (currentIsHidden) return;
      currentIsHidden = true;
      applyStyles(true);
      const result = await updatePrivacy({ hideRoomFromPublicList: true } as Partial<PlayerPrivacyPayload>);
      if (result) { updateCachedMyProfilePrivacy(result); } else { currentIsHidden = false; applyStyles(false); }
    };

    toggle.append(publicBtn, privateBtn);
    row.append(labelEl, toggle);
    return row;
  };

  // Initial render
  let renderCount = 0;
  const render = async () => {
    renderCount++;
    console.log(`[MyProfile] render() called (count: ${renderCount})`);
    container.innerHTML = "";
    const header = await createProfileHeader();
    const notificationsSection = createNotificationsSection();
    const privacySection = createPrivacySection();
    container.append(header, notificationsSection, privacySection);
  };

  // Initial render to show placeholder or data
  const cacheExistedBeforeSubscribe = !!getCachedMyProfile();
  render();

  // Listen for welcome event updates
  let isFirstCall = true;
  const unsubscribeWelcome = onWelcome(() => {
    if (isFirstCall && cacheExistedBeforeSubscribe) {
      // Skip only the immediate synchronous callback from onWelcome() when cache
      // already existed before we subscribed (initial render already shows the data)
      isFirstCall = false;
      return;
    }
    isFirstCall = false;
    render();
  });

  return {
    id: "myProfile" as const,
    root: container,
    show: () => style(container, { display: "flex" }),
    hide: () => style(container, { display: "none" }),
    destroy: () => {
      unsubscribeWelcome();
      container.remove();
    },
  };
}
