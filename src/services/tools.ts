// src/services/tools.ts
// External community tools for Magic Garden.


export type ExternalToolCreator = {
  name: string;
  avatar?: string;
};

export type ExternalToolAction = {
  label: string;
  url: string;
  showInlinePreview?: boolean;
};

export type ExternalTool = {
  id: string;
  title: string;
  description: string;
  url: string;
  actions?: ExternalToolAction[];
  showInlinePreview?: boolean;
  icon?: string;
  tags?: string[];
  creators?: ExternalToolCreator[];
};

const TOOL_LIST: ExternalTool[] = [
  {
    id: "aries-mod-intro",
    title: "Arie's Mod introduction",
    description: "Visual guide for the mod with the main features highlighted",
    url: "https://i.imgur.com/LZL6zPj.jpeg",
    icon: "",
    showInlinePreview: true,
    tags: ["guide", "mod"],
    creators: [
      {
        name: "Bella",
        avatar: "https://cdn.discordapp.com/avatars/1400054123969380354/241dfc8a181b9e4b9dab6f1ac4f7567a.webp",
      },
    ],
  },
  {
    id: "wiki",
    title: "Magic Garden Wiki",
    description: "Community-curated documentation for plants, mechanics, weather, and more.",
    url: "https://magicgarden.wiki/Main_Page",
    icon: "https://i.imgur.com/0LXKEzh.png",
    tags: ["guide", "utility"],
    creators: [
      {
        name: "Community",
      },
    ],
  },
  {
    id: "qpm",
    title: "QPM Mod Menu",
    description: "Mod/userscript focused on game stats, adding pet analytics, inventory helpers and shop/weather tracking",
    url: "",
    icon: "",
    tags: ["mod"],
    actions: [
      {
        label: "Github",
        url: "https://github.com/ryandt2305-cpu/QPM-GR/",
      },
      {
        label: "Install",
        url: "https://github.com/ryandt2305-cpu/QPM-GR/raw/refs/heads/master/dist/QPM.user.js",
      },
    ],
    creators: [
      {
        name: "Tokyo",
        avatar: "https://cdn.discordapp.com/avatars/511094276613210122/c2af3c8ff2123724ba49b7e897d0ce97.png",
      },
    ],
  },
  {
    id: "calculator",
    title: "Daserix' Magic Garden Calculators",
    description: "Calculate crop value based on size and mutations, with garden import for total optimisation stats",
    url: "https://daserix.github.io/magic-garden-calculator/",
    icon: "https://i.imgur.com/xXPqRgK.png",
    tags: ["utility"],
    creators: [
      {
        name: "Daserix",
        avatar: "https://cdn.discordapp.com/avatars/266245650662817793/09de28b070e0a107eb1bea1fe015afc3.webp",
      },
    ],
  },
  {
    id: "mgtools",
    title: "MGTools",
    description: "Mod/userscript adding pet management, ability tracking, calculators, timers, and a customizable UI",
    url: "",
    actions: [
      {
        label: "Discord",
        url: "https://discord.gg/qFpQ436HZc",
      },
      {
        label: "Github",
        url: "https://github.com/Myke247/MGTools/",
      },
      {
        label: "Install",
        url: "https://github.com/Umm12many/MGTools-M/raw/refs/heads/main/MGTools.user.js",
      },
    ],
    icon: "https://cdn.discordapp.com/icons/1428162440297840640/23c0c05e578d5eb307febb4b562626e9.webp",
    tags: ["mod"],
    creators: [
      {
        name: "Myke",
        avatar: "https://cdn.discordapp.com/avatars/184699074543484928/ca44cd2f0f3002b2455a9805986eeac9.webp",
      },
      {
        name: "Normie",
        avatar: "https://cdn.discordapp.com/avatars/375367702094544898/ebd1ef1279c16a4ab8e73ee9fbd70148.png",
      },
    ],
  },
  {
    id: "mg-android",
    title: "Magic Garden Android App",
    description: "Basic Android companion app for Magic Garden (early build, not actively maintained)",
    url: "https://appdistribution.firebase.dev/i/cde454c6e9eb5f30",
    icon: "",
    tags: ["android"],
    creators: [
      {
        name: "Umm12many",
        avatar: "https://cdn.discordapp.com/avatars/925833066310672465/ad6f0f9d27e1a4b1acebf6987b3d7c39.png",
      },
    ],
  },
  {
    id: "mg-android-notifier",
    title: "Magic Garden Notifier",
    description: "Android app that sends push notifications/alarms when selected shop items restock, with configurable thresholds and background monitoring",
    url: "",
    icon: "https://media.discordapp.net/attachments/1434668481999278262/1434668482225635348/ic_launcher.webp?ex=694bbe65&is=694a6ce5&hm=a3c6dc6135bfd34f08bbc9fe7ad259df8dd1b5b5f66681871e20288a0bfb0e2a&=&format=webp",
    tags: ["utility", "android"],
    actions: [
      {
        label: "Github",
        url: "https://github.com/Daserix/magic-garden-notifier-releases",
      },
      {
        label: "Install",
        url: "https://github.com/Daserix/magic-garden-notifier-releases/releases/download/v1.1.0/mg-notifier-1.1.0.apk",
      },
    ],
    creators: [
      {
        name: "Daserix",
        avatar: "https://cdn.discordapp.com/avatars/266245650662817793/09de28b070e0a107eb1bea1fe015afc3.png",
      },
    ],
  },
  {
    id: "guide-1b",
    title: "Making Your First 1B",
    description: "Beginner-friendly step-by-step guide to earning your first 1B coins, covering early crop choices, key pets, and long-term strategy",
    url: "https://i.imgur.com/gs6Karj.png",
    icon: "",
    showInlinePreview: true,
    tags: ["guide"],
    creators: [
      {
        name: "Bella",
        avatar: "https://cdn.discordapp.com/avatars/1400054123969380354/241dfc8a181b9e4b9dab6f1ac4f7567a.png",
      },
    ],
  },
  {
    id: "visual-guides",
    title: "Visual guides",
    description: "Visual guides covering crops/multiplier stacking and pet info (eggs, hatch rates, abilities), plus beginner tips to avoid common mistakes",
    url: "",
    icon: "",
    tags: ["guide"],
    actions: [
      {
        label: "Crops & Multipliers",
        url: "https://i.imgur.com/86TuVYh.jpeg",
        showInlinePreview: true,
      },
      {
        label: "Pets",
        url: "https://i.imgur.com/bx2qX8i.jpeg",
        showInlinePreview: true,
      },
      {
        label: "Winter event",
        url: "https://i.imgur.com/Ew9xBk6.jpeg",
        showInlinePreview: true,
      }
    ],
    creators: [
      {
        name: "Foraged Rituals",
        avatar: "https://cdn.discordapp.com/avatars/1065631808072450164/40be204333c0f3f7c5f3ce1d8636ff77.png",
      },
    ],
  },
];


