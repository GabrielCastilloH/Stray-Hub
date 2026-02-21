# DogFaceNet Installation & Setup Guide

Quick guide to get DogFaceNet embedder running in your Stray Hub backend.

## Prerequisites

- Python 3.8+ (3.9 or 3.10 recommended)
- pip package manager
- Virtual environment (recommended)

## Step-by-Step Installation

### 1. Create Virtual Environment (Recommended)

```bash
# Navigate to project root
cd /path/to/Stray-Hub

# Create virtual environment
python3 -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

### 2. Install Dependencies

```bash
# Navigate to ml directory
cd ml

# Install all required packages
pip install -r requirements.txt

# This will install:
# - tensorflow>=2.10.0
# - Pillow>=9.0.0
# - numpy>=1.21.0
# - scikit-image>=0.19.0
# - fastapi>=0.95.0
# - uvicorn>=0.20.0
# - and more...
```

**Expected install time**: 2-5 minutes

**For Apple Silicon (M1/M2) Mac**:
```bash
# For better performance with GPU acceleration
pip install tensorflow-macos tensorflow-metal
```

### 3. Verify Installation

```bash
# Test imports
python3 -c "from ml.services.dogfacenet import DogFaceNetEmbedder; print('✓ Import successful')"

# Quick functionality test
cd ml
python embed.py
```

You should see:
```
Loading DogFaceNet embedder...
⚠ Warning: Weights not found at ml/checkpoints/dogfacenet_weights.h5
  Loading model without weights (for testing only)
✓ Embedder ready
✓ Model ready: input (224, 224, 3), output 32D
✓ Model version: v1.0

Testing DogFaceNet embedder...
...
✓ Embedder is working correctly!
```

### 4. Run Comprehensive Tests

```bash
cd services/dogfacenet
python test_embedder.py
```

Expected output:
```
######################################################################
# DogFaceNet Embedder Test Suite
######################################################################

TEST 1: Model Loading (No Weights)
✓ Model loaded successfully

... (6 more tests) ...

TEST SUMMARY
✓ PASS   Loading
✓ PASS   Generation
✓ PASS   Normalization
✓ PASS   Stability
✓ PASS   Similarity
✓ PASS   Batch
✓ PASS   Formats
----------------------------------------------------------------------
Results: 7/7 tests passed

🎉 All tests passed! DogFaceNet embedder is working correctly.
```

### 5. Obtain Model Weights (Required for Production)

The model architecture is ready, but you need trained weights for production use.

**Option A: Download Pre-trained Weights (Recommended)**

1. Check the DogFaceNet releases page:
   - https://github.com/GuillaumeMougeot/DogFaceNet/releases
   - Or dataset page: https://zenodo.org/records/12578449

2. Download the `.h5` checkpoint file

3. Place it in the checkpoints directory:
   ```bash
   mkdir -p ml/checkpoints
   cp /path/to/downloaded/weights.h5 ml/checkpoints/dogfacenet_weights.h5
   ```

**Option B: Train Your Own Model**

```bash
# Navigate to the vendored DogFaceNet directory
cd DogFaceNet-master

# Download the training dataset
# Follow instructions at: https://zenodo.org/records/12578449

# Run training (requires dataset)
python dogfacenet/dogfacenet.py

