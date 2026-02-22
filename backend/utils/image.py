import io

from PIL import Image

from backend.config import settings


def resize_for_embedding(file_data: bytes) -> bytes:
    """Center-crop to square then resize to model input size (224x224 by default)."""
    img = Image.open(io.BytesIO(file_data))
    img = img.convert("RGB")
    w, h = img.size
    short = min(w, h)
    left = (w - short) // 2
    top = (h - short) // 2
    img = img.crop((left, top, left + short, top + short))
    img = img.resize((settings.image_resize_size, settings.image_resize_size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
