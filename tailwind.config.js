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
  // Pages are served from a subpath on GitHub Pages (parkerbranham.com/Clearline/).
  // Relative URLs in the built CSS keep assets working there and on localhost.
};
