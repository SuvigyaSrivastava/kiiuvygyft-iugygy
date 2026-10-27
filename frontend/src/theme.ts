import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

/** Chart tokens. Values mirror the CSS custom properties in styles.css; keep both in step. */
export const TOKENS = {
  light: { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", forecast: "#2a78d6", actual: "#eb6834", over: "#e34948", under: "#2a78d6", good: "#006300" },
  dark: { surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835", forecast: "#3987e5", actual: "#d95926", over: "#e66767", under: "#3987e5", good: "#0ca30c" },
} as const;
export type Tokens = { [K in keyof typeof TOKENS.light]: string };

const KEY = "wind-portal-theme";

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme(): { choice: ThemeChoice; mode: "light" | "dark"; cycle: () => void; tokens: Tokens } {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  const [sys, setSys] = useState<boolean>(systemDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSys(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (choice === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", choice);
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
  }, [choice]);

  const mode: "light" | "dark" = choice === "system" ? (sys ? "dark" : "light") : choice;
  const cycle = () => setChoice((c) => (c === "system" ? "light" : c === "light" ? "dark" : "system"));
  return { choice, mode, cycle, tokens: TOKENS[mode] as Tokens };
}
