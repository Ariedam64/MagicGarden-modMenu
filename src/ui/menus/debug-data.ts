// src/ui/menus/debug-data.ts
import { Menu } from "../menu";
import { audioPlayer, type SfxInfo } from "../../core/audioPlayer";
import { Sprites, type TileInfo } from "../../core/sprite";
import { findTileRefMatch } from "../../data/sprites";

// ---- Jotai helpers ----
import {
  ensureStore,
  isStoreCaptured,
  findAtomsByLabel,
  getAtomByLabel,
  jGet,
  jSet,
  jSub,
} from "../../store/jotai";

// ---- Service (shared logic) ----
import {
  Frame,
  FrameBuffer,
  fmtTime,
  escapeLite,
  installWSHookIfNeeded,
  getWSInfos,
  getWSStatusText,
  quinoaWS,
} from "../../services/debug-data";

// ------------------------------------------------------------------
// UI — Debug Tools Menu
// ------------------------------------------------------------------

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "mg-debug-data-styles";
  style.textContent = `
  .dd-debug-view{display:flex;flex-direction:column;gap:16px;}
  .dd-debug-columns{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(320px,1fr));align-items:start;}
  @media (max-width:720px){.dd-debug-columns{grid-template-columns:minmax(0,1fr);}}
  .dd-debug-column{display:flex;flex-direction:column;gap:16px;min-width:0;}
  .dd-card-description{font-size:13px;opacity:.72;margin:0;}
  .dd-atom-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:40vh;overflow:auto;padding-right:4px;}
  .dd-atom-list__item{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 6px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .12s ease,border-color .12s ease;}
  .dd-atom-list__item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);}
  .dd-atom-list__checkbox{accent-color:#5c7eff;}
  .dd-atom-list__label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .dd-status-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.01em;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f5f7ff;}
  .dd-status-chip.is-ok{color:#49d389;background:rgba(73,211,137,.14);border-color:rgba(73,211,137,.32);}
  .dd-status-chip.is-warn{color:#ffb760;background:rgba(255,183,96,.12);border-color:rgba(255,183,96,.32);}
  .dd-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
  .dd-toolbar--stretch{width:100%;}
  .dd-toolbar .qmm-input{min-width:160px;}
  .dd-toolbar .dd-grow{flex:1 1 220px;min-width:180px;}
  .dd-mute-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .dd-log{position:relative;border:1px solid #ffffff18;border-radius:16px;background:#0b1016;padding:10px;max-height:48vh;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
  .dd-log__empty{padding:28px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-log .ws-row{position:relative;display:grid;grid-template-columns:96px 20px minmax(0,1fr);gap:10px;padding:8px 12px;border-radius:12px;border:1px solid transparent;transition:background .15s ease,border-color .15s ease;align-items:start;margin:2px 0;}
  .dd-log .ws-row .ts{opacity:.76;font-size:12px;}
  .dd-log .ws-row .arrow{font-weight:600;}
  .dd-log .ws-row .body{white-space:pre-wrap;word-break:break-word;}
  .dd-log .ws-row .body code{font-family:inherit;font-size:12px;color:#dbe4ff;}
  .dd-log .ws-row .acts{position:absolute;top:6px;right:8px;display:flex;gap:6px;padding:4px 6px;background:rgba(13,18,25,.94);border:1px solid rgba(255,255,255,.18);border-radius:8px;opacity:0;visibility:hidden;transition:opacity .12s ease;z-index:1;}
  .dd-log .ws-row .acts .qmm-btn{padding:2px 6px;font-size:11px;}
  .dd-log .ws-row:hover .acts{opacity:1;visibility:visible;}
  .dd-log .ws-row:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.18);}
  .dd-log .ws-row.selected{background:rgba(92,126,255,.16);border-color:rgba(92,126,255,.42);}
  .dd-send-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
  .dd-send-controls .qmm-radio-group{display:flex;gap:10px;}
  .dd-textarea{min-height:140px;}
  .dd-inline-note{font-size:12px;opacity:.7;}
  .dd-log-filter-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .dd-script-log{position:relative;border:1px solid #ffffff18;border-radius:16px;background:#0b1016;max-height:48vh;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
  .dd-script-log__empty{padding:28px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-script-log__row{display:grid;grid-template-columns:minmax(92px,96px) minmax(70px,90px) minmax(120px,160px) minmax(0,1fr);gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);align-items:start;}
  .dd-script-log__row:last-child{border-bottom:none;}
  .dd-script-log__ts{font-size:12px;opacity:.7;font-family:var(--qmm-font-mono,monospace);}
  .dd-script-log__level{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;min-width:58px;}
  .dd-script-log__level.is-debug{background:rgba(138,180,255,.14);color:#8ab4ff;border:1px solid rgba(138,180,255,.32);}
  .dd-script-log__level.is-info{background:rgba(92,126,255,.14);color:#9fb6ff;border:1px solid rgba(92,126,255,.32);}
  .dd-script-log__level.is-warn{background:rgba(255,183,96,.12);color:#ffb760;border:1px solid rgba(255,183,96,.32);}
  .dd-script-log__level.is-error{background:rgba(255,108,132,.16);color:#ff6c84;border:1px solid rgba(255,108,132,.32);}
  .dd-script-log__source{font-size:12px;font-weight:600;opacity:.85;}
  .dd-script-log__context{display:block;font-size:11px;opacity:.6;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;}
  .dd-script-log__message-wrap{display:flex;flex-direction:column;gap:6px;}
  .dd-script-log__message{font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}
  .dd-script-log__actions{display:flex;gap:6px;justify-content:flex-end;align-self:flex-end;}
  .dd-script-log__actions button{padding:2px 8px;font-size:11px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease;}
  .dd-script-log__actions button:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.28);}
  .dd-script-log__details{grid-column:1/-1;margin:4px 0 0;background:#05080c;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;white-space:pre-wrap;font-family:var(--qmm-font-mono,monospace);font-size:12px;line-height:1.4;display:none;word-break:break-word;max-height:180px;overflow:auto;}
  .dd-script-log__row.is-open .dd-script-log__details{display:block;}
  .dd-log-source-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .dd-log-toolbar-spacer{flex:1 1 auto;}
  .dd-audio-summary{display:grid;gap:4px;font-size:13px;}
  .dd-audio-summary strong{font-size:14px;}
  .dd-audio-volume{font-family:var(--qmm-font-mono,monospace);font-size:12px;opacity:.78;}
  .dd-audio-list{display:flex;flex-direction:column;gap:8px;margin-top:4px;max-height:48vh;overflow:auto;padding-right:4px;}
  .dd-audio-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(9,12,18,.72);}
  .dd-audio-row__info{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:6px;}
  .dd-audio-row__title{font-weight:600;font-size:13px;word-break:break-word;}
  .dd-audio-meta{font-size:12px;opacity:.72;display:flex;flex-wrap:wrap;gap:8px;}
  .dd-audio-url{font-family:var(--qmm-font-mono,monospace);font-size:11px;word-break:break-all;color:#d6dcffb3;}
  .dd-audio-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;}
  .dd-audio-empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-sprite-controls{display:flex;flex-direction:column;gap:12px;}
  .dd-sprite-control-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));}
  .dd-sprite-control{display:flex;flex-direction:column;gap:4px;}
  .dd-sprite-control__label{font-size:11px;opacity:.72;text-transform:uppercase;letter-spacing:.08em;}
  .dd-sprite-control.is-hidden{display:none;}
  .dd-sprite-control .qmm-select{width:100%;}
  .dd-sprite-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:100%;}
  .dd-sprite-toolbar .qmm-input{flex:1 1 220px;min-width:180px;padding:6px 10px;border-radius:8px;font-size:13px;}
  .dd-sprite-btn{padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid rgba(124,148,255,.38);background:linear-gradient(180deg,rgba(122,150,255,.26),rgba(82,108,214,.14));color:#f5f7ff;box-shadow:0 3px 10px rgba(78,104,214,.22);text-shadow:0 1px 0 rgba(0,0,0,.24);}
  .dd-sprite-btn:hover{border-color:rgba(148,172,255,.45);background:linear-gradient(180deg,rgba(136,162,255,.34),rgba(98,122,226,.18));}
  .dd-sprite-btn:active{transform:translateY(1px);}
  .dd-sprite-btn .qmm-btn__icon{font-size:1.05em;}
  .dd-sprite-btn--ghost{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14);box-shadow:none;color:inherit;text-shadow:none;}
  .dd-sprite-btn--ghost:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);}
  .dd-sprite-list{display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow:auto;padding-right:4px;}
  .dd-sprite-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border-radius:10px;border:1px solid transparent;background:rgba(255,255,255,.02);cursor:pointer;text-align:left;transition:background .12s ease,border-color .12s ease,transform .12s ease;}
  .dd-sprite-item:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14);}
  .dd-sprite-item.is-active{border-color:rgba(92,126,255,.45);background:rgba(92,126,255,.18);}
  .dd-sprite-item__title{font-weight:600;font-size:13px;}
  .dd-sprite-item__subtitle{font-size:11px;opacity:.7;word-break:break-all;}
  .dd-sprite-empty{padding:20px 12px;text-align:center;font-size:13px;opacity:.68;}
  .dd-sprite-preview-body{display:flex;flex-direction:column;gap:12px;}
  .dd-sprite-preview-scroll{max-height:60vh;overflow:auto;padding-right:4px;}
  .dd-sprite-url{font-size:12px;opacity:.75;word-break:break-all;}
  .dd-sprite-tiles-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));}
  .dd-sprite-tile{display:flex;flex-direction:column;gap:6px;align-items:center;padding:8px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);}
  .dd-sprite-tile canvas{width:100%;height:auto;image-rendering:pixelated;background:#05080c;border-radius:8px;}
  .dd-sprite-tile__name{font-weight:600;font-size:12px;text-align:center;}
  .dd-sprite-tile__refs{font-size:11px;opacity:.68;text-align:center;font-family:var(--qmm-font-mono,monospace);word-break:break-word;}
  .dd-sprite-tile__meta{font-size:11px;opacity:.75;text-align:center;font-family:var(--qmm-font-mono,monospace);}
  .dd-sprite-ui-preview{display:flex;flex-direction:column;align-items:center;gap:12px;background:rgba(0,0,0,.28);padding:12px;border-radius:12px;}
  .dd-sprite-variant-grid{display:grid;gap:8px;width:100%;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));}
  .dd-sprite-variant-grid.is-wide{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));max-width:100%;}
  .dd-sprite-variant{display:flex;flex-direction:column;gap:4px;align-items:center;}
  .dd-sprite-variant__label{font-size:11px;opacity:.78;text-transform:uppercase;letter-spacing:.08em;text-align:center;}
  .dd-sprite-variant__label[data-variant="gold"]{color:#f8d47c;background:linear-gradient(135deg,#fff1a1,#f3c76a 58%,#f6b84f);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 1px 4px rgba(0,0,0,.35);}
  .dd-sprite-variant__label[data-variant="rainbow"]{color:#f7f2ff;background:linear-gradient(90deg,#ff6b6b,#ffd86f,#6bff8f,#6bc7ff,#b86bff);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 1px 4px rgba(0,0,0,.35);}
  .dd-sprite-variant__canvas{width:100%;height:auto;image-rendering:pixelated;background:#05080c;border-radius:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}
  `;
  document.head.appendChild(style);
}

