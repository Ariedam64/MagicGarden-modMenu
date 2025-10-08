// src/services/tools.ts
// External community tools for Magic Garden.


export type ExternalTool = {
  id: string;
  title: string;
  description: string;
  url: string;
  icon?: string;
  tags?: string[];
};

const TOOL_LIST: ExternalTool[] = [
  {
    id: "wiki",
    title: "Magic Garden Wiki",
    description: "Community-curated documentation for plants, mechanics, weather, and more.",
    url: "https://magicgarden.fandom.com/wiki/MagicCircle_Wiki",
    icon: "📚",
    tags: ["guide"],
  },
  {
    id: "calculator",
    title: "Magic Garden Calculator",
    description: "Numerous optimisation statistics at your fingertips.",
    url: "https://daserix.github.io/magic-garden-calculator/",
    icon: "🧮",
    tags: ["calculator"],
  },
  {
    id: "mgtools",
    title: "MGTools",
    description: "Utility scripts designed to streamline your time in Magic Garden.",
    url: "https://github.com/Myke247/MGTools/",
    icon: "🛠️",
    tags: ["utility"],
  },
  {
    id: "pet-revenue",
    title: "Pet Revenue Planner",
    description:
      "Forecast the extra income your pets generate, showing $/min and per-boost gains so you can decide which pets and crops to prioritize.",
    url: "https://docs.google.com/spreadsheets/d/1tG1LIEsXQlNRxaN2pySkwwN688_eCLgGIil_xRaPnBo/edit?gid=1430710045#gid=1430710045",
    icon: "🐾",
    tags: ["calculator"],
  },
  {
    id: "dollar-hour",
    title: "$ per Hour Calculators",
    description: "Estimate your gold per hour: select a crop, apply weather and friend/pet boosts, set the duration, and get an instant $/h result.",
    url: "https://docs.google.com/spreadsheets/d/1ZYikURs-vBMfTQCU_fFbl25CITBrjsEZePxWc-DqOm8/edit?gid=689506777#gid=689506777",
    icon: "💸",
    tags: ["calculator"],
  },
  {
    id: "should-i-invest",
    title: "Should I Invest?",
    description: "Instant ROI calculator, select crop, weather, mutation, size, and boost to see if it’s worth it.",
    url: "https://docs.google.com/spreadsheets/d/1PyKd9NG3GsocFmCgwQ01ZQ783ADzcim5LS5XLSLJtqI/edit",
    icon: "🤔",
    tags: ["calculator"],
  },
  {
    id: "matrixes",
    title: "Matrixes Reference",
    description: "A reference matrix that compares and ranks each plant’s $/h across all buffs and combos, with quick pick/freeze/gold suggestions.",
    url: "https://docs.google.com/spreadsheets/d/1gUdu8LBFbkN7CJzqX_nDwLW9nxdIks-0jRJTrUI19U4/edit?gid=1450892699#gid=1450892699",
    icon: "🧩",
    tags: ["reference"],
  },
  {
    id: "beginners-guide",
    title: "Beginner's Guide Snapshot",
    description: "A concise visual cheat sheet to get new gardeners up to speed quickly.",
    url: "https://i.imgur.com/7IHU0RJ.png",
    icon: "🌱",
    tags: ["guide", "beginner"],
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
