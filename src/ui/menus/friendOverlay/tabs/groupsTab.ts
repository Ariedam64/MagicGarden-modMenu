import { MessagesOverlay } from "../../messagesOverlay";
import { playerDatabaseUserId } from "../../../../store/atoms";
import {
  createGroup,
  deleteGroup,
  fetchGroupDetails,
  leaveGroup,
  removeGroupMember,
  setImageSafe,
  updateGroupName,
  type GroupDetails,
  type GroupMember,
} from "../../../../utils/supabase";
import { MGAssets } from "../../../../utils/mgAssets";
import { toastSimple } from "../../../../ui/toast";
import { createButton, createInput, setButtonEnabled } from "../ui";

const GROUPS_REFRESH_EVENT = "qws-groups-refresh";

type GroupsTabHandle = {
  root: HTMLDivElement;
  show: () => void;
  hide: () => void;
  refresh: () => void;
  destroy: () => void;
};

const resolveOwnerId = (details: GroupDetails) => {
  const group = (details.group ?? details) as any;
  return group?.ownerId ?? group?.owner_id ?? null;
};

const resolveCreatedAt = (details: GroupDetails) => {
  const group = (details.group ?? details) as any;
  return group?.createdAt ?? group?.created_at ?? null;
};

const resolveGroupName = (details: GroupDetails) => {
  const group = (details.group ?? details) as any;
  return group?.name ?? group?.group_name ?? "Untitled group";
};

const resolveMembers = (details: GroupDetails): GroupMember[] => {
  const members = (details.members ??
    (details as any).groupMembers ??
    (details as any).membersList ??
    []) as GroupMember[];
  return Array.isArray(members) ? members : [];
};

let cosmeticBaseUrl: string | null = null;
let cosmeticBasePromise: Promise<string> | null = null;

const normalizeCosmeticName = (raw: string): string | null => {
  const source = String(raw ?? "").trim();
  if (!source) return null;
  let value = source;
  const lower = value.toLowerCase();
  const idx = lower.lastIndexOf("cosmetic/");
  if (idx >= 0) {
    value = value.slice(idx + "cosmetic/".length);
  }
  value = value.replace(/^\/+/, "");
  const q = value.indexOf("?");
  if (q >= 0) value = value.slice(0, q);
  const h = value.indexOf("#");
  if (h >= 0) value = value.slice(0, h);
  return value.trim() ? value.trim() : null;
};

const ensureCosmeticBase = (): Promise<string | null> => {
  if (cosmeticBaseUrl) return Promise.resolve(cosmeticBaseUrl);
  if (cosmeticBasePromise) return cosmeticBasePromise.catch(() => null);
  cosmeticBasePromise = MGAssets.base()
    .then((base) => {
      cosmeticBaseUrl = base;
      cosmeticBasePromise = null;
      return base;
    })
    .catch(() => {
      cosmeticBasePromise = null;
      return null;
    });
  return cosmeticBasePromise;
};

const buildCosmeticUrl = (name: string): string | null => {
  if (!cosmeticBaseUrl) return null;
  const normalized = normalizeCosmeticName(name);
  if (!normalized) return null;
  const base = cosmeticBaseUrl.replace(/\/?$/, "/");
  return `${base}cosmetic/${normalized}`;
};

const applyCosmeticImg = (img: HTMLImageElement, name: string) => {
  const url = buildCosmeticUrl(name);
  if (url) {
    setImageSafe(img, url);
  } else {
    img.dataset.cosmetic = name;
  }
};

const populateCosmeticImages = (root: HTMLElement) => {
  if (!cosmeticBaseUrl) return;
  const imgs = root.querySelectorAll<HTMLImageElement>("img[data-cosmetic]");
  imgs.forEach((img) => {
    const name = img.dataset.cosmetic;
    if (!name) return;
    const url = buildCosmeticUrl(name);
    if (!url) return;
    setImageSafe(img, url);
    img.removeAttribute("data-cosmetic");
  });
};

