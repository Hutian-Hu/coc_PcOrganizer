// Website color themes — five avant-garde palettes + dark mode per theme.
// A theme overrides a fixed set of CSS custom properties on :root.
// Choices persist in localStorage and are applied on load (see bottom).

export type ThemeName = "volt" | "neon" | "onyx" | "aurora" | "heat";
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

function palette(o: {
  bg: string;
  fg: string;
  card?: string;
  popover?: string;
  primary: string;
  pf?: string;
  secondary?: string;
  sf?: string;
  muted?: string;
  mf?: string;
  accent: string;
  af?: string;
  border?: string;
}): VarMap {
  return {
    "--background": o.bg,
    "--foreground": o.fg,
    "--card": o.card ?? o.bg,
    "--card-foreground": o.fg,
    "--popover": o.popover ?? o.card ?? o.bg,
    "--popover-foreground": o.fg,
    "--primary": o.primary,
    "--primary-foreground": o.pf ?? "0 0% 100%",
    "--secondary": o.secondary ?? o.fg,
    "--secondary-foreground": o.sf ?? o.bg,
    "--muted": o.muted ?? o.secondary ?? o.fg,
    "--muted-foreground": o.mf ?? o.fg,
    "--accent": o.accent,
    "--accent-foreground": o.af ?? "240 20% 8%",
    "--border": o.border ?? o.fg,
    "--input": o.border ?? o.fg,
    "--ring": o.primary,
  };
}

export const THEMES: Record<ThemeName, ThemeDef> = {
  volt: {
    label: "电光",
    swatch: ["240 12% 96%", "258 90% 60%"],
    vars: palette({
      bg: "240 12% 96%",
      fg: "240 12% 10%",
      card: "0 0% 100%",
      primary: "258 90% 60%",
      secondary: "240 8% 92%",
      sf: "240 10% 18%",
      muted: "240 8% 93%",
      mf: "240 6% 46%",
      accent: "72 100% 50%",
      border: "240 8% 86%",
    }),
    darkVars: palette({
      bg: "240 12% 7%",
      fg: "240 10% 94%",
      card: "240 10% 10%",
      primary: "262 95% 68%",
      secondary: "240 7% 16%",
      sf: "240 10% 92%",
      muted: "240 7% 15%",
      mf: "240 6% 58%",
      accent: "72 100% 55%",
      border: "240 7% 20%",
    }),
    hoColors: ["258 88% 62%", "190 95% 42%", "72 100% 40%", "330 90% 55%"],
  },
  neon: {
    label: "霓虹",
    swatch: ["240 10% 96%", "190 100% 42%"],
    vars: palette({
      bg: "240 10% 96%",
      fg: "240 14% 10%",
      card: "0 0% 100%",
      primary: "190 100% 38%",
      secondary: "195 20% 91%",
      sf: "240 14% 16%",
      muted: "195 14% 92%",
      mf: "240 6% 44%",
      accent: "320 100% 55%",
      af: "0 0% 100%",
      border: "240 8% 85%",
    }),
    darkVars: palette({
      bg: "250 14% 7%",
      fg: "240 12% 94%",
      card: "250 12% 10%",
      primary: "190 100% 50%",
      secondary: "250 10% 16%",
      sf: "240 12% 92%",
      muted: "250 9% 15%",
      mf: "250 6% 58%",
      accent: "320 100% 60%",
      af: "0 0% 100%",
      border: "250 8% 20%",
    }),
    hoColors: ["190 100% 42%", "320 100% 55%", "72 100% 45%", "258 85% 62%"],
  },
  onyx: {
    label: "曜石",
    swatch: ["0 0% 97%", "240 10% 12%"],
    vars: palette({
      bg: "0 0% 97%",
      fg: "240 10% 12%",
      card: "0 0% 100%",
      primary: "240 10% 12%",
      pf: "0 0% 98%",
      secondary: "0 0% 90%",
      sf: "240 10% 15%",
      muted: "0 0% 92%",
      mf: "240 4% 42%",
      accent: "25 100% 55%",
      border: "0 0% 82%",
    }),
    darkVars: palette({
      bg: "240 6% 8%",
      fg: "0 0% 94%",
      card: "240 6% 11%",
      primary: "0 0% 94%",
      pf: "240 10% 10%",
      secondary: "240 5% 16%",
      sf: "0 0% 92%",
      muted: "240 5% 15%",
      mf: "240 4% 56%",
      accent: "25 100% 58%",
      border: "240 5% 20%",
    }),
    hoColors: ["25 100% 55%", "258 85% 62%", "160 90% 38%", "320 90% 55%"],
  },
  aurora: {
    label: "极光",
    swatch: ["165 15% 96%", "160 90% 35%"],
    vars: palette({
      bg: "165 15% 96%",
      fg: "170 14% 10%",
      card: "0 0% 100%",
      primary: "160 90% 32%",
      secondary: "160 12% 90%",
      sf: "170 14% 14%",
      muted: "160 10% 91%",
      mf: "170 6% 42%",
      accent: "265 90% 62%",
      af: "0 0% 100%",
      border: "165 8% 84%",
    }),
    darkVars: palette({
      bg: "165 14% 7%",
      fg: "160 12% 92%",
      card: "165 12% 10%",
      primary: "160 90% 45%",
      secondary: "165 9% 15%",
      sf: "160 12% 90%",
      muted: "165 8% 14%",
      mf: "165 5% 56%",
      accent: "265 90% 68%",
      af: "0 0% 100%",
      border: "165 7% 19%",
    }),
    hoColors: ["160 90% 38%", "265 90% 62%", "190 95% 42%", "45 100% 48%"],
  },
  heat: {
    label: "热浪",
    swatch: ["20 22% 96%", "350 90% 50%"],
    vars: palette({
      bg: "20 22% 96%",
      fg: "350 20% 12%",
      card: "0 0% 100%",
      primary: "350 90% 48%",
      secondary: "20 18% 91%",
      sf: "350 18% 16%",
      muted: "20 14% 92%",
      mf: "350 8% 44%",
      accent: "215 100% 55%",
      af: "0 0% 100%",
      border: "20 12% 85%",
    }),
    darkVars: palette({
      bg: "350 14% 8%",
      fg: "350 14% 92%",
      card: "350 12% 11%",
      primary: "350 90% 58%",
      secondary: "350 10% 16%",
      sf: "350 14% 90%",
      muted: "350 8% 15%",
      mf: "350 6% 58%",
      accent: "215 100% 62%",
      af: "0 0% 100%",
      border: "350 8% 20%",
    }),
    hoColors: ["350 90% 55%", "215 100% 55%", "38 100% 48%", "160 85% 38%"],
  },
};

const THEME_KEY = "coc-web-theme-v3";
const MODE_KEY = "coc-web-mode";

export function getTheme(): ThemeName {
  try {
    const v = localStorage.getItem(THEME_KEY) as ThemeName | null;
    if (v && THEMES[v]) return v;
  } catch {
    /* ignore */
  }
  return "volt";
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
const DEFAULT_HO = ["258 88% 62%", "190 95% 42%", "72 100% 40%", "330 90% 55%"];
DEFAULT_HO.forEach((c, i) => document.documentElement.style.setProperty(`--ho-${i + 1}`, c));

// apply saved theme as early as possible
applyTheme(getTheme());
