// src/ui/menus/players.ts
import { Menu, VTabItem } from "../menu";
import { toastSimple } from "../toast";
import { PlayersService, type Player } from "../../services/players";
import { waitInventoryPanelClosed, isInventoryPanelOpen, isJournalModalOpen, waitJournalModalClosed  } from "../../services/fakeModal";

/* ---------------- Lecture/state ---------------- */

async function readPlayers(): Promise<Player[]> { return PlayersService.list(); }

const NF_US_INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function truncateLabel(s: string, max = 22) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

const vItem = (p: Player): VTabItem => ({
  id: p.id,
  title: truncateLabel(p.name || p.id, 9),
  subtitle: p.isConnected ? "Online" : "Offline",
  avatarUrl: p.discordAvatarUrl || "",
  statusColor: p.isConnected ? "#48d170" : "#999a",
});

/* ---------------- Menu ---------------- */

export async function renderPlayersMenu(root: HTMLElement) {
  const ui = new Menu({ id: "players", compact: true, windowSelector: ".qws-win"});
  ui.mount(root);

  const panel = ui.root.querySelector(".qmm-views") as HTMLElement;

  const { root: split, left, right } = ui.split2("260px");
  panel.appendChild(split);

  // left/right: layout flex & overflow corrects
  split.style.height = "100%";
  split.style.minHeight = "0";

  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.minHeight = "0"; // clé pour autoriser le overflow interne

  right.style.minHeight = "0";
  right.style.overflow = "auto";

  const vt = ui.vtabs({
    filterPlaceholder: "Find player…",
    onSelect: (_id, item) => renderRight(item?.id || null),
    fillAvailableHeight: true,
  });

  // vtabs en colonne, occupe tout l'espace du panneau gauche
  vt.root.style.display = "flex";
  vt.root.style.flexDirection = "column";
  vt.root.style.flex = "1 1 auto";
  vt.root.style.minHeight = "0";

  left.appendChild(vt.root);

  // --- petites retouches de la barre de filtre (input + icône)
  const filter = vt.root.querySelector(".filter") as HTMLElement | null;
  if (filter) {
    filter.style.display = "flex";
    filter.style.alignItems = "center";
    filter.style.gap = "8px";
    const input = filter.querySelector("input") as HTMLInputElement | null;
    if (input) {
      input.style.flex = "1 1 auto";
      input.style.minWidth = "0";
    }
  }

  async function renderRight(playerId: string | null) {
    right.innerHTML = "";
    const p = playerId ? players.find(x => x.id === playerId) || null : null;
    if (!p) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.textContent = "Select a player on the left.";
      right.appendChild(empty);
      return;
    }

    // Conteneur (grid) pour empiler les sections
    const col = document.createElement("div");
    col.style.display = "grid";
    col.style.gridAutoRows = "min-content";
    col.style.justifyItems = "center";
    col.style.gap = "10px";
    col.style.overflow = "auto";
    right.appendChild(col);

    // ===== Profile =====
    const prof = document.createElement("div");
    prof.style.display = "grid";
    prof.style.gap = "8px";
    prof.style.justifyItems = "center";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "12px";

    const avatar = document.createElement("img");
    avatar.src = p.discordAvatarUrl || "";
    avatar.alt = p.name;
    avatar.width = 48; avatar.height = 48;
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";
    avatar.style.border = "1px solid #4446";

    const title = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.textContent = p.name || p.id;
    nameEl.style.fontWeight = "600";
    nameEl.style.fontSize = "16px";
    const sub = document.createElement("div");
    sub.style.opacity = "0.8";
    sub.style.fontSize = "12px";
    sub.textContent = p.isConnected ? "Online" : "Offline";
    title.append(nameEl, sub);

    head.append(avatar, title);

    const info = document.createElement("div");
    info.style.opacity = "0.9";

    prof.append(head, info);
    col.appendChild(prof);

         // ===== Informations =====
    const infoWrap = document.createElement("div");
    infoWrap.style.display = "grid";
    infoWrap.style.gap = "6px";
    infoWrap.style.justifySelf = "stretch";
    infoWrap.style.width = "100%";

    // lignes alignées à gauche
    const invValueRow = ui.flexRow({ justify: "start", fullWidth: true, gap: 6 });
    const invLabel = document.createElement("div");
    invLabel.textContent = "Inventory: ";
    invLabel.style.fontSize = "14px";
    invLabel.style.opacity = "0.85";
    const invValue = document.createElement("div");
    invValue.textContent = "…";
    invValue.style.fontSize = "15px";
    invValue.style.fontWeight = "700";
    invValue.style.color = "#FFD84D";
    invValueRow.append(invLabel, invValue);

    const gardenValueRow = ui.flexRow({ justify: "start", fullWidth: true, gap: 6 });
    const gardenLabel = document.createElement("div");
    gardenLabel.textContent = "Garden: ";
    gardenLabel.style.fontSize = "14px";
    gardenLabel.style.opacity = "0.85";
    const gardenValue = document.createElement("div");
    gardenValue.textContent = "…";
    gardenValue.style.fontWeight = "700";
    gardenValue.style.fontSize = "15px";
    gardenValue.style.color = "#FFD84D";
    gardenValueRow.append(gardenLabel, gardenValue);

    // injecte dans la section
    infoWrap.append(invValueRow, gardenValueRow);
    const infoCard = ui.card("🌱 Crops values", { tone: "muted", align: "center" });
    infoCard.body.append(infoWrap);
    col.appendChild(infoCard.root);

    // ===== Teleport =====
    const teleRow = ui.flexRow({ justify: "center" });
    const btnToPlayer = ui.btn("To player", { size: "sm" });
    btnToPlayer.style.minWidth = "120px";
    const btnToGarden = ui.btn("To garden", { size: "sm" });
    btnToGarden.style.minWidth = "120px";

    btnToPlayer.onclick = async () => {
      try {
        const fn = (PlayersService as any).teleportToPlayer ?? (PlayersService as any).teleportTo;
        await fn.call(PlayersService, p.id);
      } catch (e: any) {
        await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
      }
    };
    btnToGarden.onclick = async () => {
      try {
        const fn = (PlayersService as any).teleportToGarden ?? (PlayersService as any).tptogarden;
        await fn.call(PlayersService, p.id);
      } catch (e: any) {
        await toastSimple("Teleport", e?.message || "Error during teleport.", "error");
      }
    };

    teleRow.append(btnToPlayer, btnToGarden);
    const teleportCard = ui.card("🌀 Teleport", { tone: "muted", align: "center" });
    teleportCard.body.append(teleRow);
    col.appendChild(teleportCard.root);

    // ===== Inspect (ex-Inventory) =====
    const invRow = ui.flexRow({ justify: "center" });
    const btnInv = ui.btn("Inventory", { size: "sm" });
    btnInv.style.minWidth = "120px";
    const btnJournal = ui.btn("Journal", { size: "sm" });
    btnJournal.style.minWidth = "120px";

    // Conserve la logique existante pour ouvrir l’aperçu d’inventaire
    btnInv.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openInventoryPreview(p.id, p.name);
        if (await isInventoryPanelOpen()) {
          await waitInventoryPanelClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    btnJournal.onclick = async () => {
      try {
        ui.setWindowVisible(false);
        await PlayersService.openJournalLog(p.id, p.name);
        if (await isJournalModalOpen()) {
          await waitJournalModalClosed();
        }
      } finally {
        ui.setWindowVisible(true);
      }
    };

    invRow.append(btnInv, btnJournal);
    const inspectCard = ui.card("🔍 Inspect", { tone: "muted", align: "center" });
    inspectCard.body.append(invRow);
    col.appendChild(inspectCard.root);

    // ===== Fun =====
    const funWrap = document.createElement("div");
    funWrap.style.display = "grid";
    funWrap.style.gap = "10px";

    const followRow = ui.flexRow({ justify: "center" });
    followRow.style.gap = "16px";

    const playerFollowGroup = document.createElement("div");
    playerFollowGroup.style.display = "flex";
    playerFollowGroup.style.alignItems = "center";
    playerFollowGroup.style.gap = "8px";

    const label = document.createElement("div");
    label.textContent = "Follow player";
    label.style.fontSize = "14px";
    label.style.opacity = "0.85";
    const sw = ui.switch(PlayersService.isFollowing(p.id));
    (sw as HTMLInputElement).addEventListener("change", async () => {
      try {
        if ((sw as HTMLInputElement).checked) {
          await PlayersService.startFollowing(p.id);
          await toastSimple("Follow", "Enabled.", "success");
        } else {
          PlayersService.stopFollowing();
          await toastSimple("Follow", "Disable.", "info");
        }
      } catch (e: any) {
        await toastSimple("Follow", e?.message || "Error", "error");
        (sw as HTMLInputElement).checked = !(sw as HTMLInputElement).checked;
      }
    });
    playerFollowGroup.append(label, sw as HTMLElement);

    const petFollowGroup = document.createElement("div");
    petFollowGroup.style.display = "flex";
    petFollowGroup.style.alignItems = "center";
    petFollowGroup.style.gap = "4px";

    const petsLabel = document.createElement("div");
    petsLabel.textContent = "Pet follow";
    petsLabel.style.fontSize = "14px";
    petsLabel.style.opacity = "0.85";
    const petsSwitch = ui.switch(PlayersService.isPetFollowing(p.id));
    (petsSwitch as HTMLInputElement).addEventListener("change", async () => {
      try {
        if ((petsSwitch as HTMLInputElement).checked) {
          await PlayersService.startPetFollowing(p.id);
        } else {
          await PlayersService.stopPetFollowing();
        }
      } catch (e: any) {
        await toastSimple("Pet follow", e?.message || "Error", "error");
        (petsSwitch as HTMLInputElement).checked = !(petsSwitch as HTMLInputElement).checked;
      }
    });
    petFollowGroup.append(petsLabel, petsSwitch as HTMLElement);

    followRow.append(playerFollowGroup, petFollowGroup);

    funWrap.append(followRow);
    const funCard = ui.card("🎉 Fun", { tone: "muted", align: "center" });
    funCard.body.append(funWrap);
    col.appendChild(funCard.root);

    // Remplissage asynchrone depuis le service
    (async () => {
      try {
        const total = await PlayersService.getInventoryValue(p.id);
        invValue.textContent = `${NF_US_INT.format(Math.round(total))}`;
        invValue.title = "Total inventory value";
      } catch {
        invValue.textContent = "—";
      }
      try {
        const total = await PlayersService.getGardenValue(p.id);
        gardenValue.textContent = `${NF_US_INT.format(Math.round(total))}`;
        gardenValue.title = "Total garden value";
      } catch {
        gardenValue.textContent = "—";
      }
    })();
  }
  

  let players: Player[] = [];

  /** ------- DIFF MINIMAL (inclut gardenPosition) ------- **/
  let lastSig = "";
  function signature(ps: Player[]) {
    return ps.map(p =>
      `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}|${p.inventory?.items?.length ?? 0}`
    ).join(";");
  }

  async function refreshAll(keepSelection = true) {
    const prevSel = vt.getSelected()?.id ?? null;

    const next = await readPlayers();
    const sig = signature(next);
    if (sig === lastSig) {
      return;
    }
    lastSig = sig;

    players = next;
    vt.setItems(players.map(vItem));

    const sel = (keepSelection && prevSel && players.some(p => p.id === prevSel))
      ? prevSel
      : (players[0]?.id ?? null);
    if (sel !== null) vt.select(sel); else renderRight(null);
  }
  /** ----- FIN DIFF MINIMAL ----- **/

  await PlayersService.onChange(() => { refreshAll(true).catch(() => {}); });

  await refreshAll(true);
}
