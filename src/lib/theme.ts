// Website color themes (Morandi-inspired, low saturation) + dark mode.
// A theme overrides a fixed set of CSS custom properties on :root,
// with a separate dark palette per theme.
// Choices persist in localStorage and are applied on load (see bottom).

export type ThemeName = "oat" | "sage" | "mist" | "rose" | "clay";
export type Mode = "light" | "dark";

type VarMap = Record<string, string>;

type ThemeDef = {
  label: string;
  swatch: [string, string];
  vars: VarMap;
  darkVars: VarMap;
  hoColors: [string, string, string, string];
};

const BASE_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
] as const;

function darkVariant(hue: { fg: string; primary: string }): VarMap {
  return {
    "--background": hue.fg,
    "--foreground": "40 15% 88%",
    "--card": hue.fg,
    "--card-foreground": "40 15% 88%",
    "--popover": hue.fg,
    "--popover-foreground": "40 15% 88%",
    "--primary": hue.primary,
    "--primary-foreground": "40 30% 12%",
    "--secondary": "40 7% 24%",
    "--secondary-foreground": "40 15% 88%",
    "--muted": "40 7% 22%",
    "--muted-foreground": "40 6% 62%",
    "--accent": "36 8% 26%",
    "--accent-foreground": "40 15% 88%",
    "--border": "40 7% 28%",
    "--input": "40 7% 28%",
    "--ring": hue.primary,
  };
}

