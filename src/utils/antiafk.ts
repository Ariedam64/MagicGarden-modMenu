// utils.ts
export type XY = { x: number; y: number };

export function createAntiAfkController(deps: {
  getPosition: () => Promise<XY | undefined>,
  move: (x: number, y: number) => Promise<any>,
}) {
  const STOP_EVENTS = ["visibilitychange","blur","focus","focusout","pagehide","freeze","resume","mouseleave","mouseenter"];
  const listeners: Array<{t: string; h: (e: Event)=>void; target: Document|Window}> = [];
  function swallowAll() {
    const add = (target: Document|Window, t: string) => {
      const h = (e: Event) => { e.stopImmediatePropagation(); e.preventDefault?.(); };
      target.addEventListener(t as any, h, { capture: true });
      listeners.push({ t, h, target });
    };
    STOP_EVENTS.forEach(t => { add(document, t); add(window, t); });
  }
  function unswallowAll() {
    for (const {t,h,target} of listeners) try { target.removeEventListener(t as any, h, { capture: true } as any); } catch {}
    listeners.length = 0;
  }

  const docProto = Object.getPrototypeOf(document);
  const saved = {
    hidden: Object.getOwnPropertyDescriptor(docProto, "hidden"),
    visibilityState: Object.getOwnPropertyDescriptor(docProto, "visibilityState"),
    hasFocus: (document.hasFocus ? document.hasFocus.bind(document) : null) as null | (()=>boolean),
  };
  function patchProps() {
    try { Object.defineProperty(docProto, "hidden", { configurable: true, get(){ return false; } }); } catch {}
    try { Object.defineProperty(docProto, "visibilityState", { configurable: true, get(){ return "visible"; } }); } catch {}
    try { (document as any).hasFocus = () => true; } catch {}
  }
  function restoreProps() {
    try { if (saved.hidden) Object.defineProperty(docProto, "hidden", saved.hidden); } catch {}
    try { if (saved.visibilityState) Object.defineProperty(docProto, "visibilityState", saved.visibilityState); } catch {}
    try { if (saved.hasFocus) (document as any).hasFocus = saved.hasFocus; } catch {}
  }

  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  const resumeIfSuspended = () => { if (audioCtx && audioCtx.state !== "running") audioCtx.resume?.().catch(()=>{}); };

  function startAudioKeepAlive() {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: "interactive" });
      gain = audioCtx.createGain(); gain.gain.value = 0.00001;
      osc = audioCtx.createOscillator(); osc.frequency.value = 1;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      document.addEventListener("visibilitychange", resumeIfSuspended, { capture: true });
      window.addEventListener("focus", resumeIfSuspended, { capture: true });
    } catch {
      stopAudioKeepAlive();
    }
  }
  function stopAudioKeepAlive() {
    try { osc?.stop(); } catch {}
    try { osc?.disconnect(); gain?.disconnect(); } catch {}
    try { audioCtx?.close?.(); } catch {}
    document.removeEventListener("visibilitychange", resumeIfSuspended, { capture: true } as any);
    window.removeEventListener("focus", resumeIfSuspended, { capture: true } as any);
    osc = null; gain = null; audioCtx = null;
  }

  let hb: number | null = null;
  function startHeartbeat() {
    const targetEl = (document.querySelector("canvas") as HTMLElement) || document.body || document.documentElement;
    hb = window.setInterval(() => {
      try { targetEl.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 1, clientY: 1 })); } catch {}
    }, 25_000);
  }
  function stopHeartbeat() { if (hb !== null) { clearInterval(hb); hb = null; } }

  let pingTimer: number | null = null;
  async function pingPosition() {
    try {
      const cur = await deps.getPosition();
      if (!cur) return;
      await deps.move(Math.round(cur.x), Math.round(cur.y));
    } catch {}
  }
  function startPing() { pingTimer = window.setInterval(pingPosition, 60_000); void pingPosition(); }
  function stopPing() { if (pingTimer !== null) { clearInterval(pingTimer); pingTimer = null; } }

  return {
    start() {
      patchProps();
      swallowAll();
      startAudioKeepAlive();
      startHeartbeat();
      startPing();
    },
    stop() {
      stopPing();
      stopHeartbeat();
      stopAudioKeepAlive();
      unswallowAll();
      restoreProps();
    },
  };
}
