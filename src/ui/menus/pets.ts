// src/ui/menus/pets.ts
// UI UNIQUEMENT (aucune logique). Aligné sur le style/layout de garden.ts.

import { Menu} from "../menu";
import { PetsService,
  InventoryPet,
  installPetTeamHotkeysOnce,
  setTeamsForHotkeys,
  petImg64From } from "../../services/pets";
import type { PetInfo } from "../../services/player";
import type { PetTeam } from "../../services/pets";
import { onActivePetsStructuralChangeNow } from "../../store/atoms";

/* ================== petits helpers UI (mêmes vibes que garden) ================== */


  // Ability → { bg, hover } — calé sur les couleurs du jeu
function getAbilityChipColors(id: string): { bg: string; hover: string } {
  const key = String(id || "");
  const base = (PetsService.getAbilityNameWithoutLevel?.(key) || "")
    .replace(/[\s\-_]+/g, "")
    .toLowerCase();

  const is = (prefix: string) => key.startsWith(prefix) || base === prefix.toLowerCase();

  if (is("ProduceScaleBoost"))   return { bg: "rgba(34,139,34,0.9)",  hover: "rgba(34,139,34,1)" };
  if (is("PlantGrowthBoost"))    return { bg: "rgba(0,128,128,0.9)",  hover: "rgba(0,128,128,1)" };
  if (is("EggGrowthBoost"))      return { bg: "rgba(180,90,240,0.9)", hover: "rgba(180,90,240,1)" };
  if (is("PetAgeBoost"))         return { bg: "rgba(147,112,219,0.9)",hover: "rgba(147,112,219,1)" };
  if (is("PetHatchSizeBoost"))   return { bg: "rgba(128,0,128,0.9)",  hover: "rgba(128,0,128,1)" };
  if (is("PetXpBoost"))          return { bg: "rgba(30,144,255,0.9)", hover: "rgba(30,144,255,1)" };
  if (is("HungerBoost"))         return { bg: "rgba(255,20,147,0.9)", hover: "rgba(255,20,147,1)" };
  if (is("SellBoost"))           return { bg: "rgba(220,20,60,0.9)",  hover: "rgba(220,20,60,1)" };
  if (is("CoinFinder"))          return { bg: "rgba(180,150,0,0.9)",  hover: "rgba(180,150,0,1)" };
  if (is("ProduceMutationBoost"))return { bg: "rgba(138,43,226,0.9)", hover: "rgba(138,43,226,1)" };
  if (is("DoubleHarvest"))       return { bg: "rgba(0,120,180,0.9)",  hover: "rgba(0,120,180,1)" };
  if (is("ProduceEater"))        return { bg: "rgba(255,69,0,0.9)",   hover: "rgba(255,69,0,1)" };
  if (is("ProduceRefund"))       return { bg: "rgba(255,99,71,0.9)",  hover: "rgba(255,99,71,1)" };
  if (is("PetMutationBoost"))    return { bg: "rgba(156,65,181,0.9)", hover: "rgba(156,65,181,1)" };
  if (is("HungerRestore"))       return { bg: "rgba(255,105,180,0.9)",hover: "rgba(255,105,180,1)" };
  if (is("PetRefund"))           return { bg: "rgba(0,80,120,0.9)",   hover: "rgba(0,80,120,1)" };
  if (is("Copycat"))             return { bg: "rgba(255,140,0,0.9)",  hover: "rgba(255,140,0,1)" };

  if (is("GoldGranter")) {
    return {
      bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
      hover: "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)",
    };
  }
  if (is("RainbowGranter")) {
    return {
      bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
      hover: "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))",
    };
  }
  if (is("SeedFinderIV")) {
    return {
      bg: "linear-gradient(130deg, rgba(0,180,216,0.9) 0%, rgba(124,42,232,0.9) 40%, rgba(160,0,126,0.9) 60%, rgba(255,215,0,0.9) 100%)",
      hover: "linear-gradient(130deg, rgba(0,180,216,1) 0%, rgba(124,42,232,1) 40%, rgba(160,0,126,1) 60%, rgba(255,215,0,1) 100%)",
    };
  }
  if (is("SeedFinder")) {
    // I/II/III
    const lv = key.replace(/.*?([IVX]+)$/, "$1");
    if (lv === "II") return { bg: "rgba(183,121,31,0.9)", hover: "rgba(183,121,31,1)" };
    if (lv === "III") return { bg: "rgba(139,62,152,0.9)", hover: "rgba(139,62,152,1)" };
    return { bg: "rgba(94,172,70,0.9)", hover: "rgba(94,172,70,1)" };
  }

  // défaut neutre
  return { bg: "rgba(100,100,100,0.9)", hover: "rgba(150,150,150,1)" };
}

