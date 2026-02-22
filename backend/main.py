from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.dependencies import _init_firebase
from backend.routers import health, profiles, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_firebase()
    yield


app = FastAPI(
    title="Stray Hub API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(profiles.router)
app.include_router(search.router)