export const THEMES: Record<ThemeName, ThemeDef> = {
  oat: {
    label: "燕麦米",
    swatch: ["40 19% 93%", "96 12% 47%"],
    vars: {
      "--background": "40 19% 93%",
      "--foreground": "45 7% 28%",
      "--card": "40 22% 95.5%",
      "--card-foreground": "45 7% 28%",
      "--popover": "40 20% 96.5%",
      "--popover-foreground": "45 7% 28%",
      "--primary": "96 12% 47%",
      "--primary-foreground": "40 25% 96%",
      "--secondary": "40 14% 88%",
      "--secondary-foreground": "45 9% 32%",
      "--muted": "40 13% 89%",
      "--muted-foreground": "40 5% 48%",
      "--accent": "36 15% 86%",
      "--accent-foreground": "45 9% 32%",
      "--border": "40 11% 81%",
      "--input": "40 11% 81%",
      "--ring": "96 12% 47%",
    },
    darkVars: darkVariant({ fg: "40 8% 14%", primary: "96 14% 62%" }),
    hoColors: ["96 16% 58%", "205 18% 60%", "350 16% 62%", "36 22% 60%"],
  },
  sage: {
    label: "鼠尾草",
    swatch: ["90 12% 92%", "96 18% 40%"],
    vars: {
      "--background": "90 12% 92%",
      "--foreground": "100 8% 25%",
      "--card": "90 14% 94.5%",
      "--card-foreground": "100 8% 25%",
      "--popover": "90 14% 95.5%",
      "--popover-foreground": "100 8% 25%",
      "--primary": "96 18% 40%",
      "--primary-foreground": "90 20% 96%",
      "--secondary": "90 10% 86%",
      "--secondary-foreground": "100 8% 28%",
      "--muted": "90 10% 87%",
      "--muted-foreground": "90 5% 46%",
      "--accent": "80 12% 84%",
      "--accent-foreground": "100 8% 28%",
      "--border": "90 8% 79%",
      "--input": "90 8% 79%",
      "--ring": "96 18% 40%",
    },
    darkVars: darkVariant({ fg: "100 8% 13%", primary: "96 16% 60%" }),
    hoColors: ["96 20% 42%", "205 16% 52%", "340 12% 58%", "45 20% 52%"],
  },
  mist: {
    label: "雾蓝",
    swatch: ["210 16% 93%", "205 20% 52%"],
    vars: {
      "--background": "210 16% 93%",
      "--foreground": "210 10% 28%",
      "--card": "210 18% 95%",
      "--card-foreground": "210 10% 28%",
      "--popover": "210 18% 96%",
      "--popover-foreground": "210 10% 28%",
      "--primary": "205 20% 52%",
      "--primary-foreground": "210 25% 97%",
      "--secondary": "210 12% 87%",
      "--secondary-foreground": "210 10% 30%",
      "--muted": "210 11% 88%",
      "--muted-foreground": "210 6% 48%",
      "--accent": "200 14% 85%",
      "--accent-foreground": "210 10% 30%",
      "--border": "210 9% 80%",
      "--input": "210 9% 80%",
      "--ring": "205 20% 52%",
    },
    darkVars: darkVariant({ fg: "215 12% 13%", primary: "205 22% 64%" }),
    hoColors: ["205 24% 55%", "96 16% 52%", "350 14% 60%", "30 16% 58%"],
  },
  rose: {
    label: "藕荷",
    swatch: ["350 14% 94%", "350 18% 52%"],
    vars: {
      "--background": "350 14% 94%",
      "--foreground": "340 8% 28%",
      "--card": "350 16% 95.5%",
      "--card-foreground": "340 8% 28%",
      "--popover": "350 16% 96.5%",
      "--popover-foreground": "340 8% 28%",
      "--primary": "350 18% 52%",
      "--primary-foreground": "350 22% 97%",
      "--secondary": "350 12% 88%",
      "--secondary-foreground": "340 9% 30%",
      "--muted": "350 11% 89%",
      "--muted-foreground": "350 5% 48%",
      "--accent": "340 12% 86%",
      "--accent-foreground": "340 9% 30%",
      "--border": "350 8% 81%",
      "--input": "350 8% 81%",
      "--ring": "350 18% 52%",
    },
    darkVars: darkVariant({ fg: "345 8% 13%", primary: "350 18% 66%" }),
    hoColors: ["350 18% 58%", "96 16% 50%", "205 16% 58%", "40 18% 58%"],
  },
  clay: {
    label: "暖陶",
    swatch: ["30 18% 93%", "22 28% 52%"],
    vars: {
      "--background": "30 18% 93%",
      "--foreground": "25 10% 28%",
      "--card": "30 20% 95%",
      "--card-foreground": "25 10% 28%",
      "--popover": "30 20% 96%",
      "--popover-foreground": "25 10% 28%",
      "--primary": "22 28% 52%",
      "--primary-foreground": "30 25% 97%",
      "--secondary": "30 14% 87%",
      "--secondary-foreground": "25 10% 30%",
      "--muted": "30 12% 88%",
      "--muted-foreground": "30 6% 47%",
      "--accent": "35 16% 85%",
      "--accent-foreground": "25 10% 30%",
      "--border": "30 10% 80%",
      "--input": "30 10% 80%",
      "--ring": "22 28% 52%",
    },
    darkVars: darkVariant({ fg: "28 10% 13%", primary: "22 28% 62%" }),
    hoColors: ["22 30% 54%", "96 16% 48%", "205 16% 56%", "340 12% 56%"],
  },
};

const THEME_KEY = "coc-web-theme";
const MODE_KEY = "coc-web-mode";

export function getTheme(): ThemeName {
  try {
    const v = localStorage.getItem(THEME_KEY) as ThemeName | null;
    if (v && THEMES[v]) return v;
  } catch {
    /* ignore */
  }
  return "oat";
}

export function getMode(): Mode {
  try {
    if (localStorage.getItem(MODE_KEY) === "dark") return "dark";
  } catch {
    /* ignore */
  }
  return "light";
}

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  if (!t) return;
  const root = document.documentElement;
  const vars = getMode() === "dark" ? t.darkVars : t.vars;
  for (const k of BASE_VARS) root.style.setProperty(k, vars[k as keyof VarMap] ?? vars["--background"]);
  t.hoColors.forEach((c, i) => root.style.setProperty(`--ho-${i + 1}`, c));
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch {
    /* ignore */
  }
}

export function setMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme(getTheme());
}

// default HO column colors (before any theme is applied)
const DEFAULT_HO = ["96 16% 58%", "205 18% 60%", "350 16% 62%", "36 22% 60%"];
DEFAULT_HO.forEach((c, i) => document.documentElement.style.setProperty(`--ho-${i + 1}`, c));

// apply saved theme as early as possible
applyTheme(getTheme());
