// src/main.ts
import { installPageWebSocketHook } from "./hooks/ws-hook";
import { mountHUD, initWatchers } from "./ui/hud";

import { renderDebugDataMenu } from "./ui/menus/debug-data";
import { renderLockerMenu } from "./ui/menus/locker";
import { renderPlayersMenu } from "./ui/menus/players";
import { renderCalculatorMenu } from "./ui/menus/calculator";
import { renderStatsMenu } from "./ui/menus/stats";
import { renderPetsMenu } from "./ui/menus/pets";
import { renderMiscMenu } from "./ui/menus/misc";
import { renderNotifierMenu } from "./ui/menus/notifier";
import { renderToolsMenu } from "./ui/menus/tools";
import { renderEditorMenu } from "./ui/menus/editor";
import { renderRoomMenu } from "./ui/menus/room";
import { renderKeybindsMenu } from "./ui/menus/keybinds";

import { ensureSpritesReady } from "./services/assetManifest";
import { prefetchManifest, recordAssetUrlHint } from "./services/assetManifest";

import { PlayerService } from "./services/player";
import { createAntiAfkController } from "./utils/antiafk";
import { initSprites  } from "./core/sprite";
import { EditorService } from "./services/editor";

import { initGameVersion } from "./utils/gameVersion";
import { warmUpAllSprites } from "./utils/sprites";
import { loadTileSheet } from "./utils/tileSheet";
import { migrateLocalStorageToAries } from "./utils/localStorage";
import type { AriesModApi } from "./utils/ariesModApi";
import { installAriesModApi } from "./utils/ariesModApi";

const ariesMod: AriesModApi = installAriesModApi();

const TILE_SHEETS_TO_PRELOAD = ["plants", "mutations", "pets", "animations", "items", "decor"] as const;

async function preloadAllTiles(): Promise<void> {
  const tasks = TILE_SHEETS_TO_PRELOAD.map(async (base) => {
    const result = await loadTileSheet(base);
    return result;
  });

  await Promise.all(tasks);
}

(async function () {
  "use strict";

  migrateLocalStorageToAries();

  installPageWebSocketHook();
  initGameVersion();
  void prefetchManifest({ registerSprites: true, waitForVersionMs: 3_000 });

  initSprites({
    config: {
      blackBelow: 10,
      skipAlphaBelow: 1,
      tolerance: 0.005,
    },
    onAsset: (url) => {
      recordAssetUrlHint(url);
      void prefetchManifest({ registerSprites: true });
    },
  });

  await ensureSpritesReady();
  await preloadAllTiles();
  await warmUpAllSprites();

  EditorService.init();

  mountHUD({
    onRegister(register) {
      register('players', '👥 Players', renderPlayersMenu);
      register('pets', '🐾 Pets', renderPetsMenu);
      register('room', '🏠 Room', renderRoomMenu);
      register('locker', '🔒 Locker', renderLockerMenu);
      register('alerts',  '🔔 Alerts', renderNotifierMenu)
      register('calculator', '🤓 Calculator', renderCalculatorMenu);
      register('editor', '📝 Editor', renderEditorMenu);
      register('stats', '📊 Stats', renderStatsMenu);
      register('misc', '🧩 Misc', renderMiscMenu);
      register('keybinds', '⌨️ Keybinds', renderKeybindsMenu);
      register('tools', '🛠️ Tools', renderToolsMenu);
      register('debug-data', '🔧 Debug', renderDebugDataMenu);
    }
  });

  initWatchers()

  const antiAfk = createAntiAfkController({
    getPosition: () => PlayerService.getPosition(),
    move: (x, y) => PlayerService.move(x, y),
  });

  ariesMod.antiAfkController = antiAfk;

  antiAfk.start();

})();
