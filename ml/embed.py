"""
Stray Hub - Dog Face Embedding Service

Main entry point for dog face embedding extraction.
This module provides a simple interface to the DogFaceNet embedder.

Usage:
    from ml.embed import get_embedder, embed_dog_face
    
    # Load embedder once at startup
    embedder = get_embedder()
    
    # Generate embeddings
    embedding = embed_dog_face('path/to/dog_face.jpg')
"""

import os
from typing import Union, Optional
import numpy as np
from PIL import Image

from services.dogfacenet import DogFaceNetEmbedder


# Global embedder instance (loaded once)
_embedder: Optional[DogFaceNetEmbedder] = None


def get_embedder(weights_path: Optional[str] = None, force_reload: bool = False) -> DogFaceNetEmbedder:
    """
    Get the global DogFaceNet embedder instance.
    
    This function loads the model once and caches it. Subsequent calls
    return the cached instance for efficiency.
    
    Args:
        weights_path: Path to model weights. If None, uses default location.
                     Default: 'ml/checkpoints/dogfacenet_weights.h5'
        force_reload: If True, reload model even if already loaded
        
    Returns:
        DogFaceNetEmbedder: Ready-to-use embedder instance
        
    Example:
        embedder = get_embedder('path/to/weights.h5')
        embedding = embedder.embed('dog.jpg')
    """
    global _embedder
    
    # Return cached embedder if available
    if _embedder is not None and not force_reload:
        return _embedder
    
    # Determine weights path
    if weights_path is None:
        # Default location
        current_dir = os.path.dirname(os.path.abspath(__file__))
        weights_path = os.path.join(current_dir, 'checkpoints', 'dogfacenet_weights.h5')
        
        # Check if weights exist
        if not os.path.exists(weights_path):
            print(f"⚠ Warning: Weights not found at {weights_path}")
            print("  Loading model without weights (for testing only)")
            weights_path = None
    
    # Load embedder
    print(f"Loading DogFaceNet embedder...")
    _embedder = DogFaceNetEmbedder.load(weights_path=weights_path)
    print(f"✓ Embedder ready")
    
    return _embedder


def embed_dog_face(image: Union[str, Image.Image, np.ndarray]) -> np.ndarray:
    """
    Generate an L2-normalized embedding for a dog face image.
    
    This is a convenience function that uses the global embedder instance.
    
    Args:
        image: Input dog face image (path, PIL Image, or numpy array)
        
    Returns:
        np.ndarray: L2-normalized embedding vector of shape (32,)
        
    Example:
        emb1 = embed_dog_face('dog1.jpg')
        emb2 = embed_dog_face('dog2.jpg')
        similarity = np.dot(emb1, emb2)
    """
    embedder = get_embedder()
    return embedder.embed(image)


def embed_batch(images: list) -> np.ndarray:
    """
    Generate embeddings for a batch of dog face images.
    
    Args:
        images: List of images (paths, PIL Images, or numpy arrays)
        
    Returns:
        np.ndarray: Array of L2-normalized embeddings with shape (N, 32)
        
    Example:
        embeddings = embed_batch(['dog1.jpg', 'dog2.jpg', 'dog3.jpg'])
    """
    embedder = get_embedder()
    return embedder.embed_batch(images)


def compute_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Compute cosine similarity between two embeddings.
    
    Args:
        embedding1: First embedding (32,)
        embedding2: Second embedding (32,)
        
    Returns:
        float: Similarity score in [-1, 1] (higher = more similar)
    """
    embedder = get_embedder()
    return embedder.compute_similarity(embedding1, embedding2)


def compute_distance(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Compute Euclidean distance between two embeddings.
    
    Args:
        embedding1: First embedding (32,)
        embedding2: Second embedding (32,)
        
    Returns:
        float: Distance (lower = more similar)
    """
    embedder = get_embedder()
    return embedder.compute_distance(embedding1, embedding2)


if __name__ == '__main__':
    # Quick test
    print("Testing DogFaceNet embedder...")
    
    # Load embedder
    embedder = get_embedder()
    print(embedder)
    
    # Create test image
    print("\nGenerating test embedding...")
    test_img = np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8)
    embedding = embed_dog_face(test_img)
    
    print(f"✓ Embedding shape: {embedding.shape}")
    print(f"✓ Embedding norm: {np.linalg.norm(embedding):.6f}")
    print(f"✓ Embedding range: [{embedding.min():.4f}, {embedding.max():.4f}]")
    
    print("\n✓ Embedder is working correctly!")
