/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
      },

      colors: {
        brand: {
          indigo:  "#6366f1",
          emerald: "#10b981",
          rose:    "#f43f5e",
          amber:   "#f59e0b",
        },
      },

      borderRadius: {
        "4xl": "2rem",
        "5xl": "3rem",
      },

      boxShadow: {
        card:       "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)",
        "card-hover":"0 8px 32px rgba(0,0,0,.10)",
        toast:      "0 25px 50px -12px rgba(0,0,0,.25)",
      },

      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        pulseRing: {
          "0%":   { boxShadow: "0 0 0 0 rgba(99,102,241,.4)" },
          "70%":  { boxShadow: "0 0 0 10px rgba(99,102,241,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" },
        },
      },

      animation: {
        shimmer:    "shimmer 1.5s infinite",
        fadeInUp:   "fadeInUp 0.4s ease-out both",
        scaleIn:    "scaleIn 0.3s ease-out both",
        pulseRing:  "pulseRing 2s infinite",
      },

      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },

      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
