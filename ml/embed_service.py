"""
Stray Hub - Embedding Service API

FastAPI service for dog face embedding extraction.
This provides HTTP endpoints for the ML inference service.

To run:
    uvicorn embed_service:app --host 0.0.0.0 --port 8000 --reload

Endpoints:
    POST /embed - Generate embedding for a single image
    POST /embed/batch - Generate embeddings for multiple images
    GET /health - Health check
    GET /info - Model information
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from PIL import Image
import io

from embed import get_embedder, embed_dog_face, embed_batch, compute_similarity


# Initialize FastAPI app
app = FastAPI(
    title="Stray Hub Embedding Service",
    description="Dog face embedding extraction using DogFaceNet",
    version="1.0.0"
)


# Pydantic models for request/response
class EmbeddingResponse(BaseModel):
    embedding: List[float]
    model_version: str
    embedding_size: int


class SimilarityRequest(BaseModel):
    embedding1: List[float]
    embedding2: List[float]


class SimilarityResponse(BaseModel):
    similarity: float
    distance: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    message: str


class ModelInfoResponse(BaseModel):
    model_version: str
    embedding_size: int
    input_shape: List[int]
    total_parameters: int
    weights_path: Optional[str]


# Load embedder at startup
@app.on_event("startup")
async def startup_event():
    """Load model when server starts."""
    print("Starting Embedding Service...")
    try:
        embedder = get_embedder()
        print(f"✓ Model loaded successfully")
        print(embedder)
    except Exception as e:
        print(f"✗ Warning: Failed to load model: {e}")
        print("  Service will start but embeddings may not work")


@app.get("/", response_model=dict)
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Stray Hub Embedding Service",
        "version": "1.0.0",
        "endpoints": {
            "embed": "POST /embed - Generate embedding from image",
            "batch": "POST /embed/batch - Generate embeddings for multiple images",
            "similarity": "POST /similarity - Compare two embeddings",
            "health": "GET /health - Health check",
            "info": "GET /info - Model information"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    try:
        embedder = get_embedder()
        return HealthResponse(
            status="healthy",
            model_loaded=True,
            message="Embedding service is operational"
        )
    except Exception as e:
        return HealthResponse(
            status="unhealthy",
            model_loaded=False,
            message=f"Model loading failed: {str(e)}"
        )


@app.get("/info", response_model=ModelInfoResponse)
async def model_info():
    """Get information about the loaded model."""
    try:
        embedder = get_embedder()
        info = embedder.get_model_info()
        
        return ModelInfoResponse(
            model_version=info['version'],
            embedding_size=info['embedding_size'],
            input_shape=list(info['input_shape']),
            total_parameters=info['total_parameters'],
            weights_path=info['weights_path']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model info: {str(e)}")


@app.post("/embed", response_model=EmbeddingResponse)
async def generate_embedding(file: UploadFile = File(...)):
    """
    Generate embedding for a single dog face image.
    
    Upload an image file (JPEG, PNG, etc.) and receive a 32-dimensional
    L2-normalized embedding vector.
    """
    try:
        # Read image from upload
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Generate embedding
        embedding = embed_dog_face(image)
        
        # Get embedder info
        embedder = get_embedder()
        
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            model_version=embedder.MODEL_VERSION,
            embedding_size=len(embedding)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate embedding: {str(e)}"
        )


@app.post("/embed/batch")
async def generate_batch_embeddings(files: List[UploadFile] = File(...)):
    """
    Generate embeddings for multiple dog face images.
    
    Upload multiple image files and receive an array of embeddings.
    """
    try:
        # Read all images
        images = []
        for file in files:
            contents = await file.read()
            image = Image.open(io.BytesIO(contents))
            images.append(image)
        
        # Generate embeddings
        embeddings = embed_batch(images)
        
        # Get embedder info
        embedder = get_embedder()
        
        return {
            "embeddings": embeddings.tolist(),
            "count": len(embeddings),
            "model_version": embedder.MODEL_VERSION,
            "embedding_size": embeddings.shape[1]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate batch embeddings: {str(e)}"
        )


@app.post("/similarity", response_model=SimilarityResponse)
async def compute_embedding_similarity(request: SimilarityRequest):
    """
    Compute similarity between two embeddings.
    
    Provide two embedding vectors and receive:
    - Cosine similarity (higher = more similar)
    - Euclidean distance (lower = more similar)
    """
    try:
        # Convert to numpy arrays
        emb1 = np.array(request.embedding1, dtype=np.float32)
        emb2 = np.array(request.embedding2, dtype=np.float32)
        
        # Validate dimensions
        if emb1.shape != (32,) or emb2.shape != (32,):
            raise ValueError("Embeddings must be 32-dimensional vectors")
        
        # Compute metrics
        similarity = compute_similarity(emb1, emb2)
        embedder = get_embedder()
        distance = embedder.compute_distance(emb1, emb2)
        
        return SimilarityResponse(
            similarity=float(similarity),
            distance=float(distance)
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute similarity: {str(e)}"
        )


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "type": type(exc).__name__
        }
    )


if __name__ == '__main__':
    import uvicorn
    print("Starting Stray Hub Embedding Service...")
    print("API docs available at: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
