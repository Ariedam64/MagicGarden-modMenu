// src/ui/menus/misc.ts
import { Menu } from "../menu";
import { MiscService } from "../../services/misc";

/* ---------------- helpers ---------------- */

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

  /* ===== Section: Player controls (Ghost + Delay sur la même ligne) ===== */
  const secPlayer = (() => {
    // Ligne unique, deux paires label+control
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
      lab.style.fontSize = "13px";  // +1px
      lab.style.margin = "0";
      lab.style.justifySelf = "start";
      if (labelId) (lab as any).id = labelId;

      wrap.append(lab, controlEl);
      return wrap;
    };

    // Ghost pair
    const ghostSwitch = ui.switch(MiscService.readGhostEnabled(false)) as HTMLInputElement;
    (ghostSwitch as any).id = "player.ghostMode";
    const ghostPair = pair("Ghost", ghostSwitch as unknown as HTMLElement, "label.ghost");

    // Delay pair
    const delayInput = ui.inputNumber(10, 1000, 5, 50) as HTMLInputElement;
    (delayInput as any).id = "player.moveDelay";
    const delayWrap = ((delayInput as any).wrap ?? delayInput) as HTMLElement;
    (delayWrap as any).style && ((delayWrap as any).style.margin = "0");
    (delayInput as any).style && ((delayInput as any).style.width = "84px");
    const delayPair = pair("Delay (ms)", delayWrap, "label.delay");

    row.append(ghostPair, delayPair);

    // Wire to service
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

  /* ===== Section: Seed deleter (compact, neutral buttons) ===== */
  const secSeed = (() => {
    const grid = ui.formGrid({ columnGap: 6, rowGap: 6 });

    // Row: Selected
    const selLabel = ui.label("Selected");
    selLabel.style.fontSize = "13px"; // +1px
    selLabel.style.margin = "0";
    selLabel.style.justifySelf = "start";

    const selValue = document.createElement("div");
    selValue.id = "misc.seedDeleter.summary";
    selValue.style.fontSize = "13px"; // +1px
    selValue.style.opacity = "0.9";
    selValue.textContent = "0 species · 0 seeds";
    grid.append(selLabel, selValue);

    // Row: Actions
    const actLabel = ui.label("Actions");
    actLabel.style.fontSize = "13px"; // +1px
    actLabel.style.margin = "0";
    actLabel.style.justifySelf = "start";

    const actions = ui.flexRow({ gap: 6 });
    actions.style.justifyContent = "flex-start";

    const btnSelect = ui.btn("Select seeds", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    grid.append(actLabel, actions);

    // Helpers
    function readSelection() {
      const sel = MiscService.getCurrentSeedSelection?.() || [];
      const speciesCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, speciesCount, totalQty };
    }
    function updateSummaryUI() {
      const { speciesCount, totalQty } = readSelection();
      selValue.textContent = `${speciesCount} species · ${formatNum(totalQty)} seeds`;
      const has = speciesCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
    }

    // Events
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

    const card = ui.card("🗑️ Seed deleter", { tone: "muted", align: "center" });
    card.root.style.maxWidth = "440px";
    card.body.append(grid);
    return card.root;
  })();

  // Layout principal (compact)
  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "8px";
  content.style.justifyItems = "center";
  content.append(secPlayer, secSeed);

  view.appendChild(content);

  // cleanup
  (view as any).__cleanup__ = () => {
    try { (secPlayer as any).__cleanup__?.(); } catch {}
    try { (secSeed as any).__cleanup__?.(); } catch {}
  };
}
