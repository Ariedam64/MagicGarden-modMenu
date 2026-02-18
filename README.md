# Arie's Mod — All-in-one overlay for Magic Garden

An in-game overlay that adds community features, alerts, pet management, crop protection, and dozens of quality-of-life improvements — all running live on top of the official game client.

**Open / Close the overlay:** `ALT + X` or `Insert` (`Option + X` on Mac)

> Download the latest script from the [Releases](https://github.com/Ariedam64/MagicGarden-modMenu/releases) page.

---

## Scope & Compatibility

| Platform | Supported |
|---|---|
| Official websites (magicgarden.gg, magiccircle.gg, starweaver.org) | Yes |
| Discord Web (browser) | Yes |
| Discord Desktop / Mobile | No |

---

## Installation

### 1) Get a userscript manager

| Browser | Extension |
|---|---|
| Chrome / Edge / Opera GX | [Tampermonkey](https://www.tampermonkey.net/) |
| Firefox | [Violentmonkey](https://violentmonkey.github.io/) |

### 2) Configure your browser (Tampermonkey only)

**Turn on Developer mode:**

- **Chrome:** go to `chrome://extensions/` and toggle **Developer mode** ON (top-right)
- **Edge:** go to `edge://extensions` and toggle **Developer mode** ON (left panel)
- **Opera GX:** go to `opera://extensions` and toggle **Developer mode** ON (top-right)

**Enable user scripts:**

From the extensions page, open Tampermonkey **Details** and turn **Allow user scripts** ON (only if this toggle is visible).

Close and reopen your browser to apply the settings.

> Violentmonkey requires no extra configuration.

### 3) Install Arie's Mod

Go to the [Releases](https://github.com/Ariedam64/MagicGarden-modMenu/releases) page, download the latest `.user.js` file, and let your userscript manager install it. Refresh the game — the HUD appears in the corner once the game connects.

---

## Main Features

### Community Hub

A full-screen panel accessible from a button injected directly into the game's toolbar. It connects you to the entire player community with 6 tabs:

- **Rooms** — Browse 150+ public rooms and join any of them with one click. Every room you join has a **+50% friend sell bonus** because of the player count. Filter by number of players and refresh anytime.
- **Messages** — Chat with your friends and groups directly in-game. Share your current room, pet team configs, or items from your inventory through rich cards in the conversation. Includes emoji picker, read receipts, and notification sounds.
- **Friends** — Add friends, see who's online and which room they're in. Click a friend to view their full profile: garden preview, inventory, stats, activity log, journal, and leaderboard ranks. Send a DM or join their room directly from their profile.
- **Groups** — Create or join player groups (public or private, up to 100 members). Group owners can promote/demote members, kick, rename, and manage visibility. Each group has its own chat conversation.
- **Leaderboard** — Rankings for **Coins** and **Eggs Hatched** with gold/silver/bronze badges for the top 3. Your own rank is always visible at the bottom. Rank change indicators show progression over time.
- **My Profile** — Control your privacy with 7 individual toggles (room, garden, inventory, coins, activity log, journal, stats) and manage notification sounds.

### Alerts

A real-time notification system that watches the shop and weather for you.

- **Shop alerts** — Pick any seed, egg, tool, or decor and get notified the instant it appears in the shop. A bell icon with a badge pops up along with a sound notification.
- **Sound modes** — Choose between *One shot* (plays once) or *Loop* (repeats until the item leaves the shop). Each alert can have its own sound and volume.
- **Buy from the overlay** — When an alert fires, you can purchase the item directly from the notification overlay without opening the shop. There's even a **Buy All** button to grab every unit at once.
- **Weather alerts** — Get notified when specific weather events start, with customizable sounds and last-seen timestamps.
- **Pet food alerts** — Warns you when a pet's food drops below a threshold you set.
- **Custom audio** — Add your own notification sounds and set defaults for shop, weather, and pet alerts.

### Pet Manager

Create and manage pet teams to swap your active pets instantly.

- **Teams** — Create named teams with 3 pet slots each. Filter available pets by ability or species. Import your currently active pets with one click.
- **Hotkeys** — Assign a keybind to each team from the Keybinds menu. Press a key and your pets swap instantly. You can also cycle through teams with *Previous team* / *Next team* keybinds.
- **Drag & drop** — Reorder your teams by dragging them.
- **Feeding config** — Choose which crops each pet species is allowed to eat with the Instant Feed button.
- **Pet logs** — View the last 500 ability procs with filters and search.

### Locker

Protect your valuable crops from being accidentally harvested or sold.

- **Lock mode** — Choose between *Block* (prevent harvest if conditions match) or *Allow* (only allow harvest if conditions match).
- **Scale filter** — Set minimum and/or maximum harvest size (as a percentage).
- **Mutation filter** — Require Gold and/or Rainbow mutations before harvesting.
- **Weather filter** — Require specific weather mutations with three matching modes: *Any* (at least one), *All* (every one), or *Recipes* (one from each weather group, e.g., Frozen + Dawnbound).
- **Per-crop overrides** — Set specific rules for individual crops that bypass the general locker.
- **Visual indicators** — Locked crops show a purple border and a lock icon directly in the game. The Sell All button is blocked when locked crops are present.

---

## In-Game Improvements

These features are injected directly into the game's interface — no menu needed.

### Shop

- **Buy All button** — Appears next to every shop item. Buy all remaining stock with one click.
- **Tracked items first** — Items you follow in the Alert menu are moved to the top of the shop list so you never miss them.
- **Sell All Pets** — A new button to sell every non-favorited pet at once (with confirmation).

### Inventory

- **Crop prices** — Every harvested crop in your inventory shows its estimated coin value.
- **Sorting** — Sort your inventory by name, quantity, rarity, size, mutations, strength (pets), or value. Sort direction (asc/desc) and filters persist between sessions.
- **Item quantity** — When you select an item, its total quantity is displayed alongside it.
- **Lock indicators** — Locked crops display a lock icon and purple border.

### Pet Panel

- **Instant Feed** — A button injected into the pet panel that feeds your pet the best available crop instantly.
- **Feed from Inventory** — Opens a crop selector so you can manually choose what to feed.
- Both buttons can be individually toggled on/off from the Pets menu.

### Toolbar

- A custom **Community Hub** button is added to the game's toolbar.
- Shows an unread message badge when you have new messages or friend requests.

---

## Other Menus

### Calculator

Estimate the exact sell value of any crop. Pick a species, adjust size, mutations, weather, and friend bonus to see min/max coin prices with a live sprite preview.

### Keybinds

Remap every mod action and many game controls. Supports modifier keys, hold-to-repeat, and per-team pet hotkeys. Use the trash button to clear a binding or the reset button to restore defaults.

### Stats

Track your session and lifetime stats: crops planted/harvested/destroyed, watering efficiency, shop purchases, revenue from sales, pets hatched by rarity with per-species breakdowns.

### Misc

- **Auto-reconnect** — Automatically reconnects after a session conflict or kick, with configurable delay.
- **Ghost mode** — Move freely through walls with adjustable speed.
- **Inventory guard** — Keeps 1 inventory slot free to prevent overflow.
- **Auto-store** — Automatically moves seeds and decor into the Seed Silo and Decor Shed when they already exist there.
- **Seed / Decor deleter** — Bulk-select and delete seeds or decor items with a rate-limited queue, progress tracker, and pause/stop controls.

### Settings

- View mod version, game version, and environment info.
- **Export / Import** your settings as a JSON file.
- **Backups** — Save named backups of your settings and restore them at any time.

### Tools

A curated directory of community calculators, planners, guides, and spreadsheets with tag filtering and direct links.

### Editor

Sandbox mode that unlocks all plants and decor for placement. Useful for planning your garden layout.

---

## Backend

The mod uses a lightweight backend API to power community features (friends, messages, groups, rooms, leaderboard). It syncs your player state every 60 seconds with smart deduplication. All community features are opt-in via the Settings menu — you can disable data sharing entirely and use only local features.

---

## Browser Support

- **Chrome & Edge** — fully tested and recommended.
- **Firefox** — works, minor layout differences possible.
- **Discord Activity** — everything loads, but room joining redirects to the website because Discord blocks direct joins.
- **Audio notifications** require at least one click/tap on the page to unlock the browser's audio context.
