# Stray Hub ML Services

Machine learning infrastructure for dog face re-identification in the Stray Hub system.

## Overview

This directory contains the ML inference services for Stray Hub, including:
- **DogFaceNet Embedder**: Dog face embedding extraction
- **Embedding Service API**: HTTP API for ML inference
- **Utilities**: Image preprocessing, vector operations, etc.

## Directory Structure

```
ml/
├── services/
│   └── dogfacenet/          # DogFaceNet inference module
│       ├── __init__.py
│       ├── model.py         # Model architecture
│       ├── embedder.py      # High-level wrapper
│       ├── preprocessing.py # Image preprocessing
│       ├── test_embedder.py # Test suite
│       └── README.md        # Detailed documentation
├── checkpoints/             # Model weights (not in git)
│   └── .gitkeep
├── embed.py                 # Main embedding interface
├── embed_service.py         # FastAPI service
├── requirements.txt         # Python dependencies
└── README.md               # This file
```

## Quick Start

### 1. Install Dependencies

```bash
cd ml
pip install -r requirements.txt
```

### 2. Obtain Model Weights

See `checkpoints/.gitkeep` for instructions on obtaining DogFaceNet weights.

Quick option for testing (without weights):
```python
from services.dogfacenet import DogFaceNetEmbedder
embedder = DogFaceNetEmbedder.load(weights_path=None)  # Untrained model
```

### 3. Test the Installation

```bash
# Run comprehensive test suite
cd services/dogfacenet
python test_embedder.py

# Quick test
cd ../..
python embed.py
```

### 4. Use in Your Code

```python
from ml.embed import embed_dog_face
import numpy as np

# Generate embedding
embedding = embed_dog_face('path/to/dog_face.jpg')

# Compare two dogs
emb1 = embed_dog_face('dog1.jpg')
emb2 = embed_dog_face('dog2.jpg')
similarity = np.dot(emb1, emb2)  # Cosine similarity

print(f"Similarity: {similarity:.4f}")
```

### 5. Run the API Service (Optional)

```bash
# Start FastAPI service
uvicorn embed_service:app --reload

# API docs at: http://localhost:8000/docs
```

Test the API:
```bash
# Health check
curl http://localhost:8000/health

# Generate embedding
curl -X POST http://localhost:8000/embed \
  -F "file=@dog_face.jpg"
```

## Integration with Backend

### Initialize at Startup

In your main backend application (FastAPI, Flask, etc.):

```python
from ml.embed import get_embedder

# Global embedder instance
embedder = get_embedder('ml/checkpoints/dogfacenet_weights.h5')
```

### Create Endpoint for Image Upload

```python
from fastapi import FastAPI, UploadFile
from ml.embed import embed_dog_face
from PIL import Image

app = FastAPI()

@app.post("/api/dogs/upload")
async def upload_dog_image(file: UploadFile):
    # Load image
    image = Image.open(file.file)
    
    # Generate embedding
    embedding = embed_dog_face(image)
    
    # Store in database (see below)
    dog_id = store_dog_embedding(embedding, image)
    
    # Find matches (see below)
    matches = find_similar_dogs(embedding, top_k=5)
    
    return {
        "dog_id": dog_id,
        "embedding": embedding.tolist(),
        "potential_matches": matches
    }
```

### Store Embeddings in Database

```python
import psycopg2
from pgvector.psycopg2 import register_vector

def store_dog_embedding(dog_id, embedding):
    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO dog_embeddings 
        (dog_id, embedding_vector, model_version, created_at)
        VALUES (%s, %s, %s, NOW())
    """, (dog_id, embedding, embedder.MODEL_VERSION))
    
    conn.commit()
```

### Search with FAISS

```python
import faiss
import numpy as np

# Build index from database embeddings
def build_faiss_index(embeddings_array):
    """
    embeddings_array: numpy array of shape (N, 32)
    """
    dimension = 32
    index = faiss.IndexFlatIP(dimension)  # Inner Product (cosine similarity)
    index.add(embeddings_array.astype('float32'))
    return index

# Search for similar dogs
def find_similar_dogs(query_embedding, index, dog_ids, top_k=5):
    query = np.expand_dims(query_embedding, 0).astype('float32')
    distances, indices = index.search(query, top_k)
    
    matches = []
    for idx, dist in zip(indices[0], distances[0]):
        matches.append({
            'dog_id': dog_ids[idx],
            'similarity': float(dist)
        })
    
    return matches
```

## Model Information

### DogFaceNet

- **Paper**: "A Deep Learning Approach for Dog Face Verification and Recognition" (PRICAI 2019)
- **Architecture**: Modified ResNet without bottleneck layers
- **Input**: 224×224×3 RGB images (pre-cropped dog faces)
- **Output**: 32-dimensional L2-normalized embedding vectors
- **Training**: Triplet loss with hard negative mining
- **Dataset**: ~8600 dog face images

### Performance

- **Accuracy**: ~86-92% on face verification (depends on dataset size)
- **Inference Time**: 50-100ms per image (CPU), 10-20ms (GPU)
- **Model Size**: ~5-10 MB
- **Memory**: ~500 MB (loaded model)

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Stray Hub ML Pipeline                     │
└─────────────────────────────────────────────────────────────────┘

1. User uploads dog image
   ↓
2. [Face Detection] - Crop dog face from image (TODO)
   ↓
3. [Face Alignment] - Align based on landmarks (TODO)
   ↓
4. [Preprocessing] - Resize to 224×224, normalize
   ↓
5. [DogFaceNet] - Generate 32D embedding (✓ IMPLEMENTED)
   ↓
6. [L2 Normalize] - Ensure unit norm (✓ IMPLEMENTED)
   ↓
7. [FAISS Search] - Find top-K similar embeddings (TODO)
   ↓
