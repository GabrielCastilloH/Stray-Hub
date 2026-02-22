"""
DogFaceNet Inference Module

This module provides dog face embedding extraction using DogFaceNet,
a triplet-loss based model for dog face re-identification.

Migrated from: https://github.com/GuillaumeMougeot/DogFaceNet
"""

from .embedder import DogFaceNetEmbedder

__all__ = ['DogFaceNetEmbedder']
__version__ = '1.0.0'
