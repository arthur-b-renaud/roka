"""Tests for LLM settings service."""

from app.services.llm_settings import LLMConfig


def test_model_string():
    config = LLMConfig(
        provider="openai",
        model="gpt-4o",
        api_key="sk-test",
        api_base="",
        is_configured=True,
    )
    assert config.model_string == "openai/gpt-4o"


def test_ollama_configured_without_key():
    config = LLMConfig(
        provider="ollama",
        model="llama3",
        api_key="",
        api_base="http://localhost:11434",
        is_configured=True,
    )
    assert config.is_configured is True
    assert config.model_string == "ollama/llama3"


def test_not_configured_without_key():
    config = LLMConfig(
        provider="openai",
        model="gpt-4o",
        api_key="",
        api_base="",
        is_configured=False,
    )
    assert config.is_configured is False