8. [Human Review] - Confirm if match or new dog
   ↓
9. [Database Update] - Store/update dog records
```

## What's Implemented

✅ **DogFaceNet Model Architecture**
- Clean inference-only implementation
- L2-normalized embeddings
- Batch processing support

✅ **Preprocessing**
- Image loading (path, PIL, numpy)
- Auto-resizing to 224×224
- Normalization to [0, 1]
- Multiple format support

✅ **High-Level API**
- Simple `embed_dog_face()` function
- Batch embedding generation
- Similarity/distance computation

✅ **FastAPI Service**
- REST API for embedding generation
- Health checks and model info
- Swagger docs at `/docs`

✅ **Testing**
- Comprehensive test suite
- Validation of normalization
- Stability checks

## What's NOT Implemented (Future Work)

❌ **Face Detection** - Automatic dog face detection in images
❌ **Face Alignment** - Landmark-based face alignment
❌ **FAISS Integration** - Vector similarity search
❌ **Database Integration** - Persistent storage of embeddings
❌ **Endpoints** - Full backend API for dog matching
❌ **Confirmation Flow** - Human-in-the-loop verification

See the main project requirements for the full system design.

## Testing

### Unit Tests

```bash
cd services/dogfacenet
python test_embedder.py
```

This runs 7 comprehensive tests:
1. Model loading
2. Embedding generation
3. L2 normalization
4. Embedding stability
5. Similarity computation
6. Batch processing
7. Input format flexibility

### Manual Testing

```python
# Test basic functionality
from ml.embed import embed_dog_face, compute_similarity
import numpy as np

# Create random test images
img1 = np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8)
img2 = np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8)

# Generate embeddings
emb1 = embed_dog_face(img1)
emb2 = embed_dog_face(img2)

# Verify normalization
print(f"Norm 1: {np.linalg.norm(emb1):.6f}")  # Should be ~1.0
print(f"Norm 2: {np.linalg.norm(emb2):.6f}")  # Should be ~1.0

# Compute similarity
sim = compute_similarity(emb1, emb2)
print(f"Similarity: {sim:.4f}")
```

### API Testing

```bash
# Start service
uvicorn embed_service:app --reload

# In another terminal:
# Health check
curl http://localhost:8000/health

# Model info
curl http://localhost:8000/info

# Generate embedding
curl -X POST http://localhost:8000/embed \
  -F "file=@test_dog.jpg" \
  | jq '.embedding'
```

## Troubleshooting

### TensorFlow Issues

```
ImportError: cannot import name 'tf' from 'tensorflow'
```

**Solution**: Ensure TensorFlow 2.x is installed:
```bash
pip install "tensorflow>=2.10.0,<2.16.0"
```

### Model Loading Fails

```
FileNotFoundError: Weights file not found
```

**Solution**: See `checkpoints/.gitkeep` for obtaining weights, or load without weights for testing:
```python
embedder = DogFaceNetEmbedder.load(weights_path=None)
```

### Slow Inference on M1/M2 Mac

**Solution**: Install TensorFlow with Metal acceleration:
```bash
pip install tensorflow-macos tensorflow-metal
```

### Memory Issues

**Solution**: Process images in smaller batches:
```python
embeddings = []
for batch in chunks(images, batch_size=16):
    batch_emb = embedder.embed_batch(batch)
    embeddings.append(batch_emb)
embeddings = np.vstack(embeddings)
```

## Dependencies

See `requirements.txt` for full list. Key dependencies:
- **tensorflow** >= 2.10.0: Deep learning framework
- **Pillow** >= 9.0.0: Image I/O
- **numpy** >= 1.21.0: Array operations
- **scikit-image** >= 0.19.0: Image preprocessing
- **fastapi** >= 0.95.0: API framework (optional)

## Model Versioning

The embedder tracks model versions to ensure database consistency:

```python
embedder.MODEL_VERSION  # "v1.0"
```

When storing embeddings, always save the model version:
```sql
INSERT INTO embeddings (dog_id, embedding, model_version)
VALUES (?, ?, ?)
```

This allows you to:
- Maintain multiple model versions in production
- Gradually migrate to new models
- Compare embeddings only from the same model version

## Performance Optimization

### For Production

1. **Use GPU**: Install `tensorflow-gpu` for CUDA-enabled GPUs
2. **Batch Processing**: Process multiple images at once
3. **Model Serving**: Use TensorFlow Serving or TorchServe
4. **Caching**: Cache embeddings in Redis/Memcached
5. **Load Balancing**: Run multiple service instances

### Batch Size Recommendations

- **CPU**: 1-4 images per batch
- **GPU**: 16-32 images per batch
- **Memory**: Each image ~1-2 MB in memory

## Documentation

- **DogFaceNet Module**: See `services/dogfacenet/README.md`
- **Original Paper**: [Springer Link](https://link.springer.com/chapter/10.1007/978-3-030-29894-4_34)
- **Original Repo**: [GitHub](https://github.com/GuillaumeMougeot/DogFaceNet)

## Citation

If you use DogFaceNet in publications, please cite:

```bibtex
@InProceedings{dogfacenet2019,
  author="Mougeot, Guillaume and Li, Dewei and Jia, Shuai",
  title="A Deep Learning Approach for Dog Face Verification and Recognition",
  booktitle="PRICAI 2019: Trends in Artificial Intelligence",
  year="2019",
  publisher="Springer International Publishing",
  pages="418--430"
}
```

## License

This implementation is licensed under the MIT License, consistent with the original DogFaceNet project.

## Support

For issues or questions:
- DogFaceNet-specific: See [original repository](https://github.com/GuillaumeMougeot/DogFaceNet)
- Stray Hub integration: Contact the development team