function createTwoColumns(view: HTMLElement) {
  const columns = document.createElement("div");
  columns.className = "dd-debug-columns";
  view.appendChild(columns);

  const leftCol = document.createElement("div");
  leftCol.className = "dd-debug-column";
  const rightCol = document.createElement("div");
  rightCol.className = "dd-debug-column";
  columns.append(leftCol, rightCol);

  return { columns, leftCol, rightCol };
}

export async function renderDebugDataMenu(root: HTMLElement) {
  ensureStyles();

  const ui = new Menu({ id: "debug-tools", compact: true });
  ui.mount(root);

  ui.addTab("jotai", "Jotai", (view) => renderJotaiTab(view, ui));
  ui.addTab("atoms-live", "Live atoms", (view) => renderLiveAtomsTab(view, ui));
  ui.addTab("sprites", "Sprites", (view) => renderSpritesTab(view, ui));
  ui.addTab("audio-player", "Audio player", (view) => renderAudioPlayerTab(view, ui));
  ui.addTab("websocket", "WebSocket", (view) => renderWSTab(view, ui));
}

/* ===================== JOTAI TAB ===================== */

function renderJotaiTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  // LEFT: Capture store + helpers
  {
    const card = ui.card("🗄️ Capture store", {
      tone: "muted",
      subtitle: "Initialize the Jotai store so atoms can be inspected.",
    });
    leftCol.appendChild(card.root);

    const status = document.createElement("span");
    status.className = "dd-status-chip";
    const refreshStatus = () => {
      const captured = isStoreCaptured();
      status.textContent = captured ? "Store captured" : "Store not captured";
      status.classList.toggle("is-ok", captured);
      status.classList.toggle("is-warn", !captured);
    };
    refreshStatus();

    const actions = ui.flexRow({ gap: 10, align: "center", wrap: true });
    const btnCap = ui.btn("Capture store", {
      variant: "primary",
      icon: "⏺",
      onClick: async () => {
        try { await ensureStore(); } catch {}
        refreshStatus();
      },
    });

    actions.append(btnCap, status);
    card.body.appendChild(actions);
  }

  // LEFT: Find / List atoms
  {
    const card = ui.card("🔍 Explore atoms", {
      tone: "muted",
      subtitle: "Filter labels using a regular expression.",
    });
    leftCol.appendChild(card.root);

    const queryRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("regex label (ex: position|health)", "");
    q.classList.add("dd-grow");
    const btnList = ui.btn("List", { icon: "📄", onClick: () => doList() });
    const btnCopy = ui.btn("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
    queryRow.append(q, btnList, btnCopy);

    const pre = document.createElement("pre");
    stylePre(pre);
    pre.style.minHeight = "140px";

    async function doList() {
      const raw = q.value.trim();
      const rx = safeRegex(raw || ".*");
      const all = findAtomsByLabel(/.*/);
      const atoms = all.filter(a => rx.test(String(a?.debugLabel || a?.label || "")));
      const labels = atoms.map(a => String(a?.debugLabel || a?.label || "<?>"));
      pre.textContent = labels.join("\n");
    }

    card.body.append(queryRow, pre);
  }

  // RIGHT: Get / Subscribe
  {
    const card = ui.card("🧭 Inspect an atom", {
      tone: "muted",
      subtitle: "Get the current value or subscribe to updates.",
    });
    rightCol.appendChild(card.root);

    const controls = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("atom label (ex: positionAtom)", "");
    q.classList.add("dd-grow");
    const pre = document.createElement("pre");
    stylePre(pre);
    pre.style.minHeight = "160px";
    let unsubRef: null | (() => void) = null;

    const btnGet = ui.btn("Get", {
      icon: "👁",
      onClick: async () => {
        const atom = getAtomByLabel(q.value.trim());
        if (!atom) { pre.textContent = `Atom "${q.value}" not found`; return; }
        try { setText(pre, await jGet(atom)); }
        catch (e: any) { setText(pre, e?.message || String(e)); }
      },
    });
    const btnSub = ui.btn("Subscribe", {
      icon: "🔔",
      onClick: async () => {
        const label = q.value.trim();
        if (!label) return;
        const atom = getAtomByLabel(label);
        if (!atom) { pre.textContent = `Atom "${label}" not found`; return; }
        if (unsubRef) {
          unsubRef();
          unsubRef = null;
          btnSub.textContent = "Subscribe";
          return;
        }
        unsubRef = await jSub(atom, async () => { try { setText(pre, await jGet(atom)); } catch {} });
        btnSub.textContent = "Unsubscribe";
      },
    });
    const btnCopy = ui.btn("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
    controls.append(q, btnGet, btnSub, btnCopy);

    const note = document.createElement("p");
    note.className = "dd-inline-note";
    note.textContent = "Tip: subscriptions keep the value updated after each mutation.";

    card.body.append(controls, note, pre);
  }

  // RIGHT: Set atom
  {
    const card = ui.card("✏️ Update an atom", {
      tone: "muted",
      subtitle: "Publish a new value (JSON).",
    });
    rightCol.appendChild(card.root);

    const controls = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("atom label (ex: activeModalAtom)", "");
    q.classList.add("dd-grow");
    const ta = document.createElement("textarea");
    ta.className = "qmm-input dd-textarea";
    ta.placeholder = `JSON or text value, e.g. inventory or { "x": 1, "y": 2 }`;

    const btnSet = ui.btn("Set", {
      icon: "✅",
      variant: "primary",
      onClick: async () => {
        const label = q.value.trim();
        if (!label) { toast("Enter an atom label"); return; }

        try {
          await ensureStore();
        } catch (e: any) {
          toast(e?.message || "Unable to capture store");
          return;
        }
        if (!isStoreCaptured()) {
          toast("Store not captured. Use \"Capture store\" first.");
          return;
        }

        const atom = getAtomByLabel(label);
        if (!atom) { toast(`Atom "${label}" not found`); return; }

        const raw = ta.value;
        const trimmed = raw.trim();
        let val: any = raw;
        let fallback = false;
        if (trimmed) {
          try {
            val = JSON.parse(trimmed);
          } catch {
            fallback = true;
          }
        } else {
          val = "";
        }

        try {
          await jSet(atom, val);
          toast(fallback ? "Set OK (raw text)" : "Set OK");
        } catch (e: any) {
          toast(e?.message || "Set failed");
        }
      },
    });
    const btnCopy = ui.btn("Copy JSON", { icon: "📋", onClick: () => copy(ta.value) });
    controls.append(q, btnSet, btnCopy);

    card.body.append(controls, ta);
  }

  function setText(el: HTMLElement, v: any) {
    el.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  }
  function toast(msg: string) { try { (window as any).toastSimple?.(msg, "", "warn"); } catch {} }
}

/* ===================== ATOMS LIVE TAB ===================== */

type AtomLiveEntry = {
  atom: any;
  lastValue: any;
  unsubscribe: null | (() => void);
};

type AtomLiveRecord = {
  label: string;
  timestamp: number;
  previous: any;
  next: any;
  type: "initial" | "update";
};

function renderLiveAtomsTab(view: HTMLElement, ui: Menu) {
  if (typeof (view as any).__atoms_live_cleanup__ === "function") {
    try { (view as any).__atoms_live_cleanup__(); } catch {}
  }

  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const entries = new Map<string, AtomLiveEntry>();
  const records: AtomLiveRecord[] = [];
  let recording = false;
  let selectedRecord: number | null = null;

  const { leftCol, rightCol } = createTwoColumns(view);

  // ---------- Selection controls ----------
  const selectCard = ui.card("🧪 Pick atoms", {
    tone: "muted",
    subtitle: "Filter labels with a regex then toggle atoms to monitor.",
  });
  leftCol.appendChild(selectCard.root);

  const filterRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const filterInput = ui.inputText("regex label (ex: position|health)", "");
  filterInput.classList.add("dd-grow");
  const btnFilter = ui.btn("Refresh", { icon: "🔍", onClick: () => refreshMatches() });
  filterRow.append(filterInput, btnFilter);

  const matchesWrap = document.createElement("div");
  matchesWrap.className = "dd-atom-list";

  const emptyMatches = document.createElement("p");
  emptyMatches.className = "dd-card-description";
  emptyMatches.textContent = "No atoms match the current filter.";
  emptyMatches.style.display = "none";

  const selectedInfo = document.createElement("p");
  selectedInfo.className = "dd-card-description";
  selectedInfo.style.marginTop = "8px";

  selectCard.body.append(filterRow, matchesWrap, emptyMatches, selectedInfo);

  filterInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      refreshMatches();
    }
  });

  // ---------- Live log ----------
  const logCard = ui.card("📡 Live atom log", {
    tone: "muted",
    subtitle: "Start recording to capture updates for the selected atoms.",
  });
  rightCol.appendChild(logCard.root);

  const controlsRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const btnRecord = ui.btn("Start recording", {
    variant: "primary",
    onClick: () => toggleRecording(),
  });
  const btnClear = ui.btn("Clear log", {
    variant: "ghost",
    icon: "🧹",
    onClick: () => {
      records.length = 0;
      selectedRecord = null;
      renderRecords(false);
      updateDetails(null);
      updateControls();
    },
  });
  const btnCopyLog = ui.btn("Copy log", {
    variant: "ghost",
    icon: "📋",
    onClick: () => copyLog(),
  });
  controlsRow.append(btnRecord, btnClear, btnCopyLog);
  logCard.body.appendChild(controlsRow);

  const logWrap = document.createElement("div");
  logWrap.className = "dd-log";
  logWrap.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const logEmpty = document.createElement("div");
  logEmpty.className = "dd-log__empty";
  logEmpty.textContent = "No updates yet.";
  logWrap.appendChild(logEmpty);
  logCard.body.appendChild(logWrap);

  const detailHeader = document.createElement("p");
  detailHeader.className = "dd-card-description";
  detailHeader.textContent = "Select a log entry to inspect previous and next values.";

  const detailWrap = ui.flexRow({ gap: 12, wrap: true, fullWidth: true });
  const prevBox = document.createElement("div");
  prevBox.style.flex = "1 1 320px";
  const prevTitle = document.createElement("strong");
  prevTitle.textContent = "Previous";
  prevTitle.style.display = "block";
  prevTitle.style.marginBottom = "6px";
  const prevPre = document.createElement("pre");
  stylePre(prevPre);
  prevPre.style.minHeight = "140px";
  prevPre.textContent = "";
  prevBox.append(prevTitle, prevPre);

  const nextBox = document.createElement("div");
  nextBox.style.flex = "1 1 320px";
  const nextTitle = document.createElement("strong");
  nextTitle.textContent = "Next";
  nextTitle.style.display = "block";
  nextTitle.style.marginBottom = "6px";
  const nextPre = document.createElement("pre");
  stylePre(nextPre);
  nextPre.style.minHeight = "140px";
  nextPre.textContent = "";
  nextBox.append(nextTitle, nextPre);

  const historyBox = document.createElement("div");
  historyBox.style.flex = "1 1 100%";
  historyBox.style.minWidth = "0";
  const historyTitle = document.createElement("strong");
  historyTitle.textContent = "History";
  historyTitle.style.display = "block";
  historyTitle.style.marginBottom = "6px";
  const historyList = document.createElement("div");
  historyList.style.display = "flex";
  historyList.style.flexDirection = "column";
  historyList.style.gap = "10px";
  historyList.style.maxHeight = "320px";
  historyList.style.overflow = "auto";
  historyBox.append(historyTitle, historyList);

  detailWrap.append(prevBox, nextBox, historyBox);
  logCard.body.append(detailHeader, detailWrap);

  // ---------- Logic helpers ----------
  function refreshMatches() {
    const raw = filterInput.value.trim();
    const rx = safeRegex(raw || ".*");
    const atoms = findAtomsByLabel(rx);
    matchesWrap.innerHTML = "";
    emptyMatches.style.display = atoms.length ? "none" : "block";
    atoms
      .map((atom) => ({ atom, label: String(atom?.debugLabel || atom?.label || "<unknown>") }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach(({ atom, label }) => {
        const row = document.createElement("label");
        row.className = "dd-atom-list__item";
        row.title = label;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = entries.has(label);
        checkbox.className = "dd-atom-list__checkbox";

        const text = document.createElement("span");
        text.className = "dd-atom-list__label";
        text.textContent = label;

        row.append(checkbox, text);

        checkbox.addEventListener("change", async () => {
          if (checkbox.checked) {
            const existing = entries.get(label);
            if (existing) {
              existing.atom = atom;
            } else {
              entries.set(label, { atom, lastValue: null, unsubscribe: null });
            }
            if (recording) {
              const ok = await attachEntry(label);
              if (!ok) checkbox.checked = false;
            }
          } else {
            const existing = entries.get(label);
            if (existing?.unsubscribe) {
              try { existing.unsubscribe(); } catch {}
            }
            entries.delete(label);
          }
          updateSelectedInfo();
          updateControls();
        });

        matchesWrap.appendChild(row);
        if (entries.has(label)) {
          const existing = entries.get(label);
          if (existing) existing.atom = atom;
        }
      });
    updateSelectedInfo();
  }

  function updateSelectedInfo() {
    const size = entries.size;
    selectedInfo.textContent = size
      ? `${size} atom${size > 1 ? "s" : ""} selected.`
      : "No atom selected.";
  }

  function updateControls() {
    setBtnLabel(btnRecord, recording ? "Stop recording" : "Start recording");
    btnRecord.classList.toggle("active", recording);
    btnRecord.disabled = !recording && !entries.size;
    btnClear.disabled = records.length === 0;
    btnCopyLog.disabled = records.length === 0;
  }

  function renderRecords(autoScroll = false) {
    logWrap.innerHTML = "";
    if (!records.length) {
      logWrap.appendChild(logEmpty);
      renderHistoryFor(null, null);
      return;
    }
    records.forEach((rec, idx) => {
      const row = document.createElement("div");
      row.className = "atoms-log-row";
      row.dataset.idx = String(idx);
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(120px, 160px) minmax(0, 1fr)";
      row.style.gap = "12px";
      row.style.padding = "10px 12px";
      row.style.margin = "4px 0";
      row.style.borderRadius = "12px";
      row.style.border = "1px solid rgba(255,255,255,.12)";
      const isSelected = selectedRecord === idx;
      row.style.background = isSelected ? "rgba(92,126,255,.16)" : "rgba(11,16,22,.85)";
      row.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      row.style.cursor = "pointer";
      row.addEventListener("mouseenter", () => { row.style.borderColor = "rgba(255,255,255,.28)"; });
      row.addEventListener("mouseleave", () => {
        const sel = selectedRecord === idx;
        row.style.borderColor = sel ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      });

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "2px";
      const lbl = document.createElement("strong");
      lbl.textContent = rec.label;
      const ts = document.createElement("span");
      ts.style.opacity = "0.7";
      ts.style.fontSize = "12px";
      ts.textContent = `${fmtTime(rec.timestamp)}${rec.type === "initial" ? " • initial" : ""}`;
      left.append(lbl, ts);

      const summary = document.createElement("div");
      summary.style.fontSize = "12px";
      summary.style.lineHeight = "1.45";
      summary.style.whiteSpace = "pre-wrap";
      const prefix = rec.type === "initial" ? "[initial] " : "";
      summary.textContent = prefix + summarizeValue(rec.next);

      row.append(left, summary);
      row.addEventListener("click", () => {
        selectedRecord = idx;
        renderRecords(false);
        updateDetails(rec);
      });
      logWrap.appendChild(row);
    });
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
    if (selectedRecord != null && !records[selectedRecord]) {
      selectedRecord = records.length ? Math.min(selectedRecord, records.length - 1) : null;
    }
    if (selectedRecord != null) {
      renderHistoryFor(records[selectedRecord]?.label ?? null, selectedRecord);
    }
  }

  function updateDetails(rec: AtomLiveRecord | null) {
    if (!rec) {
      detailHeader.textContent = "Select a log entry to inspect previous and next values.";
      prevTitle.textContent = "Previous";
      prevPre.textContent = "";
      nextTitle.textContent = "Next";
      nextPre.textContent = "";
      renderHistoryFor(null, null);
      return;
    }
    const typeSuffix = rec.type === "initial" ? " (initial)" : "";
    detailHeader.textContent = `${rec.label} — ${fmtTime(rec.timestamp)}${typeSuffix}`;
    prevTitle.textContent = rec.type === "initial" ? "Previous (none)" : "Previous";
    prevPre.textContent = rec.type === "initial" ? "(no previous snapshot)" : stringify(rec.previous);
    nextTitle.textContent = rec.type === "initial" ? "Initial value" : "Next";
    nextPre.textContent = stringify(rec.next);
    renderHistoryFor(rec.label, selectedRecord);
  }

  function renderHistoryFor(label: string | null, selectedIdx: number | null) {
    historyList.innerHTML = "";
    if (!label) {
      const empty = document.createElement("p");
      empty.className = "dd-card-description";
      empty.textContent = "Select a log entry to inspect the value history.";
      historyList.appendChild(empty);
      return;
    }

    const relevant = records
      .map((rec, idx) => ({ rec, idx }))
      .filter(({ rec }) => rec.label === label);

    if (!relevant.length) {
      const empty = document.createElement("p");
      empty.className = "dd-card-description";
      empty.textContent = "No history recorded yet.";
      historyList.appendChild(empty);
      return;
    }

    relevant.forEach(({ rec, idx }, order) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.flexDirection = "column";
      item.style.gap = "6px";
      item.style.padding = "10px 12px";
      item.style.borderRadius = "12px";
      item.style.border = "1px solid rgba(255,255,255,.12)";
      const isSelected = idx === selectedIdx;
      item.style.background = isSelected ? "rgba(92,126,255,.16)" : "rgba(11,16,22,.85)";
      item.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      item.style.cursor = "pointer";

      item.addEventListener("mouseenter", () => {
        if (!isSelected) item.style.borderColor = "rgba(255,255,255,.24)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      });
      item.addEventListener("click", () => {
        selectedRecord = idx;
        renderRecords(false);
        updateDetails(records[selectedRecord]);
      });

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.justifyContent = "space-between";

      const meta = document.createElement("div");
      meta.style.display = "flex";
      meta.style.alignItems = "center";
      meta.style.gap = "8px";

      const orderBadge = document.createElement("span");
      orderBadge.textContent = `#${order + 1}`;
      orderBadge.style.fontSize = "11px";
      orderBadge.style.letterSpacing = ".04em";
      orderBadge.style.textTransform = "uppercase";
      orderBadge.style.padding = "2px 6px";
      orderBadge.style.borderRadius = "999px";
      orderBadge.style.background = "rgba(255,255,255,.08)";
      orderBadge.style.border = "1px solid rgba(255,255,255,.16)";

      const type = document.createElement("span");
      type.textContent = rec.type === "initial" ? "Initial" : "Update";
      type.style.fontSize = "11px";
      type.style.opacity = "0.75";
      type.style.textTransform = "uppercase";

      meta.append(orderBadge, type);

      const ts = document.createElement("span");
      ts.textContent = fmtTime(rec.timestamp);
      ts.style.fontSize = "12px";
      ts.style.opacity = "0.75";

      head.append(meta, ts);

      const val = document.createElement("pre");
      stylePre(val);
      val.style.margin = "0";
      val.textContent = stringify(rec.next);

      item.append(head, val);
      historyList.appendChild(item);
    });
  }

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (!entries.size) {
      toast("Select at least one atom");
      return;
    }
    try {
      await ensureStore();
    } catch (e: any) {
      toast(e?.message || "Unable to capture store");
      return;
    }
    recording = true;
    updateControls();
    for (const label of Array.from(entries.keys())) {
      const ok = await attachEntry(label);
      if (!ok) entries.delete(label);
    }
    if (!entries.size) {
      stopRecording();
    }
    updateSelectedInfo();
    updateControls();
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    for (const entry of entries.values()) {
      if (entry.unsubscribe) {
        try { entry.unsubscribe(); } catch {}
        entry.unsubscribe = null;
      }
    }
    updateControls();
  }

  async function attachEntry(label: string): Promise<boolean> {
    const entry = entries.get(label);
    if (!entry) return false;
    if (entry.unsubscribe) {
      try { entry.unsubscribe(); } catch {}
      entry.unsubscribe = null;
    }
    try {
      const initialValue = snapshot(await jGet(entry.atom));
      entry.lastValue = initialValue;
      const unsub = await jSub(entry.atom, async () => {
        const previous = snapshot(entry.lastValue);
        let nextValue: any;
        try { nextValue = await jGet(entry.atom); }
        catch (err: any) { nextValue = err?.message || String(err); }
        const nextSnap = snapshot(nextValue);
        entry.lastValue = nextSnap;
        const rec: AtomLiveRecord = {
          label,
          timestamp: Date.now(),
          previous,
          next: nextSnap,
          type: "update",
        };
        records.push(rec);
        if (selectedRecord == null) selectedRecord = records.length - 1;
        renderRecords(true);
        updateDetails(records[selectedRecord]);
        updateControls();
      });
      const initialRecord: AtomLiveRecord = {
        label,
        timestamp: Date.now(),
        previous: null,
        next: snapshot(initialValue),
        type: "initial",
      };
      records.push(initialRecord);
      if (selectedRecord == null) selectedRecord = records.length - 1;
      renderRecords(true);
      updateDetails(records[selectedRecord]);
      entry.unsubscribe = () => { try { unsub(); } catch {}; };
      return true;
    } catch (err: any) {
      toast(err?.message || `Unable to subscribe to ${label}`);
      entries.delete(label);
      updateSelectedInfo();
      updateControls();
      return false;
    }
  }

  function copyLog() {
    if (!records.length) return;
    const text = records
      .map((rec) => {
        const prev = rec.previous == null ? "(no previous snapshot)" : stringify(rec.previous);
        const next = stringify(rec.next);
        const type = rec.type === "initial" ? "initial" : "update";
        return `[${fmtTime(rec.timestamp)}] ${rec.label} (${type})\nprevious: ${prev}\nnext: ${next}`;
      })
      .join("\n\n");
    copy(text);
  }

  function snapshot<T = any>(value: T): T {
    if (value == null) return value;
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch {}
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function stringify(value: any): string {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }

  function summarizeValue(value: any): string {
    const str = stringify(value).replace(/\s+/g, " ").trim();
    return str.length > 140 ? str.slice(0, 140) + "…" : str;
  }

  function setBtnLabel(btn: HTMLButtonElement, text: string) {
    const label = btn.querySelector<HTMLElement>(".label");
    if (label) label.textContent = text; else btn.textContent = text;
  }

  function toast(msg: string, type: "warn" | "success" = "warn") {
    try { (window as any).toastSimple?.(msg, "", type); } catch {}
  }

  refreshMatches();
  updateControls();

  (view as any).__atoms_live_cleanup__ = () => {
    stopRecording();
    for (const entry of entries.values()) {
      if (entry.unsubscribe) {
        try { entry.unsubscribe(); } catch {}
      }
    }
    entries.clear();
    records.length = 0;
    selectedRecord = null;
  };
}

/* ===================== SPRITES TAB ===================== */

function renderSpritesTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  type SpriteModeTab = "tiles" | "ui";
  type SpriteEntry = { base: string; url: string };
  type SpriteVariantType = "normal" | "gold" | "rainbow";
  type VariantFilter = SpriteVariantType | "all";

  type TileCategory = {
    id: string;
    label: string;
    icon: string;
    getUrls: () => string[];
  };

  const tileCategoryBase: TileCategory[] = [
    { id: "all", label: "All tiles", icon: "🗂️", getUrls: () => Sprites.lists().tiles },
    { id: "map", label: "Map", icon: "🗺️", getUrls: () => Sprites.listMap() },
    {
      id: "plants",
      label: "Plants",
      icon: "🌿",
      getUrls: () => {
        const urls = new Set([
          ...Sprites.listPlants(),
          ...Sprites.listAllPlants(),
        ]);
        return [...urls];
      },
    },
    { id: "seeds", label: "Seeds", icon: "🌰", getUrls: () => Sprites.listSeeds() },
    { id: "items", label: "Items", icon: "🎁", getUrls: () => Sprites.listItems() },
    { id: "pets", label: "Pets", icon: "🐾", getUrls: () => Sprites.listPets() },
  ];

  const tileCategories: TileCategory[] = [
    ...tileCategoryBase,
    {
      id: "other",
      label: "Other",
      icon: "🧩",
      getUrls: () => {
        const rest = new Set(Sprites.lists().tiles);
        tileCategoryBase
          .filter((cat) => cat.id !== "all")
          .forEach((cat) => {
            for (const url of cat.getUrls()) rest.delete(url);
          });
        return [...rest];
      },
    },
  ];

  let mode: SpriteModeTab = "tiles";
  let category = "all";
  let selectedBase: string | null = null;
  let allEntries: SpriteEntry[] = [];
  let filteredEntries: SpriteEntry[] = [];
  let previewToken = 0;
  let variantFilter: VariantFilter = "all";

  const controlsCard = ui.card("🎨 Sprites explorer", {
    tone: "muted",
    subtitle: "Browse captured tile sheets and UI assets detected by the sprite sniffer.",
  });
  controlsCard.body.classList.add("dd-sprite-controls");
  leftCol.appendChild(controlsCard.root);

  const controlsGrid = document.createElement("div");
  controlsGrid.className = "dd-sprite-control-grid";
  controlsCard.body.appendChild(controlsGrid);

  function createSelectControl(labelText: string, select: HTMLSelectElement): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "dd-sprite-control";
    const labelEl = document.createElement("span");
    labelEl.className = "dd-sprite-control__label";
    labelEl.textContent = labelText;
    wrap.append(labelEl, select);
    return wrap;
  }

  const modeSelect = ui.select({ width: "100%" });
  const modeOptions: { value: SpriteModeTab; label: string }[] = [
    { value: "tiles", label: "🧱 Tiles" },
    { value: "ui", label: "🖼️ UI" },
  ];
  modeOptions.forEach(({ value, label }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modeSelect.appendChild(opt);
  });
  modeSelect.value = mode;
  const modeControl = createSelectControl("Asset type", modeSelect);
  controlsGrid.appendChild(modeControl);

  const categorySelect = ui.select({ width: "100%" });
  tileCategories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.label}`;
    categorySelect.appendChild(opt);
  });
  categorySelect.value = category;
  const categoryControl = createSelectControl("Tiles category", categorySelect);
  controlsGrid.appendChild(categoryControl);

  const variantSelect = ui.select({ width: "100%" });
  const variantOptions: { id: VariantFilter; label: string }[] = [
    { id: "all", label: "✨ All variants" },
    { id: "normal", label: "🎨 Normal" },
    { id: "gold", label: "🥇 Gold" },
    { id: "rainbow", label: "🌈 Rainbow" },
  ];
  variantOptions.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.id;
    opt.textContent = option.label;
    variantSelect.appendChild(opt);
  });
  variantSelect.value = variantFilter;
  const variantControl = createSelectControl("Variant preview", variantSelect);
  controlsGrid.appendChild(variantControl);

  const controlsFooter = ui.flexRow({ gap: 8, wrap: true, fullWidth: true });
  controlsFooter.classList.add("dd-sprite-toolbar");
  const btnRefresh = ui.btn("Refresh lists", {
    icon: "🔄",
    size: "sm",
    onClick: () => refreshList({ preserveSelection: true }),
  }) as HTMLButtonElement;
  btnRefresh.classList.add("dd-sprite-btn");
  controlsFooter.appendChild(btnRefresh);
  controlsCard.body.appendChild(controlsFooter);

  const listCard = ui.card("🗂️ Tile sheets", {
    tone: "muted",
    subtitle: "Select a sprite sheet to preview its tiles.",
  });
  listCard.body.style.display = "flex";
  listCard.body.style.flexDirection = "column";
  listCard.body.style.gap = "12px";
  leftCol.appendChild(listCard.root);

  const filterRow = ui.flexRow({ gap: 8, wrap: true, fullWidth: true });
  filterRow.classList.add("dd-sprite-toolbar");
  const filterInput = ui.inputText("filter (regex)", "");
  filterInput.classList.add("dd-grow");
  const btnClearFilter = ui.btn("Clear", {
    icon: "🧹",
    size: "sm",
    onClick: () => {
      filterInput.value = "";
      applyFilter(true);
      filterInput.focus();
    },
  }) as HTMLButtonElement;
  btnClearFilter.classList.add("dd-sprite-btn", "dd-sprite-btn--ghost");
  filterRow.append(filterInput, btnClearFilter);
  listCard.body.appendChild(filterRow);

  const listInfo = document.createElement("div");
  listInfo.className = "dd-card-description";
  listCard.body.appendChild(listInfo);

  const listContainer = document.createElement("div");
  listContainer.className = "dd-sprite-list";
  listCard.body.appendChild(listContainer);

  const listEmpty = document.createElement("div");
  listEmpty.className = "dd-sprite-empty";
  listEmpty.style.display = "none";
  listCard.body.appendChild(listEmpty);

  const previewCard = ui.card("👁️ Preview", {
    tone: "muted",
    subtitle: "Visualize the slices for a tile sheet or inspect a UI sprite.",
  });
  previewCard.body.classList.add("dd-sprite-preview-body");
  rightCol.appendChild(previewCard.root);

  const previewBody = previewCard.body;

  const placeholder = document.createElement("div");
  placeholder.className = "dd-sprite-empty";
  placeholder.textContent = "Select a sprite sheet or UI asset from the list.";
  previewBody.appendChild(placeholder);

  function setMode(next: SpriteModeTab) {
    if (mode === next) return;
    mode = next;
    modeSelect.value = mode;
    updateCategoryVisibility();
    updateListTitle();
    refreshList({ preserveSelection: false });
  }

  function updateCategoryVisibility() {
    const showTiles = mode === "tiles";
    categoryControl.classList.toggle("is-hidden", !showTiles);
    categorySelect.disabled = !showTiles;
  }

  function refreshList(opts: { preserveSelection?: boolean } = {}) {
    const preserve = !!opts.preserveSelection;
    const previous = preserve ? selectedBase : null;

    const urls =
      mode === "tiles"
        ? getCategoryUrls(category)
        : Array.from(new Set(Sprites.lists().ui));

    allEntries = toEntries(urls);

    if (preserve && previous && allEntries.some((entry) => entry.base === previous)) {
      selectedBase = previous;
    } else {
      selectedBase = allEntries[0]?.base ?? null;
    }

    updateListTitle();
    applyFilter(true);
  }

  function getCategoryUrls(catId: string): string[] {
    const cat = tileCategories.find((c) => c.id === catId) ?? tileCategories[0];
    try {
      return Array.from(new Set(cat.getUrls()));
    } catch {
      return [];
    }
  }

  function toEntries(urls: string[]): SpriteEntry[] {
    return urls
      .map((url) => ({ url, base: baseName(url) }))
      .sort((a, b) => a.base.localeCompare(b.base));
  }

  function applyFilter(preserveSelection: boolean) {
    const query = filterInput.value.trim();
    const rx = query ? safeRegex(query) : /.*/i;
    filteredEntries = allEntries.filter((entry) => rx.test(entry.base) || rx.test(entry.url));

    if (preserveSelection) {
      if (selectedBase && !filteredEntries.some((entry) => entry.base === selectedBase)) {
        selectedBase = filteredEntries[0]?.base ?? null;
      }
    } else {
      selectedBase = filteredEntries[0]?.base ?? null;
    }

    renderListItems();
    updateInfoLine();
    updateEmptyState();
    updateSelectionStyles();
    void renderCurrentPreview();
  }

  function renderListItems() {
    listContainer.innerHTML = "";
    for (const entry of filteredEntries) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dd-sprite-item";
      item.dataset.base = entry.base;
      if (entry.base === selectedBase) item.classList.add("is-active");

      const title = document.createElement("span");
      title.className = "dd-sprite-item__title";
      title.textContent = entry.base;

      const subtitle = document.createElement("span");
      subtitle.className = "dd-sprite-item__subtitle";
      subtitle.textContent = shortenUrl(entry.url);

      item.append(title, subtitle);
      item.addEventListener("click", () => setSelected(entry.base));

      listContainer.appendChild(item);
    }
  }

  function updateSelectionStyles() {
    listContainer.querySelectorAll<HTMLButtonElement>(".dd-sprite-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.base === selectedBase);
    });
  }

  function updateInfoLine() {
    const total = allEntries.length;
    const visible = filteredEntries.length;
    const label = mode === "tiles" ? "tile sheet" : "UI asset";

    if (!total) {
      listInfo.textContent =
        mode === "tiles"
          ? "No tile sheets captured yet. Trigger in-game actions then refresh."
          : "No UI sprites captured yet. Interact with the UI then refresh.";
      return;
    }

    let text = `${visible} ${label}${visible === 1 ? "" : "s"} visible`;
    if (visible !== total) text += ` (total ${total})`;
    if (mode === "tiles" && category !== "all") {
      const cat = tileCategories.find((c) => c.id === category);
      if (cat) text += ` · ${cat.label}`;
    }
    listInfo.textContent = text;
  }

  function updateEmptyState() {
    if (filteredEntries.length) {
      listEmpty.style.display = "none";
    } else {
      listEmpty.style.display = "";
      if (!allEntries.length) {
        listEmpty.textContent =
          mode === "tiles"
            ? "No tile sheets captured yet. Trigger in-game actions then refresh."
            : "No UI sprites captured yet. Interact with the UI then refresh.";
      } else {
        listEmpty.textContent =
          mode === "tiles"
            ? "No tile sheets match the current filters."
            : "No UI assets match the current filters.";
      }
    }
  }

  function setSelected(base: string | null) {
    if (selectedBase === base) return;
    selectedBase = base;
    updateSelectionStyles();
    void renderCurrentPreview();
  }

  async function renderCurrentPreview() {
    const entry =
      filteredEntries.find((item) => item.base === selectedBase) ??
      allEntries.find((item) => item.base === selectedBase) ??
      null;
    const token = ++previewToken;
    await renderPreview(entry, token);
  }

  async function renderPreview(entry: SpriteEntry | null, token: number) {
    if (!entry) {
      previewCard.setTitle("👁️ Preview");
      previewBody.replaceChildren(
        createEmptyMessage(
          mode === "tiles"
            ? "Select a tile sheet to preview its tiles."
            : "Select a UI asset to inspect it.",
        ),
      );
      return;
    }

    previewCard.setTitle(`👁️ Preview · ${entry.base}`);

    const loading = createEmptyMessage("Loading…");
    previewBody.replaceChildren(loading);

    try {
      if (mode === "tiles") {
        await renderTilesPreview(entry, token);
      } else {
        await renderUiPreview(entry, token);
      }
    } catch (error) {
      if (token !== previewToken) return;
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      previewBody.replaceChildren(createEmptyMessage(`Failed to load sprite: ${message}`));
    }
  }

  type SpriteVariant = {
    type: SpriteVariantType;
    icon: string;
    label: string;
    canvas: HTMLCanvasElement;
  };

  function createVariantGrid(variants: SpriteVariant[], opts?: { wide?: boolean }): HTMLDivElement {
    const grid = document.createElement("div");
    grid.className = "dd-sprite-variant-grid";
    if (opts?.wide) grid.classList.add("is-wide");

    variants.forEach((variant) => {
      const { type, icon, label, canvas } = variant;
      canvas.classList.add("dd-sprite-variant__canvas");
      const item = document.createElement("div");
      item.className = "dd-sprite-variant";

      const caption = document.createElement("div");
      caption.className = "dd-sprite-variant__label";
      caption.dataset.variant = type;
      caption.textContent = `${icon} ${label}`;

      item.append(canvas, caption);
      grid.appendChild(item);
    });

    return grid;
  }

  function tileToCanvasCopy(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement | null {
    const src = tile.data as any;
    if (typeof src === "string" || !src) return null;

    const fallbackSize = tile.size ?? 0;
    const width = Math.max(typeof src.width === "number" ? src.width : fallbackSize, 1);
    const height = Math.max(typeof src.height === "number" ? src.height : fallbackSize, 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    try {
      ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
    } catch {
      return null;
    }

    return canvas;
  }

  function filterVariantsForDisplay(variants: SpriteVariant[]): SpriteVariant[] {
    if (variantFilter === "all") return variants;
    return variants.filter((variant) => variant.type === variantFilter);
  }

  function buildVariants(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): SpriteVariant[] {
    const variants: SpriteVariant[] = [];

    const base = tileToCanvasCopy(tile);
    if (base) {
      variants.push({ type: "normal", icon: "🎨", label: "Normal", canvas: base });
    }

    const addVariant = (
      type: SpriteVariantType,
      label: string,
      icon: string,
      factory: () => HTMLCanvasElement,
    ) => {
      try {
        const canvas = factory();
        variants.push({ type, icon, label, canvas });
      } catch {
        /* ignore failed variants */
      }
    };

    if (base) {
      addVariant("gold", "Gold", "🥇", () => Sprites.effectGold(tile));
      addVariant("rainbow", "Rainbow", "🌈", () => Sprites.effectRainbow(tile));
    }

    return variants;
  }

  async function renderTilesPreview(entry: SpriteEntry, token: number) {
    const escaped = entry.base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`${escaped}\.(png|webp)$`, "i");
    const map = await Sprites.loadTiles({ mode: "canvas", includeBlanks: false, onlySheets: rx });
    if (token !== previewToken) return;

    const tiles = (map.get(entry.base) || []) as TileInfo<HTMLCanvasElement>[];
    previewBody.innerHTML = "";
    if (!tiles.length) {
      previewBody.append(createEmptyMessage("No tiles available for this sheet."));
      return;
    }

    const summary = document.createElement("div");
    summary.className = "dd-card-description";
    const size = tiles[0]?.size ?? 0;
    summary.textContent = `${tiles.length} tile${tiles.length === 1 ? "" : "s"} · ${
      size ? `${size}×${size}px` : "unknown size"
    }`;

    const urlLine = createUrlLine(entry.url);

    const scroll = document.createElement("div");
    scroll.className = "dd-sprite-preview-scroll";

    const grid = document.createElement("div");
    grid.className = "dd-sprite-tiles-grid";
    scroll.appendChild(grid);

    tiles.forEach((tile) => {
      const cell = document.createElement("div");
      cell.className = "dd-sprite-tile";

      const variants = filterVariantsForDisplay(buildVariants(tile));
      if (variants.length) {
        cell.appendChild(createVariantGrid(variants));
      }

      const match = findTileRefMatch(tile.sheet, tile.index);
      if (match) {
        const displayNames = Array.from(
          new Set(match.entries.map((entry) => entry.displayName || entry.key)),
        );

        const titleLine = document.createElement("div");
        titleLine.className = "dd-sprite-tile__name";
        titleLine.textContent = displayNames.length
          ? `${match.sheetLabel}: ${displayNames.join(", ")}`
          : match.sheetLabel;
        cell.appendChild(titleLine);

        const refsLine = document.createElement("div");
        refsLine.className = "dd-sprite-tile__refs";
        const refsText = match.entries
          .map((entry) => `${entry.qualifiedName} (#${entry.index})`)
          .join(" · ");
        refsLine.textContent = refsText;
        refsLine.title = refsText;
        cell.appendChild(refsLine);
      }

      const meta = document.createElement("div");
      meta.className = "dd-sprite-tile__meta";
      meta.textContent = `#${tile.index} · col ${tile.col} · row ${tile.row}`;

      cell.appendChild(meta);
      grid.appendChild(cell);
    });

    previewBody.append(summary, urlLine, scroll);
  }

  async function renderUiPreview(entry: SpriteEntry, token: number) {
    const map = await Sprites.loadUI();
    if (token !== previewToken) return;

    const img = map.get(entry.base);
    previewBody.innerHTML = "";
    if (!img) {
      previewBody.append(createEmptyMessage("This UI asset was not found in the cache yet."));
      return;
    }

    const dimensions = document.createElement("div");
    dimensions.className = "dd-card-description";
    dimensions.textContent = "Dimensions: …";

    const urlLine = createUrlLine(entry.url);

    const wrap = document.createElement("div");
    wrap.className = "dd-sprite-ui-preview";

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (naturalWidth && naturalHeight) {
      dimensions.textContent = `Dimensions: ${naturalWidth}×${naturalHeight}px`;
    } else {
      dimensions.textContent = "Dimensions: unknown";
    }

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = naturalWidth || img.width || 1;
    baseCanvas.height = naturalHeight || img.height || 1;
    const ctx = baseCanvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      try {
        ctx.drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);
      } catch {
        /* ignore draw failures for not-yet-loaded assets */
      }
    }

    const baseTile: TileInfo<HTMLCanvasElement> = {
      sheet: entry.base,
      url: entry.url,
      index: 0,
      col: 0,
      row: 0,
      size: Math.max(baseCanvas.width, baseCanvas.height, 1),
      data: baseCanvas,
    };

    const variants = filterVariantsForDisplay(buildVariants(baseTile));
    if (variants.length) {
      // For UI assets keep a wider layout when possible.
      wrap.appendChild(createVariantGrid(variants, { wide: true }));
    }

    previewBody.append(dimensions, urlLine, wrap);
  }

  function updateListTitle() {
    if (mode === "tiles") {
      const cat = tileCategories.find((c) => c.id === category);
      listCard.setTitle(`${cat?.icon ?? "🗂️"} ${cat?.label ?? "Tiles"}`);
    } else {
      listCard.setTitle("🖼️ UI assets");
    }
  }

  function createUrlLine(url: string): HTMLDivElement {
    const line = document.createElement("div");
    line.className = "dd-sprite-url";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    line.appendChild(link);
    return line;
  }

  function createEmptyMessage(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "dd-sprite-empty";
    div.textContent = text;
    return div;
  }

  function baseName(url: string): string {
    try {
      const clean = decodeURIComponent(url.split(/[#?]/)[0]);
      const parts = clean.split("/");
      const file = parts.pop() || "";
      return file.replace(/\.[a-z0-9]+$/i, "") || file || clean;
    } catch {
      return url;
    }
  }

  function shortenUrl(url: string): string {
    try {
      const parsed = new URL(url, location.href);
      const path = parsed.pathname.replace(/^\//, "");
      return path || parsed.hostname;
    } catch {
      return url;
    }
  }

  function onSpriteDetected() {
    refreshList({ preserveSelection: true });
  }

  filterInput.addEventListener("input", () => applyFilter(true));
  filterInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      applyFilter(true);
    }
  });

  modeSelect.addEventListener("change", () => {
    const next = modeSelect.value === "ui" ? "ui" : "tiles";
    setMode(next);
  });

  categorySelect.addEventListener("change", () => {
    const next = categorySelect.value || tileCategories[0]?.id || "all";
    if (category === next) return;
    category = next;
    updateListTitle();
    refreshList({ preserveSelection: false });
  });

  variantSelect.addEventListener("change", () => {
    const next = (variantSelect.value as VariantFilter) || "all";
    if (variantFilter === next) return;
    variantFilter = next;
    void renderCurrentPreview();
  });

  updateCategoryVisibility();
  updateListTitle();
  refreshList({ preserveSelection: false });

  const existingListener = (view as any).__spriteListener as (() => void) | undefined;
  if (existingListener) window.removeEventListener("mg:sprite-detected", existingListener);

  (view as any).__spriteListener = onSpriteDetected;
  window.addEventListener("mg:sprite-detected", onSpriteDetected);

  const offUnmount = ui.on("unmounted", () => {
    window.removeEventListener("mg:sprite-detected", onSpriteDetected);
    (view as any).__spriteListener = undefined;
    offUnmount();
  });
}

