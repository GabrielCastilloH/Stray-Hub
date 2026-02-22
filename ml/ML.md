# ML Pipeline — Stray Hub

Dog face embedding extraction and similarity search for stray animal identification.

---

## Overview

| Item | Value |
|------|-------|
| **Port** | 8000 |
| **Model** | DogFaceNet (modified ResNet) |
| **Input** | 224×224×3 RGB |
| **Output** | 32D L2-normalized embedding |
| **Similarity** | Cosine (dot product of normalized vectors) |
| **Match threshold** | ≥ 0.7 |

---

## Quick Start

```bash
cd ml && pip install -r requirements.txt
uvicorn embed_service:app --port 8000 --reload
# API docs: http://localhost:8000/docs
```

---

## Architecture

```
Image (any size) → Resize 224×224 → DogFaceNet → 32D embedding (L2-norm) → Cosine similarity
```

- **Embedding generation** lives in `ml/` only. Never in Functions or mobile.
- **Similarity search** is done in the backend (numpy dot product over Firestore embeddings). ML service only produces embeddings.

---

## Directory Structure

```
ml/
├── services/dogfacenet/   # Model, preprocessing, embedder
├── checkpoints/           # dogfacenet_weights.h5 (gitignored)
├── embed.py               # get_embedder(), embed_dog_face(), embed_batch()
└── embed_service.py       # FastAPI on port 8000
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/embed` | Single image → 32D embedding |
| POST | `/embed/batch` | Multiple images → embeddings |
| POST | `/similarity` | Two embeddings → cosine sim + distance |
| GET | `/health` | Health check |
| GET | `/info` | Model version, input shape, etc. |

---

## Model Weights

Place trained weights at `checkpoints/dogfacenet_weights.h5`.

- **Download**: [DogFaceNet releases](https://github.com/GuillaumeMougeot/DogFaceNet/releases) or [Zenodo](https://zenodo.org/records/12578449)
- **Train**: `cd DogFaceNet-master && python dogfacenet/dogfacenet.py`
- **Without weights**: Model loads for testing; embeddings are untrained.

---

## Usage

```python
from ml.embed import embed_dog_face, embed_batch, compute_similarity

# Single image (path, PIL, or numpy)
emb = embed_dog_face('dog.jpg')  # (32,)

# Batch
embs = embed_batch(['a.jpg', 'b.jpg'])  # (N, 32)

# Similarity (both L2-normalized)
sim = compute_similarity(emb1, emb2)  # [-1, 1], higher = more similar
```

---

## Integration with Backend

1. Backend calls `POST http://localhost:8000/embed` with image bytes.
2. Backend averages multi-photo embeddings (element-wise mean, then L2-normalize).
3. Backend fetches other sightings from Firestore and computes cosine similarity (numpy dot product).
4. Candidates with similarity ≥ 0.7 are returned as matches.

---

## Schema (Current v1)

| Field | Value |
|-------|-------|
| Embedding size | 32 floats |
| Input | 224×224×3 RGB |
| Normalization | L2 (unit norm) |
| Model | DogFaceNet (`dogfacenet_v1_random`) |

- Firestore `sightings.embedding` stores `array of 32 floats`.
- `sightings.model_version` must be stored.
- **Any change** to embedding size, preprocessing, or model → update this section in ML.md.

---

## Performance

| Hardware | Single image | Batch (32) |
|----------|--------------|------------|
| CPU (Intel i7) | 80–100ms | 2–3s |
| GPU (NVIDIA T4) | 15–20ms | 400–500ms |
| M1 Mac (Metal) | 20–30ms | 600–800ms |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| TensorFlow import error | `pip install "tensorflow>=2.10.0,<2.16.0"` |
| M1/M2 slow | `pip install tensorflow-macos tensorflow-metal` |
| Weights not found | Use `weights_path=None` for testing; get weights for production |
| OOM | `export CUDA_VISIBLE_DEVICES=""` or reduce batch size |

---

## Tests

```bash
cd ml/services/dogfacenet && python test_embedder.py
```
