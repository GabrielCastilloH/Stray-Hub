"""
DogFaceNet Embedder

High-level wrapper for DogFaceNet inference.
Provides a simple interface for loading the model and generating embeddings.
"""

import os
import numpy as np
from typing import Union, Optional
from PIL import Image
import tensorflow as tf

from .model import build_dogfacenet_model, triplet_loss, triplet_accuracy
from .preprocessing import preprocess_image, preprocess_batch, normalize_embedding


class DogFaceNetEmbedder:
    """
    High-level interface for DogFaceNet embedding generation.
    
    This class handles model loading, weight management, and embedding extraction.
    It's designed to be loaded once at application startup and reused for all
    inference requests.
    
    Example usage:
        # Load model once at startup
        embedder = DogFaceNetEmbedder.load('path/to/weights.h5')
        
        # Generate embeddings for uploaded images
        from PIL import Image
        image = Image.open('dog_face.jpg')
        embedding = embedder.embed(image)
        
        # embeddings are already L2-normalized and ready for similarity search
        similarity = np.dot(embedding1, embedding2)
    """
    
    MODEL_VERSION = "v1.0"  # Track model version for database compatibility
    EMBEDDING_SIZE = 32
    INPUT_SHAPE = (224, 224, 3)
    
    def __init__(self, model: tf.keras.Model, weights_path: Optional[str] = None):
        """
        Initialize embedder with a loaded model.
        
        Use DogFaceNetEmbedder.load() instead of calling this directly.
        
        Args:
            model: Loaded TensorFlow/Keras model
            weights_path: Path to the weights file (for tracking)
        """
        self.model = model
        self.weights_path = weights_path
        self._validate_model()
    
    @classmethod
    def load(cls, 
             weights_path: Optional[str] = None, 
             compile_model: bool = False) -> 'DogFaceNetEmbedder':
        """
        Load DogFaceNet model from weights file or create a new untrained model.
        
        Args:
            weights_path: Path to .h5 weights file. If None, creates untrained model.
            compile_model: Whether to compile the model (not needed for inference)
            
        Returns:
            DogFaceNetEmbedder: Ready-to-use embedder instance
            
        Raises:
            FileNotFoundError: If weights_path is provided but file doesn't exist
            ValueError: If model loading fails
        """
        # Build model architecture
        model = build_dogfacenet_model(
            input_shape=cls.INPUT_SHAPE,
            emb_size=cls.EMBEDDING_SIZE
        )
        
        # Load weights if provided
        if weights_path is not None:
            if not os.path.exists(weights_path):
                raise FileNotFoundError(
                    f"Weights file not found: {weights_path}\n\n"
                    f"To use DogFaceNet, you need to:\n"
                    f"1. Download pretrained weights from the DogFaceNet repository\n"
                    f"2. Or train the model using the original training scripts\n"
                    f"3. Place the .h5 file in your ml/checkpoints/ directory\n"
                    f"4. Update the weights_path parameter"
                )
            
            try:
                # Try loading as full model first (includes architecture + weights)
                model = tf.keras.models.load_model(
                    weights_path,
                    custom_objects={
                        'triplet': triplet_loss,
                        'triplet_acc': triplet_accuracy
                    }
                )
                print(f"✓ Loaded full model from: {weights_path}")
                
            except Exception as e:
                # Fall back to loading just weights
                try:
                    model.load_weights(weights_path)
                    print(f"✓ Loaded model weights from: {weights_path}")
                except Exception as e2:
                    raise ValueError(
                        f"Failed to load model from {weights_path}\n"
                        f"Error loading full model: {e}\n"
                        f"Error loading weights: {e2}"
                    )
        else:
            print("⚠ Warning: No weights loaded. Model is untrained.")
            print("   For production use, provide a weights_path parameter.")
        
        # Compile if requested (optional for inference)
        if compile_model:
            model.compile(
                optimizer='adam',
                loss=triplet_loss,
                metrics=[triplet_accuracy]
            )
        
        print(f"✓ Model ready: input {cls.INPUT_SHAPE}, output {cls.EMBEDDING_SIZE}D")
        print(f"✓ Model version: {cls.MODEL_VERSION}")
        
        return cls(model, weights_path)
    
    def _validate_model(self):
        """Validate that the model has the expected architecture."""
        expected_input_shape = (None,) + self.INPUT_SHAPE
        expected_output_shape = (None, self.EMBEDDING_SIZE)
        
        actual_input_shape = self.model.input_shape
        actual_output_shape = self.model.output_shape
        
        if actual_input_shape != expected_input_shape:
            raise ValueError(
                f"Model input shape mismatch. "
                f"Expected {expected_input_shape}, got {actual_input_shape}"
            )
        
        if actual_output_shape != expected_output_shape:
            raise ValueError(
                f"Model output shape mismatch. "
                f"Expected {expected_output_shape}, got {actual_output_shape}"
            )
    
    def embed(self, image: Union[str, Image.Image, np.ndarray]) -> np.ndarray:
        """
        Generate an L2-normalized embedding for a single dog face image.
        
        The input image should be a pre-cropped dog face (ideally aligned).
        The embedding will be automatically L2-normalized for cosine similarity.
        
        Args:
            image: Input image. Can be:
                - str: Path to image file
                - PIL.Image: PIL Image object
                - np.ndarray: NumPy array (H, W, C) with values in [0, 255] or [0, 1]
                
        Returns:
            np.ndarray: L2-normalized embedding vector of shape (32,)
            
        Example:
            embedding1 = embedder.embed('dog1.jpg')
            embedding2 = embedder.embed('dog2.jpg')
            similarity = np.dot(embedding1, embedding2)  # cosine similarity
        """
        # Preprocess image
        processed = preprocess_image(image, target_size=self.INPUT_SHAPE[:2])
        
        # Generate embedding
        embedding = self.model.predict(processed, verbose=0)
        
        # Extract single vector (remove batch dimension)
        embedding = embedding[0]
        
        # Ensure L2 normalization (model should already do this, but double-check)
        embedding = normalize_embedding(embedding)
        
        return embedding
    
    def embed_batch(self, images: list) -> np.ndarray:
        """
        Generate embeddings for a batch of images (more efficient than single).
        
        Args:
            images: List of images (paths, PIL Images, or numpy arrays)
            
        Returns:
            np.ndarray: Array of L2-normalized embeddings with shape (N, 32)
        """
        # Preprocess batch
        processed = preprocess_batch(images, target_size=self.INPUT_SHAPE[:2])
        
        # Generate embeddings
        embeddings = self.model.predict(processed, verbose=0)
        
        # Ensure L2 normalization
        embeddings = normalize_embedding(embeddings)
        
        return embeddings
    
    def compute_similarity(self, 
                          embedding1: np.ndarray, 
                          embedding2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings.
        
        Since embeddings are L2-normalized, this is simply the dot product.
        Returns a value in [-1, 1], where 1 means identical, -1 means opposite.
        
        Args:
            embedding1: First embedding vector (32,)
            embedding2: Second embedding vector (32,)
            
        Returns:
            float: Cosine similarity score
        """
        return float(np.dot(embedding1, embedding2))
    
    def compute_distance(self, 
                        embedding1: np.ndarray, 
                        embedding2: np.ndarray) -> float:
        """
        Compute Euclidean distance between two embeddings.
        
        This is the L2 distance used in the triplet loss training.
        Lower values indicate more similar embeddings.
        
        Args:
            embedding1: First embedding vector (32,)
            embedding2: Second embedding vector (32,)
            
        Returns:
            float: Euclidean distance
        """
        return float(np.linalg.norm(embedding1 - embedding2))
    
    def save_weights(self, save_path: str):
        """
        Save model weights to a file.
        
        Args:
            save_path: Path where weights will be saved (should end in .h5)
        """
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        self.model.save(save_path)
        print(f"✓ Model saved to: {save_path}")
    
    def get_model_info(self) -> dict:
        """
        Get information about the loaded model.
        
        Returns:
            dict: Model metadata including version, shapes, and weights path
        """
        return {
            'version': self.MODEL_VERSION,
            'embedding_size': self.EMBEDDING_SIZE,
            'input_shape': self.INPUT_SHAPE,
            'weights_path': self.weights_path,
            'total_parameters': self.model.count_params(),
            'trainable_parameters': sum([
                tf.size(w).numpy() 
                for w in self.model.trainable_weights
            ])
        }
    
    def __repr__(self) -> str:
        info = self.get_model_info()
        return (
            f"DogFaceNetEmbedder(\n"
            f"  version={info['version']},\n"
            f"  input_shape={info['input_shape']},\n"
            f"  embedding_size={info['embedding_size']},\n"
            f"  parameters={info['total_parameters']:,},\n"
            f"  weights_path={info['weights_path']}\n"
            f")"
        )
