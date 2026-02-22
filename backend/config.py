from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    firebase_credentials_path: str = ""
    storage_bucket: str = ""
    ml_service_url: str = "http://localhost:8000"
    signed_url_expiration_minutes: int = 60
    max_photos_per_profile: int = 5
    default_page_size: int = 20
    image_resize_size: int = 224
    similarity_threshold: float = 0.7
    max_match_results: int = 5

    model_config = {"env_prefix": "STRAY_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
