import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        maka: {
          50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
          400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c",
          800: "#9a3412", 900: "#7c2d12"
        },
        ink: {
          950: "#0c0a09", 900: "#1c1917", 800: "#292524", 700: "#44403c",
          600: "#57534e", 500: "#78716c", 400: "#a8a29e", 300: "#d6d3d1"
        }
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
