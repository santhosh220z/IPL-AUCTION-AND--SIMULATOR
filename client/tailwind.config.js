/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"]
      },
      colors: {
        storm: {
          50: "#050505",
          100: "#111111",
          200: "#1A1A1A",
          300: "#2A2A2A",
          400: "#444444",
          500: "#7B7B7B",
          600: "#A5A5A5",
          700: "#C7AA55",
          800: "#E1C06B",
          900: "#FFFFFF"
        },
        ember: {
          400: "#E1C06B",
          500: "#D4AF37",
          600: "#B8942D"
        }
      },
      boxShadow: {
        ambient: "0 24px 70px rgba(0, 0, 0, 0.45)"
      }
    }
  },
  plugins: []
};
