/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pine: "#173B33",
        pinesoft: "#2A544A",
        paper: "#F4F7F5",
        card: "#FFFFFF",
        jade: { DEFAULT: "#0E8A62", deep: "#0A6B4C", tint: "#E2F2EB" },
        marigold: { DEFAULT: "#EDA419", tint: "#FBF0D8", ink: "#8A5B00" },
        mist: "#DEE8E3",
        fog: "#6C8078",
        danger: "#C0453C",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        body: ['"Instrument Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,59,51,0.06), 0 4px 16px rgba(23,59,51,0.06)",
        lift: "0 2px 4px rgba(23,59,51,0.08), 0 10px 28px rgba(23,59,51,0.10)",
      },
    },
  },
  plugins: [],
};
