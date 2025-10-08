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
2. Open the [script installer](https://github.com/Ariedam64/MagicGarden-modMenu/raw/refs/heads/main/dist/quinoa-ws.min.user.js) and let your manager install it.
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

### 🐾 Pets
- Manage pet teams with drag & drop, custom icons, and quick duplication.
- Apply teams instantly, edit abilities, and push the setup into hotkeys for swapping.
- Live inventory fetcher keeps slot previews and ability badges accurate.

### 🏠 Room
- Two tabs: 🌐 Public Rooms (auto-refresh every 10 s with category/player filters) and ⭐ Custom Rooms (your saved quick joins).
- Discord users get a safety notice when direct joins are blocked inside activities.
- Scrollable cards highlight capacity, tags, and join actions.

### 🔒 Locker
- Curate crop lockers with weather recipes, gold/rainbow toggles and scale filters.
- Preview sprites directly inside the menu to avoid guessing IDs.
- Persisted settings let you restore preferred layouts every session.

### 🔔 Alerts
- Build granular notifier rules for seeds, eggs, tools, or decors using visual pickers and rarity filters.
- Overlay bell shows live shop restocks with thumbnails, quantity badges, and audio cues.
- Global mute, per-rule enable switches, and weather-state conditions keep spam under control.

### 🛠️ Tools
- Curated list of community calculators, planners, and helper spreadsheets with tag filtering.
- Each card offers an "Open tool" button that tries to launch in a new tab (with graceful fallback toast on failure).

### 🧩 Misc
- Player ghost movement toggle with adjustable delay to move silently.
- Seed deleter workflow to bulk-select species, review totals, and delete/clear in one place.

### ⌨️ Keybinds
- Rebind every supported action through hotkey capture buttons, including modifier-only shortcuts.
- Toggle hold detection per action, reset to defaults, or clear bindings entirely.
- Updates propagate instantly to the game and to the HUD toggle behaviour.

### 🔧 Debug
- Websocket inspector with live feed, replay buffer, and quick resend helpers.
- Audio previewer to trigger any cached SFX with volume info.
- Sprite explorer that lists discovered assets, matching tile refs, and renders each variant.
- Jotai atom browser for spelunking the captured React state tree.

## 🤝 Compatibility notes

- Official browser: tested on Chrome & Edge. Firefox works but might show more layout shifts (CSS grid heavy UI).
- Discord Activity: everything loads, but room joining redirects you back to the website because Discord blocks direct joins.
- Audio notifications require a user interaction (click/tap) to unlock the Web Audio context.

Thanks for trying the mod even in this chaotic state!
