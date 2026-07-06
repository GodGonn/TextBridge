import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bridge: {
          50: "#eef8ff",
          100: "#d9efff",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        th: {
          page: "rgb(var(--th-page) / <alpha-value>)",
          card: "rgb(var(--th-card) / <alpha-value>)",
          inner: "rgb(var(--th-inner) / <alpha-value>)",
          elevated: "rgb(var(--th-elevated) / <alpha-value>)",
          text: "rgb(var(--th-text) / <alpha-value>)",
          "text-sub": "rgb(var(--th-text-sub) / <alpha-value>)",
          "text-muted": "rgb(var(--th-text-muted) / <alpha-value>)",
          "text-faint": "rgb(var(--th-text-faint) / <alpha-value>)",
          border: "rgb(var(--th-border) / <alpha-value>)",
          "border-strong": "rgb(var(--th-border-strong) / <alpha-value>)",
          "border-subtle": "rgb(var(--th-border-subtle) / <alpha-value>)",
          accent: "rgb(var(--th-accent) / <alpha-value>)",
          "accent-text": "rgb(var(--th-accent-text) / <alpha-value>)",
          "accent-soft": "rgb(var(--th-accent-soft) / <alpha-value>)",
          overlay: "rgb(var(--th-overlay) / <alpha-value>)",
          "error-bg": "rgb(var(--th-error-bg) / <alpha-value>)",
          "error-text": "rgb(var(--th-error-text) / <alpha-value>)",
          "warning-bg": "rgb(var(--th-warning-bg) / <alpha-value>)",
          "warning-text": "rgb(var(--th-warning-text) / <alpha-value>)",
        },
      },
      boxShadow: {
        soft: "0 18px 60px rgba(15, 23, 42, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
