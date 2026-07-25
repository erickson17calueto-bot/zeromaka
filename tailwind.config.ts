import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        maka: {
          50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
          400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c",
          800: "#9a3412", 900: "#7c2d12"
        },
        ink: {
          950: "var(--ink-950)", 900: "var(--ink-900)", 800: "var(--ink-800)", 700: "var(--ink-700)",
          600: "var(--ink-600)", 500: "var(--ink-500)", 400: "var(--ink-400)", 300: "var(--ink-300)",
          200: "var(--ink-200)", 100: "var(--ink-100)"
        },
        // Texto/ícone sobre o laranja da marca — fixo escuro nos dois temas (não inverte).
        onbrand: "#1c1917"
      },
      fontFamily: {
        display: ["Archivo Black", "Arial Black", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
