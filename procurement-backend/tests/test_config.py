import pytest
from pydantic import ValidationError

from app.config import Settings


def test_secret_key_is_required(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_short_secret_key_is_rejected(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "replace-me")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_32_character_secret_key_is_accepted(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a" * 32)

    assert Settings(_env_file=None).secret_key == "a" * 32
