// Dark-first theme. Light is opt-in and remembered per browser (a convenience only).
export type Theme = "dark" | "light";
const KEY = "omniforce.theme";

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable: theme still applies for this visit */ }
}
