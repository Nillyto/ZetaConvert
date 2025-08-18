# ZetaConvert

Conversor de archivos online (imágenes, texto y 3D). Frontend estático (Netlify) + backend en Render (Flask + Pillow).

## Estructura
- `index.html` + páginas en `converters/`, `text/`, `three/`, `legal/`
- CSS en `assets/css/styles.css`
- JS en `assets/js/` (UI, i18n, tema, formularios, conversor)
- PWA: `manifest.webmanifest`, `sw.js`
- SEO: `robots.txt`, `sitemap.xml`
- Netlify: `netlify.toml` (redirects, proxy `/api`)

## Desarrollo
1. Clona el repo.
2. Sirve estáticos (por ejemplo):
   ```bash
   npx serve .
