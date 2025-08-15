from django.http import JsonResponse
from django.shortcuts import render
from datetime import date
import os
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

def get_snowflake_connection():
    key_path = os.getenv("SNOWFLAKE_KEY_PATH") or os.getenv("SF_PRIVATE_KEY_PATH")
    if not key_path:
        raise RuntimeError("Set SNOWFLAKE_KEY_PATH to your rsa_key.pem")

    with open(key_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=(os.getenv("SNOWFLAKE_KEY_PASSPHRASE") or os.getenv("SF_PRIVATE_KEY_PASSPHRASE") or None)
                     and (os.getenv("SNOWFLAKE_KEY_PASSPHRASE") or os.getenv("SF_PRIVATE_KEY_PASSPHRASE")).encode(),
            backend=default_backend(),
        )

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    cfg = {
        "account": os.getenv("SF_ACCOUNT") or "CMZNSCB-MU47932",
        "user": os.getenv("SF_USER") or "ELII",
        "warehouse": os.getenv("SF_WAREHOUSE") or "COMPUTE_WH",
        "database": os.getenv("SF_DATABASE") or "WELLS",
        "schema": os.getenv("SF_SCHEMA") or "MINERALS",
        "private_key": private_key_bytes,
    }
    return snowflake.connector.connect(**cfg)

def map_page(request):
    """Renders the HTML page with Plotly map + slider."""
    return render(request, "map.html", {})

import os
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

def _snowflake_points():
    key_path = os.getenv("SNOWFLAKE_KEY_PATH")
    if not key_path or not os.path.exists(key_path):
        raise RuntimeError(f"SNOWFLAKE_KEY_PATH not set or file not found: {key_path}")

    with open(key_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None,  # set a bytes passphrase here if your key is encrypted
            backend=default_backend(),
        )

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    conn = snowflake.connector.connect(
        account=os.getenv("SF_ACCOUNT", "CMZNSCB-MU47932"),
        user=os.getenv("SF_USER", "ELII"),
        warehouse=os.getenv("SF_WAREHOUSE", "COMPUTE_WH"),
        database=os.getenv("SF_DATABASE", "WELLS"),
        schema=os.getenv("SF_SCHEMA", "MINERALS"),
        private_key=private_key_bytes,
    )

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                LATITUDE   AS LAT,
                LONGITUDE  AS LON,
                COMPLETIONDATE,
                DATE_PART(year, COMPLETIONDATE) AS COMPLETION_YEAR
            FROM WELLS.MINERALS.RAW_WELL_DATA
            WHERE COMPLETIONDATE IS NOT NULL
              AND LATITUDE IS NOT NULL
              AND LONGITUDE IS NOT NULL
              -- AND api_uwi IN ('42-041-32667', '42-041-32540', '42-041-32602') 
            """
        )
        rows = cur.fetchall()

        out = []
        for lat, lon, cdate, cyear in rows:
            label = f"Completion: {cdate}" if cdate is not None else "Well"
            out.append({"lat": float(lat), "lon": float(lon), "label": label, "year": int(cyear)})
        return out
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

def map_data(request):
    """Returns JSON for map points based on ?date=YYYY-MM-DD (or just year)."""
    rows = _snowflake_points()
    return JsonResponse({
        "lat": [r["lat"] for r in rows],
        "lon": [r["lon"] for r in rows],
        "text": [r["label"] for r in rows],
        "year": [r["year"] for r in rows],
    })