/* ===================== AUDIO PLAYER TAB ===================== */

function renderAudioPlayerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  let infoList: SfxInfo[] = [];
  let groupEntries: Array<[string, string[]]> = [];
  let visibleSounds: SfxInfo[] = [];

  const overviewCard = ui.card("🎧 Audio player", {
    tone: "muted",
    subtitle: "Inspect detected sounds, auto groups and Howler status.",
  });
  leftCol.appendChild(overviewCard.root);

  const summary = document.createElement("div");
  summary.className = "dd-audio-summary";
  const summarySounds = document.createElement("div");
  const summaryGroups = document.createElement("div");
  const summarySources = document.createElement("div");
  summary.append(summarySounds, summaryGroups, summarySources);

  const volumeLine = document.createElement("div");
  volumeLine.className = "dd-audio-volume";
  const finalLine = document.createElement("div");
  finalLine.className = "dd-audio-volume";

  const overviewError = ui.errorBar();

  const actionsRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const btnScan = ui.btn("Rescan sounds", {
    icon: "🔄",
    variant: "primary",
    onClick: () => { void refreshAll({ rescan: true }); },
  }) as HTMLButtonElement;
  const btnRefresh = ui.btn("Refresh snapshot", {
    icon: "🔁",
    onClick: () => { void refreshAll(); },
  }) as HTMLButtonElement;
  const btnCopyJson = ui.btn("Copy JSON", {
    icon: "📋",
    onClick: () => copy(audioPlayer.exportJSON()),
  }) as HTMLButtonElement;
  actionsRow.append(btnScan, btnRefresh, btnCopyJson);

  overviewCard.body.append(summary, volumeLine, finalLine, overviewError.el, actionsRow);

  const groupsCard = ui.card("🎛️ Groups", {
    tone: "muted",
    subtitle: "Browse auto-generated groups and play random variations.",
  });
  leftCol.appendChild(groupsCard.root);

  const groupToolbar = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const groupFilter = ui.inputText("filter groups (regex)", "");
  groupFilter.classList.add("dd-grow");
  const btnGroupClear = ui.btn("Clear", {
    icon: "🧹",
    onClick: () => {
      groupFilter.value = "";
      renderGroups();
      groupFilter.focus();
    },
  }) as HTMLButtonElement;
  groupToolbar.append(groupFilter, btnGroupClear);

  const groupInfo = document.createElement("p");
  groupInfo.className = "dd-card-description";
  groupInfo.style.margin = "0";

  const groupList = document.createElement("div");
  groupList.className = "dd-audio-list";

  const groupEmpty = document.createElement("div");
  groupEmpty.className = "dd-audio-empty";
  groupEmpty.textContent = "No groups match the current filter.";

  groupsCard.body.append(groupToolbar, groupInfo, groupList, groupEmpty);

  const soundsCard = ui.card("🔉 Sounds", {
    tone: "muted",
    subtitle: "Inspect detected files and trigger playback.",
  });
  rightCol.appendChild(soundsCard.root);

  const soundToolbar = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const soundFilter = ui.inputText("filter sounds (regex)", "");
  soundFilter.classList.add("dd-grow");
  const btnSoundClear = ui.btn("Clear", {
    icon: "🧹",
    onClick: () => {
      soundFilter.value = "";
      renderSounds();
      soundFilter.focus();
    },
  }) as HTMLButtonElement;
  const btnCopyVisible = ui.btn("Copy visible URLs", {
    icon: "📋",
    onClick: () => {
      if (!visibleSounds.length) return;
      copy(visibleSounds.map((s) => s.url).join("\n"));
    },
  }) as HTMLButtonElement;
  soundToolbar.append(soundFilter, btnSoundClear, btnCopyVisible);

  const soundInfo = document.createElement("p");
  soundInfo.className = "dd-card-description";
  soundInfo.style.margin = "0";

  const soundList = document.createElement("div");
  soundList.className = "dd-audio-list";

  const soundEmpty = document.createElement("div");
  soundEmpty.className = "dd-audio-empty";
  soundEmpty.textContent = "No sounds match the current filter.";

  soundsCard.body.append(soundToolbar, soundInfo, soundList, soundEmpty);

  groupFilter.addEventListener("input", () => renderGroups());
  groupFilter.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderGroups();
    }
  });

  soundFilter.addEventListener("input", () => renderSounds());
  soundFilter.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderSounds();
    }
  });

  let busy = false;

  function labelForSound(info: SfxInfo): string {
    return info.logicalName || info.name || fileNameFromUrl(info.url);
  }

  function fileNameFromUrl(url: string): string {
    try {
      return new URL(url, location.href).pathname.split("/").pop() || url;
    } catch {
      return url;
    }
  }

  function formatNumber(value: number | null | undefined, digits = 3): string {
    return value == null || Number.isNaN(value) || !Number.isFinite(value) ? "—" : value.toFixed(digits);
  }

  function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean) {
    const setter = (btn as any).setEnabled;
    if (typeof setter === "function") setter(enabled);
    else btn.disabled = !enabled;
  }

  const scanLabel = btnScan.querySelector(".label") as HTMLElement | null;
  const defaultScanText = scanLabel?.textContent ?? "Rescan sounds";

  function setScanButtonLoading(loading: boolean) {
    setButtonEnabled(btnScan, !loading);
    if (scanLabel) scanLabel.textContent = loading ? "Scanning…" : defaultScanText;
  }

  function refreshData() {
    infoList = audioPlayer.info().slice().sort((a, b) => labelForSound(a).localeCompare(labelForSound(b)));
    groupEntries = Object.entries(audioPlayer.groups()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function updateOverview() {
    const sources = new Set<string>();
    infoList.forEach((info) => {
      (info.sources || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((src) => sources.add(src));
    });
    const vol = audioPlayer.getGameSfxVolume();
    const howlerGlobal = (window as any)?.Howler;
    let howlerMaster: number | null = null;
    try {
      if (howlerGlobal && typeof howlerGlobal.volume === "function") {
        const val = howlerGlobal.volume();
        if (typeof val === "number" && Number.isFinite(val)) howlerMaster = val;
      }
    } catch {
      /* ignore */
    }
    const howlerCount = Array.isArray(howlerGlobal?._howls) ? howlerGlobal._howls.length : 0;

    summarySounds.innerHTML = `<strong>${infoList.length}</strong> sounds detected`;
    summaryGroups.innerHTML = `<strong>${groupEntries.length}</strong> auto groups`;
    summarySources.innerHTML = `<strong>${sources.size}</strong> unique source tags`;

    volumeLine.textContent = `Atom raw: ${formatNumber(vol.raw)} (clamped ${formatNumber(vol.clamped)})`;
    let suffix = "";
    if (howlerMaster != null) {
      suffix = ` · Howler master ${formatNumber(howlerMaster)}`;
      if (howlerCount) suffix += ` (${howlerCount} howl${howlerCount === 1 ? "" : "s"})`;
    } else if (howlerCount) {
      suffix = ` · ${howlerCount} howl${howlerCount === 1 ? "" : "s"} registered`;
    }
    finalLine.textContent = `Final output volume: ${formatNumber(vol.vol)}${suffix}`;
  }

  function renderGroups() {
    const rx = safeRegex(groupFilter.value.trim() || ".*");
    const infoByUrl = new Map(infoList.map((info) => [info.url, info] as const));
    groupList.innerHTML = "";
    let visible = 0;

    const matches = (value?: string | null) => !!value && rx.test(value);

    for (const [name, urls] of groupEntries) {
      const include = matches(name) || urls.some((url) => {
        const info = infoByUrl.get(url);
        return matches(url) || matches(info?.logicalName) || matches(info?.name);
      });
      if (!include) continue;
      visible++;

      const sampleUrl = urls[0] || "";
      const sampleInfo = infoByUrl.get(sampleUrl);

      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";

      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = name;

      const meta = document.createElement("div");
      meta.className = "dd-audio-meta";
      const parts: string[] = [];
      parts.push(`${urls.length} variation${urls.length === 1 ? "" : "s"}`);
      if (sampleInfo?.name) parts.push(`Sample: ${sampleInfo.name}`);
      if (sampleInfo?.sources) parts.push(`Sources: ${sampleInfo.sources}`);
      meta.textContent = parts.join(" • ");

      const urlEl = document.createElement("div");
      urlEl.className = "dd-audio-url";
      urlEl.textContent = sampleUrl || "(no sample)";

      infoWrap.append(title, meta, urlEl);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: false, align: "center" });
      actions.className = "dd-audio-actions";

      const playBtn = ui.btn("Play", {
        icon: "▶️",
        size: "sm",
        onClick: () => { audioPlayer.playGroup(name, { random: true }); },
      }) as HTMLButtonElement;
      const copyBtn = ui.btn("Copy URLs", {
        icon: "📋",
        size: "sm",
        onClick: () => copy(urls.join("\n")),
      }) as HTMLButtonElement;
      const openBtn = sampleUrl
        ? (ui.btn("Open", {
            icon: "🔗",
            size: "sm",
            onClick: () => { try { window.open(sampleUrl, "_blank", "noopener,noreferrer"); } catch {} },
          }) as HTMLButtonElement)
        : null;

      actions.append(playBtn, copyBtn);
      if (openBtn) actions.append(openBtn);
      row.appendChild(actions);

      groupList.appendChild(row);
    }

    groupInfo.textContent = groupEntries.length
      ? `${visible} / ${groupEntries.length} groups shown.`
      : "No groups have been detected yet. Run a rescan to populate the cache.";
    groupList.style.display = visible ? "" : "none";
    groupEmpty.textContent = groupEntries.length
      ? "No groups match the current filter."
      : "No groups detected yet. Run a rescan to populate the cache.";
    groupEmpty.style.display = visible ? "none" : "block";
    setButtonEnabled(btnGroupClear, groupFilter.value.trim().length > 0);
  }

  function renderSounds() {
    const rx = safeRegex(soundFilter.value.trim() || ".*");
    visibleSounds = [];
    soundList.innerHTML = "";
    const matches = (value?: string | null) => !!value && rx.test(value);

    for (const info of infoList) {
      if (!(matches(info.logicalName) || matches(info.name) || matches(info.sources) || matches(info.url))) continue;
      visibleSounds.push(info);

      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";

      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = labelForSound(info);

      const meta = document.createElement("div");
      meta.className = "dd-audio-meta";
      const parts: string[] = [];
      if (info.name && info.name !== info.logicalName) parts.push(`File: ${info.name}`);
      if (info.logicalName) parts.push(`Logical: ${info.logicalName}`);
      if (info.sources) parts.push(`Sources: ${info.sources}`);
      meta.textContent = parts.join(" • ");

      const urlEl = document.createElement("div");
      urlEl.className = "dd-audio-url";
      urlEl.textContent = info.url;

      infoWrap.append(title, meta, urlEl);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: false, align: "center" });
      actions.className = "dd-audio-actions";

      const playBtn = ui.btn("Play", {
        icon: "▶️",
        size: "sm",
        onClick: () => { audioPlayer.playUrl(info.url); },
      }) as HTMLButtonElement;
      const copyBtn = ui.btn("Copy", {
        icon: "📋",
        size: "sm",
        onClick: () => copy(info.url),
      }) as HTMLButtonElement;
      const openBtn = ui.btn("Open", {
        icon: "🔗",
        size: "sm",
        onClick: () => { try { window.open(info.url, "_blank", "noopener,noreferrer"); } catch {} },
      }) as HTMLButtonElement;

      actions.append(playBtn, copyBtn, openBtn);
      row.appendChild(actions);

      soundList.appendChild(row);
    }

    soundInfo.textContent = infoList.length
      ? `${visibleSounds.length} / ${infoList.length} sounds shown.`
      : "No sounds have been detected yet. Run a rescan to populate the cache.";
    soundList.style.display = visibleSounds.length ? "" : "none";
    soundEmpty.textContent = infoList.length
      ? "No sounds match the current filter."
      : "No sounds detected yet. Run a rescan to populate the cache.";
    soundEmpty.style.display = visibleSounds.length ? "none" : "block";
    setButtonEnabled(btnCopyVisible, visibleSounds.length > 0);
    setButtonEnabled(btnSoundClear, soundFilter.value.trim().length > 0);
  }

  async function refreshAll(opts: { rescan?: boolean } = {}) {
    if (busy) return;
    busy = true;
    const { rescan = false } = opts;
    overviewError.clear();
    if (rescan) setScanButtonLoading(true); else setButtonEnabled(btnScan, false);
    setButtonEnabled(btnRefresh, false);
    let scanError: unknown = null;

    try {
      if (rescan) {
        try {
          await audioPlayer.scan();
        } catch (err) {
          scanError = err;
        }
      }
      refreshData();
      updateOverview();
      renderGroups();
      renderSounds();
      if (scanError) {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        overviewError.show(`Scan failed: ${message}`);
        console.error("[debug] audio scan failed", scanError);
      }
    } finally {
      if (rescan) setScanButtonLoading(false); else setButtonEnabled(btnScan, true);
      setButtonEnabled(btnRefresh, true);
      busy = false;
    }
  }

  void refreshAll();
}


