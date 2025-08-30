from io import BytesIO
from PIL import Image

SUPPORTED_FROM = {'.jpg', '.jpeg', '.png', '.webp'}
SUPPORTED_TO = {'png', 'jpg', 'webp', 'pdf'}

def convert_image(file_bytes: bytes, src_ext: str, target: str, quality: int|None=None, resize: tuple[int,int]|None=None, strip: bool=False) -> tuple[bytes, str]:
    im = Image.open(BytesIO(file_bytes))
    # Optional resize
    if resize and (resize[0] > 0 or resize[1] > 0):
        w, h = im.size
        new_w = resize[0] if resize[0] > 0 else int(w * (resize[1]/h))
        new_h = resize[1] if resize[1] > 0 else int(h * (resize[0]/w))
        im = im.resize((new_w, new_h))

    if target.lower() == 'pdf':
        pdf_io = BytesIO()
        if im.mode in ('RGBA','P'):
            im = im.convert('RGB')
        im.save(pdf_io, format='PDF')
        return pdf_io.getvalue(), 'application/pdf'
    else:
        out = BytesIO()
        save_params = {}
        if target.lower() in ('jpg','jpeg'):
            if im.mode in ('RGBA','P'):
                im = im.convert('RGB')
            save_params['quality'] = int(quality or 90)
            fmt = 'JPEG'
            mime = 'image/jpeg'
        elif target.lower() == 'png':
            fmt = 'PNG'; mime = 'image/png'
        elif target.lower() == 'webp':
            fmt = 'WEBP'; mime = 'image/webp'
            save_params['quality'] = int(quality or 90)
        else:
            raise ValueError('Formato no soportado')
        # Strip metadata if requested
        if strip:
            try:
                im.info.pop('exif', None)
            except Exception:
                pass
        im.save(out, format=fmt, **save_params)
        return out.getvalue(), mime
