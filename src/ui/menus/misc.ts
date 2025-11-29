// src/ui/menus/misc.ts
import { Menu } from "../menu";
import { MiscService } from "../../services/misc";

/* ---------------- helpers ---------------- */
const formatShortDuration = (seconds: number) => {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (r === 0) return `${m} min`;
  return `${m} min ${r} s`;
};

/* ---------------- number formatting (US) ---------------- */
const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

/* ---------------- entry ---------------- */

export async function renderMiscMenu(container: HTMLElement) {
  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "grid";
  view.style.gap = "8px";
  view.style.minHeight = "0";
  view.style.justifyItems = "center";

  /* ===== Section: Auto reco ===== */
  const secAutoReco = (() => {
    const card = ui.card("🔄 Auto reconnect on session conflict", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "480px";
    card.body.style.display = "grid";
    card.body.style.gap = "10px";

    const header = ui.flexRow({ align: "center", justify: "between", fullWidth: true });
    const toggleWrap = document.createElement("div");
    toggleWrap.style.display = "inline-flex";
    toggleWrap.style.alignItems = "center";
    toggleWrap.style.gap = "8px";
    const toggleLabel = ui.label("Activate");
    toggleLabel.style.margin = "0";
    const toggle = ui.switch(MiscService.readAutoRecoEnabled(false)) as HTMLInputElement;
    toggleWrap.append(toggleLabel, toggle as unknown as HTMLElement);
    header.append(toggleWrap);

    const initialSeconds = Math.round(MiscService.getAutoRecoDelayMs() / 1000);
    const sliderRow = ui.flexRow({ align: "center", gap: 10, justify: "between", fullWidth: true });
    const sliderLabel = ui.label("Reconnect after");
    sliderLabel.style.margin = "0";
    const slider = ui.slider(30, 300, 30, initialSeconds) as HTMLInputElement;
    slider.style.flex = "1";
    const sliderValue = document.createElement("div");
    sliderValue.style.minWidth = "72px";
    sliderValue.style.textAlign = "right";
    sliderValue.textContent = formatShortDuration(initialSeconds);
    sliderRow.append(sliderLabel, slider, sliderValue);

    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.35";

    const clampSeconds = (value: number) =>
      Math.max(30, Math.min(300, Math.round(value / 30) * 30));

    const syncToggle = () => {
      const on = !!toggle.checked;
      slider.disabled = !on;
      MiscService.writeAutoRecoEnabled(on);
      hint.textContent = on
        ? "Automatically log back in if this account is disconnected because it was opened in another session."
        : "Auto reconnect on session conflict is turned off.";
    };

    const updateSlider = (raw: number, persist: boolean) => {
      const seconds = clampSeconds(raw);
      slider.value = String(seconds);
      sliderValue.textContent = formatShortDuration(seconds);
      if (persist) MiscService.setAutoRecoDelayMs(seconds * 1000);
      syncToggle();
    };

    toggle.addEventListener("change", syncToggle);
    slider.addEventListener("input", () => updateSlider(Number(slider.value), false));
    slider.addEventListener("change", () => updateSlider(Number(slider.value), true));

    syncToggle();

    card.body.append(header, sliderRow, hint);
    return card.root;
  })();

  /* ===== Section: Player controls (Ghost + Delay on same line) ===== */
  const secPlayer = (() => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.flexWrap = "wrap";

    const pair = (labelText: string, controlEl: HTMLElement, labelId?: string) => {
      const wrap = document.createElement("div");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";

      const lab = ui.label(labelText);
      lab.style.fontSize = "13px";
      lab.style.margin = "0";
      lab.style.justifySelf = "start";
      if (labelId) (lab as any).id = labelId;

      wrap.append(lab, controlEl);
      return wrap;
    };

    const ghostSwitch = ui.switch(MiscService.readGhostEnabled(false)) as HTMLInputElement;
    (ghostSwitch as any).id = "player.ghostMode";
    const ghostPair = pair("Ghost", ghostSwitch as unknown as HTMLElement, "label.ghost");

    const delayInput = ui.inputNumber(10, 1000, 5, 50) as HTMLInputElement;
    (delayInput as any).id = "player.moveDelay";
    const delayWrap = ((delayInput as any).wrap ?? delayInput) as HTMLElement;
    (delayWrap as any).style && ((delayWrap as any).style.margin = "0");
    (delayInput as any).style && ((delayInput as any).style.width = "84px");
    const delayPair = pair("Delay (ms)", delayWrap, "label.delay");

    row.append(ghostPair, delayPair);

    const ghost = MiscService.createGhostController();
    delayInput.value = String(MiscService.getGhostDelayMs());
    delayInput.addEventListener("change", () => {
      const v = Math.max(10, Math.min(1000, Math.floor(Number(delayInput.value) || 50)));
      delayInput.value = String(v);
      ghost.setSpeed?.(v);
      MiscService.setGhostDelayMs(v);
    });

    if (ghostSwitch.checked) ghost.start();
    ghostSwitch.onchange = () => {
      const on = !!ghostSwitch.checked;
      MiscService.writeGhostEnabled(on);
      on ? ghost.start() : ghost.stop();
    };

    (row as any).__cleanup__ = () => { try { ghost.stop(); } catch {} };

    const card = ui.card("🎮 Player controls", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(row);
    return card.root;
  })();

  /* ===== Section: Seed deleter ===== */
  const secSeed = (() => {
    const grid = ui.formGrid({ columnGap: 6, rowGap: 6 });

    const selLabel = ui.label("Selected");
    selLabel.style.fontSize = "13px";
    selLabel.style.margin = "0";
    selLabel.style.justifySelf = "start";

    const selValue = document.createElement("div");
    selValue.id = "misc.seedDeleter.summary";
    selValue.style.fontSize = "13px";
    selValue.style.opacity = "0.9";
    selValue.textContent = "0 species - 0 seeds";
    grid.append(selLabel, selValue);

    const actLabel = ui.label("Actions");
    actLabel.style.fontSize = "13px";
    actLabel.style.margin = "0";
    actLabel.style.justifySelf = "start";

    const actions = ui.flexRow({ gap: 6 });
    actions.style.justifyContent = "flex-start";

    const btnSelect = ui.btn("Select seeds", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    grid.append(actLabel, actions);

    function readSelection() {
      const sel = MiscService.getCurrentSeedSelection?.() || [];
      const speciesCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, speciesCount, totalQty };
    }
    function updateSummaryUI() {
      const { speciesCount, totalQty } = readSelection();
      selValue.textContent = `${speciesCount} species - ${formatNum(totalQty)} seeds`;
      const has = speciesCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
    }

    btnSelect.onclick = async () => {
      await MiscService.openSeedSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearSeedSelection?.(); } catch {}
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      await MiscService.deleteSelectedSeeds();
      updateSummaryUI();
    };

    const card = ui.card("🌱 Seed deleter", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(grid);
    return card.root;
  })();

  /* ===== Section: Decor deleter ===== */
  const secDecor = (() => {
    const grid = ui.formGrid({ columnGap: 6, rowGap: 6 });

    const selLabel = ui.label("Selected");
    selLabel.style.fontSize = "13px";
    selLabel.style.margin = "0";
    selLabel.style.justifySelf = "start";

    const selValue = document.createElement("div");
    selValue.id = "misc.decorDeleter.summary";
    selValue.style.fontSize = "13px";
    selValue.style.opacity = "0.9";
    selValue.textContent = "0 decor - 0 items";
    grid.append(selLabel, selValue);

    const actLabel = ui.label("Actions");
    actLabel.style.fontSize = "13px";
    actLabel.style.margin = "0";
    actLabel.style.justifySelf = "start";

    const actions = ui.flexRow({ gap: 6 });
    actions.style.justifyContent = "flex-start";

    const btnSelect = ui.btn("Select decor", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    grid.append(actLabel, actions);

    function readSelection() {
      const sel = MiscService.getCurrentDecorSelection?.() || [];
      const decorCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, decorCount, totalQty };
    }
    function updateSummaryUI() {
      const { decorCount, totalQty } = readSelection();
      selValue.textContent = `${decorCount} decor - ${formatNum(totalQty)} items`;
      const has = decorCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
    }

    btnSelect.onclick = async () => {
      await MiscService.openDecorSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      await MiscService.deleteSelectedDecor?.();
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearDecorSelection?.(); } catch {}
      updateSummaryUI();
    };

    const card = ui.card("🧱 Decor deleter", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(grid);
    return card.root;
  })();

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "8px";
  content.style.justifyItems = "center";
  content.append(secAutoReco, secPlayer, secSeed, secDecor);

  view.appendChild(content);

  (view as any).__cleanup__ = () => {
    try { (secPlayer as any).__cleanup__?.(); } catch {}
    try { (secSeed as any).__cleanup__?.(); } catch {}
  };
}
