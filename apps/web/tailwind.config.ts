import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        teams: {
          purple: "#5b5fc7",
          purpleHover: "#4f52b2",
          grayBg: "#f5f5f5",
          grayBorder: "#e1dfdd",
          grayHover: "#ebebeb",
          textLight: "#616161",
          textDark: "#242424",
        }
      },
    },
  },
  plugins: [],
};
export default config;
