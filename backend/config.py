from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    firebase_credentials_path: str = ""
    storage_bucket: str = ""
    signed_url_expiration_minutes: int = 60
    max_photos_per_profile: int = 5
    default_page_size: int = 20

    model_config = {"env_prefix": "STRAY_"}


settings = Settings()
