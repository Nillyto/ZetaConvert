import io, zipfile
import fitz  # PyMuPDF

SUPPORTED_FROM = {'.pdf'}

def pdf_to_images(file_bytes: bytes, image_ext: str='jpg', dpi: int=144, pages: list[int]|None=None) -> tuple[bytes, str, str]:
    assert image_ext in ('jpg','png','webp'), 'Formato destino inválido'
    doc = fitz.open(stream=file_bytes, filetype='pdf')
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        indices = pages if pages else list(range(len(doc)))
        for idx, i in enumerate(indices):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            img_bytes = pix.tobytes(output=image_ext)
            z.writestr(f'page-{i+1:03d}.{image_ext}', img_bytes)
    return mem.getvalue(), 'application/zip', 'pages.zip'
