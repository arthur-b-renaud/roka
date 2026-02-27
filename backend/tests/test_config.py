"""Tests for backend configuration."""

from app.config import Settings


def test_default_settings():
    """Verify default values are sensible."""
    s = Settings()
    assert s.db_pool_min == 2
    assert s.db_pool_max == 10
    assert s.task_poll_interval_seconds == 5
    assert s.llm_timeout_seconds == 120
    assert s.llm_max_input_chars == 4000
    assert s.llm_cache_ttl_seconds == 60


def test_cors_origin_list_single():
    s = Settings(cors_origins="http://localhost:3000")
    assert s.cors_origin_list == ["http://localhost:3000"]


def test_cors_origin_list_multiple():
    s = Settings(cors_origins="http://localhost:3000, https://roka.example.com")
    assert s.cors_origin_list == ["http://localhost:3000", "https://roka.example.com"]


def test_cors_origin_list_empty():
    s = Settings(cors_origins="")
    assert s.cors_origin_list == []
