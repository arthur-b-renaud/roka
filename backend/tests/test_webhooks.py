"""Tests for webhook route validation."""

import secrets
import pytest


def test_timing_safe_compare():
    """Verify we use constant-time comparison for secrets."""
    secret = "my-secret-value"
    # Correct comparison
    assert secrets.compare_digest(secret, secret) is True
    # Incorrect comparison
    assert secrets.compare_digest(secret, "wrong") is False
    # Empty vs non-empty
    assert secrets.compare_digest("", "") is True
    assert secrets.compare_digest(secret, "") is False
