# Tailwind (production build)

The app no longer uses the Tailwind CDN. Styles are compiled to `tailwind.css`
at build time and committed to the repo (GitHub Pages has no build step).

## Rebuild after editing classes
```bash
npm install        # first time only
npm run build:css  # regenerates tailwind.css (minified)
```
Then commit `tailwind.css`. The page links it with a cache-buster
(`tailwind.css?v=1`) — bump that `?v=` when you rebuild so browsers pick up
the new file.

## Files
- `tailwind.config.js` — content globs scan all `*.html` and `*.js`
- `postcss.config.js` — tailwindcss + autoprefixer
- `package.json` — `build:css` / `watch:css` scripts
