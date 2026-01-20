# MagicGarden Mod Menu, first rough cut

> "It works, I promise." This is the very first release of my Magic Garden mod menu. It is rough, it is messy, it is absolutely not optimised… but it does what I need for now.

## ⚠️ Heads-up

- This codebase is still a giant spaghetti bowl. Expect duplicated logic, long files, and hacks everywhere. I will clean it up later, right now the goal was to ship something usable.
- Performance tuning is basically non-existent. The mod works on both the official **magicgarden.gg** website and the Discord Activities version, yet you might notice jank on low-end machines.
- Please report crashes or visual glitches, but also remember that the whole thing is held together with duct tape.

## ✅ What you get

The userscript injects a floating HUD called **Arie's Mod** with draggable windows. From there you can open feature-rich panels for players, pets, rooms, alerts, tools, and more. Everything runs live on top of the official client, so you keep native updates while unlocking advanced helpers.

## 🚀 Installation (players)

1. Install a userscript manager (Tampermonkey is the one I target).
2. Open the [script installer](https://github.com/Ariedam64/MagicGarden-modMenu/raw/refs/heads/main/quinoa-ws.min.user.js) and let your manager install it.
3. Reload the game on either **https://magicgarden.gg** or within the Discord activity. The HUD pops up in the bottom-right corner when the websocket connects.

## 🛠️ Installation (developers / tinkerers)

```bash
git clone https://github.com/Ariedam64/MagicGarden-modMenu.git
cd MagicGarden-modMenu
npm install
npm run watch   # rebuilds on changes
# or
npm run build   # produces dist/ + quinoa-ws.min.user.js
```

Load the generated `quinoa-ws.min.user.js` into your userscript manager (or `dist/index.user.js` if you are testing locally) and refresh the game. The build uses `esbuild` and writes directly to `dist/`.

## 🧭 HUD & global behaviour

- `GUI Toggle` and `GUI Drag` hotkeys control visibility and drag mode (see ⌨️ Keybinds).
- The HUD shows connection status, detected version, and quick-launch shortcuts for every panel.
- Windows remember their last position and collapsed/hidden state using `localStorage`.
- Anti-AFK kicks in automatically by nudging your player position when idle.

## 🗂️ Menu tour

Each panel lives in `src/ui/menus/*` and is rendered through the shared `Menu` helper. Here is the current line-up:

### 👥 Players
- Vertical list of every player in the room with online status and Discord avatar.
- Right column reveals crop and inventory value estimates, live teleport buttons, and quick links to inspect inventory or journal.
- Toggle follow modes (you and your pets) directly from the panel.
- Activity log viewer fetches up to 500 events per player and adds sorting so you can reorder the history fast.

### 👫 Friends
- Friend system backed by the mod's API: send/accept/reject friend requests, see online status and which room they're in.
- View friend gardens, inventory, stats with privacy controls so you decide what friends can see.
- Search for players across all public rooms and join their room with one click.

### 🐾 Pets
- Manage pet teams with drag & drop, custom icons, and quick duplication.
- Apply teams instantly, edit abilities, and push the setup into hotkeys for swapping.
- Live inventory fetcher keeps slot previews and ability badges accurate.
- Pet Panel Enhancer injects **FEED INSTANT** and **FEED FROM INVENTORY** buttons.

### 🏠 Room
- Three tabs: 🌐 Public Rooms (auto-refresh every 10 s with category/player filters), ⭐ Custom Rooms (your saved quick joins), and 🔍 Search Player (find players across public rooms).
- Discord users get a safety notice when direct joins are blocked inside activities.
- Scrollable cards highlight capacity, tags, and join actions.

### 🔒 Locker
- Curate crop lockers with weather recipes, gold/rainbow toggles and scale filters, plus lock modes for both **block** and **allow** flows.
- Preview sprites directly inside the menu to avoid guessing IDs.
- Persisted settings let you restore preferred layouts every session.

### 🔔 Alerts
- Build granular notifier rules for seeds, eggs, tools, or decors using visual pickers and rarity filters.
- Overlay bell shows live shop restocks with thumbnails, quantity badges, and audio cues.
- Buy items straight from the alert overlay when a restock pops, instead of diving back into vendor panels.
- Global mute, per-rule enable switches, and weather-state conditions keep spam under control.

### 🛠️ Tools
- Curated list of community calculators, planners, and helper spreadsheets with tag filtering.
- Each card offers an "Open tool" button that tries to launch in a new tab (with graceful fallback toast on failure).
- Global shop helpers add **Buy All** controls to each vendor panel and a **Sell All Pets** shortcut.

### 🧮 Calculator
- Crop value calculator: pick a crop, size, mutations, and friend bonus to get min/max sell prices.
- Mutation visualizer to avoid mistakes and real-time sprite preview.

### 🧩 Misc
- Player ghost movement toggle with adjustable delay to move silently.
- Seed and decor deleter workflows to bulk-select items, review totals, and delete/clear in one place.
- Inventory sorter upgrade with direction selector, toggle to reveal item values with filtered totals, and persistence so your last sort/search combo is reapplied automatically.

### 📊 Stats
- Dedicated dashboard that snapshots your session: when tracking started, and collapsible cards per domain.
- Garden metrics counting planted, harvested, destroyed crops and watering efficiency (including time saved).
- Shop ledger highlighting seeds/tools/eggs/decors bought plus revenue from crop and pet sales.
- Pet hatching breakdown per rarity with sprites, plus ability trigger/value totals and weather event counters.

### ⌨️ Keybinds
- Rebind every supported action through hotkey capture buttons, including modifier-only shortcuts.
- Toggle hold detection per action, reset to defaults, or clear bindings entirely.
- Updates propagate instantly to the game and to the HUD toggle behaviour.

### ⚙️ Settings
- Centralized configuration for mod features: HUD theme, notification preferences, performance options.
- Privacy settings to control API data sharing, friend visibility, and activity log access.
- Storage management to clear cache, export/import settings, or reset to defaults.

### ✏️ Editor
- Advanced dev tools: spawn items in inventory, edit player state, quick testing scenarios.
- Developer utilities for mod development and debugging.

### 🔧 Debug
- Websocket inspector with live feed, replay buffer, and quick resend helpers.
- Audio previewer to trigger any cached SFX with volume info.
- Sprite explorer that lists discovered assets, matching tile refs, and renders each variant.
- Jotai atom browser for spelunking the captured React state tree.

## How to Use the Mod (Detailed Walkthrough)

Skip installation steps and jump into usage. Open the HUD with `ALT + X` or `INSERT` (`Option + X` on macOS). Windows are draggable but not resizable. The HUD header shows:
- Status dot: green = websocket + Jotai storage healthy; yellow = some features may be degraded; red = nothing works.
- Version badge: green when you are up to date, yellow when a newer build exists (e.g., `2.6.6 -> 2.6.65`).
- Tip: every menu can open/minimize independently. If a window is stuck off-screen, hover it, hold `ALT`, and drag to free it.

### Players menu
- Left column lists players in your room; right column shows info/actions for the selected player.
- Crop value covers crops only (not animals, eggs, seeds, tools, or decor).
- Teleport to the player or jump into their garden.
- Inspect inventory, journal, stats, and activity log; these views are read-only and cannot give you items.
- Follow keeps you right behind the target; Pet follow sends your pets to trail them.

### Friends menu
- Send friend requests to players, accept/reject incoming requests, or remove friends.
- See real-time online status and which room your friends are in.
- View friend gardens, inventory, stats (respects their privacy settings).
- Privacy tab lets you control what data friends can see: garden, inventory, stats, journal, activity log.
- Search tab scans all public rooms to find a player and join their room.

### Room menu
- Three tabs. **Public Rooms** lists 100+ public rooms you can join directly on the web version (magicgarden.gg / magiccircle.gg / starweaver.org). Discord Activity cannot join directly. View who is inside, sort, and refresh.
- **Custom Room** saves rooms you can rejoin anytime.
- **Search Player** scans public rooms for a player and lets you join their room when found.

### Locker menu
- **General** tab: global crop locker. Harvest mode: **Block** (block harvest if any active filter matches) or **Allow** (allow harvest only if all active filters match). Filters include size (50-100), color (none/gold/rainbow), and weather. Weather supports **Any match** (at least one active filter), **All match** (all active filters), or **Recipes** (multi-select weather mutation combos, e.g., `Frozen + Amberbound` or `Frozen + Dawnbound`).
- **Overrides** tab: per-crop rules that bypass the general locker so specific crops use their own settings.

### Calculator menu
- Crop value calculator: pick a crop, size, mutations, and friend bonus to get min/max sell prices. Includes a mutation visualizer to avoid mistakes.

### Pets menu
- **Manager**: create pet teams, name them, and see the active team (green indicator). Filter pets by ability or species, add pets with the `+` (opens filtered inventory), or import your current active pets. Remove with `-` or `Clear`, and reorder teams by dragging the three-dot handle.
- **Log**: view and filter the last 500 pet ability procs.

### Stats menu
- Legacy stats dashboard (from before in-game stats existed); still handy for tracking rainbow/gold hatch rates.

### Tool menu
- Collection of community tools, calculators, scripts, and guides.

### Keybind menu
- Rebind most game keys and mod actions. Use the trash button to clear (falls back to default if one exists) or the circular arrow to reset. The game "Action" key has a "Hold" toggle (green dot) to auto-spam while held.

### Alert menu
- Four tabs. **Shops** notifies when chosen items appear; shows a bell with a moving badge and optional sound. Configure per-item sounds and choose **One shot** (plays once) or **Loop** (until the item leaves the shop). Buy directly from the "tracked items available" bell.
- **Weather**: alerts for specific weather events with per-rule sounds and last-seen timestamps.
- **Pets**: warns when a pet's food drops below a threshold.
- **Audio**: add custom sounds and set defaults for shop/weather/pet alerts.

### Settings menu
- **General**: customize HUD theme, notification preferences, performance options.
- **Privacy**: control what data is shared with the API backend, toggle friend visibility, activity log access.
- **Storage**: clear cached data, export/import your settings, reset to defaults.

### Misc menu
- **Ghost**: fly through the map (speed adjustable) and pass through walls.
- **Seed deleter**: click **Select seeds**, choose seeds/quantities in selection mode, confirm, then **Delete** once sure.
- **Decor deleter**: same flow but requires a shovel and an empty plot or edge slot.
- **Inventory sorter**: enhanced sorting with direction, value display, filtered totals, and persistence.

### Editor menu
- **Item spawning**: add items directly to inventory for testing/debugging.
- **State editing**: modify player state values.
- **Testing tools**: quick access to common test scenarios.

### Debug menu
- Jotai explorer: list atoms, inspect one, and update it (all atoms are writable). **Live atom** records an atom state over time.
- Sprite viewer: browse sprites and variants (gold/rainbow).
- Audio player: preview many in-game sounds.
- Websocket inspector: live traffic viewer with filters; copy, edit, or replay messages.

## 🔌 Backend API

The mod uses a small VPS backend (`ariesmod-api.ariedam.fr`) to power the friend system and cross-player features. Right now it handles around 400 daily users. The API syncs player state every 60 seconds (smart deduplication to avoid spam), manages friend requests/lists, and serves public room discovery. All API features are opt-in via the Settings menu privacy controls. You can disable data sharing entirely if you just want local-only features.

## 🤝 Compatibility notes

- Official browser: tested on Chrome & Edge. Firefox works but might show more layout shifts (CSS grid heavy UI).
- Discord Activity: everything loads, but room joining redirects you back to the website because Discord blocks direct joins.
- Audio notifications require a user interaction (click/tap) to unlock the Web Audio context.

Thanks for trying the mod even in this chaotic state!
