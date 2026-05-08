import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b0e14",
          soft: "#0f172a",
          muted: "#111827",
        },
        surface: {
          DEFAULT: "#0f172a",
          raised: "#111c30",
          hover: "#152139",
        },
        line: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.14)",
        },
        text: {
          DEFAULT: "#e5e7eb",
          dim: "#94a3b8",
          faint: "#64748b",
        },
        brand: {
          DEFAULT: "#0ea5e9",
          accent: "#22d3ee",
          deep: "#0284c7",
        },
        good: "#22c55e",
        warn: "#f59e0b",
        bad: "#ef4444",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.25)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
