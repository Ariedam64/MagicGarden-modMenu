// src/main.ts

import { installPageWebSocketHook } from "./hooks/ws-hook";
import { mountHUD, initWatchers } from "./ui/hud";

import { renderDebugDataMenu } from "./ui/menus/debug-data";
import { renderLockerMenu } from "./ui/menus/locker";
import { renderCalculatorMenu } from "./ui/menus/calculator";
import { renderStatsMenu } from "./ui/menus/stats";
import { renderPetsMenu } from "./ui/menus/pets";
import { renderMiscMenu } from "./ui/menus/misc";
import { renderSettingsMenu } from "./ui/menus/settings";
import { renderNotifierMenu } from "./ui/menus/notifier";
import { renderToolsMenu } from "./ui/menus/tools";
import { renderEditorMenu } from "./ui/menus/editor";
import { renderRoomMenu } from "./ui/menus/room";
import { renderKeybindsMenu } from "./ui/menus/keybinds";
import { renderFriendsMenu } from "./ui/menus/friends";

import { PlayerService } from "./services/player";
import { createAntiAfkController } from "./utils/antiafk";
import { EditorService } from "./services/editor";

import { initGameVersion } from "./utils/gameVersion";
import { migrateLocalStorageToAries } from "./utils/localStorage";
import type { AriesModApi } from "./utils/ariesModApi";
import { installAriesModApi } from "./utils/ariesModApi";
import { startPlayerStateReportingWhenGameReady } from "./utils/payload";

import { warmupSpriteCache } from "./ui/spriteIconCache";
import { tos } from "./utils/tileObjectSystemApi";
import "./sprite";



(async function () {
  "use strict";

  installPageWebSocketHook();
  initGameVersion();

  try {warmupSpriteCache();} catch {}
    tos.init()

  EditorService.init();

  mountHUD({
    onRegister(register) {
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
      register('settings', '⚙️ Settings', renderSettingsMenu);
      register('debug-data', '🐞 Debug', renderDebugDataMenu);
    }
  });

  initWatchers()

  const antiAfk = createAntiAfkController({
    getPosition: () => PlayerService.getPosition(),
    move: (x, y) => PlayerService.move(x, y),
  });

  antiAfk.start();

  startPlayerStateReportingWhenGameReady();

})();
