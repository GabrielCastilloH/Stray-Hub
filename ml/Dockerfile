FROM python:3.12-slim

WORKDIR /app

# System deps for OpenCV and image libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install prod deps — tensorflow-cpu (no GPU on Cloud Run, much smaller image)
RUN pip install --no-cache-dir \
    "tensorflow-cpu>=2.16.0" \
    "Pillow>=9.0.0" \
    "scikit-image>=0.19.0" \
    "opencv-python-headless>=4.6.0" \
    "numpy>=1.21.0" \
    "fastapi>=0.95.0" \
    "uvicorn[standard]>=0.20.0" \
    "python-multipart>=0.0.6" \
    "pydantic>=2.0.0"

# Copy source + model weights (67MB .h5 is baked into the image)
COPY . .

EXPOSE 8080

CMD ["uvicorn", "embed_service:app", "--host", "0.0.0.0", "--port", "8080"]
