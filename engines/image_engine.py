# image_engine.py
from __future__ import annotations
from io import BytesIO
from typing import Tuple, Optional
from PIL import Image, ImageOps, features

# =========================
#  Soporte dinámico por PIL
# =========================
# Armamos conjuntos a partir de las extensiones registradas en Pillow.
# Esto permite admitir muchos formatos sin listarlos a mano.
_PIL_EXT_MAP = Image.registered_extensions()  # {".jpg": "JPEG", ".png": "PNG", ...}

# Inputs válidos: todas las extensiones que PIL sabe abrir
SUPPORTED_FROM = set(sorted(ext.lower() for ext, fmt in _PIL_EXT_MAP.items()))

# Targets que vamos a intentar guardar. Incluimos los más comunes explicitamente
# y además habilitamos cualquier formato que PIL reporte como grabable.
_COMMON_TARGETS = {"jpg", "jpeg", "png", "webp", "tiff", "bmp", "gif", "pdf"}
# Derivar posibles de PIL
_PIL_SAVE_FORMATS = {fmt.lower() for fmt in set(_PIL_EXT_MAP.values())}
# proyección a “ext” plausible
_PIL_SAVE_AS_EXT = {ext.lstrip(".").lower() for ext, fmt in _PIL_EXT_MAP.items() if fmt.lower() in _PIL_SAVE_FORMATS}
SUPPORTED_TO = _COMMON_TARGETS.union(_PIL_SAVE_AS_EXT)

# Mimes conocidos (fallback: image/<ext>)
_MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "tif": "image/tiff", "tiff": "image/tiff",
    "bmp": "image/bmp",
    "gif": "image/gif",
    "avif": "image/avif",        # requiere plugin/soporte del build de PIL
    "heic": "image/heic",        # idem
    "ico": "image/vnd.microsoft.icon",
    "pdf": "application/pdf",
}

def _fmt_of_ext(ext: str) -> str:
    """Devuelve el formato PIL (e.g. 'JPEG') a partir de una extensión '.jpg'."""
    return _PIL_EXT_MAP.get(ext.lower(), "").upper() or ext.lstrip(".").upper()

def _mime_of_target(target: str) -> str:
    t = target.lower()
    if t in _MIME:
        return _MIME[t]
    return ("application/pdf" if t == "pdf" else f"image/{t}")

def _normalize_ext(e: Optional[str]) -> str:
    if not e: return ""
    e = e.strip().lower()
    return e if e.startswith(".") else f".{e}"

def _flatten_to_rgb(im: Image.Image, bg=(255, 255, 255)) -> Image.Image:
    """
    Convierte RGBA/P a RGB con fondo sólido (útil para JPG/PDF).
    """
    if im.mode in ("RGBA", "LA"):
        bg_im = Image.new("RGB", im.size, bg)
        bg_im.paste(im, mask=im.split()[-1])  # usa alfa como máscara
        return bg_im
    if im.mode == "P":
        return im.convert("RGB")
    if im.mode.startswith("CMYK"):
        return im.convert("RGB")
    return im

def _apply_resize(im: Image.Image, resize: Optional[Tuple[int, int]]) -> Image.Image:
    if not resize:
        return im
    w, h = im.size
    rw, rh = resize
    if (rw and rw > 0) or (rh and rh > 0):
        if rw and rh:
            new_w, new_h = int(rw), int(rh)
        elif rw:
            new_w = int(rw)
            new_h = max(1, int(h * (new_w / float(w))))
        else:
            new_h = int(rh)
            new_w = max(1, int(w * (new_h / float(h))))
        if new_w > 0 and new_h > 0 and (new_w != w or new_h != h):
            im = im.resize((new_w, new_h))
    return im

def convert_image(
    file_bytes: bytes,
    src_ext: str,
    target: str,
    quality: Optional[int] = None,
    resize: Optional[Tuple[int, int]] = None,
    strip: bool = False
) -> Tuple[bytes, str]:
    """
    Conversión simple y genérica de imágenes:
    - Abre cualquier formato que soporte PIL (SUPPORTED_FROM).
    - target puede ser: jpg/jpeg/png/webp/tiff/bmp/gif/pdf o cualquier otro que PIL pueda guardar.
    - quality afecta JPG/WEBP (y algunos otros si PIL lo respeta).
    - resize=(w,h) con cualquiera en 0 para mantener proporción.
    - strip elimina metadatos EXIF básicos.
    Devuelve: (bytes_salida, mime).
    """
    target = (target or "").lower()
    if target not in SUPPORTED_TO:
        # No abortamos: intentamos igual y dejamos que PIL decida (alguno builds soportan AVIF/HEIC)
        SUPPORTED_TO.add(target)

    # Abrir imagen y corregir orientación EXIF
    im = Image.open(BytesIO(file_bytes))
    im = ImageOps.exif_transpose(im)

    # Resize opcional
    im = _apply_resize(im, resize)

    # ===== PDF =====
    if target == "pdf":
        # PDF no soporta alfa; aplanamos a RGB
        im_pdf = _flatten_to_rgb(im, bg=(255, 255, 255))
        out = BytesIO()
        # Si hay multi-frame y quisieras varias páginas, tendrías que iterar frames (fuera de alcance “simple”)
        im_pdf.save(out, format="PDF", optimize=True)
        return out.getvalue(), _mime_of_target("pdf")

    # ===== Imagen =====
    # Normalizamos modo según destino
    t = target
    fmt = _fmt_of_ext(f".{t}")

    save_params = {}
    out = BytesIO()

    # Manejo de modos: JPG/WEBP suelen requerir RGB sin alfa
    if t in ("jpg", "jpeg", "webp"):
        im = _flatten_to_rgb(im)

    # Quality
    q = int(quality) if (quality is not None and str(quality).isdigit()) else 90
    if t in ("jpg", "jpeg"):
        save_params.update({"quality": q, "subsampling": 2, "optimize": True})
    elif t == "webp":
        # algunos builds soportan lossless=True si querés usar q=100 → simple: calidad fija
        save_params.update({"quality": q, "method": 6})

    # PNG: compresión por defecto; TIFF/BMP/GIF sin parámetros especiales para mantenerlo simple
    # Strip metadata: recrear imagen sin EXIF/APP chunks cuando es posible
    if strip:
        try:
            # Forzar recreación sin info extra
            data_only = Image.new(im.mode, im.size)
            data_only.putdata(list(im.getdata()))
            im = data_only
        except Exception:
            # fallback: intentar limpiar exif del info si existe
            im.info.pop("exif", None)

    # Guardar
    try:
        im.save(out, format=fmt, **save_params)
    except Exception:
        # Fallback: intentar con formato por defecto de PIL
        fallback_fmt = "JPEG" if t in ("jpg", "jpeg") else (fmt or "PNG")
        if fallback_fmt in ("JPEG",) and im.mode not in ("RGB",):
            im = _flatten_to_rgb(im)
        im.save(out, format=fallback_fmt, **save_params)

    return out.getvalue(), _mime_of_target(t)
