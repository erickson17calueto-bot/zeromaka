"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "zeromaka_theme";

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Aplica o tema ao <html>: adiciona a classe `.light` só quando o tema efetivo é claro. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.classList.toggle("light", !dark);
}

/** Script inline (no-flash) — corre no <head> antes da pintura para evitar flash de tema. */
export const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(!d){document.documentElement.classList.add('light');}}catch(e){}})();`;

type Ctx = { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void };
const ThemeCtx = createContext<Ctx>({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("dark");

  // Sincroniza o estado React com o que o script no-flash já aplicou.
  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemeChoice | null) || "dark";
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  // Em modo "system", segue as mudanças do SO em tempo real.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
    applyTheme(t);
  }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
