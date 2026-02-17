from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App configuration from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@db:5432/postgres"

    # Connection pool
    db_pool_min: int = 2
    db_pool_max: int = 10

    # CORS -- comma-separated origins
    cors_origins: str = "http://localhost:3000"

    # LLM fallback (used only when DB has no llm config)
    litellm_model: str = "openai/gpt-4o"
    llm_timeout_seconds: int = 120

    # Webhook auth
    webhook_secret: str = ""

    # Polling
    task_poll_interval_seconds: int = 5

    # Centrifugo (real-time bridge)
    centrifugo_api_url: str = "http://centrifugo:8000"
    centrifugo_api_key: str = ""

    # LLM settings cache TTL
    llm_cache_ttl_seconds: int = 60

    # Text truncation limit for LLM input
    llm_max_input_chars: int = 4000

    # Credential vault encryption key (Fernet, 32-byte base64)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    roka_vault_key: str = ""

    # OAuth provider credentials (for user "Connect" flows)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    slack_oauth_client_id: str = ""
    slack_oauth_client_secret: str = ""

    class Config:
        env_file = ".env"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def vault_configured(self) -> bool:
        return bool(self.roka_vault_key.strip())


settings = Settings()