/* ===================== WEBSOCKET TAB ===================== */

function renderWSTab(view: HTMLElement, ui: Menu) {
  if (typeof (view as any).__ws_cleanup__ === "function") {
    try { (view as any).__ws_cleanup__(); } catch {}
  }
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  // ---------- State ----------
  type FrameEx = Frame & { id: number };
  const frames = new FrameBuffer<FrameEx>(2000);
  const framesMap = new Map<number, FrameEx>();
  let seq = 0;

  let paused = false;
  let autoScroll = true;
  let showIn = true;
  let showOut = true;
  let filterText = "";
  let onlyCurrentSocket = false;
  let replayToSource = false;
  let selectedId: number | null = null;
  let mutePatterns: RegExp[] = [];

  // ---------- Helpers ----------
  const setSelectedRow = (fid: number | null) => {
    selectedId = fid;
    [...logWrap.querySelectorAll<HTMLElement>('[data-fid]')].forEach(row => {
      row.classList.toggle("selected", String(fid || "") === row.dataset.fid);
    });
    if (fid != null) {
      const f = framesMap.get(fid);
      if (f) ta.value = f.text;
    }
  };
  const matchesMutes = (text: string) => mutePatterns.some(rx => rx.test(text));

  // ---------- Layout containers ----------
  const statusCard = ui.card("📡 Live traffic", {
    tone: "muted",
    subtitle: "Monitor, filter, and replay WebSocket frames.",
  });
  view.appendChild(statusCard.root);

  const muteCard = ui.card("🙉 Mutes (regex)", {
    tone: "muted",
    subtitle: "Hide unwanted messages.",
  });
  view.appendChild(muteCard.root);

  const logCard = ui.card("🧾 Frame log", { tone: "muted" });
  view.appendChild(logCard.root);

  const sendCard = ui.card("📤 Send a frame", {
    tone: "muted",
    subtitle: "Pick or compose a payload and send it.",
  });
  view.appendChild(sendCard.root);

  // ---------- SOCKET PICKER & CONTROLS ----------
  const statusToolbar = document.createElement("div");
  statusToolbar.className = "dd-toolbar dd-toolbar--stretch";
  statusCard.body.appendChild(statusToolbar);

  const lblConn = document.createElement("span");
  lblConn.className = "dd-status-chip";

  const sel = ui.select({ width: "220px" });

  const btnPause = ui.btn("Pause", {
    variant: "secondary",
    onClick: () => {
      paused = !paused;
      setPauseLabel(paused ? "Resume" : "Pause");
      btnPause.classList.toggle("active", paused);
      btnPause.title = paused ? "Resume live updates" : "Pause live updates";
    },
  });
  const setPauseLabel = (text: string) => {
    const label = btnPause.querySelector<HTMLElement>(".label");
    if (label) label.textContent = text; else btnPause.textContent = text;
  };
  setPauseLabel("Pause");
  btnPause.title = "Suspend live updates";

  const btnClear = ui.btn("Clear", {
    variant: "ghost",
    icon: "🧹",
    onClick: () => { frames.clear(); framesMap.clear(); setSelectedRow(null); repaint(true); },
  });

  const btnCopy = ui.btn("Copy visible", {
    variant: "ghost",
    icon: "📋",
    onClick: () => copyVisible(),
  });

  statusToolbar.append(lblConn, sel, btnPause, btnClear, btnCopy);

  const filterToolbar = document.createElement("div");
  filterToolbar.className = "dd-toolbar dd-toolbar--stretch";
  statusCard.body.appendChild(filterToolbar);

  const inputFilter = ui.inputText("filter text (case-insensitive)", "");
  inputFilter.classList.add("dd-grow");
  inputFilter.addEventListener("input", () => { filterText = inputFilter.value.trim().toLowerCase(); repaint(true); });

  const inToggle = ui.toggleChip("IN", { checked: true, icon: "←", tooltip: "Show incoming messages" });
  inToggle.input.addEventListener("change", () => { showIn = inToggle.input.checked; repaint(true); });

  const outToggle = ui.toggleChip("OUT", { checked: true, icon: "→", tooltip: "Show outgoing messages" });
  outToggle.input.addEventListener("change", () => { showOut = outToggle.input.checked; repaint(true); });

  const currentToggle = ui.toggleChip("Active socket", { checked: false, icon: "🎯", tooltip: "Limit to the selected socket" });
  currentToggle.input.addEventListener("change", () => { onlyCurrentSocket = currentToggle.input.checked; repaint(true); });

  const autoScrollToggle = ui.toggleChip("Auto-scroll", { checked: true, icon: "📜", tooltip: "Keep the log aligned with the latest frames" });
  autoScrollToggle.input.addEventListener("change", () => { autoScroll = autoScrollToggle.input.checked; });

  filterToolbar.append(inputFilter, inToggle.root, outToggle.root, currentToggle.root, autoScrollToggle.root);

  // ---------- MUTE patterns ----------
  const muteRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const muteInput = ui.inputText("add regex (e.g. ping|keepalive)", "");
  muteInput.classList.add("dd-grow");
  const btnAddMute = ui.btn("Add", {
    icon: "➕",
    onClick: () => {
      const raw = muteInput.value.trim();
      if (!raw) return;
      try {
        mutePatterns.push(new RegExp(raw, "i"));
        muteInput.value = "";
        repaintMutes();
        repaint(true);
      } catch { /* ignore invalid */ }
    },
  });
  muteRow.append(muteInput, btnAddMute);
  muteCard.body.appendChild(muteRow);

  const mutesWrap = document.createElement("div");
  mutesWrap.className = "dd-mute-chips";
  muteCard.body.appendChild(mutesWrap);

  function repaintMutes() {
    mutesWrap.innerHTML = "";
    mutePatterns.forEach((rx, i) => {
      const chip = ui.btn(`/${rx.source}/i ×`, {
        variant: "ghost",
        size: "sm",
        onClick: () => { mutePatterns.splice(i, 1); repaintMutes(); repaint(true); },
      });
      mutesWrap.appendChild(chip);
    });
  }

  // ---------- LOG AREA ----------
  const logWrap = document.createElement("div");
  logWrap.className = "dd-log";
  logWrap.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  logWrap.style.fontSize = "12px";
  logWrap.style.lineHeight = "1.4";
  logWrap.style.userSelect = "text";
  const emptyState = document.createElement("div");
  emptyState.className = "dd-log__empty";
  emptyState.textContent = "No frames visible yet.";
  logWrap.appendChild(emptyState);
  logCard.body.appendChild(logWrap);

  // ---------- SEND AREA ----------
  const ta = document.createElement("textarea");
  ta.className = "qmm-input dd-textarea";
  ta.placeholder = `Select a frame or paste a payload here. Choose Text or JSON below.`;

  const sendControls = document.createElement("div");
  sendControls.className = "dd-send-controls";
  const asJson = ui.radioGroup<"text" | "json">(
    "ws-send-mode",
    [{ value: "text", label: "Text" }, { value: "json", label: "JSON" }],
    "text",
    () => {}
  );
  const replayToggle = ui.toggleChip("Use source WS", { checked: false, icon: "↩" });
  replayToggle.input.addEventListener("change", () => { replayToSource = replayToggle.input.checked; });
  const btnSend = ui.btn("Send", { variant: "primary", icon: "📨", onClick: () => doSend() });
  const btnCopyPayload = ui.btn("Copy payload", { variant: "ghost", icon: "📋", onClick: () => copy(ta.value) });

  sendControls.append(asJson, replayToggle.root, btnSend, btnCopyPayload);
  sendCard.body.append(ta, sendControls);

  // ---------- SOCKET PICKER ----------
  function refreshSocketPicker() {
    const wsArr = getWSInfos();
    sel.innerHTML = "";
    wsArr.forEach((info, idx) => {
      const op = document.createElement("option");
      op.value = String(idx);
      op.textContent = info.id + (info.ws === quinoaWS ? " • page" : "");
      sel.appendChild(op);
    });
    if (!sel.value && sel.options.length) sel.value = "0";
    updateStatus();
  }

  function currentWS(): WebSocket | null {
    const idx = Number(sel.value);
    const vals = getWSInfos();
    return Number.isFinite(idx) ? (vals[idx]?.ws ?? null) : null;
  }

  function updateStatus() {
    const text = getWSStatusText();
    lblConn.textContent = text;
    const low = text.toLowerCase();
    lblConn.classList.toggle("is-ok", /open|connected|ready/.test(low));
    lblConn.classList.toggle("is-warn", /closing|connecting|pending/.test(low));
  }

  // ---------- Rendering helpers ----------
  function updateEmptyState() {
    const hasRows = logWrap.querySelector(".ws-row") != null;
    emptyState.style.display = hasRows ? "none" : "";
  }
  function passesFilters(f: FrameEx): boolean {
    if ((f.dir === "in" && !showIn) || (f.dir === "out" && !showOut)) return false;
    if (filterText && !f.text.toLowerCase().includes(filterText)) return false;
    if (onlyCurrentSocket && f.ws && currentWS() && f.ws !== currentWS()) return false;
    if (matchesMutes(f.text)) return false;
    return true;
  }

  function rowActions(fid: number, f: FrameEx) {
    const acts = document.createElement("div");
    acts.className = "acts";

    const bCopy = document.createElement("button");
    bCopy.className = "qmm-btn"; bCopy.textContent = "Copy";
    bCopy.onclick = (e) => { e.stopPropagation(); copy(f.text); };

    const bToEd = document.createElement("button");
    bToEd.className = "qmm-btn"; bToEd.textContent = "→ Editor";
    bToEd.onclick = (e) => { e.stopPropagation(); ta.value = f.text; setSelectedRow(fid); };

    const bReplay = document.createElement("button");
    bReplay.className = "qmm-btn"; bReplay.textContent = "Replay";
    bReplay.title = "Send right away (to current WS or source WS if enabled)";
    bReplay.onclick = (e) => { e.stopPropagation(); replayFrame(f); };

    acts.append(bCopy, bToEd, bReplay);
    return acts;
  }

  function buildRow(f: FrameEx) {
    const row = document.createElement("div");
    row.className = "ws-row";
    row.dataset.fid = String(f.id);

    const ts = document.createElement("div");
    ts.className = "ts";
    ts.textContent = fmtTime(f.t);

    const arrow = document.createElement("div");
    arrow.className = "arrow";
    arrow.textContent = f.dir === "in" ? "←" : "→";
    arrow.style.color = f.dir === "in" ? "#4bd17a" : "#8ab4ff";

    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = `<code>${escapeLite(f.text)}</code>`;

    const acts = rowActions(f.id, f);

    row.append(ts, arrow, body, acts);

    row.onclick = () => setSelectedRow(f.id);
    row.ondblclick = () => { ta.value = f.text; setSelectedRow(f.id); };
    return row;
  }

  function appendOne(f: FrameEx) {
    if (!passesFilters(f)) return;
    const row = buildRow(f);
    logWrap.appendChild(row);
    updateEmptyState();
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function repaint(_full = false) {
    logWrap.querySelectorAll(".ws-row").forEach((n) => n.remove());
    frames.toArray().forEach((f: any) => { if (passesFilters(f)) logWrap.appendChild(buildRow(f)); });
    updateEmptyState();
    if (selectedId != null) setSelectedRow(selectedId);
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function copyVisible() {
    const lines = frames.toArray()
      .filter((f: any) => passesFilters(f))
      .map((f: any) => `[${fmtTime(f.t)}] ${f.dir === "in" ? "<-" : "->"} ${f.text}`)
      .join("\n");
    copy(lines);
  }

  function replayFrame(f: FrameEx) {
    const target = (replayToSource && f.ws) ? f.ws : currentWS();
    if (!target || target.readyState !== WebSocket.OPEN) return;
    const mode = (asJson.querySelector('input[type="radio"]:checked') as HTMLInputElement)?.value || "text";
    if (mode === "json") {
      try { target.send(JSON.parse(f.text)); }
      catch { target.send(f.text); }
    } else {
      target.send(f.text);
    }
  }

  function doSend() {
    const ws = currentWS();
    const wsAlt = (selectedId != null && replayToSource) ? (framesMap.get(selectedId)?.ws ?? null) : null;
    const target = (replayToSource ? wsAlt : ws) || ws;
    if (!target || target.readyState !== WebSocket.OPEN) return;

    const mode = (asJson.querySelector('input[type="radio"]:checked') as HTMLInputElement)?.value || "text";
    if (mode === "json") {
      try { target.send(JSON.parse(ta.value)); } catch { target.send(ta.value); }
    } else {
      target.send(ta.value);
    }
  }

  // ---------- HOOK & STREAM ----------
  installWSHookIfNeeded((f) => {
    if (paused) return;
    const ex: FrameEx = { ...f, id: ++seq };
    frames.push(ex);
    framesMap.set(ex.id, ex);
    updateStatus();
    appendOne(ex);
  });
  refreshSocketPicker();
  repaint(true);

  const pollId = window.setInterval(() => { refreshSocketPicker(); }, 1000);
  (view as any).__ws_cleanup__ = () => { window.clearInterval(pollId); };
}

/* ===================== Utils UI (copie/affichage) ===================== */

function copy(text: string) {
  const str = String(text ?? "");
  if (!str.length) return;

  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    try { (window as any).toastSimple?.(ok ? "Copied" : "Copy failed", "", ok ? "success" : "error"); } catch {}
  };

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(str)
      .then(() => { try { (window as any).toastSimple?.("Copied", "", "success"); } catch {} })
      .catch(fallback);
  } else {
    fallback();
  }
}

function safeRegex(q: string) { try { return new RegExp(q, "i"); } catch { return /.*/i; } }

function stylePre(pre: HTMLPreElement) {
  pre.style.maxHeight = "260px";
  pre.style.overflow = "auto";
  pre.style.background = "#0b1016";
  pre.style.border = "1px solid #ffffff18";
  pre.style.borderRadius = "12px";
  pre.style.padding = "12px";
  pre.style.margin = "6px 0 0";
  pre.style.fontSize = "12px";
  pre.style.lineHeight = "1.5";
  pre.style.color = "#dbe4ff";
  pre.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.04)";
}