const TOOL_TAGS: string[] = Array.from(
  new Set(
    TOOL_LIST.flatMap(tool => {
      return tool.tags ?? [];
    }),
  ),
).sort((a, b) => a.localeCompare(b));

function cloneTool(tool: ExternalTool): ExternalTool {
  return {
    ...tool,
    tags: tool.tags ? [...tool.tags] : undefined,
    actions: tool.actions ? tool.actions.map(action => ({ ...action })) : undefined,
    showInlinePreview: tool.showInlinePreview,
  };
}

function resolve(tool: string | ExternalTool): ExternalTool | null {
  if (typeof tool === "string") {
    const found = TOOL_LIST.find(entry => entry.id === tool);
    return found ? cloneTool(found) : null;
  }
  return cloneTool(tool);
}

declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

function openUrl(url: string): boolean {
  if (typeof GM_openInTab === "function") {
    GM_openInTab(url, { active: true, insert: true });
    return true;
  }
  if (typeof window === "undefined") return false;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

export function openLink(url: string): boolean {
  return openUrl(url);
}

export const ToolsService = {
  list(): ExternalTool[] {
    const list = TOOL_LIST.map(cloneTool);
    return list;
  },

  tags(): string[] {
    return TOOL_TAGS.map(tag => tag);
  },

  get(id: string): ExternalTool | null {
    const found = TOOL_LIST.find(tool => tool.id === id);
    const entry = found ? cloneTool(found) : null;
    return entry;
  },

  open(tool: string | ExternalTool): boolean {
    const entry = resolve(tool);
    if (!entry) {
      return false;
    }
    const ok = openUrl(entry.url);
    return ok;
  },
};

