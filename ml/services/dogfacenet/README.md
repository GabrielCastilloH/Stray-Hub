# DogFaceNet Inference Module

A clean, production-ready implementation of **DogFaceNet** for dog face embedding extraction. This module has been migrated from the original [DogFaceNet repository](https://github.com/GuillaumeMougeot/DogFaceNet) and optimized for inference in the Stray Hub system.

## Overview

DogFaceNet is a deep learning model for dog face re-identification based on triplet loss. It generates 32-dimensional embedding vectors that can be used for:
- **Face Matching**: Finding if a newly uploaded dog matches an existing dog in the database
- **Face Clustering**: Grouping images of the same dog
- **Face Verification**: Determining if two images show the same dog

## Architecture

- **Input**: 224×224×3 RGB images (pre-cropped dog faces)
- **Architecture**: Modified ResNet without bottleneck layers
- **Output**: 32-dimensional L2-normalized embedding vectors
- **Framework**: TensorFlow 2.x / Keras

## Installation

### Dependencies

Install required packages:

```bash
cd ml
pip install -r requirements.txt
```

### Model Weights

**Important**: This module contains only the model architecture. To use it, you need trained weights.

#### Option 1: Download Pre-trained Weights (Recommended)

The original DogFaceNet authors may provide pre-trained weights. Check:
- [DogFaceNet Releases](https://github.com/GuillaumeMougeot/DogFaceNet/releases)
- [DogFaceNet Dataset on Zenodo](https://zenodo.org/records/12578449)

Download the `.h5` checkpoint file and place it in:
```
ml/checkpoints/dogfacenet_weights.h5
```

#### Option 2: Train Your Own Model

Use the original DogFaceNet training scripts in `DogFaceNet-master/` directory:

```bash
cd DogFaceNet-master
# Follow original training instructions
python dogfacenet/dogfacenet.py
```

After training, copy the checkpoint:
```bash
cp DogFaceNet-master/output/model/*.h5 ml/checkpoints/dogfacenet_weights.h5
```

## Usage

### Basic Usage

```python
from services.dogfacenet import DogFaceNetEmbedder
from PIL import Image

# Load model once at startup
embedder = DogFaceNetEmbedder.load('ml/checkpoints/dogfacenet_weights.h5')

# Generate embedding for a dog face image
image = Image.open('dog_face.jpg')
embedding = embedder.embed(image)  # Returns (32,) normalized vector

print(f"Embedding shape: {embedding.shape}")
print(f"Embedding norm: {np.linalg.norm(embedding):.6f}")  # Should be ~1.0
```

### Batch Processing

```python
# Process multiple images efficiently
images = ['dog1.jpg', 'dog2.jpg', 'dog3.jpg']
embeddings = embedder.embed_batch(images)  # Returns (3, 32) array
```

### Computing Similarity

```python
# Compare two dog faces
emb1 = embedder.embed('dog_image1.jpg')
emb2 = embedder.embed('dog_image2.jpg')

# Cosine similarity (higher = more similar)
similarity = embedder.compute_similarity(emb1, emb2)
print(f"Similarity: {similarity:.4f}")  # Range: [-1, 1]

# Euclidean distance (lower = more similar)
distance = embedder.compute_distance(emb1, emb2)
print(f"Distance: {distance:.4f}")
```

### Input Formats

The embedder accepts multiple input formats:

```python
# 1. File path
emb = embedder.embed('dog.jpg')

# 2. PIL Image
from PIL import Image
img = Image.open('dog.jpg')
emb = embedder.embed(img)

# 3. NumPy array
import numpy as np
arr = np.array(img)
emb = embedder.embed(arr)

# 4. Different sizes (auto-resizes to 224×224)
small_img = np.random.rand(100, 100, 3)  # Will be resized
emb = embedder.embed(small_img)
```

## Testing

Run the comprehensive test suite:

```bash
cd ml/services/dogfacenet
python test_embedder.py
```

This validates:
- ✓ Model loading
- ✓ Embedding generation
- ✓ L2 normalization
- ✓ Embedding stability
- ✓ Similarity/distance computation
- ✓ Batch processing
- ✓ Input format flexibility

## Integration with Stray Hub Backend

### 1. Initialize at Startup

```python
# In your FastAPI/Flask app initialization
from services.dogfacenet import DogFaceNetEmbedder

# Global embedder instance
embedder = DogFaceNetEmbedder.load('ml/checkpoints/dogfacenet_weights.h5')
```

### 2. Create Embedding Endpoint

```python
from fastapi import FastAPI, UploadFile
import numpy as np

app = FastAPI()

@app.post("/api/embed")
async def embed_image(file: UploadFile):
    # Read uploaded image
    image = Image.open(file.file)
    
    # Generate embedding
    embedding = embedder.embed(image)
    
    return {
        "embedding": embedding.tolist(),
        "model_version": embedder.MODEL_VERSION,
        "embedding_size": len(embedding)
    }
```

### 3. Store in Database

```python
# PostgreSQL with pgvector extension
import psycopg2

def store_embedding(dog_id, sighting_id, image_url, embedding):
    conn = psycopg2.connect(...)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO embeddings 
        (dog_id, sighting_id, image_url, embedding_vector, model_version)
        VALUES (%s, %s, %s, %s, %s)
    """, (
        dog_id,
        sighting_id, 
        image_url,
        embedding.tolist(),  # Store as array
        embedder.MODEL_VERSION
    ))
    
    conn.commit()
```

### 4. Search with FAISS

```python
import faiss

# Build FAISS index from database embeddings
def build_index(embeddings_array):
    """
    embeddings_array: numpy array of shape (N, 32)
    """
    dimension = 32
    index = faiss.IndexFlatIP(dimension)  # Inner product (cosine sim for normalized vectors)
    index.add(embeddings_array)
    return index

# Search for similar dogs
def find_matches(query_embedding, index, top_k=5):
    """
    Returns top_k most similar embeddings
    """
    query = np.expand_dims(query_embedding, 0)
    distances, indices = index.search(query, top_k)
    return indices[0], distances[0]
```

## File Structure

```
ml/services/dogfacenet/
├── __init__.py           # Package exports
├── embedder.py           # High-level DogFaceNetEmbedder class
├── model.py              # Model architecture definition
├── preprocessing.py      # Image preprocessing utilities
├── test_embedder.py      # Comprehensive test suite
└── README.md             # This file
```

## Migrated Files

This module was extracted from the following DogFaceNet source files:

| Original File | Purpose | Migrated To |
|---------------|---------|-------------|
| `dogfacenet/dogfacenet.py` (lines 125-169) | Model architecture | `model.py` |
| `dogfacenet/dogfacenet.py` (lines 92-111) | Loss functions | `model.py` |
| `dogfacenet/online_training.py` (lines 222-230) | Image loading | `preprocessing.py` |
| N/A | High-level wrapper | `embedder.py` |

## Key Features

✅ **Clean inference-only code** (no training dependencies)  
✅ **Modular design** (easy to swap models later)  
✅ **L2-normalized embeddings** (ready for cosine similarity)  
✅ **Batch processing support** (efficient)  
✅ **Multiple input formats** (PIL, NumPy, file paths)  
✅ **Auto-resizing** (handles any input size)  
✅ **Model versioning** (track which model generated embeddings)  
✅ **Comprehensive tests** (validate everything works)

## Model Versioning

The embedder tracks model versions to ensure database consistency:

```python
embedder.MODEL_VERSION  # e.g., "v1.0"
```

Store this version alongside embeddings in your database. If you retrain or update the model, increment the version and you can maintain multiple embedding versions.

## Performance Notes

- **Model size**: ~5-10 MB
- **Inference time**: ~50-100ms per image on CPU, ~10-20ms on GPU
- **Memory**: ~500 MB (loaded model)
- **Batch size**: Recommended 16-32 for GPU, 1-4 for CPU

## Troubleshooting

### Model loading fails

```python
FileNotFoundError: Weights file not found
```

**Solution**: Download or train model weights and place in `ml/checkpoints/`

### Embeddings are not normalized

```python
# Check normalization
norm = np.linalg.norm(embedding)
print(norm)  # Should be ~1.0
```

**Solution**: The model includes L2 normalization. If this fails, update TensorFlow or check model definition.

### Different results on same image

**Solution**: Ensure you're using the same preprocessing. Run `test_embedder.py` to verify stability.

## Citation

If you use DogFaceNet in your work, please cite the original paper:

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

For issues specific to this migration, contact the Stray Hub team.  
For questions about the original DogFaceNet model, see the [original repository](https://github.com/GuillaumeMougeot/DogFaceNet).
