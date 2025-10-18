"""Lightweight helpers for executing Snowflake queries."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Optional, Sequence

import snowflake.connector
from snowflake.connector import DictCursor
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend


class SnowflakeConfigurationError(RuntimeError):
    """Raised when the Snowflake configuration is incomplete."""


def _load_private_key_bytes() -> Optional[bytes]:
    """Return the Snowflake RSA private key bytes if a path is configured."""

    key_path = (
        os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
        or os.getenv("SNOWFLAKE_KEY_PATH")
        or os.getenv("SF_PRIVATE_KEY_PATH")
    )
    if not key_path:
        return None

    expanded_path = os.path.expanduser(key_path)
    if not os.path.isfile(expanded_path):
        raise SnowflakeConfigurationError(
            f"Snowflake private key not found at {expanded_path}"
        )

    passphrase = (
        os.getenv("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE")
        or os.getenv("SNOWFLAKE_KEY_PASSPHRASE")
        or os.getenv("SF_PRIVATE_KEY_PASSPHRASE")
    )

    with open(expanded_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=passphrase.encode() if passphrase else None,
            backend=default_backend(),
        )

    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _getenv(*names: str) -> Optional[str]:
    """Return the first defined environment variable from ``names``."""

    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def _build_connection_kwargs() -> Dict[str, Any]:
    required_vars = {
        "account": ("SNOWFLAKE_ACCOUNT", "SF_ACCOUNT"),
        "user": ("SNOWFLAKE_USER", "SF_USER"),
        "warehouse": ("SNOWFLAKE_WAREHOUSE", "SF_WAREHOUSE"),
        "database": ("SNOWFLAKE_DATABASE", "SF_DATABASE"),
        "schema": ("SNOWFLAKE_SCHEMA", "SF_SCHEMA"),
    }

    missing = [
        primary
        for primary, aliases in required_vars.items()
        if _getenv(*aliases) is None
    ]
    if missing:
        readable = ", ".join(sorted(missing))
        raise SnowflakeConfigurationError(
            f"Missing required Snowflake configuration for: {readable}"
        )

    cfg: Dict[str, Any] = {
        key: _getenv(*aliases) for key, aliases in required_vars.items()
    }

    role = _getenv("SNOWFLAKE_ROLE", "SF_ROLE")
    if role:
        cfg["role"] = role

    private_key = _load_private_key_bytes()
    if private_key:
        cfg["private_key"] = private_key
    else:
        password = _getenv("SNOWFLAKE_PASSWORD", "SF_PASSWORD")
        if not password:
            raise SnowflakeConfigurationError(
                "Provide SNOWFLAKE_PASSWORD/SF_PASSWORD or "
                "SNOWFLAKE_PRIVATE_KEY_PATH."
            )
        cfg["password"] = password

    return cfg


@contextmanager
def _snowflake_cursor(dict_cursor: bool = False):
    """Yield a Snowflake cursor and ensure cleanup."""

    conn = snowflake.connector.connect(**_build_connection_kwargs())
    cursor = conn.cursor(DictCursor if dict_cursor else None)
    try:
        yield cursor
        conn.commit()
    finally:
        try:
            cursor.close()
        finally:
            conn.close()


def execute(query: str, params: Optional[Sequence[Any]] = None) -> int:
    """Execute a statement and return the affected row count."""

    with _snowflake_cursor() as cursor:
        cursor.execute(query, params or [])
        return cursor.rowcount


def fetch_one(
    query: str, params: Optional[Sequence[Any]] = None
) -> Optional[Dict[str, Any]]:
    """Return the first row for a query or ``None`` if empty."""

    with _snowflake_cursor(dict_cursor=True) as cursor:
        cursor.execute(query, params or [])
        row = cursor.fetchone()
    return row


def fetch_all(
    query: str, params: Optional[Sequence[Any]] = None
) -> Iterable[Dict[str, Any]]:
    """Return all rows for a query as dictionaries."""

    with _snowflake_cursor(dict_cursor=True) as cursor:
        cursor.execute(query, params or [])
        rows = cursor.fetchall()
    return rows or []
