# Vendored libraries

| File | What | Licence |
|---|---|---|
| `three.bundle.min.js` | three.js r187 core + the add-ons listed in `three-entry.js`, as one ES module | MIT (`LICENSE-three.txt`) |
| `qrcode.min.js` | qrcode-generator 2.0.4 as an ES module | MIT (`LICENSE-qrcode-generator.txt`) |

Rebuild (only needed to add an add-on or update three.js):

```bash
npm install three esbuild
npx esbuild three-entry.js --bundle --format=esm --minify --legal-comments=none --outfile=three.bundle.min.js
```

Check that the result imports nothing by URL (`grep -o 'https://cdn[^"]*' three.bundle.min.js`): some
three.js add-ons (e.g. `TTFLoader`) pull dependencies from a CDN, which would break offline rendering.
