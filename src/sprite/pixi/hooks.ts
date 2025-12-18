import { waitWithTimeout } from '../utils/async';

export interface PixiHandles {
  app: any | null;
  renderer: any | null;
  pixiVersion: any | null;
  appReady: Promise<any>;
  rendererReady: Promise<any>;
}

export function createPixiHooks(): PixiHandles {
  let appResolver: (v: any) => void;
  let rdrResolver: (v: any) => void;
  const appReady = new Promise<any>(resolve => (appResolver = resolve));
  const rendererReady = new Promise<any>(resolve => (rdrResolver = resolve));

  let APP: any = null;
  let RDR: any = null;
  let PIXI_VER: any = null;

  const hook = (name: string, cb: (...args: any[]) => void) => {
    const root: any = (globalThis as any).unsafeWindow || globalThis;
    const prev = root[name];
    root[name] = function () {
      try {
        cb.apply(this, arguments as any);
      } finally {
        if (typeof prev === 'function') {
          try {
            prev.apply(this, arguments as any);
          } catch {
            /* ignore */
          }
        }
      }
    };
  };

  hook('__PIXI_APP_INIT__', (a: any, v: any) => {
    if (!APP) {
      APP = a;
      PIXI_VER = v;
      appResolver(a);
    }
  });
  hook('__PIXI_RENDERER_INIT__', (r: any, v: any) => {
    if (!RDR) {
      RDR = r;
      PIXI_VER = v;
      rdrResolver(r);
    }
  });

  // Fallback: if PIXI is already initialized before we hook, try to detect it.
  const tryResolveExisting = () => {
    const root: any = (globalThis as any).unsafeWindow || globalThis;
    if (!APP) {
      const maybeApp = root.__PIXI_APP__ || root.PIXI_APP || root.app;
      if (maybeApp) {
        APP = maybeApp;
        appResolver(APP);
      }
    }
    if (!RDR) {
      const maybeRdr = root.__PIXI_RENDERER__ || root.PIXI_RENDERER__ || root.renderer || (APP as any)?.renderer;
      if (maybeRdr) {
        RDR = maybeRdr;
        rdrResolver(RDR);
      }
    }
  };
  tryResolveExisting();
  // Poll a few times in case the game created PIXI before we loaded.
  let fallbackPolls = 0;
  const fallbackInterval = setInterval(() => {
    if (APP && RDR) {
      clearInterval(fallbackInterval);
      return;
    }
    tryResolveExisting();
    fallbackPolls += 1;
    if (fallbackPolls >= 50) {
      clearInterval(fallbackInterval);
    }
  }, 100);

  return {
    get app() {
      return APP;
    },
    get renderer() {
      return RDR;
    },
    get pixiVersion() {
      return PIXI_VER;
    },
    appReady,
    rendererReady,
  };
}

export async function waitForPixi(handles: PixiHandles, timeoutMs = 15000) {
  const app = await waitWithTimeout(handles.appReady, timeoutMs, 'PIXI app');
  const renderer = await waitWithTimeout(handles.rendererReady, timeoutMs, 'PIXI renderer');
  return { app, renderer, version: handles.pixiVersion };
}
