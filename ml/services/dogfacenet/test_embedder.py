"""
Test script for DogFaceNet embedder.

This script validates that the model loads correctly and produces
stable, normalized embeddings.
"""

import os
import sys
import numpy as np
from PIL import Image

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from services.dogfacenet import DogFaceNetEmbedder


def create_test_image(size=(224, 224, 3), seed=42):
    """Create a synthetic test image."""
    np.random.seed(seed)
    # Create random RGB image
    image = np.random.randint(0, 256, size, dtype=np.uint8)
    return image


def test_model_loading():
    """Test 1: Model loads without weights."""
    print("\n" + "="*70)
    print("TEST 1: Model Loading (No Weights)")
    print("="*70)
    
    try:
        embedder = DogFaceNetEmbedder.load(weights_path=None)
        print("✓ Model loaded successfully without weights")
        print(f"✓ Model info:\n{embedder}")
        return embedder
    except Exception as e:
        print(f"✗ Failed to load model: {e}")
        return None


def test_embedding_generation(embedder):
    """Test 2: Generate embeddings from test images."""
    print("\n" + "="*70)
    print("TEST 2: Embedding Generation")
    print("="*70)
    
    try:
        # Create test image
        test_img = create_test_image(seed=42)
        print(f"✓ Created test image: shape {test_img.shape}, dtype {test_img.dtype}")
        
        # Generate embedding
        embedding = embedder.embed(test_img)
        print(f"✓ Generated embedding: shape {embedding.shape}, dtype {embedding.dtype}")
        print(f"  Embedding stats: min={embedding.min():.4f}, max={embedding.max():.4f}, "
              f"mean={embedding.mean():.4f}")
        
        return embedding
    except Exception as e:
        print(f"✗ Failed to generate embedding: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_normalization(embedder):
    """Test 3: Verify L2 normalization."""
    print("\n" + "="*70)
    print("TEST 3: L2 Normalization Verification")
    print("="*70)
    
    try:
        test_img = create_test_image(seed=123)
        embedding = embedder.embed(test_img)
        
        # Check L2 norm (should be 1.0 for normalized vectors)
        norm = np.linalg.norm(embedding)
        print(f"✓ L2 norm of embedding: {norm:.6f}")
        
        if abs(norm - 1.0) < 1e-5:
            print("✓ Embedding is properly L2-normalized")
            return True
        else:
            print(f"✗ WARNING: Embedding norm is {norm}, expected 1.0")
            return False
    except Exception as e:
        print(f"✗ Failed normalization test: {e}")
        return False


def test_stability(embedder):
    """Test 4: Verify embedding stability (same input -> same output)."""
    print("\n" + "="*70)
    print("TEST 4: Embedding Stability")
    print("="*70)
    
    try:
        test_img = create_test_image(seed=999)
        
        # Generate embedding twice
        embedding1 = embedder.embed(test_img)
        embedding2 = embedder.embed(test_img)
        
        # Compute difference
        diff = np.abs(embedding1 - embedding2)
        max_diff = diff.max()
        mean_diff = diff.mean()
        
        print(f"✓ Generated two embeddings from identical input")
        print(f"  Max difference: {max_diff:.10f}")
        print(f"  Mean difference: {mean_diff:.10f}")
        
        if max_diff < 1e-6:
            print("✓ Embeddings are identical (stable)")
            return True
        else:
            print(f"✗ WARNING: Embeddings differ by {max_diff}")
            return False
    except Exception as e:
        print(f"✗ Failed stability test: {e}")
        return False


def test_similarity_computation(embedder):
    """Test 5: Test similarity and distance computations."""
    print("\n" + "="*70)
    print("TEST 5: Similarity & Distance Computation")
    print("="*70)
    
    try:
        # Create two different test images
        img1 = create_test_image(seed=1)
        img2 = create_test_image(seed=2)
        img3 = create_test_image(seed=1)  # Same as img1
        
        emb1 = embedder.embed(img1)
        emb2 = embedder.embed(img2)
        emb3 = embedder.embed(img3)
        
        # Test similarity
        sim_same = embedder.compute_similarity(emb1, emb3)
        sim_diff = embedder.compute_similarity(emb1, emb2)
        print(f"✓ Similarity (same image): {sim_same:.6f}")
        print(f"✓ Similarity (different images): {sim_diff:.6f}")
        
        # Test distance
        dist_same = embedder.compute_distance(emb1, emb3)
        dist_diff = embedder.compute_distance(emb1, emb2)
        print(f"✓ Distance (same image): {dist_same:.6f}")
        print(f"✓ Distance (different images): {dist_diff:.6f}")
        
        # Sanity checks
        if sim_same > sim_diff and dist_same < dist_diff:
            print("✓ Similarity/distance metrics are consistent")
            return True
        else:
            print("✗ WARNING: Unexpected similarity/distance relationships")
            return False
            
    except Exception as e:
        print(f"✗ Failed similarity test: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_batch_processing(embedder):
    """Test 6: Batch embedding generation."""
    print("\n" + "="*70)
    print("TEST 6: Batch Processing")
    print("="*70)
    
    try:
        # Create batch of test images
        batch_size = 5
        images = [create_test_image(seed=i) for i in range(batch_size)]
        print(f"✓ Created batch of {batch_size} test images")
        
        # Process batch
        embeddings = embedder.embed_batch(images)
        print(f"✓ Generated batch embeddings: shape {embeddings.shape}")
        
        # Verify all are normalized
        norms = np.linalg.norm(embeddings, axis=1)
        print(f"  Norms: min={norms.min():.6f}, max={norms.max():.6f}, "
              f"mean={norms.mean():.6f}")
        
        if np.allclose(norms, 1.0, atol=1e-5):
            print("✓ All batch embeddings are properly normalized")
            return True
        else:
            print("✗ WARNING: Some batch embeddings are not normalized")
            return False
            
    except Exception as e:
        print(f"✗ Failed batch processing test: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_input_formats(embedder):
    """Test 7: Different input formats (array, PIL, path)."""
    print("\n" + "="*70)
    print("TEST 7: Input Format Flexibility")
    print("="*70)
    
    results = []
    
    # Test 1: NumPy array
    try:
        arr = create_test_image(seed=42)
        emb1 = embedder.embed(arr)
        print("✓ NumPy array input works")
        results.append(True)
    except Exception as e:
        print(f"✗ NumPy array input failed: {e}")
        results.append(False)
    
    # Test 2: PIL Image
    try:
        arr = create_test_image(seed=42)
        pil_img = Image.fromarray(arr)
        emb2 = embedder.embed(pil_img)
        print("✓ PIL Image input works")
        
        # Should produce identical embedding
        if np.allclose(emb1, emb2, atol=1e-5):
            print("  ✓ PIL and NumPy inputs produce identical embeddings")
        else:
            print("  ✗ WARNING: PIL and NumPy produce different embeddings")
        results.append(True)
    except Exception as e:
        print(f"✗ PIL Image input failed: {e}")
        results.append(False)
    
    # Test 3: Different sizes (should auto-resize)
    try:
        arr_small = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        emb_small = embedder.embed(arr_small)
        print("✓ Auto-resize works (100x100 -> 224x224)")
        results.append(True)
    except Exception as e:
        print(f"✗ Auto-resize failed: {e}")
        results.append(False)
    
    return all(results)


def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "#"*70)
    print("# DogFaceNet Embedder Test Suite")
    print("#"*70)
    
    results = {}
    
    # Test 1: Load model
    embedder = test_model_loading()
    results['loading'] = embedder is not None
    
    if not embedder:
        print("\n✗ FATAL: Cannot continue without loaded model")
        return
    
    # Test 2-7: Functional tests
    results['generation'] = test_embedding_generation(embedder) is not None
    results['normalization'] = test_normalization(embedder)
    results['stability'] = test_stability(embedder)
    results['similarity'] = test_similarity_computation(embedder)
    results['batch'] = test_batch_processing(embedder)
    results['formats'] = test_input_formats(embedder)
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✓ PASS" if passed_flag else "✗ FAIL"
        print(f"{status:8s} {test_name.capitalize()}")
    
    print("-"*70)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! DogFaceNet embedder is working correctly.")
        print("\nNext steps:")
        print("1. Download or train a DogFaceNet model checkpoint (.h5 file)")
        print("2. Place it in ml/checkpoints/dogfacenet_weights.h5")
        print("3. Load with: embedder = DogFaceNetEmbedder.load('ml/checkpoints/dogfacenet_weights.h5')")
        print("4. Integrate into your backend API")
    else:
        print(f"\n⚠ {total - passed} test(s) failed. Please review the errors above.")
    
    return passed == total


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
