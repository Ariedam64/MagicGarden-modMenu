// src/main.ts
import { installPageWebSocketHook } from "./hooks/ws-hook";
import { mountHUD, initWatchers } from "./ui/hud";

import { renderDebugDataMenu } from "./ui/menus/debug-data";
import { renderLockerMenu } from "./ui/menus/locker";
import { renderPlayersMenu } from "./ui/menus/players";
import { renderStatsMenu } from "./ui/menus/stats";
import { renderPetsMenu } from "./ui/menus/pets";
import { renderMiscMenu } from "./ui/menus/misc";
import { renderNotifierMenu } from "./ui/menus/notifier";
import { renderToolsMenu } from "./ui/menus/tools";
import { renderRoomMenu } from "./ui/menus/room";
import { renderKeybindsMenu } from "./ui/menus/keybinds";

import { PlayerService } from "./services/player";
import { createAntiAfkController } from "./utils/antiafk";
import { initSprites, Sprites  } from "./core/sprite";

(async function () {
  "use strict";

  initSprites({
    config: {
      blackBelow: 10,
      skipAlphaBelow: 1,
      tolerance: 0.005,
    },
    onAsset: (url, kind) => {
      window.dispatchEvent(new CustomEvent("mg:sprite-detected", { detail: { url, kind } }));
      // ex: logger / store
      // console.log(`[Sprites] ${kind}:`, url);
    },
  });

  installPageWebSocketHook();

  mountHUD({
    onRegister(register) {
      register('players', '👥 Players', renderPlayersMenu);
      register('pets', '🐾 Pets', renderPetsMenu);
      register('room', '🏠 Room', renderRoomMenu);
      register('locker', '🔒 Locker', renderLockerMenu);
      register('alerts',  '🔔 Alerts', renderNotifierMenu)
      register('tools', '🛠️ Tools', renderToolsMenu);
      register('stats', '📊 Stats', renderStatsMenu);
      register('misc', '🧩 Misc', renderMiscMenu);
      register('keybinds', '⌨️ Keybinds', renderKeybindsMenu);
      register('debug-data', '🔧 Debug', renderDebugDataMenu);
    }
  });

  initWatchers()

  const antiAfk = createAntiAfkController({
    getPosition: () => PlayerService.getPosition(),
    move: (x, y) => PlayerService.move(x, y),
  });

  antiAfk.start();

})();