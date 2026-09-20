import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          canvas: "var(--bg-canvas)",
          surface: "var(--bg-surface)",
          sidebar: "var(--bg-sidebar)",
          border: "var(--border-subtle)",
          borderStrong: "var(--border-strong)",
          brand: "var(--accent-brand)",
          brandHover: "var(--accent-brand-hover)",
          brandLight: "var(--accent-brand-light)",
          cyan: "var(--accent-cyan)",
          emerald: "var(--accent-emerald)",
          amber: "var(--accent-amber)",
          rose: "var(--accent-rose)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
