import os, time, hashlib, io
from typing import List, Optional
from pathlib import Path
from collections import defaultdict

from fastapi import FastAPI, Request, UploadFile, File, Form, Response, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.background import BackgroundTask
from starlette.middleware.cors import CORSMiddleware

from engines.image_engine import convert_image
from engines import image_engine, pdf_engine

# ====== Paths & App ======
BASE_DIR   = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"
TEMPL_DIR  = BASE_DIR / "templates"
CSS_PATH   = STATIC_DIR / "css" / "styles.css"

APP_NAME = "ZetaConvert"
MAX_BYTES = 20 * 1024 * 1024
RATE_LIMIT_PER_MIN = 60
STORE_DIR = "/tmp/zc"
os.makedirs(STORE_DIR, exist_ok=True)

app = FastAPI(title=APP_NAME)

# Static (RUTA ABSOLUTA) y Templates (UNICA instancia) + cache-bust por mtime real
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPL_DIR))
try:
    STYLE_VERSION = str(int(CSS_PATH.stat().st_mtime))
except FileNotFoundError:
    STYLE_VERSION = str(int(time.time()))
templates.env.globals["STYLE_VERSION"] = STYLE_VERSION

# ====== Seguridad / CORS ======
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["GET","POST","OPTIONS"], allow_headers=["*"]
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options","nosniff")
    resp.headers.setdefault("Referrer-Policy","strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy","geolocation=(), microphone=(), camera=()")
    return resp

# ====== Rate limit & size ======
bucket = {}
def too_big(request: Request):
    try:
        size = int(request.headers.get('content-length') or "0")
    except ValueError:
        size = 0
    return size > MAX_BYTES

