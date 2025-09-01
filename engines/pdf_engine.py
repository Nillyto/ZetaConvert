from io import BytesIO

try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

def _ensure_pymupdf():
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) no está instalado.")

def pdf_to_images(pdf_bytes: bytes, image_ext: str = "jpg", dpi: int = 144, pages=None):
    """
    Devuelve (zip_bytes, 'application/zip', 'pages.zip') o (img_bytes, mime, filename)
    según tu implementación actual. Ajustá a tu retorno real.
    """
    _ensure_pymupdf()
    # ... tu implementación existente usando fitz ...
    # (no la repito porque ya la tenías; solo asegurate de llamar _ensure_pymupdf() antes)