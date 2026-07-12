/** @type {import('tailwindcss').Config} */

// All colors are CSS variables (defined in index.css) so the entire app
// re-themes for dark mode without touching component classes. Values are
// "R G B" triplets to keep Tailwind's alpha modifiers (e.g. bg-pine/70) working.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        pine: v("pine"),
        pinesoft: v("pinesoft"),
        paper: v("paper"),
        card: v("card"),
        jade: { DEFAULT: v("jade"), deep: v("jade-deep"), tint: v("jade-tint") },
        marigold: { DEFAULT: v("marigold"), tint: v("marigold-tint"), ink: v("marigold-ink") },
        mist: v("mist"),
        fog: v("fog"),
        danger: v("danger"),
        // Surfaces that stay dark in BOTH themes (footer, toasts, overlays).
        abyss: { DEFAULT: v("abyss"), soft: v("abyss-soft") },
        glow: v("glow"),
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
