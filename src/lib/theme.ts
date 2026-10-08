// Website color themes (Morandi-inspired, low saturation).
// A theme overrides a fixed set of CSS custom properties on :root.
// The choice persists in localStorage and is applied on load (see bottom).

export type ThemeName = "oat" | "sage" | "mist" | "rose" | "clay";

type VarMap = Record<string, string>;

export const THEMES: Record<ThemeName, { label: string; swatch: [string, string]; vars: VarMap }> = {
  oat: {
    label: "燕麦米",
    swatch: ["40 19% 93%", "96 12% 47%"],
    vars: {
      "--background": "40 19% 93%",
      "--foreground": "45 7% 28%",
      "--card": "40 22% 95.5%",
      "--popover": "40 20% 96.5%",
      "--primary": "96 12% 47%",
      "--secondary": "40 14% 88%",
      "--muted": "40 13% 89%",
      "--muted-foreground": "40 5% 48%",
      "--accent": "36 15% 86%",
      "--border": "40 11% 81%",
      "--input": "40 11% 81%",
      "--ring": "96 12% 47%",
    },
  },
  sage: {
    label: "鼠尾草",
    swatch: ["90 12% 92%", "96 18% 40%"],
    vars: {
      "--background": "90 12% 92%",
      "--foreground": "100 8% 25%",
      "--card": "90 14% 94.5%",
      "--popover": "90 14% 95.5%",
      "--primary": "96 18% 40%",
      "--secondary": "90 10% 86%",
      "--muted": "90 10% 87%",
      "--muted-foreground": "90 5% 46%",
      "--accent": "80 12% 84%",
      "--border": "90 8% 79%",
      "--input": "90 8% 79%",
      "--ring": "96 18% 40%",
    },
  },
  mist: {
    label: "雾蓝",
    swatch: ["210 16% 93%", "205 20% 52%"],
    vars: {
      "--background": "210 16% 93%",
      "--foreground": "210 10% 28%",
      "--card": "210 18% 95%",
      "--popover": "210 18% 96%",
      "--primary": "205 20% 52%",
      "--secondary": "210 12% 87%",
      "--muted": "210 11% 88%",
      "--muted-foreground": "210 6% 48%",
      "--accent": "200 14% 85%",
      "--border": "210 9% 80%",
      "--input": "210 9% 80%",
      "--ring": "205 20% 52%",
    },
  },
  rose: {
    label: "藕荷",
    swatch: ["350 14% 94%", "350 18% 52%"],
    vars: {
      "--background": "350 14% 94%",
      "--foreground": "340 8% 28%",
      "--card": "350 16% 95.5%",
      "--popover": "350 16% 96.5%",
      "--primary": "350 18% 52%",
      "--secondary": "350 12% 88%",
      "--muted": "350 11% 89%",
      "--muted-foreground": "350 5% 48%",
      "--accent": "340 12% 86%",
      "--border": "350 8% 81%",
      "--input": "350 8% 81%",
      "--ring": "350 18% 52%",
    },
  },
  clay: {
    label: "暖陶",
    swatch: ["30 18% 93%", "22 28% 52%"],
    vars: {
      "--background": "30 18% 93%",
      "--foreground": "25 10% 28%",
      "--card": "30 20% 95%",
      "--popover": "30 20% 96%",
      "--primary": "22 28% 52%",
      "--secondary": "30 14% 87%",
      "--muted": "30 12% 88%",
      "--muted-foreground": "30 6% 47%",
      "--accent": "35 16% 85%",
      "--border": "30 10% 80%",
      "--input": "30 10% 80%",
      "--ring": "22 28% 52%",
    },
  },
};

const THEME_KEY = "coc-web-theme";

export function getTheme(): ThemeName {
  try {
    const v = localStorage.getItem(THEME_KEY) as ThemeName | null;
    if (v && THEMES[v]) return v;
  } catch {
    /* ignore */
  }
  return "oat";
}

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  if (!t) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch {
    /* ignore */
  }
}

// apply saved theme as early as possible
applyTheme(getTheme());
