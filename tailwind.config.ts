import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "#0d0d0d",
        surface: "#1a1a19",
        surface2: "#232322",
        hairline: "#2c2c2a",
        ink: {
          primary: "#ffffff",
          secondary: "#c3c2b7",
          muted: "#898781",
        },
        series: {
          1: "#3987e5",
          2: "#199e70",
          3: "#c98500",
          4: "#008300",
          5: "#9085e9",
          6: "#e66767",
          7: "#d55181",
          8: "#d95926",
        },
        good: "#0ca30c",
        warning: "#fab219",
        serious: "#ec835a",
        critical: "#d03b3b",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