def rate_limited(ip: str) -> bool:
    now = int(time.time() // 60)
    key = (ip, now)
    bucket[key] = bucket.get(key, 0) + 1
    return bucket[key] > RATE_LIMIT_PER_MIN

# ====== Catálogo de rutas ======
class Route:
    def __init__(self, slug, title, desc, accept, to, emoji="🔁", multi=False,
                 category="imagenes", exts_from=None, exts_to=None, keywords=None):
        self.slug = slug
        self.title = title
        self.desc = desc
        self.accept = accept
        self.to = to
        self.emoji = emoji
        self.multi = multi
        self.category = category
        self.exts_from = exts_from or []
        self.exts_to   = exts_to or []
        self.keywords  = keywords or []

ROUTES = [
    # IMÁGENES
    Route("jpg-to-png","JPG a PNG","Convertí imágenes JPG a PNG sin pérdida.",
          "image/jpeg,.jpg,.jpeg",["png"], category="imagenes",
          exts_from=["jpg","jpeg"], exts_to=["png"], keywords=["jpeg a png","convertir jpg a png"]),
    Route("png-to-jpg","PNG a JPG","Pasá tus PNG a JPG comprimido.",
          "image/png,.png",["jpg"], category="imagenes",
          exts_from=["png"], exts_to=["jpg","jpeg"], keywords=["png a jpeg"]),
    Route("webp-to-jpg","WEBP a JPG","Ideal para apps que no aceptan WEBP.",
          "image/webp,.webp",["jpg"], category="imagenes",
          exts_from=["webp"], exts_to=["jpg"], keywords=["webp a jpeg"]),
    Route("jpg-to-webp","JPG a WEBP","Compactá en WEBP moderno.",
          "image/jpeg,.jpg,.jpeg",["webp"], category="imagenes",
          exts_from=["jpg","jpeg"], exts_to=["webp"]),
    Route("image-to-pdf","Imagen a PDF","Generá un PDF desde una imagen.",
          "image/*",["pdf"], category="imagenes",
          exts_from=["jpg","jpeg","png","webp"], exts_to=["pdf"]),
    Route("pdf-to-jpg","PDF a JPG (ZIP)","Exportá las páginas del PDF a JPG en un ZIP.",
          "application/pdf,.pdf",["zip"], category="imagenes",
          exts_from=["pdf"], exts_to=["jpg","zip"], keywords=["pdf a imagen"]),
    Route("images-to-pdf","Varias imágenes a un PDF","Subí varias imágenes y creamos un PDF.",
          "image/*",["pdf"], multi=True, category="imagenes",
          exts_from=["jpg","jpeg","png","webp"], exts_to=["pdf"]),

    # VIDEO (placeholders)
    Route("mp4-to-mp3","MP4 a MP3","Extraé el audio de tu video.",
          ".mp4,video/mp4",["mp3"], category="video",
          exts_from=["mp4"], exts_to=["mp3"], keywords=["extraer audio","video a mp3"]),
    Route("mov-to-mp4","MOV a MP4","Convertí MOV (iPhone) a MP4 universal.",
          ".mov,video/quicktime",["mp4"], category="video",
          exts_from=["mov"], exts_to=["mp4"]),
    Route("webm-to-mp4","WEBM a MP4","Hacé tus WEBM compatibles.",
          ".webm,video/webm",["mp4"], category="video",
          exts_from=["webm"], exts_to=["mp4"]),

    # 3D (placeholders)
    Route("stl-to-obj","STL a OBJ","Convertí mallas STL a OBJ.",
          ".stl",["obj"], category="3d",
          exts_from=["stl"], exts_to=["obj"]),
    Route("obj-to-stl","OBJ a STL","Llevá tus OBJ a STL listo para imprimir.",
          ".obj",["stl"], category="3d",
          exts_from=["obj"], exts_to=["stl"]),
    Route("step-to-stl","STEP a STL","Pasá CAD STEP a STL.",
          ".step,.stp",["stl"], category="3d",
          exts_from=["step","stp"], exts_to=["stl"]),

    # DOCUMENTOS (placeholders)
    Route("docx-to-pdf","Word (DOCX) a PDF","Convertí documentos a PDF listo para compartir.",
          ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",["pdf"], category="documentos",
          exts_from=["docx"], exts_to=["pdf"]),
    Route("pptx-to-pdf","PowerPoint (PPTX) a PDF","Presentaciones en PDF en segundos.",
          ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",["pdf"], category="documentos",
          exts_from=["pptx"], exts_to=["pdf"]),
    Route("xlsx-to-pdf","Excel (XLSX) a PDF","Hojas de cálculo a PDF legible.",
          ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",["pdf"], category="documentos",
          exts_from=["xlsx"], exts_to=["pdf"]),
    Route("pdf-merge","Unir PDF","Juntá varios PDFs en uno.",
          "application/pdf,.pdf",["pdf"], category="documentos",
          exts_from=["pdf"], exts_to=["pdf"], keywords=["unir pdf","merge pdf"]),
    Route("pdf-split","Dividir PDF","Separá tu PDF en páginas o rangos.",
          "application/pdf,.pdf",["zip","pdf"], category="documentos",
          exts_from=["pdf"], exts_to=["pdf","zip"], keywords=["split pdf"]),
    Route("pdf-compress","Comprimir PDF","Reducí el peso manteniendo calidad.",
          "application/pdf,.pdf",["pdf"], category="documentos",
          exts_from=["pdf"], exts_to=["pdf"], keywords=["comprimir pdf"]),
]

CATEGORIES = defaultdict(list)
for r in ROUTES:
    CATEGORIES[r.category].append(r)

# ====== Dataset para buscador ======
@app.get("/formats.json")
def formats_json():
    return {"items": [
        {"slug": r.slug, "title": r.title, "desc": r.desc, "category": r.category,
         "from": r.exts_from, "to": r.exts_to, "keywords": r.keywords, "emoji": r.emoji}
        for r in ROUTES
    ]}

def get_route(slug: str) -> Optional[Route]:
    for r in ROUTES:
        if r.slug == slug:
            return r
    return None

# ====== Pages ======
@app.get("/", response_class=HTMLResponse, name="home")
async def home(request: Request):
    return templates.TemplateResponse(
        "home.html",
        {"request": request, "year": time.strftime("%Y"), "routes_list": ROUTES}
    )

@app.get("/routes", response_class=HTMLResponse, name="routes")
async def routes_page(request: Request):
    return templates.TemplateResponse(
        "home.html",
        {"request": request, "year": time.strftime("%Y"), "routes_list": ROUTES}
    )

@app.get("/r/{slug}", response_class=HTMLResponse, name="route_page")
async def route_page(request: Request, slug: str):
    route = get_route(slug)
    if not route:
        raise HTTPException(404)
    page_title = route.title + " online"
    page_desc  = route.desc + " Gratis y sin registro."
    return templates.TemplateResponse(
        "route.html",
        {"request": request, "route": route, "page_title": page_title, "page_desc": page_desc, "year": time.strftime("%Y")}
    )

@app.get("/privacidad", response_class=HTMLResponse, name="privacy")
async def privacy(request: Request):
    return templates.TemplateResponse("privacy.html", {"request": request, "year": time.strftime("%Y")})

@app.get("/terminos", response_class=HTMLResponse, name="terms")
async def terms(request: Request):
    return templates.TemplateResponse("terms.html", {"request": request, "year": time.strftime("%Y")})

# Short aliases
app.add_api_route("/privacy", privacy, include_in_schema=False)
app.add_api_route("/terms", terms, include_in_schema=False)

# ====== Convert API ======
@app.post("/api/convert")
async def convert(
    request: Request,
    target: str = Form(...), route: str = Form(None),
    file: UploadFile = File(None), files: List[UploadFile] = File(None),
    quality: int = Form(90), dpi: int = Form(144), pages: str = Form(""),
    resize_w: int = Form(0), resize_h: int = Form(0), stripmeta: int = Form(1)
):
    client_ip = request.client.host if request.client else "0.0.0.0"
    if rate_limited(client_ip):
        raise HTTPException(429, "Demasiadas solicitudes, probá en un minuto.")
    if too_big(request):
        raise HTTPException(413, f"Archivo demasiado grande. Máx {MAX_BYTES//1024//1024}MB")

    # Parse pages "1-3,5"
    pages_list = None
    if pages.strip():
        rngs = [p.strip() for p in pages.split(',') if p.strip()]
        idxs = []
        for r in rngs:
            if '-' in r:
                a,b = r.split('-',1)
                a,b = int(a)-1, int(b)-1
                idxs.extend(list(range(max(0,a), max(0,b)+1)))
            else:
                idxs.append(max(0, int(r)-1))
        pages_list = sorted(set([i for i in idxs if i >= 0]))

    # Multi-upload: images -> single PDF
    if files:
        if target.lower() != "pdf":
            raise HTTPException(400, "Multi-archivo solo se permite a PDF.")
        from PIL import Image
        images = []
        for uf in files:
            b = await uf.read()
            im = Image.open(io.BytesIO(b))
            if im.mode in ('RGBA','P'):
                im = im.convert('RGB')
            # Optional resize
            if resize_w>0 or resize_h>0:
                w, h = im.size
                new_w = resize_w if resize_w>0 else int(w*(resize_h/h))
                new_h = resize_h if resize_h>0 else int(h*(resize_w/w))
                im = im.resize((new_w, new_h))
            images.append(im)
        if not images:
            raise HTTPException(400, "Sin archivos")
        out_path = os.path.join(STORE_DIR, f"images-{int(time.time())}.pdf")
        images[0].save(out_path, save_all=True, append_images=images[1:], format="PDF")
        return FileResponse(
            out_path, filename="images.pdf", media_type="application/pdf",
            background=BackgroundTask(lambda: os.path.exists(out_path) and os.remove(out_path))
        )

    # Single file
    if not file:
        raise HTTPException(400, "Falta archivo")
    name = file.filename or "input"
    ext = os.path.splitext(name)[1].lower()

    if ext in image_engine.SUPPORTED_FROM:
        content = await file.read()
        data, mime = convert_image(content, ext, target,
                                   quality=quality, resize=(resize_w, resize_h), strip=bool(stripmeta))
        fname = os.path.splitext(os.path.basename(name))[0] + "." + target.lower()
        return Response(content=data, media_type=mime,
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    elif ext == ".pdf":
        content = await file.read()
        if target.lower() == "zip":
            data, mime, fname = pdf_engine.pdf_to_images(content, image_ext="jpg", dpi=dpi, pages=pages_list)
            return Response(content=data, media_type=mime,
                            headers={"Content-Disposition": f'attachment; filename="{fname}"'})
        elif target.lower() in ("png","jpg","webp"):
            data, mime, fname = pdf_engine.pdf_to_images(content, image_ext=target.lower(), dpi=dpi, pages=pages_list)
            return Response(content=data, media_type=mime,
                            headers={"Content-Disposition": f'attachment; filename="{fname}"'})
        else:
            raise HTTPException(400, "Destino no soportado para PDF")
    else:
        raise HTTPException(400, "Formato de entrada no soportado aún")

# ====== SEO util ======
@app.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    return "User-agent: *\nAllow: /\nSitemap: https://zetaconvert.online/sitemap.xml\n"

@app.get("/ads.txt", name="ads_txt", response_class=PlainTextResponse)
def ads_txt():
    return "google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0\n"

@app.get("/sitemap.xml", response_class=PlainTextResponse)
def sitemap(request: Request):
    base = str(request.base_url)[:-1]
    urls = [f"{base}/", f"{base}/routes", f"{base}/privacidad", f"{base}/terminos"] + [f"{base}/r/{r.slug}" for r in ROUTES]
    items = "".join(f"<url><loc>{u}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>" for u in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    return Response(content=xml, media_type="application/xml")

@app.get("/manifest.webmanifest", name="manifest")
def manifest():
    return {
        "name":"ZetaConvert","short_name":"ZetaConvert","start_url":"/","display":"standalone",
        "background_color":"#ffffff","theme_color":"#e1192a",
        "icons":[
            {"src":"/static/icons/icon-192.png","sizes":"192x192","type":"image/png"},
            {"src":"/static/icons/icon-512.png","sizes":"512x512","type":"image/png"}
        ]
    }

@app.get("/healthz")
def health():
    return {"ok": True}
