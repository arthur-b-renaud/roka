from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App configuration from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@db:5432/postgres"

    # Connection pool
    db_pool_min: int = 2
    db_pool_max: int = 10

    # Supabase (service-role -- god mode)
    supabase_url: str = "http://kong:8000"
    supabase_service_role_key: str = ""

    # CORS -- comma-separated origins, e.g. "http://localhost:3000,https://roka.example.com"
    cors_origins: str = "http://localhost:3000"

    # LLM fallback (used only when DB has no llm config)
    litellm_model: str = "openai/gpt-4o"
    llm_timeout_seconds: int = 120

    # Webhook auth (optional). If set, requests must include X-Roka-Webhook-Secret
    webhook_secret: str = ""

    # Polling
    task_poll_interval_seconds: int = 5

    # LLM settings cache TTL
    llm_cache_ttl_seconds: int = 60

    # Text truncation limit for LLM input
    llm_max_input_chars: int = 4000

    class Config:
        env_file = ".env"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
