import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#eef3fb", 100: "#d6e1f3", 200: "#adc3e6", 300: "#7c9dd3", 400: "#4f77bd", 500: "#2f59a3", 600: "#214485", 700: "#1a366b", 800: "#142a54", 900: "#0e1e3d", 950: "#0a1530" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
