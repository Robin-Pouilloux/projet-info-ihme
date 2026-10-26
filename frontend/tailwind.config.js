/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202923",
        moss: "#526b57",
        lime: "#d5e4bd",
        paper: "#f6f5f0",
        muted: "#7e877f",
        line: "#e7e8e1",
        orange: "#d48558",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["DM Sans", "Inter", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 30px rgba(32, 41, 35, 0.045)",
      },
    },
  },
  plugins: [],
};
