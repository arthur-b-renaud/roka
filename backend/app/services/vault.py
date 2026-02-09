"""
Credential vault: Fernet-encrypted secrets stored in PostgreSQL.

Encrypt/decrypt credentials at the application layer.
Master key from ROKA_VAULT_KEY env var -- never stored in DB.
"""

import json
import logging
import uuid
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.db import get_pool

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.roka_vault_key.strip()
        if not key:
            raise RuntimeError(
                "ROKA_VAULT_KEY not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt(data: dict[str, Any]) -> bytes:
    """Encrypt a dict as Fernet-encrypted bytes."""
    payload = json.dumps(data).encode("utf-8")
    return _get_fernet().encrypt(payload)


def decrypt(encrypted: bytes) -> dict[str, Any]:
    """Decrypt Fernet-encrypted bytes back to a dict."""
    try:
        payload = _get_fernet().decrypt(encrypted)
        return json.loads(payload)
    except InvalidToken:
        logger.error("Failed to decrypt credential -- wrong vault key?")
        raise ValueError("Decryption failed. Check ROKA_VAULT_KEY.")


async def create_credential(
    owner_id: str,
    name: str,
    service: str,
    cred_type: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Create a new encrypted credential. Returns the row (without decrypted config)."""
    pool = get_pool()
    encrypted = encrypt(config)
    row = await pool.fetchrow("""
        INSERT INTO credentials (owner_id, name, service, type, config_encrypted)
        VALUES ($1, $2, $3, $4::credential_type, $5)
        RETURNING id, name, service, type::text, is_active, created_at, updated_at
    """, uuid.UUID(owner_id), name, service, cred_type, encrypted)
    return dict(row) if row else {}


async def update_credential(
    credential_id: str,
    owner_id: str,
    name: str | None = None,
    service: str | None = None,
    config: dict[str, Any] | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    """Update credential fields. Config is re-encrypted if provided."""
    pool = get_pool()
    sets = []
    args: list[Any] = []
    idx = 3  # $1=id, $2=owner_id

    if name is not None:
        sets.append(f"name = ${idx}")
        args.append(name)
        idx += 1
    if service is not None:
        sets.append(f"service = ${idx}")
        args.append(service)
        idx += 1
    if config is not None:
        sets.append(f"config_encrypted = ${idx}")
        args.append(encrypt(config))
        idx += 1
    if is_active is not None:
        sets.append(f"is_active = ${idx}")
        args.append(is_active)
        idx += 1

    if not sets:
        return {}

    row = await pool.fetchrow(f"""
        UPDATE credentials SET {', '.join(sets)}
        WHERE id = $1 AND owner_id = $2
        RETURNING id, name, service, type::text, is_active, created_at, updated_at
    """, uuid.UUID(credential_id), uuid.UUID(owner_id), *args)
    return dict(row) if row else {}


async def get_credential_decrypted(credential_id: str) -> dict[str, Any]:
    """Fetch and decrypt a credential by ID. Backend-only -- never expose to frontend."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, owner_id, name, service, type::text, config_encrypted, is_active FROM credentials WHERE id = $1",
        uuid.UUID(credential_id),
    )
    if not row:
        raise ValueError(f"Credential {credential_id} not found")
    config = decrypt(row["config_encrypted"])
    return {
        "id": str(row["id"]),
        "owner_id": str(row["owner_id"]),
        "name": row["name"],
        "service": row["service"],
        "type": row["type"],
        "config": config,
        "is_active": row["is_active"],
    }


async def get_credentials_by_service(service: str, owner_id: str) -> list[dict[str, Any]]:
    """Fetch all active credentials for a service, decrypted."""
    pool = get_pool()
    rows = await pool.fetch("""
        SELECT id, name, service, type::text, config_encrypted, is_active
        FROM credentials
        WHERE service = $1 AND owner_id = $2 AND is_active = true
    """, service, uuid.UUID(owner_id))
    results = []
    for row in rows:
        config = decrypt(row["config_encrypted"])
        results.append({
            "id": str(row["id"]),
            "name": row["name"],
            "service": row["service"],
            "type": row["type"],
            "config": config,
        })
    return results


async def list_credentials(owner_id: str) -> list[dict[str, Any]]:
    """List credentials for a user (without decrypted config)."""
    pool = get_pool()
    rows = await pool.fetch("""
        SELECT id, name, service, type::text, is_active, created_at, updated_at
        FROM credentials
        WHERE owner_id = $1
        ORDER BY created_at DESC
    """, uuid.UUID(owner_id))
    return [dict(r) for r in rows]


async def delete_credential(credential_id: str, owner_id: str) -> bool:
    result = await get_pool().execute(
        "DELETE FROM credentials WHERE id = $1 AND owner_id = $2",
        uuid.UUID(credential_id), uuid.UUID(owner_id),
    )
    return result == "DELETE 1"
