from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App configuration from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@db:5432/postgres"

    # Supabase (service-role -- god mode)
    supabase_url: str = "http://kong:8000"
    supabase_service_role_key: str = ""

    # LLM fallback (used only when DB has no llm config)
    litellm_model: str = "openai/gpt-4o"

    # Webhook auth (optional). If set, requests must include X-Roka-Webhook-Secret
    webhook_secret: str = ""

    # Polling
    task_poll_interval_seconds: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
