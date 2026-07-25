"use client";
import { useTheme, ThemeChoice } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";

const OPTS: { v: ThemeChoice; icon: typeof Sun; label: string }[] = [
  { v: "light", icon: Sun, label: "Claro" },
  { v: "dark", icon: Moon, label: "Escuro" },
  { v: "system", icon: Monitor, label: "Sistema" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-ink-800 p-0.5" role="group" aria-label="Tema">
      {OPTS.map(({ v, icon: Icon, label }) => {
        const active = theme === v;
        return (
          <button
            key={v}
            onClick={() => setTheme(v)}
            aria-pressed={active}
            title={label}
            className={`flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors ${
              active ? "bg-maka-500/15 text-maka-400" : "text-ink-500 hover:text-ink-300 hover:bg-ink-800"
            }`}
          >
            <Icon size={15} />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
