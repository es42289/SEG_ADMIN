"""Lightweight helpers for executing Snowflake queries."""

from __future__ import annotations

import base64
import os
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional, Sequence

import boto3
import snowflake.connector
from botocore.exceptions import ClientError
from snowflake.connector import DictCursor
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend


class SnowflakeConfigurationError(RuntimeError):
    """Raised when the Snowflake configuration is incomplete."""


def _load_private_key_from_file() -> Optional[bytes]:
    """Return the RSA key bytes from the filesystem if a path is configured."""

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

    passphrase = _private_key_passphrase()

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


def _private_key_passphrase() -> Optional[str]:
    """Return the configured passphrase for the RSA key, if any."""

    return (
        os.getenv("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE")
        or os.getenv("SNOWFLAKE_KEY_PASSPHRASE")
        or os.getenv("SF_PRIVATE_KEY_PASSPHRASE")
    )


def _load_private_key_from_secret_manager() -> Optional[bytes]:
    """Fetch the RSA private key from AWS Secrets Manager if configured."""

    secret_id = (
        os.getenv("SNOWFLAKE_PRIVATE_KEY_SECRET_ID")
        or "seg-user-app/snowflake-rsa-key"
    )

    if not secret_id:
        return None

    region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

    try:
        session = boto3.Session()
        client = session.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_id)
    except ClientError as exc:
        raise SnowflakeConfigurationError(
            f"Could not retrieve Snowflake RSA key from Secrets Manager: {exc}"
        ) from exc

    payload: Optional[bytes]
    secret_string = response.get("SecretString")
    if secret_string:
        payload = secret_string.encode()
    else:
        secret_binary = response.get("SecretBinary")
        if not secret_binary:
            raise SnowflakeConfigurationError(
                f"Secret {secret_id} did not contain a SecretString or SecretBinary payload"
            )
        payload = base64.b64decode(secret_binary)

    passphrase = _private_key_passphrase()

    private_key = serialization.load_pem_private_key(
        payload,
        password=passphrase.encode() if passphrase else None,
        backend=default_backend(),
    )

    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


@lru_cache(maxsize=1)
def _load_private_key_bytes() -> bytes:
    """Return the Snowflake RSA private key bytes from disk or Secrets Manager."""

    key_bytes = _load_private_key_from_file()
    if key_bytes:
        return key_bytes

    key_bytes = _load_private_key_from_secret_manager()
    if key_bytes:
        return key_bytes

    raise SnowflakeConfigurationError(
        "Configure SNOWFLAKE_PRIVATE_KEY_PATH or SNOWFLAKE_PRIVATE_KEY_SECRET_ID"
    )


def get_private_key_bytes() -> bytes:
    """Public helper so other modules can reuse the RSA key loader."""

    return _load_private_key_bytes()


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

    cfg["private_key"] = _load_private_key_bytes()

    return cfg


def get_connection_kwargs() -> Dict[str, Any]:
    """Return a copy of the Snowflake connection configuration."""

    return dict(_build_connection_kwargs())


def connect(**overrides: Any):
    """Create a Snowflake connection using the shared configuration."""

    cfg = _build_connection_kwargs()
    cfg.update(overrides)
    return snowflake.connector.connect(**cfg)


@contextmanager
def _snowflake_cursor(dict_cursor: bool = False):
    """Yield a Snowflake cursor and ensure cleanup."""

    conn = connect()
    cursor = conn.cursor(DictCursor) if dict_cursor else conn.cursor()
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