export function createGroupsTab(options?: {
  onUnreadChange?: (total: number) => void;
}): GroupsTabHandle {
  const root = document.createElement("div");
  root.className = "qws-fo-groups-tab";

  const notifyGroupsRefresh = () => {
    try {
      window.dispatchEvent(new CustomEvent(GROUPS_REFRESH_EVENT));
    } catch {}
  };

  let currentGroupId: string | null = null;
  let myId: string | null = null;
  let unsubPlayer: (() => void) | null = null;
  let createOpen = false;
  let createValue = "";
  let creating = false;

  const overlay = new MessagesOverlay({
    embedded: true,
    mode: "group",
    title: "Groups",
    onUnreadChange: options?.onUnreadChange,
    onListHeadRender: (list) => {
      const head = document.createElement("div");
      head.className = "qws-msg-list-head";
      const title = document.createElement("div");
      title.className = "qws-msg-list-title";
      title.textContent = "Groups";
      const newBtn = document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "qws-msg-list-new";
      newBtn.textContent = "New";
      newBtn.disabled = creating;
      newBtn.addEventListener("click", () => {
        createOpen = !createOpen;
        overlay.rerenderList();
      });
      head.append(title, newBtn);
      list.appendChild(head);

      const form = document.createElement("div");
      form.className = "qws-msg-list-create";
      form.style.display = createOpen ? "flex" : "none";
      const row = document.createElement("div");
      row.className = "qws-msg-list-create-row";
      const field = document.createElement("div");
      field.className = "qws-msg-list-create-field";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "qws-msg-list-input";
      input.placeholder = "Group name...";
      input.maxLength = 32;
      input.value = createValue;
      input.addEventListener("input", () => {
        createValue = input.value;
        const enabled = createValue.trim().length > 0 && !creating;
        createBtn.disabled = !enabled;
      });

      field.appendChild(input);

      const actions = document.createElement("div");
      actions.className = "qws-msg-list-create-actions";
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "qws-msg-list-action qws-msg-list-action-primary";
      createBtn.textContent = creating ? "Creating..." : "Create";
      createBtn.disabled = createValue.trim().length === 0 || creating;
      createBtn.addEventListener("click", async () => {
        const name = createValue.trim();
        if (!name) return;
        const playerId = myId ?? await playerDatabaseUserId.get();
        if (!playerId) return;
        creating = true;
        createBtn.textContent = "Creating...";
        createBtn.disabled = true;
        try {
          const group = await createGroup({ ownerId: playerId, name });
          if (!group) {
            await toastSimple("Groups", "Unable to create group.", "error");
            return;
          }
          createValue = "";
          createOpen = false;
          overlay.refresh();
          notifyGroupsRefresh();
        } finally {
          creating = false;
          overlay.rerenderList();
        }
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "qws-msg-list-action qws-msg-list-action-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        createOpen = false;
        overlay.rerenderList();
      });

      actions.append(createBtn, cancelBtn);
      row.append(field, actions);

      const hint = document.createElement("div");
      hint.className = "qws-msg-list-create-hint";
      hint.textContent = "Pick a short name (3-32 characters).";

      form.append(row, hint);
      list.appendChild(form);

      if (createOpen) {
        requestAnimationFrame(() => {
          input.focus();
        });
      }
    },
    onThreadHeadRender: (head, selectedId) => {
      currentGroupId = selectedId;
      const existing = head.querySelector(".qws-msg-thread-actions");
      if (existing) existing.remove();
      if (!selectedId) return;
      const actions = document.createElement("div");
      actions.className = "qws-msg-thread-actions";
      const infoBtn = document.createElement("button");
      infoBtn.type = "button";
      infoBtn.className = "qws-msg-thread-action-btn";
      infoBtn.textContent = "Info";
      infoBtn.disabled = !selectedId;
      infoBtn.addEventListener("click", () => {
        if (!selectedId) return;
        void openDetails(selectedId);
      });
      actions.appendChild(infoBtn);
      head.appendChild(actions);
    },
  });

  overlay.mount(root);
  void overlay.init();

  const modal = document.createElement("div");
  modal.className = "qws-fo-group-modal";
  modal.style.display = "none";

  const card = document.createElement("div");
  card.className = "qws-fo-group-modal-card";

  const modalHead = document.createElement("div");
  modalHead.className = "qws-fo-group-modal-head";
  const modalTitle = document.createElement("div");
  modalTitle.className = "qws-fo-group-modal-title";
  modalTitle.textContent = "Group info";
  const closeBtn = createButton("Close", { size: "sm", variant: "ghost" });
  modalHead.append(modalTitle, closeBtn);

  const modalBody = document.createElement("div");
  modalBody.className = "qws-fo-group-details";

  card.append(modalHead, modalBody);
  modal.appendChild(card);
  root.appendChild(modal);

  const closeModal = () => {
    modal.style.display = "none";
    modalTitle.textContent = "Group info";
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  closeBtn.addEventListener("click", closeModal);

  const renderDetails = (details: GroupDetails, playerId: string) => {
    modalBody.innerHTML = "";
    const ownerId = resolveOwnerId(details);
    const createdAt = resolveCreatedAt(details);
    const groupName = resolveGroupName(details);
    const members = resolveMembers(details);
    modalTitle.textContent = `Group info - ${groupName}`;

    const ownerName = members.find((m) => m.playerId === ownerId)?.name ?? ownerId ?? "Unknown";
    const createdText = createdAt ? new Date(createdAt).toLocaleString() : "Unknown";

    const hero = document.createElement("div");
    hero.className = "qws-fo-group-hero";
    const heroTitle = document.createElement("div");
    heroTitle.className = "qws-fo-group-hero-title";
    heroTitle.textContent = groupName;
    const heroMeta = document.createElement("div");
    heroMeta.className = "qws-fo-group-hero-meta";

    const metaMembers = document.createElement("span");
    metaMembers.className = "qws-fo-group-chip";
    metaMembers.textContent = `${members.length}/12 members`;
    const metaOwner = document.createElement("span");
    metaOwner.className = "qws-fo-group-chip";
    metaOwner.textContent = `Owner: ${ownerName}`;
    const metaCreated = document.createElement("span");
    metaCreated.className = "qws-fo-group-chip";
    metaCreated.textContent = `Created: ${createdText}`;

    heroMeta.append(metaMembers, metaOwner, metaCreated);
    hero.append(heroTitle, heroMeta);

    modalBody.append(hero);

    const isOwner = Boolean(ownerId && playerId && ownerId === playerId);
    if (isOwner && currentGroupId) {
      const manageSection = document.createElement("div");
      manageSection.className = "qws-fo-group-section";
      const manageTitle = document.createElement("div");
      manageTitle.className = "qws-fo-group-section-title";
      manageTitle.textContent = "Manage";

      const editWrap = document.createElement("div");
      editWrap.className = "qws-fo-group-manage-row";
      const editInput = createInput("Rename group...", groupName);
      editInput.classList.add("qws-fo-group-input");
      const saveBtn = createButton("Save", { size: "sm", variant: "primary" });
      editWrap.append(editInput, saveBtn);

      const deleteWrap = document.createElement("div");
      deleteWrap.className = "qws-fo-group-manage-row";
      const deleteHint = document.createElement("div");
      deleteHint.className = "qws-fo-group-danger-hint";
      deleteHint.textContent = "Delete the group permanently.";
      const deleteBtn = createButton("Delete group", { size: "sm", variant: "danger" });
      deleteWrap.append(deleteHint, deleteBtn);

      manageSection.append(manageTitle, editWrap, deleteWrap);
      modalBody.appendChild(manageSection);

      saveBtn.addEventListener("click", async () => {
        const nextName = editInput.value.trim();
        if (!nextName || !currentGroupId) return;
        setButtonEnabled(saveBtn, false);
        try {
          const ok = await updateGroupName({
            groupId: currentGroupId,
            playerId,
            name: nextName,
          });
          if (!ok) {
            await toastSimple("Groups", "Unable to rename group.", "error");
            return;
          }
          overlay.refresh();
          notifyGroupsRefresh();
          void openDetails(currentGroupId);
        } finally {
          setButtonEnabled(saveBtn, true);
        }
      });

      deleteBtn.addEventListener("click", async () => {
        if (!currentGroupId) return;
        setButtonEnabled(deleteBtn, false);
        try {
          const ok = await deleteGroup({ groupId: currentGroupId, playerId });
          if (!ok) {
            await toastSimple("Groups", "Unable to delete group.", "error");
            return;
          }
          closeModal();
          currentGroupId = null;
          overlay.refresh();
          notifyGroupsRefresh();
        } finally {
          setButtonEnabled(deleteBtn, true);
        }
      });
    } else if (currentGroupId) {
      const leaveSection = document.createElement("div");
      leaveSection.className = "qws-fo-group-section";
      const leaveTitle = document.createElement("div");
      leaveTitle.className = "qws-fo-group-section-title";
      leaveTitle.textContent = "Membership";
      const leaveRow = document.createElement("div");
      leaveRow.className = "qws-fo-group-manage-row";
      const leaveHint = document.createElement("div");
      leaveHint.className = "qws-fo-group-danger-hint";
      leaveHint.textContent = "Leave this group and stop receiving messages.";
      const leaveBtn = createButton("Leave", { size: "sm", variant: "danger" });
      leaveRow.append(leaveHint, leaveBtn);
      leaveSection.append(leaveTitle, leaveRow);
      modalBody.appendChild(leaveSection);

      leaveBtn.addEventListener("click", async () => {
        if (!currentGroupId) return;
        setButtonEnabled(leaveBtn, false);
        try {
          const ok = await leaveGroup({ groupId: currentGroupId, playerId });
          if (!ok) {
            await toastSimple("Groups", "Unable to leave group.", "error");
            return;
          }
          closeModal();
          currentGroupId = null;
          overlay.refresh();
          notifyGroupsRefresh();
        } finally {
          setButtonEnabled(leaveBtn, true);
        }
      });
    }

    const memberSection = document.createElement("div");
    memberSection.className = "qws-fo-group-section";
    const memberTitle = document.createElement("div");
    memberTitle.className = "qws-fo-group-section-title";
    memberTitle.textContent = `Members (${members.length}/12)`;
    memberSection.appendChild(memberTitle);

    const listWrap = document.createElement("div");
    listWrap.className = "qws-fo-group-members-list";
    for (const member of members) {
      const row = document.createElement("div");
      row.className = "qws-fo-group-member-row";
      const avatar = document.createElement("div");
      avatar.className = "qws-fo-group-member-avatar";
      const avatarListRaw =
        (member as any).avatar ??
        (member as any).avatar_list ??
        (member as any).avatarList ??
        null;
      const avatarList = Array.isArray(avatarListRaw)
        ? avatarListRaw.map((entry) => String(entry)).filter(Boolean)
        : [];
      if (avatarList.length) {
        avatarList.forEach((entry, index) => {
          const img = document.createElement("img");
          img.className = "qws-fo-group-member-avatar-layer";
          img.alt = member.name ?? member.playerId ?? "Member";
          img.decoding = "async";
          img.loading = "lazy";
          img.style.zIndex = String(index + 1);
          applyCosmeticImg(img, entry);
          avatar.appendChild(img);
        });
      } else {
        const avatarLetter = (member.name ?? member.playerId ?? "?").trim().slice(0, 1).toUpperCase() || "?";
        avatar.textContent = avatarLetter;
      }
      const name = document.createElement("div");
      name.className = "qws-fo-group-member-name";
      name.textContent = member.name ?? member.playerId ?? "Member";
      const meta = document.createElement("div");
      meta.className = "qws-fo-group-member-meta";
      if (member.playerId) {
        const idEl = document.createElement("span");
        idEl.className = "qws-fo-group-member-id";
        idEl.textContent = member.playerId;
        meta.appendChild(idEl);
      }
      let roleLabel: string | null = null;
      if (member.playerId && ownerId && member.playerId === ownerId) {
        roleLabel = "Owner";
      } else if (member.role) {
        roleLabel = String(member.role);
      }
      if (roleLabel) {
        const badge = document.createElement("span");
        badge.className = "qws-fo-group-role-badge";
        badge.textContent = roleLabel;
        meta.appendChild(badge);
      }
      const textWrap = document.createElement("div");
      textWrap.className = "qws-fo-group-member-text";
      textWrap.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "qws-fo-group-member-actions";
      if (isOwner && member.playerId && member.playerId !== ownerId && currentGroupId) {
        const kickBtn = createButton("Remove", { size: "sm", variant: "danger" });
        kickBtn.addEventListener("click", async () => {
          if (!currentGroupId) return;
          setButtonEnabled(kickBtn, false);
          try {
            const ok = await removeGroupMember({
              groupId: currentGroupId,
              playerId,
              memberId: member.playerId!,
            });
            if (!ok) {
              await toastSimple("Groups", "Unable to remove member.", "error");
              return;
            }
            overlay.refresh();
            notifyGroupsRefresh();
            void openDetails(currentGroupId);
          } finally {
            setButtonEnabled(kickBtn, true);
          }
        });
        actions.appendChild(kickBtn);
      }
      row.append(avatar, textWrap, actions);
      listWrap.appendChild(row);
    }
    memberSection.appendChild(listWrap);
    modalBody.appendChild(memberSection);

    void ensureCosmeticBase().then(() => {
      populateCosmeticImages(modalBody);
    });
  };

  const openDetails = async (groupId: string) => {
    const playerId = myId ?? await playerDatabaseUserId.get();
    if (!playerId) return;
    try {
      const details = await fetchGroupDetails(groupId, playerId);
      if (!details) {
        await toastSimple("Groups", "Unable to load group info.", "error");
        return;
      }
      renderDetails(details, playerId);
      modal.style.display = "flex";
    } catch {
      await toastSimple("Groups", "Unable to load group info.", "error");
    }
  };

  playerDatabaseUserId
    .onChangeNow((next) => {
      myId = next ? String(next) : null;
    })
    .then((unsub) => {
      unsubPlayer = unsub;
    })
    .catch(() => {});

  return {
    root,
    show: () => overlay.setActive(true),
    hide: () => overlay.setActive(false),
    refresh: () => overlay.refresh(),
    destroy: () => {
      try {
        unsubPlayer?.();
      } catch {}
      overlay.destroy();
      modal.remove();
    },
  };
}