# After training, copy the checkpoint
cp output/model/*.h5 ../ml/checkpoints/dogfacenet_weights.h5
```

### 6. Load Model with Weights

```python
from ml.embed import get_embedder

# Load with weights
embedder = get_embedder('ml/checkpoints/dogfacenet_weights.h5')

# Generate embeddings
embedding = embedder.embed('path/to/dog_face.jpg')
print(embedding.shape)  # (32,)
```

### 7. (Optional) Start API Service

```bash
cd ml
uvicorn embed_service:app --reload --port 8000

# Visit: http://localhost:8000/docs
```

## Troubleshooting

### Issue: pip install fails with TensorFlow

```
ERROR: Could not find a version that satisfies the requirement tensorflow
```

**Solutions**:

1. **Upgrade pip**:
   ```bash
   pip install --upgrade pip
   ```

2. **Check Python version** (needs 3.8-3.11):
   ```bash
   python --version
   ```

3. **Install specific TensorFlow version**:
   ```bash
   pip install tensorflow==2.10.0
   ```

4. **For M1/M2 Mac**:
   ```bash
   pip install tensorflow-macos
   ```

### Issue: ImportError after install

```python
ImportError: cannot import name 'DogFaceNetEmbedder'
```

**Solution**: Make sure you're in the project root:
```bash
cd /path/to/Stray-Hub
python -c "from ml.services.dogfacenet import DogFaceNetEmbedder"
```

### Issue: Out of memory during inference

**Solution**: Reduce batch size or use CPU-only mode:
```bash
export CUDA_VISIBLE_DEVICES=""  # Disable GPU
```

### Issue: Tests fail

**Solution**: Check TensorFlow is installed correctly:
```python
import tensorflow as tf
print(tf.__version__)  # Should be >= 2.10.0
```

## Quick Start Examples

### Basic Usage

```python
from ml.embed import embed_dog_face

# Generate embedding
embedding = embed_dog_face('dog_face.jpg')
print(f"Shape: {embedding.shape}")  # (32,)
print(f"Norm: {np.linalg.norm(embedding):.4f}")  # ~1.0
```

### Compare Two Dogs

```python
from ml.embed import embed_dog_face, compute_similarity
import numpy as np

emb1 = embed_dog_face('dog1.jpg')
emb2 = embed_dog_face('dog2.jpg')

# Cosine similarity (higher = more similar)
similarity = compute_similarity(emb1, emb2)
print(f"Similarity: {similarity:.4f}")

# They're a match if similarity > 0.7 (tune this threshold)
if similarity > 0.7:
    print("Same dog!")
else:
    print("Different dogs")
```

### Batch Processing

```python
from ml.embed import embed_batch

# Process multiple images at once (more efficient)
images = ['dog1.jpg', 'dog2.jpg', 'dog3.jpg']
embeddings = embed_batch(images)

print(f"Shape: {embeddings.shape}")  # (3, 32)
```

## What's Installed

After running `pip install -r requirements.txt`, you'll have:

### Core ML
- **tensorflow** - Deep learning framework
- **numpy** - Array operations
- **Pillow** - Image I/O
- **scikit-image** - Image preprocessing

### API Service (Optional)
- **fastapi** - Modern web framework
- **uvicorn** - ASGI server
- **python-multipart** - File upload support
- **pydantic** - Data validation

### Development
- **pytest** - Testing framework
- **black** - Code formatter
- **flake8** - Linter
- **mypy** - Type checker

### Total Size
- ~500 MB - 1 GB (depending on TensorFlow variant)

## Performance Notes

### Expected Performance

| Hardware | Single Image | Batch (32) |
|----------|--------------|------------|
| CPU (Intel i7) | 80-100ms | 2-3s |
| GPU (NVIDIA T4) | 15-20ms | 400-500ms |
| M1 Mac | 40-60ms | 1-1.5s |
| M1 Mac (with Metal) | 20-30ms | 600-800ms |

### Optimization Tips

1. **Use batch processing** when possible
2. **Enable GPU** for faster inference
3. **Load model once** at startup (don't reload per request)
4. **Pre-resize images** to 224×224 before upload
5. **Cache embeddings** (don't recompute for same image)

## Next Steps

After installation:

1. ✅ Verify imports work
2. ✅ Run test suite
3. ✅ Try basic inference
4. 📥 Obtain model weights
5. 🔌 Integrate with backend
6. 🗄️ Set up database
7. 🔍 Implement FAISS search

See main documentation for integration guides:
- `ml/README.md` - ML services overview
- `ml/services/dogfacenet/README.md` - DogFaceNet details
- `DOGFACENET_MIGRATION.md` - Quick start guide

## Support

If you encounter issues:

1. **Check documentation**: See README files in `ml/` directory
2. **Verify Python version**: Should be 3.8-3.11
3. **Check TensorFlow**: `pip show tensorflow`
4. **Update dependencies**: `pip install --upgrade -r requirements.txt`
5. **Try clean install**: Delete `venv/`, recreate, reinstall

## Success Checklist

- [ ] Python 3.8+ installed
- [ ] Virtual environment created and activated
- [ ] All dependencies installed from requirements.txt
- [ ] Import test passes
- [ ] Test suite passes (7/7 tests)
- [ ] Basic inference works
- [ ] (Optional) Model weights obtained
- [ ] (Optional) API service runs

Once all checkboxes are complete, you're ready to integrate DogFaceNet into your backend!

---

**Need help?** Check the detailed documentation in `ml/README.md`