/* ================== Onglet: Manager ================== */
function renderManagerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

  // --- state
  let teams: PetTeam[] = [];
  let selectedId: string | null = null;
  let activeTeamId: string | null = null;
  let activePetIdSet = new Set<string>();

  // gel visuel pendant application d’une team
  let isApplyingTeam = false;

  // DnD anim state
  let draggingIdx: number | null = null;
  let overInsertIdx: number | null = null;
  let draggingHeight = 0;

  let invCacheMap: Map<string, InventoryPet> | null = null;
  const lastRenderedSlotIds: (string | null)[] = [null, null, null];

  function applySubtleBorder(btn: HTMLButtonElement, hex: string, alpha = 0.22) {
    const toRgba = (h: string, a: number) => {
      const m = h.replace("#", "");
      const r = parseInt(m.length === 3 ? m[0] + m[0] : m.slice(0, 2), 16);
      const g = parseInt(m.length === 3 ? m[1] + m[1] : m.slice(2, 4), 16);
      const b = parseInt(m.length === 3 ? m[2] + m[2] : m.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    const border = toRgba(hex, alpha);
    btn.style.border = `1px solid ${border}`;
    btn.style.background = "#1f2328";
    btn.style.boxShadow = "none";
    btn.style.transition = "none";
  }

  const framed = (title: string, content: HTMLElement) => {
    const cardSection = ui.card(title, { tone: "muted", align: "center" });
    cardSection.body.append(content);
    cardSection.root.style.maxWidth = "720px";
    return cardSection.root;
  };
  const row = (opts?: { justify?: "start" | "center" }) => ui.flexRow({ justify: opts?.justify ?? "center" });

  // layout global
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "minmax(220px, 280px) minmax(0, 1fr)";
  wrap.style.gap = "10px";
  wrap.style.alignItems = "stretch";
  wrap.style.height = "54vh";
  wrap.style.overflow = "hidden";
  view.appendChild(wrap);

  /* ================= LEFT: liste des teams ================= */
  const left = document.createElement("div");
  left.style.display = "grid";
  left.style.gridTemplateRows = "1fr auto";
  left.style.gap = "8px";
  left.style.minHeight = "0";
  wrap.appendChild(left);

  const teamList = document.createElement("div");
  teamList.style.display = "flex";
  teamList.style.flexDirection = "column";
  teamList.style.gap = "6px";
  teamList.style.overflow = "auto";
  teamList.style.padding = "6px";
  teamList.style.border = "1px solid #4445";
  teamList.style.borderRadius = "10px";
  teamList.style.scrollBehavior = "smooth";
  teamList.style.minHeight = "0";
  left.appendChild(teamList);

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.gap = "6px";
  left.appendChild(footer);

  const btnNew = ui.btn("➕ New", { variant: "primary", size: "sm" }); btnNew.id = "pets.teams.new";
  btnNew.style.flex = "1 1 0";
  const btnDel = ui.btn("🗑️ Delete", { variant: "danger", size: "sm" }); btnDel.id = "pets.teams.delete";
  btnDel.style.flex = "1 1 0";
  applySubtleBorder(btnNew, "#22c55e", 0.22);
  applySubtleBorder(btnDel, "#ef4444", 0.22);
  footer.append(btnNew, btnDel);

  // helpers
  function getSelectedTeam(): PetTeam | null {
    return teams.find(t => t.id === selectedId) || null;
  }

  // calcule l’index d’insertion en se basant sur la position Y dans la liste
  function computeInsertIndex(clientY: number): number {
    const children = Array.from(teamList.children) as HTMLElement[];
    if (!children.length) return 0;
    const first = children[0].getBoundingClientRect();
    if (clientY < first.top + first.height / 2) return 0;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) return i;
    }
    return children.length;
  }

  function abilitiesBadge(abilities: string[]): HTMLElement {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.lineHeight = "1";

    const SPACING_PX = 8;
    const SIZE_PX = 12;
    const RADIUS_PX = 3;

    const ids = Array.isArray(abilities) ? abilities.filter(Boolean) : [];
    if (!ids.length) {
      const empty = document.createElement("span");
      empty.textContent = "No ability";
      empty.style.opacity = "0.75";
      empty.style.fontSize = "12px";
      wrap.appendChild(empty);
      return wrap;
    }

    ids.forEach((id, i) => {
      const chip = document.createElement("span");
      const { bg, hover } = getAbilityChipColors(id);
      chip.title = PetsService.getAbilityName(id) || id;
      chip.setAttribute("aria-label", chip.title);

      Object.assign(chip.style, {
        display: "inline-block",
        width: `${SIZE_PX}px`,
        height: `${SIZE_PX}px`,
        borderRadius: `${RADIUS_PX}px`,
        marginRight: i === ids.length - 1 ? "0" : `${SPACING_PX}px`,
        background: bg,
        transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
        cursor: "default",
        boxShadow: "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a",
      } as CSSStyleDeclaration);

      chip.onmouseenter = () => {
        chip.style.background = hover;
        chip.style.transform = "scale(1.08)";
        chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff33";
      };
      chip.onmouseleave = () => {
        chip.style.background = bg;
        chip.style.transform = "none";
        chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a";
      };

      wrap.appendChild(chip);
    });

    return wrap;
  }

  // petit util pour animer le déplacement “live” (sans rerender)
  function applyLiveTransforms() {
    const children = Array.from(teamList.children) as HTMLElement[];
    children.forEach((el) => (el.style.transform = ""));
    if (draggingIdx === null || overInsertIdx === null) return;
    const from = draggingIdx;
    const to = overInsertIdx;
    children.forEach((el, idx) => {
      el.style.transition = "transform 120ms ease";
      if (idx === from) return;
      if (to > from && idx > from && idx < to) {
        el.style.transform = `translateY(${-draggingHeight}px)`;
      }
      if (to < from && idx >= to && idx < from) {
        el.style.transform = `translateY(${draggingHeight}px)`;
      }
    });
  }
  function clearLiveTransforms() {
    Array.from(teamList.children).forEach((el) => {
      (el as HTMLElement).style.transform = "";
      (el as HTMLElement).style.transition = "";
    });
  }

  async function refreshActiveIds() {
    activeTeamId = null;
    activePetIdSet = new Set();
    try {
      const pets = await PetsService.getPets();
      const equipIds = Array.isArray(pets)
        ? pets.map(p => String(p?.slot?.id || "")).filter(Boolean)
        : [];
      activePetIdSet = new Set(equipIds);
      for (const t of teams) {
        const tIds = (t.slots || []).filter(Boolean) as string[];
        if (tIds.length !== equipIds.length) continue;
        let same = true;
        for (const id of tIds) { if (!activePetIdSet.has(id)) { same = false; break; } }
        if (same) { activeTeamId = t.id; break; }
      }
    } catch {}
  }

  // re-render list items
  async function refreshTeamList(skipDetectActive = false) {
    if (!skipDetectActive) {
      await refreshActiveIds();
    }
    clearLiveTransforms();
    draggingIdx = null;
    overInsertIdx = null;
    draggingHeight = 0;

    teamList.innerHTML = "";

    if (!teams.length) {
      const empty = document.createElement("div");
      empty.textContent = "No teams yet. Create one!";
      empty.style.opacity = "0.75";
      empty.style.textAlign = "center";
      empty.style.padding = "8px";
      teamList.appendChild(empty);
      hydrateEditor(null);
      return;
    }

    teams.forEach((t, idx) => {
      const item = document.createElement("div");
      const isActive = t.id === activeTeamId;
      item.dataset.index = String(idx);
      item.textContent = "";
      item.style.height = "36px";
      item.style.lineHeight = "36px";
      item.style.padding = "0 10px";
      item.style.border = "1px solid #ffffff15";
      item.style.borderRadius = "6px";
      item.style.cursor = "pointer";
      item.style.fontSize = "13px";
      item.style.overflow = "hidden";
      item.style.whiteSpace = "nowrap";
      item.style.textOverflow = "ellipsis";
      item.style.display = "flex";
      item.style.flex = "0 0 auto";
      item.style.gap = "8px";
      item.style.alignItems = "center";
      item.style.background = t.id === selectedId ? "#2a313a" : "#1f2328";

      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.boxShadow = "0 0 0 1px #0006 inset";
      dot.style.background = isActive ? "#48d170" : "#64748b";
      dot.title = isActive ? "This team is currently active" : "Inactive team";

      const label = document.createElement("span");
      label.textContent = t.name || "(unnamed)";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.whiteSpace = "nowrap";

      item.append(dot, label);

      const grab = document.createElement("span");
      grab.className = "qmm-grab";
      grab.title = "Drag to reorder";
      grab.innerHTML = "&#8942;";
      grab.draggable = true;

      item.onmouseenter = () => (item.style.borderColor = "#6aa1");
      item.onmouseleave = () => (item.style.borderColor = "#ffffff15");

      item.onclick = (ev) => {
        if ((ev as any).__byDrag) return;
        const changed = selectedId !== t.id;
        if (changed) {
          selectedId = t.id;
          refreshTeamList(true);
        }
        void hydrateEditor(getSelectedTeam());
      };

      grab.addEventListener("dragstart", (ev) => {
        draggingIdx = idx;
        draggingHeight = item.getBoundingClientRect().height;
        item.classList.add("qmm-dragging");
        ev.dataTransfer?.setData("text/plain", String(idx));
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        try {
          const ghost = item.cloneNode(true) as HTMLElement;
          ghost.style.width = `${item.getBoundingClientRect().width}px`;
          ghost.style.position = "absolute";
          ghost.style.top = "-9999px";
          document.body.appendChild(ghost);
          ev.dataTransfer!.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
          setTimeout(() => document.body.removeChild(ghost), 0);
        } catch {}
      });

      grab.addEventListener("dragend", () => {
        item.classList.remove("qmm-dragging");
        clearLiveTransforms();
        draggingIdx = null;
        overInsertIdx = null;
      });

      item.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        if (draggingIdx === null) return;

        const idxOver = Number((ev.currentTarget as HTMLElement).dataset.index || -1);
        if (idxOver < 0) return;
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const insertIdx = (ev.clientY < mid) ? idxOver : idxOver + 1;

        const clamped = Math.max(0, Math.min(teams.length, insertIdx));
        if (overInsertIdx !== clamped) {
          overInsertIdx = clamped;
          applyLiveTransforms();
        }

        const edge = 28;
        const listRect = teamList.getBoundingClientRect();
        if (ev.clientY < listRect.top + edge) teamList.scrollTop -= 18;
        else if (ev.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
      });

      item.addEventListener("drop", (ev) => {
        ev.preventDefault();
        (ev as any).__byDrag = true;
        if (draggingIdx === null) return;

        let target = overInsertIdx ?? computeInsertIndex(ev.clientY);
        if (target > draggingIdx) target -= 1;

        target = Math.max(0, Math.min(teams.length - 1, target));
        if (target !== draggingIdx) {
          const a = teams.slice();
          const [it] = a.splice(draggingIdx, 1);
          a.splice(target, 0, it);
          teams = a;
          try { PetsService.setTeamsOrder(teams.map(x => x.id)); } catch {}
        }

        clearLiveTransforms();
        draggingIdx = null;
        overInsertIdx = null;
        draggingHeight = 0;

        refreshTeamList();
      });

      item.appendChild(grab);
      teamList.appendChild(item);
    });
  }

  // autorise le drop "dans les trous"
  teamList.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (draggingIdx === null) return;

    const idx = computeInsertIndex(e.clientY);
    if (overInsertIdx !== idx) {
      overInsertIdx = idx;
      applyLiveTransforms();
    }

    const edge = 28;
    const listRect = teamList.getBoundingClientRect();
    if (e.clientY < listRect.top + edge) teamList.scrollTop -= 18;
    else if (e.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
  });

  teamList.addEventListener("drop", (e) => {
    e.preventDefault();
    if (draggingIdx === null) return;
    let target = overInsertIdx ?? computeInsertIndex(e.clientY);
    if (target > draggingIdx) target -= 1;

    target = Math.max(0, Math.min(teams.length - 1, target));
    if (target !== draggingIdx) {
      const a = teams.slice();
      const [it] = a.splice(draggingIdx, 1);
      a.splice(target, 0, it);
      teams = a;
      try { PetsService.setTeamsOrder(teams.map(x => x.id)); } catch {}
    }

    clearLiveTransforms();
    draggingIdx = null;
    overInsertIdx = null;
    draggingHeight = 0;

    refreshTeamList();
  });

  // logique boutons
  btnNew.onclick = () => {
    const created = PetsService.createTeam("New Team");
    selectedId = created.id;
    refreshTeamList();
    hydrateEditor(getSelectedTeam());
  };
  btnDel.onclick = () => {
    if (!selectedId) return;
    const ok = PetsService.deleteTeam(selectedId);
    if (!ok) return;
  };

  // ----- subscribe to service (keeps UI in sync & persisted) -----
  let unsubTeams: (() => void) | null = null;
  (async () => {
    try {
      unsubTeams = await PetsService.onTeamsChangeNow(async (all) => {
        teams = Array.isArray(all) ? all.slice() : [];
        if (selectedId && !teams.some(t => t.id === selectedId)) {
          selectedId = teams[0]?.id ?? null;
        }
        if (!selectedId && teams.length) selectedId = teams[0].id;

        refreshTeamList();
        setTeamsForHotkeys(teams);

        // prime cache inventaire (sécurisé par le mute côté service)
        await PetsService.getInventoryPets().catch(() => []);
        await hydrateEditor(getSelectedTeam());
      });
    } catch {}
  })();

  /* ================= RIGHT: éditeur de team ================= */
  const right = document.createElement("div");
  right.style.display = "grid";
  right.style.gridTemplateRows = "auto 1fr";
  right.style.gap = "10px";
  right.style.minHeight = "0";
  wrap.appendChild(right);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";

  const headerTitle = document.createElement("div");
  headerTitle.textContent = "Team editor — ";
  headerTitle.style.fontWeight = "700";
  headerTitle.style.fontSize = "14px";

  const btnUseTeam = document.createElement("button");
  btnUseTeam.id = "pets.teams.useThisTeam";
  btnUseTeam.textContent = "Use this team";
  btnUseTeam.style.padding = "6px 10px";
  btnUseTeam.style.borderRadius = "8px";
  btnUseTeam.style.border = "1px solid #4445";
  btnUseTeam.style.background = "#1f2328";
  btnUseTeam.style.color = "#e7eef7";
  btnUseTeam.style.cursor = "pointer";
  btnUseTeam.onmouseenter = () => (btnUseTeam.style.borderColor = "#6aa1");
  btnUseTeam.onmouseleave = () => (btnUseTeam.style.borderColor = "#4445");
  btnUseTeam.disabled = true;

  const btnSave = document.createElement("button");
  btnSave.id = "pets.teams.save";
  btnSave.textContent = "💾 Save";
  btnSave.style.padding = "6px 10px";
  btnSave.style.borderRadius = "8px";
  btnSave.style.border = "1px solid #4445";
  btnSave.style.background = "#1f2328";
  btnSave.style.color = "#e7eef7";
  btnSave.style.cursor = "pointer";
  btnSave.onmouseenter = () => (btnSave.style.borderColor = "#6aa1");
  btnSave.onmouseleave = () => (btnSave.style.borderColor = "#4445");
  btnSave.disabled = true;

  header.append(headerTitle, btnUseTeam);
  right.appendChild(header);

  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "12px";
  card.style.overflow = "auto";
  card.style.minHeight = "0";
  card.style.background = "#0f1318";
  right.appendChild(card);

  // ---- Team name ----
  const secName = (() => {
    const r = row();
    r.style.width = "100%";
    const nameInput = ui.inputText("Team name", "");
    (nameInput as any).id = "pets.teams.editor.name";
    (nameInput as HTMLInputElement).style.flex = "1";
    (nameInput as HTMLInputElement).style.minWidth = "0";
    btnSave.style.marginLeft = "auto";
    btnSave.style.padding = "6px 10px";
    r.append(nameInput, btnSave);
    card.appendChild(framed("🏷️ Team name", r));
    return { nameInput: nameInput as HTMLInputElement };
  })();

  // ---- Search bar ----
  const secSearch = (() => {
    const wrapOuter = document.createElement("div");
    wrapOuter.style.display = "flex";
    wrapOuter.style.flexDirection = "column";
    wrapOuter.style.gap = "10px";
    wrapOuter.style.alignItems = "center";

    let isProgrammaticModeSet = false;
    let currentMode: "ability" | "species" = "ability";

    const seg = ui.segmented<"ability" | "species">(
      [
        { value: "ability", label: "✨ Ability" },
        { value: "species", label: "🧬 Species" },
      ],
      "ability",
      async (val) => {
        if (isProgrammaticModeSet) return;
        currentMode = val;
        await rebuildOptionsFromInventory();
        select.value = "";
        applyFilterToTeam();
      },
      { ariaLabel: "Search mode" }
    );

    const select = document.createElement("select");
    select.className = "qmm-input";
    select.id = "pets.teams.filter.select";
    select.style.minWidth = "260px";

    const getMode = (): "ability" | "species" => currentMode;
    const setMode = (m: "ability" | "species") => {
      currentMode = m;
      isProgrammaticModeSet = true;
      (seg as any).set(m);
      isProgrammaticModeSet = false;
    };

    const rebuildOptionsFromInventory = async () => {
      const prev = select.value;
      const inv = await PetsService.getInventoryPets().catch(() => []) as any[];

      select.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "— No filter —";
      select.appendChild(opt0);

      if (getMode() === "ability") {
        const nameSet = new Set<string>();
        for (const p of inv) {
          const abs: string[] = Array.isArray(p?.abilities) ? p.abilities.filter(Boolean) : [];
          for (const id of abs) {
            const base = PetsService.getAbilityNameWithoutLevel?.(id) || "";
            if (base) nameSet.add(base);
          }
        }
        for (const name of Array.from(nameSet).sort((a, b) => a.localeCompare(b))) {
          const o = document.createElement("option"); o.value = name; o.textContent = name; select.appendChild(o);
        }
      } else {
        const set = new Set<string>();
        for (const p of inv) {
          const sp = String(p?.petSpecies || "").trim();
          if (sp) set.add(sp);
        }
        for (const v of Array.from(set).sort((a, b) => a.localeCompare(b))) {
          const o = document.createElement("option"); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); select.appendChild(o);
        }
      }

      if (Array.from(select.options).some(o => o.value === prev)) select.value = prev;
    };

    const applyFilterToTeam = () => {
      const t = getSelectedTeam();
      if (!t) return;
      const val = (select.value || "").trim();
      const raw = getMode() === "ability" ? (val ? `ab:${val}` : "") : (val ? `sp:${val}` : "");
      PetsService.setTeamSearch(t.id, raw);
    };

    select.addEventListener("change", applyFilterToTeam);

    wrapOuter.append(seg, select);
    card.appendChild(framed("🔍 Search", wrapOuter));

    const ensureOptionExists = (val: string, pretty?: string) => {
      const v = (val || "").trim();
      if (!v) return;
      const has = Array.from(select.options).some(o => o.value === v);
      if (!has) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = pretty ?? v;
        select.appendChild(o);
      }
    };

    return {
      getMode,
      setMode,
      select,
      rebuild: rebuildOptionsFromInventory,
      apply: applyFilterToTeam,
      setFromSearchString(s: string) {
        const m = (s || "").match(/^(ab|sp):\s*(.*)$/i);
        if (!m) { setMode("ability"); select.value = ""; return; }
        const mode = m[1].toLowerCase() === "ab" ? "ability" : "species";
        const val = (m[2] || "").trim();

        setMode(mode);
        ensureOptionExists(val, mode === "species" ? val.charAt(0).toUpperCase() + val.slice(1) : val);
        select.value = val;
      }
    };
  })();

  // ---- Active pets (3 slots) ----
  const secSlots = (() => {
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr";
    grid.style.rowGap = "10px";
    grid.style.justifyItems = "center";

    type SlotRow = {
      root: HTMLDivElement;
      nameEl: HTMLDivElement;
      abilitiesEl: HTMLSpanElement;
      btnChoose: HTMLButtonElement;
      btnClear: HTMLButtonElement;
      update(pet: InventoryPet | null): void;
    };

    const mkRow = (idx: 0 | 1 | 2): SlotRow => {
      const root = document.createElement("div");
      const BTN = 28;
      const ICON = 40;

      root.style.display = "grid";
      root.style.gridTemplateColumns = `${ICON}px minmax(0,1fr) ${BTN}px ${BTN}px`;
      root.style.alignItems = "center";
      root.style.gap = "8px";
      root.style.width = "min(560px, 100%)";
      root.style.border = "1px solid #4445";
      root.style.borderRadius = "10px";
      root.style.padding = "8px 10px";
      root.style.background = "#0f1318";

      // icon
      const iconWrap = document.createElement("div");
      Object.assign(iconWrap.style, {
        width: `${ICON}px`,
        height: `${ICON}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      });

      const useEmojiFallback = () => {
        iconWrap.replaceChildren();
        const span = document.createElement("span");
        span.textContent = "🐾";
        span.style.fontSize = `${Math.max(ICON - 6, 12)}px`;
        span.setAttribute("aria-hidden", "true");
        iconWrap.appendChild(span);
      };

      const setIcon = (species?: string, mutation?: string | string[]) => {
        const src = petImg64From(species, mutation);
        iconWrap.replaceChildren();
        if (!src) { useEmojiFallback(); return; }
        const img = new Image();
        img.src = src;
        img.alt = species || "pet";
        img.decoding = "async";
        img.loading = "lazy";
        img.draggable = false;
        Object.assign(img.style, {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        });
        iconWrap.appendChild(img);
      };

      // text column
      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "6px";
      left.style.minWidth = "0";

      const nameEl = document.createElement("div");
      nameEl.style.fontWeight = "700";
      nameEl.textContent = "None";
      nameEl.style.overflow = "hidden";
      nameEl.style.textOverflow = "ellipsis";
      nameEl.style.whiteSpace = "nowrap";

      let abilitiesEl = abilitiesBadge([]);
      abilitiesEl.style.display = "inline-block";
      left.append(nameEl, abilitiesEl);

      // buttons
      const btnChoose = document.createElement("button");
      btnChoose.textContent = "+";
      Object.assign(btnChoose.style, {
        width: `${BTN}px`,
        minWidth: `${BTN}px`,
        height: `${BTN}px`,
        padding: "0",
        fontSize: "16px",
        lineHeight: "1",
        borderRadius: "10px",
        boxShadow: "none",
        display: "grid",
        placeItems: "center",
      });
      btnChoose.title = "Choose a pet";
      btnChoose.setAttribute("aria-label", "Choose a pet");

      const btnClear = document.createElement("button");
      btnClear.textContent = "−";
      Object.assign(btnClear.style, {
        width: `${BTN}px`,
        minWidth: `${BTN}px`,
        height: `${BTN}px`,
        padding: "0",
        fontSize: "16px",
        lineHeight: "1",
        borderRadius: "10px",
        boxShadow: "none",
        display: "grid",
        placeItems: "center",
      });
      btnClear.title = "Remove this pet";
      btnClear.setAttribute("aria-label", "Remove this pet");

      root.append(iconWrap, left, btnChoose, btnClear);

      function update(p: InventoryPet | null) {
        if (!p) {
          nameEl.textContent = "None";
          setIcon(undefined, undefined);
          const fresh = abilitiesBadge([]);
          (fresh as any).style.display = "inline-block";
          left.replaceChild(fresh, left.children[1]);
          (abilitiesEl as any) = fresh;
          return;
        }
        const species = String(p.petSpecies || "").trim();
        const muts = Array.isArray(p.mutations) ? p.mutations : [];

        setIcon(species, muts);

        const speciesLabel = species ? species.charAt(0).toUpperCase() + species.slice(1) : "";
        nameEl.textContent = (p.name?.trim() || speciesLabel || "Pet");

        const abs: string[] = Array.isArray(p.abilities) ? p.abilities.filter(Boolean) : [];
        const fresh = abilitiesBadge(abs);
        (fresh as any).style.display = "inline-block";
        left.replaceChild(fresh, left.children[1]);
        (abilitiesEl as any) = fresh;
      }

      // handlers (UI → Service)
      btnChoose.onclick = async () => {
        const t = getSelectedTeam();
        if (!t) return;
        btnChoose.disabled = true; btnClear.disabled = true;
        ui.setWindowVisible(false);
        try {
          await PetsService.chooseSlotPet(t.id, idx);
          await repaintSlots(getSelectedTeam());
        } finally {
          ui.setWindowVisible(true);
          btnChoose.disabled = false; btnClear.disabled = false;
        }
      };

      btnClear.onclick = async () => {
        const t = getSelectedTeam();
        if (!t) return;
        const next = t.slots.slice(0, 3);
        next[idx] = null;
        PetsService.saveTeam({ id: t.id, slots: next });
        await repaintSlots(t);
      };

      return { root, nameEl, abilitiesEl: abilitiesEl as HTMLSpanElement, btnChoose, btnClear, update };
    };

    const r0 = mkRow(0);
    const r1 = mkRow(1);
    const r2 = mkRow(2);

    grid.append(r0.root, r1.root, r2.root);

    const extra = document.createElement("div");
    extra.style.display = "flex";
    extra.style.gap = "6px";
    extra.style.justifyContent = "center";
    const btnUseCurrent = ui.btn("Current active", { variant: "primary" });
    btnUseCurrent.id = "pets.teams.useCurrent";
    btnUseCurrent.style.minWidth = "140px";
    const btnClear = ui.btn("Clear slots", { variant: "secondary" });
    btnClear.id = "pets.teams.clearSlots";
    btnClear.style.minWidth = "140px";
    const DARK_BG = "#0f1318";
    extra.append(btnUseCurrent, btnClear);

    Object.assign(btnUseCurrent.style, {
      width: "auto",
      fontSize: "16px",
      borderRadius: "10px",
      background: DARK_BG,
      boxShadow: "none",
    });
    Object.assign(btnClear.style, {
      width: "auto",
      fontSize: "16px",
      borderRadius: "10px",
      background: DARK_BG,
      boxShadow: "none",
    });

    const wrapSlots = document.createElement("div");
    wrapSlots.style.display = "flex";
    wrapSlots.style.flexDirection = "column";
    wrapSlots.style.gap = "8px";
    wrapSlots.append(grid, extra);

    card.appendChild(framed("⚡ Active pets (3 slots)", wrapSlots));

    return {
      rows: [r0, r1, r2],
      btnUseCurrent,
      btnClear,
    };
  })();

  // ===================== Wiring RIGHT side =====================
  async function repaintSlots(sourceTeam?: PetTeam | null) {
    const t = sourceTeam ?? getSelectedTeam();
    if (!t) return;
    let inv = await PetsService.getInventoryPets().catch(() => null) as InventoryPet[] | null;
    if (!inv || inv.length === 0) {
      // keep previous cache (if any)
    } else {
      invCacheMap = new Map<string, InventoryPet>();
      for (const p of inv) {
        const id = p?.id != null ? String(p.id) : "";
        if (id) invCacheMap.set(id, p);
      }
    }
    const map = invCacheMap ?? new Map<string, InventoryPet>();
    [0, 1, 2].forEach((i) => {
      const id = (t.slots[i] || null) as string | null;
      if (!id) {
        if (lastRenderedSlotIds[i] !== null) {
          secSlots.rows[i].update(null);
          lastRenderedSlotIds[i] = null;
        }
        return;
      }
      const pet = map.get(id);
      if (!pet) return;
      if (lastRenderedSlotIds[i] === id) return;
      secSlots.rows[i].update(pet);
      lastRenderedSlotIds[i] = id;
    });
  }

  async function hydrateEditor(team: PetTeam | null) {
    const has = !!team;
    secName.nameInput.disabled = !has;
    secSlots.btnClear.disabled = !has;
    secSlots.btnUseCurrent.disabled = !has;
    btnUseTeam.disabled = !has;
    btnSave.disabled = !has;


    if (has) {
      const saved = PetsService.getTeamSearch(team!.id) || "";
      const m = saved.match(/^(ab|sp):\s*(.*)$/i);
      const mode: "ability" | "species" = m
        ? (m[1].toLowerCase() === "ab" ? "ability" : "species")
        : "ability";
      secSearch.setMode(mode);
      await secSearch.rebuild();
      if (m) secSearch.setFromSearchString(saved);
    } else {
      await secSearch.rebuild();
    }

    if (!has) {
      secSlots.rows.forEach(r => r.update(null));
      secName.nameInput.value = "";
      return;
    }

    secName.nameInput.value = String(team!.name || "");
    await repaintSlots(team!);
  }

  // events: name change
  secName.nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") (ev.currentTarget as HTMLInputElement).blur();
  });
  secName.nameInput.addEventListener("blur", () => {
    const t = getSelectedTeam();
    if (!t) return;
    const nextName = secName.nameInput.value.trim();
    if (nextName !== t.name) {
      PetsService.saveTeam({ id: t.id, name: nextName });
    }
  });

  // Use current active
  secSlots.btnUseCurrent.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;
    try {
      const arr = await PetsService.getPets();
      const list = Array.isArray(arr) ? arr : [];
      const ids = list.map(p => String(p?.slot?.id || "")).filter(x => !!x).slice(0, 3);
      const nextSlots: (string | null)[] = [ids[0] || null, ids[1] || null, ids[2] || null];
      PetsService.saveTeam({ id: t.id, slots: nextSlots });
      await repaintSlots(t);
    } catch {}
  };

  // Clear slots
  secSlots.btnClear.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;
    PetsService.saveTeam({ id: t.id, slots: [null, null, null] });
    await repaintSlots(t);
  };

  // Save button (optionnel – auto-save déjà actif)
  btnSave.onclick = () => {
    const t = getSelectedTeam();
    if (!t) return;
    const name = secName.nameInput.value.trim();
    const slots = t.slots.slice(0, 3);
    PetsService.saveTeam({ id: t.id, name, slots });
    void repaintSlots(t);
  };

  function sameSet(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    for (const x of b) if (!s.has(x)) return false;
    return true;
  }

  async function waitForActiveTeam(team: PetTeam, timeoutMs = 2000) {
    const target = (team.slots || []).filter(Boolean) as string[];
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const pets = await PetsService.getPets().catch(() => null);
      const equip = Array.isArray(pets)
        ? pets.map(p => String(p?.slot?.id || "")).filter(Boolean)
        : [];
      if (sameSet(equip, target)) return true;
      await new Promise(r => setTimeout(r, 80));
    }
    return false;
  }

  btnUseTeam.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;

    try {
      isApplyingTeam = true;
      activeTeamId = t.id;
      await refreshTeamList(true);

      await PetsService.useTeam(t.id);
      await waitForActiveTeam(t);
      await hydrateEditor(getSelectedTeam());
      await refreshTeamList();
    } catch (e) {
      console.warn("[Pets] Use this team failed:", e);
      await refreshTeamList();
    } finally {
      isApplyingTeam = false;
    }
  };

  // ----- écoute inventaire unifié (le service gère mute/debounce) -----
  let unsubPets: (() => void) | null = null;
  (async () => {
    try {
      unsubPets = await onActivePetsStructuralChangeNow(async () => {
        if (isApplyingTeam) return;
        await repaintSlots(getSelectedTeam());
        await refreshTeamList();
      });
    } catch {}
  })();

  // ----- hotkeys après init du state -----
  installPetTeamHotkeysOnce(async (teamId) => {
    const t = teams.find(tt => tt.id === teamId) || null;
    try {
      isApplyingTeam = true;
      if (t) {
        activeTeamId = t.id;
        await refreshTeamList(true);
      }
      await PetsService.useTeam(teamId);
      if (t) await waitForActiveTeam(t);
      await hydrateEditor(getSelectedTeam());
      await refreshTeamList();
    } catch (e) {
      console.warn("[Pets] hotkey useTeam failed:", e);
      await refreshTeamList();
    } finally {
      isApplyingTeam = false;
    }
  });

  // cleanup on tab unmount
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubTeams?.(); } catch {}
      try { unsubPets?.(); } catch {}
      try { prev?.(); } catch {}
    };
  })();
}

/* ================== Onglet: Logs (nouveau) ================== */

function renderLogsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

  // ===== Layout
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateRows = "auto 1fr";
  wrap.style.gap = "10px";
  wrap.style.height = "54vh";
  view.appendChild(wrap);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexWrap = "wrap";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.border = "1px solid #4445";
  header.style.borderRadius = "10px";
  header.style.padding = "8px 10px";
  header.style.background = "#0f1318";
  wrap.appendChild(header);

  const selAbility = ui.select({ id: "pets.logs.filter.ability", width: "200px" });

  const selSort = ui.select({ id: "pets.logs.sort", width: "140px" });
  [["desc","Newest first"],["asc","Oldest first"]].forEach(([v,t])=>{
    const o = document.createElement("option"); o.value = v; o.textContent = t; selSort.appendChild(o);
  });
  selSort.value = "desc";

  const inputSearch = ui.inputText("search (pet / ability / details)", "");
  (inputSearch as any).id = "pets.logs.search";
  (inputSearch as HTMLInputElement).style.minWidth = "220px";

  const btnClear = ui.btn("🧹 Clear", { size: "sm" });
  btnClear.id = "pets.logs.clear";
  btnClear.style.flex = "0 0 auto";

  header.append(
    ui.label("Ability"), selAbility,
    ui.label("Sort"), selSort,
    inputSearch,
    btnClear
  );

  // ===== Card + header
  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.background = "#0f1318";
  card.style.overflow = "hidden";
  card.style.display = "grid";
  card.style.gridTemplateRows = "auto 1fr";
  card.style.minHeight = "0";
  wrap.appendChild(card);

  const headerGrid = document.createElement("div");
  headerGrid.style.display = "grid";
  headerGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
  headerGrid.style.columnGap = "0";
  headerGrid.style.borderBottom = "1px solid #ffffff1a";
  headerGrid.style.padding = "0 0 6px 0";

  function mkHeadCell(txt: string, align: "center"|"left" = "center") {
    const el = document.createElement("div");
    el.textContent = txt;
    el.style.fontWeight = "600";
    el.style.opacity = "0.9";
    el.style.padding = "6px 8px";
    el.style.textAlign = align;
    return el;
  }
  headerGrid.append(
    mkHeadCell("Time"),
    mkHeadCell("Pet"),
    mkHeadCell("Ability"),
    mkHeadCell("Details","left")
  );
  card.appendChild(headerGrid);

  // ===== Body scroller (grid)
  const bodyGrid = document.createElement("div");
  bodyGrid.style.display = "grid";
  bodyGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
  bodyGrid.style.gridAutoRows = "auto";
  bodyGrid.style.alignContent = "start";
  bodyGrid.style.overflow = "auto";
  bodyGrid.style.width = "100%";
  bodyGrid.style.minHeight = "0";
  card.appendChild(bodyGrid);

  // ===== State
  type UILog = {
    petId: string;
    petName: string | null | undefined;
    species: string | null | undefined;
    abilityId: string;
    abilityName: string;
    data: any;                 // déjà formatté string par le service
    performedAt: number;
    time12: string;
  };

  let logs: UILog[] = [];
  let abilityFilter = "";
  let sortDir: "asc" | "desc" = "desc";
  let q = "";

  // helpers simples
  function rebuildAbilityOptions() {
    const current = selAbility.value;
    selAbility.innerHTML = "";
    const opts = [["", "All abilities"], ...PetsService.getSeenAbilityIds().map(a => [a, a] as [string,string])];
    for (const [v,t] of opts) {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      selAbility.appendChild(o);
    }
    selAbility.value = (opts.some(([v]) => v === current) ? current : "");
  }

  function cell(txt: string, align: "center"|"left" = "center") {
    const el = document.createElement("div");
    el.textContent = txt;
    el.style.padding = "6px 8px";
    el.style.textAlign = align;
    el.style.whiteSpace = align === "left" ? "pre-wrap" : "normal";
    el.style.wordBreak = align === "left" ? "break-word" : "normal";
    el.style.borderBottom = "1px solid #ffffff12";
    return el;
  }

  function row(log: UILog) {
    const time = cell(log.time12, "center");
    const petLabel = (log.petName || log.species || "Pet");
    const pet  = cell(petLabel, "center");
    const abName = cell(log.abilityName || log.abilityId, "center");
    const detText = typeof log.data === "string" ? log.data : (() => { try { return JSON.stringify(log.data); } catch { return ""; } })();
    const det  = cell(detText, "left");
    bodyGrid.append(time, pet, abName, det);
  }

  // normalise pour filtre "ability X / X II"
  const normAbilityKey = (s?: string | null) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/([ivx]+)$/i, ""); // vire suffixe romain

  function applyFilters(): UILog[] {
    let arr = logs.slice();

    if (abilityFilter && abilityFilter.trim()) {
      const f = normAbilityKey(abilityFilter);
      arr = arr.filter(l => {
        const idKey   = normAbilityKey(l.abilityId);
        const nameKey = normAbilityKey(PetsService.getAbilityNameWithoutLevel(l.abilityId));
        return idKey === f || nameKey === f;
      });
    }

    if (q && q.trim()) {
      const qq = q.toLowerCase();
      arr = arr.filter(l => {
        const pet    = (l.petName || l.species || "").toLowerCase();
        const abName = (l.abilityName || "").toLowerCase();
        const abId   = (l.abilityId || "").toLowerCase();
        const det    = (typeof l.data === "string" ? l.data : (() => { try { return JSON.stringify(l.data); } catch { return ""; } })()).toLowerCase();
        return (
          pet.includes(qq) ||
          abName.includes(qq) || abId.includes(qq) ||
          det.includes(qq) ||
          (l.petId || "").toLowerCase().includes(qq)
        );
      });
    }

    arr.sort((a, b) =>
      sortDir === "asc" ? (a.performedAt - b.performedAt) : (b.performedAt - a.performedAt)
    );
    return arr;
  }

  function repaint() {
    bodyGrid.innerHTML = "";
    const arr = applyFilters();
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.textContent = "No logs yet.";
      empty.style.opacity = "0.75";
      empty.style.gridColumn = "1 / -1";
      empty.style.padding = "8px";
      bodyGrid.appendChild(empty);
      return;
    }
    arr.forEach(row);

    // autoscroll côté "fin" de liste (utile si tri asc)
    if (sortDir === "asc") bodyGrid.scrollTop = bodyGrid.scrollHeight + 32;
    else bodyGrid.scrollTop = 0;
  }

  // ===== handlers UI
  selAbility.onchange = () => { abilityFilter = selAbility.value; repaint(); };
  selSort.onchange = () => { sortDir = (selSort.value as "asc" | "desc") || "desc"; repaint(); };
  (inputSearch as HTMLInputElement).addEventListener("input", () => { q = (inputSearch as HTMLInputElement).value.trim(); repaint(); });
  btnClear.onclick = () => { try { PetsService.clearAbilityLogs(); } catch {} };

  // ===== subscriptions
  let stopWatcher: (() => void) | null = null;
  let unsubLogs: (() => void) | null = null;

  (async () => {
    try {
      // démarre le watcher (ingestion côté service)
      stopWatcher = await PetsService.startAbilityLogsWatcher();

      // seed + options
      rebuildAbilityOptions();

      // écoute du flux normalisé côté service
      unsubLogs = PetsService.onAbilityLogs((all) => {
        // mappe en shape UI (juste pour renommer "name" → "petName")
        logs = all.map(e => ({
          petId: e.petId,
          petName: e.name ?? null,
          species: e.species ?? null,
          abilityId: e.abilityId,
          abilityName: e.abilityName,
          data: e.data,
          performedAt: e.performedAt,
          time12: e.time12,
        }));
        rebuildAbilityOptions();
        repaint();
      });
    } catch {}
  })();

  // cleanup
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubLogs?.(); } catch {}
      try { stopWatcher?.(); } catch {}
      try { prev?.(); } catch {}
    };
  })();

  repaint();
}

/* ================== Entrée ================== */
export function renderPetsMenu(root: HTMLElement) {
  const ui = new Menu({ id: "pets", compact: true, windowSelector: ".qws-win" });
  ui.mount(root);
  
  ui.addTab("manager", "🧰 Manager", (view) => renderManagerTab(view, ui));
  ui.addTab("logs", "📝 Logs", (view) => renderLogsTab(view, ui));
}