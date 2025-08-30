# ZetaConvert · Innovator Edition

Conversor online con **FastAPI**, **Pillow** y **PyMuPDF**. Incluye:
- Opciones avanzadas: calidad JPG/WEBP, DPI PDF→imagen, rango de páginas, resize y quitar metadatos.
- UX: drag & drop, pegar desde portapapeles, pre-optimización en navegador, barra de progreso.
- SEO: JSON-LD (WebSite, SoftwareApplication, HowTo, FAQ), sitemap, robots, canonical, OG/Twitter.
- PWA: service worker con cache de assets y modo offline básico.
- Ads: snippet de AdSense + `ads.txt`.

## Ejecutar
```
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
