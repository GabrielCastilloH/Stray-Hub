"""
DogFaceNet Preprocessing Utilities

Image preprocessing functions for DogFaceNet inference.
Handles image loading, resizing, and normalization.
"""

import numpy as np
from PIL import Image
from typing import Union


def preprocess_image(image: Union[str, Image.Image, np.ndarray], 
                     target_size=(224, 224)) -> np.ndarray:
    """
    Preprocess an image for DogFaceNet inference.
    
    This function:
    1. Loads the image if it's a file path
    2. Converts to RGB if necessary
    3. Resizes to target size (224x224)
    4. Normalizes pixel values to [0, 1]
    5. Adds batch dimension if needed
    
    Args:
        image: Input image. Can be:
            - str: Path to image file
            - PIL.Image: PIL Image object
            - np.ndarray: NumPy array (H, W, C) or (H, W)
        target_size: Target size as (height, width). Default (224, 224)
        
    Returns:
        np.ndarray: Preprocessed image with shape (1, 224, 224, 3) and values in [0, 1]
        
    Raises:
        ValueError: If image format is not supported
    """
    # Load image from path
    if isinstance(image, str):
        image = Image.open(image)
    
    # Convert PIL Image to numpy array
    if isinstance(image, Image.Image):
        # Ensure RGB mode
        if image.mode != 'RGB':
            image = image.convert('RGB')
        image = np.array(image)
    
    # Validate numpy array
    if not isinstance(image, np.ndarray):
        raise ValueError(
            f"Unsupported image type: {type(image)}. "
            "Expected str (path), PIL.Image, or np.ndarray"
        )
    
    # Handle grayscale images (H, W) -> (H, W, 3)
    if image.ndim == 2:
        image = np.stack([image] * 3, axis=-1)
    
    # Ensure 3 channels
    if image.ndim != 3 or image.shape[2] not in [3, 4]:
        raise ValueError(
            f"Expected image with shape (H, W, 3) or (H, W, 4), got {image.shape}"
        )
    
    # Convert RGBA to RGB if necessary
    if image.shape[2] == 4:
        # Simple alpha blending with white background
        alpha = image[:, :, 3:4] / 255.0
        rgb = image[:, :, :3]
        image = (rgb * alpha + 255 * (1 - alpha)).astype(np.uint8)
    
    # Resize if needed
    if image.shape[:2] != target_size:
        pil_img = Image.fromarray(image)
        pil_img = pil_img.resize((target_size[1], target_size[0]), Image.BILINEAR)
        image = np.array(pil_img)
    
    # Normalize to [0, 1]
    if image.dtype == np.uint8:
        image = image.astype(np.float32) / 255.0
    elif image.max() > 1.0:
        # Assume it's in [0, 255] range
        image = image.astype(np.float32) / 255.0
    else:
        image = image.astype(np.float32)
    
    # Add batch dimension if not present
    if image.ndim == 3:
        image = np.expand_dims(image, axis=0)
    
    return image


def preprocess_batch(images: list, target_size=(224, 224)) -> np.ndarray:
    """
    Preprocess a batch of images for DogFaceNet inference.
    
    Args:
        images: List of images (paths, PIL Images, or numpy arrays)
        target_size: Target size as (height, width). Default (224, 224)
        
    Returns:
        np.ndarray: Batch of preprocessed images with shape (N, 224, 224, 3)
    """
    processed = []
    
    for img in images:
        processed_img = preprocess_image(img, target_size)
        # Remove batch dimension added by preprocess_image
        processed.append(processed_img[0])
    
    return np.array(processed)


def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
    """
    L2-normalize an embedding vector or batch of embeddings.
    
    This function ensures embeddings are unit vectors, which is critical
    for cosine similarity comparisons in the matching system.
    
    Args:
        embedding: Embedding vector(s) with shape (emb_size,) or (batch, emb_size)
        
    Returns:
        np.ndarray: L2-normalized embedding(s) with same shape as input
    """
    # Handle single vector
    if embedding.ndim == 1:
        norm = np.linalg.norm(embedding)
        if norm > 0:
            return embedding / norm
        return embedding
    
    # Handle batch of vectors
    norms = np.linalg.norm(embedding, axis=-1, keepdims=True)
    # Avoid division by zero
    norms = np.where(norms > 0, norms, 1.0)
    return embedding / norms
