/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './!(node_modules)/*.js',
    './!(node_modules)/**/*.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // app.css already ships the full reset + M3 design system, so Tailwind's
  // preflight base reset is disabled to avoid clobbering those styles
  // (font stack, borders, backgrounds) and causing visual regressions.
  corePlugins: {
    preflight: false,
  },
  // Pages are served from a subpath on GitHub Pages (parkerbranham.com/Clearline/).
  // Relative URLs in the built CSS keep assets working there and on localhost.
};
