from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

import boto3
from botocore.exceptions import ClientError
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import View
from django.utils.text import get_valid_filename

from snowflake.connector.errors import Error as SnowflakeError

from . import snowflake_helpers


S3_BUCKET_NAME = "seg-user-document-uploads"
S3_REGION = "us-east-2"
UPLOAD_URL_EXPIRES_IN = 600  # 10 minutes
DOWNLOAD_URL_EXPIRES_IN = 90  # seconds


logger = logging.getLogger(__name__)
_configured_cors_origins: Set[str] = set()


def _json_from_body(request) -> Dict[str, Any]:
    try:
        if not request.body:
            return {}
        return json.loads(request.body.decode("utf-8"))
    except (TypeError, ValueError):
        raise ValueError("Invalid JSON payload.")


def _normalize_note(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    note = str(value).strip()
    return note if note else None


def _format_timestamp(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _dict_get(row: Dict[str, Any], key: str, default: Any = None) -> Any:
    return row.get(key) or row.get(key.lower()) or row.get(key.upper()) or default


def _normalize_origin(origin: Optional[str]) -> Optional[str]:
    if not origin:
        return None
    origin = origin.strip()
    if not origin or origin.lower() == "null":
        return None
    return origin.rstrip("/") or None


def _ensure_bucket_cors_allows_origin(
    s3_client, origin: Optional[str]
) -> Optional[str]:
    """Ensure the bucket CORS configuration allows the request origin."""

    normalized = _normalize_origin(origin)
    if not normalized or normalized in _configured_cors_origins:
        return None

    warning_message: Optional[str] = None

    try:
        response = s3_client.get_bucket_cors(Bucket=S3_BUCKET_NAME)
        rules = list(response.get("CORSRules", []))
    except ClientError as exc:
        error_code = (
            exc.response.get("Error", {}).get("Code")
            if hasattr(exc, "response")
            else None
        )
        if error_code == "NoSuchCORSConfiguration":
            rules = []
        elif error_code == "AccessDenied":
            warning_message = (
                "AWS credentials lack permission to read the bucket CORS rules. "
                "Manually allow PUT/GET/HEAD from your site origin in the "
                f"{S3_BUCKET_NAME} bucket."
            )
            logger.warning(
                "Unable to read S3 bucket CORS configuration: %s", exc
            )
            return warning_message
        else:
            logger.warning("Unable to read S3 bucket CORS configuration: %s", exc)
            return None

    required_methods = {"GET", "HEAD", "PUT"}

    def rule_covers_origin(rule: Dict[str, Any]) -> bool:
        origins = {_normalize_origin(item) for item in rule.get("AllowedOrigins", [])}
        return "*" in origins or normalized in origins

    def rule_satisfies_requirements(rule: Dict[str, Any]) -> bool:
        methods = {method.upper() for method in rule.get("AllowedMethods", [])}
        headers = {header.lower() for header in rule.get("AllowedHeaders", [])}
        return required_methods.issubset(methods) and ("*" in headers or "content-type" in headers)

    matching_rule = next((rule for rule in rules if rule_covers_origin(rule)), None)

    if matching_rule and rule_satisfies_requirements(matching_rule):
        _configured_cors_origins.add(normalized)
        return

    updated_rules = list(rules)

    target_origin = normalized

    if matching_rule:
        matching_rule.setdefault("AllowedOrigins", [])
        if target_origin not in {_normalize_origin(item) for item in matching_rule["AllowedOrigins"]}:
            matching_rule["AllowedOrigins"].append(target_origin)
        existing_methods = {method.upper() for method in matching_rule.get("AllowedMethods", [])}
        matching_rule["AllowedMethods"] = sorted(existing_methods.union(required_methods))
        headers = set(matching_rule.get("AllowedHeaders", []))
        headers.add("*")
        matching_rule["AllowedHeaders"] = sorted(headers, key=lambda value: (value != "*", value))
        expose_headers = set(matching_rule.get("ExposeHeaders", []))
        expose_headers.add("ETag")
        matching_rule["ExposeHeaders"] = sorted(expose_headers)
    else:
        updated_rules.append(
            {
                "AllowedHeaders": ["*"],
                "AllowedMethods": sorted(required_methods),
                "AllowedOrigins": [target_origin],
                "ExposeHeaders": ["ETag"],
                "MaxAgeSeconds": 300,
            }
        )

    try:
        s3_client.put_bucket_cors(
            Bucket=S3_BUCKET_NAME,
            CORSConfiguration={"CORSRules": updated_rules},
        )
        _configured_cors_origins.add(normalized)
    except ClientError as exc:
        error_code = (
            exc.response.get("Error", {}).get("Code")
            if hasattr(exc, "response")
            else None
        )
        if error_code == "AccessDenied":
            warning_message = (
                "AWS credentials lack permission to update the bucket CORS "
                "rules. Configure CORS manually to allow PUT/GET/HEAD from "
                "your site origin."
            )
        else:
            warning_message = None
        logger.warning(
            "Unable to update S3 bucket CORS configuration for %s: %s", origin, exc
        )
        return warning_message

    return warning_message


def _snowflake_error_response(exc: Exception, action: str) -> JsonResponse:
    """Convert Snowflake exceptions into JSON API responses."""

    if isinstance(exc, snowflake_helpers.SnowflakeConfigurationError):
        detail = (
            "Snowflake configuration is incomplete. Set SNOWFLAKE_ACCOUNT, "
            "SNOWFLAKE_USER, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, "
            "SNOWFLAKE_SCHEMA, and authentication credentials, then reload."
        )
        return JsonResponse(
            {
                "detail": detail,
                "code": "snowflake_configuration_missing",
            },
            status=503,
        )

    if isinstance(exc, SnowflakeError):
        logger.exception("Snowflake error while %s", action, exc_info=exc)
    else:
        logger.exception("Unexpected error while %s", action, exc_info=exc)

    return JsonResponse(
        {
            "detail": "Snowflake request failed. Please try again later.",
            "code": "snowflake_unavailable",
        },
        status=503,
    )


class ApiLoginRequiredMixin(LoginRequiredMixin):
    """LoginRequired mixin that returns JSON instead of redirecting."""

    login_url = None
    raise_exception = True

    def handle_no_permission(self):
        return JsonResponse({"detail": "Authentication required."}, status=401)


@method_decorator(csrf_exempt, name="dispatch")
class StartUpload(ApiLoginRequiredMixin, View):
    """Return a pre-signed PUT URL for uploading a document."""

    login_url = '/login/'

    def post(self, request, *args, **kwargs):
        try:
            payload = _json_from_body(request)
        except ValueError:
            return JsonResponse({"detail": "Invalid JSON payload."}, status=400)

        filename = payload.get("filename")
        content_type = payload.get("content_type")

        if not filename or not isinstance(filename, str):
            return JsonResponse({"detail": "filename is required."}, status=400)
        if not content_type or not isinstance(content_type, str):
            return JsonResponse({"detail": "content_type is required."}, status=400)

        sanitized = get_valid_filename(filename)
        if not sanitized:
            return JsonResponse({"detail": "Filename could not be sanitized."}, status=400)

        file_id = str(uuid.uuid4())
        s3_key = f"user/{request.user.id}/{file_id}/{sanitized}"

        s3_client = boto3.client("s3", region_name=S3_REGION)
        request_origin = request.headers.get("Origin") or request.META.get("HTTP_ORIGIN")
        cors_warning = _ensure_bucket_cors_allows_origin(s3_client, request_origin)
        try:
            upload_url = s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": S3_BUCKET_NAME,
                    "Key": s3_key,
                    "ContentType": content_type,
                },
                ExpiresIn=UPLOAD_URL_EXPIRES_IN,
            )
        except ClientError as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        payload = {
            "file_id": file_id,
            "s3_key": s3_key,
            "upload_url": upload_url,
            "headers": {"Content-Type": content_type},
            "expires_in": UPLOAD_URL_EXPIRES_IN,
        }
        if cors_warning:
            payload["cors_warning"] = cors_warning

        return JsonResponse(payload)


@method_decorator(csrf_exempt, name="dispatch")
class FinalizeUpload(ApiLoginRequiredMixin, View):
    """Persist a completed upload into Snowflake."""

    login_url = '/login/'

    def post(self, request, *args, **kwargs):
        try:
            payload = _json_from_body(request)
        except ValueError:
            return JsonResponse({"detail": "Invalid JSON payload."}, status=400)

        file_id = payload.get("file_id")
        s3_key = payload.get("s3_key")
        note = _normalize_note(payload.get("note"))

        if not file_id or not isinstance(file_id, str):
            return JsonResponse({"detail": "file_id is required."}, status=400)
        if not s3_key or not isinstance(s3_key, str):
            return JsonResponse({"detail": "s3_key is required."}, status=400)

        expected_prefix = f"user/{request.user.id}/"
        if not s3_key.startswith(expected_prefix):
            return JsonResponse({"detail": "Invalid s3_key for user."}, status=403)

        s3_client = boto3.client("s3", region_name=S3_REGION)
        try:
            head = s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        except ClientError as exc:
            return JsonResponse({"detail": "Uploaded object not found."}, status=400)

        content_length = head.get("ContentLength")
        content_type = head.get("ContentType") or "application/octet-stream"
        filename = s3_key.split("/")[-1]

        try:
            existing = snowflake_helpers.fetch_one(
                """
                SELECT id, owner_user_id
                FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE id = %s
                """,
                (file_id,),
            )

            if existing:
                owner_id = _dict_get(existing, "OWNER_USER_ID")
                if owner_id != request.user.id:
                    return JsonResponse({"detail": "Forbidden."}, status=403)

                snowflake_helpers.execute(
                    """
                    UPDATE WELLS.MINERALS.USER_DOC_DIRECTORY
                    SET note = %s
                    WHERE id = %s AND owner_user_id = %s
                    """,
                    (note, file_id, request.user.id),
                )
                return JsonResponse({"ok": True})

            snowflake_helpers.execute(
                """
                INSERT INTO WELLS.MINERALS.USER_DOC_DIRECTORY
                (id, owner_user_id, s3_key, filename, content_type, bytes, note)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    file_id,
                    request.user.id,
                    s3_key,
                    filename,
                    content_type,
                    content_length,
                    note,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            return _snowflake_error_response(exc, "finalizing upload metadata")

        return JsonResponse({"ok": True})


@method_decorator(csrf_exempt, name="dispatch")
class ListMyFiles(ApiLoginRequiredMixin, View):
    """List uploaded documents for the current user."""

    login_url = '/login/'

    def get(self, request, *args, **kwargs):
        try:
            rows = snowflake_helpers.fetch_all(
                """
                SELECT id, filename, note, bytes, content_type, created_at
                FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE owner_user_id = %s
                ORDER BY created_at DESC
                """,
                (request.user.id,),
            )
        except Exception as exc:  # noqa: BLE001
            return _snowflake_error_response(exc, "listing supporting documents")

        documents = []
        for row in rows:
            documents.append(
                {
                    "id": _dict_get(row, "ID"),
                    "filename": _dict_get(row, "FILENAME"),
                    "note": _dict_get(row, "NOTE"),
                    "bytes": _dict_get(row, "BYTES"),
                    "content_type": _dict_get(row, "CONTENT_TYPE"),
                    "created_at": _format_timestamp(_dict_get(row, "CREATED_AT")),
                }
            )

        return JsonResponse({"files": documents})


@method_decorator(csrf_exempt, name="dispatch")
class FileDetail(ApiLoginRequiredMixin, View):
    """Update or delete a stored document record."""

    login_url = '/login/'

    def patch(self, request, file_id, *args, **kwargs):
        try:
            payload = _json_from_body(request)
        except ValueError:
            return JsonResponse({"detail": "Invalid JSON payload."}, status=400)

        note = _normalize_note(payload.get("note"))

        try:
            row = snowflake_helpers.fetch_one(
                """
                SELECT id, owner_user_id
                FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE id = %s
                """,
                (str(file_id),),
            )
            if not row:
                return JsonResponse({"detail": "File not found."}, status=404)

            owner_id = _dict_get(row, "OWNER_USER_ID")
            if owner_id != request.user.id:
                return JsonResponse({"detail": "Forbidden."}, status=403)

            snowflake_helpers.execute(
                """
                UPDATE WELLS.MINERALS.USER_DOC_DIRECTORY
                SET note = %s
                WHERE id = %s AND owner_user_id = %s
                """,
                (note, str(file_id), request.user.id),
            )
        except Exception as exc:  # noqa: BLE001
            return _snowflake_error_response(exc, "updating document comment")

        return JsonResponse({"ok": True, "note": note})

    def delete(self, request, file_id, *args, **kwargs):
        try:
            row = snowflake_helpers.fetch_one(
                """
                SELECT id, owner_user_id, s3_key
                FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE id = %s
                """,
                (str(file_id),),
            )
            if not row:
                return JsonResponse({"detail": "File not found."}, status=404)

            owner_id = _dict_get(row, "OWNER_USER_ID")
            if owner_id != request.user.id:
                return JsonResponse({"detail": "Forbidden."}, status=403)

            s3_key = _dict_get(row, "S3_KEY")

            snowflake_helpers.execute(
                """
                DELETE FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE id = %s AND owner_user_id = %s
                """,
                (str(file_id), request.user.id),
            )
        except Exception as exc:  # noqa: BLE001
            return _snowflake_error_response(exc, "deleting document record")

        if s3_key:
            s3_client = boto3.client("s3", region_name=S3_REGION)
            try:
                s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
            except ClientError:
                pass

        return JsonResponse({"ok": True})


@method_decorator(csrf_exempt, name="dispatch")
class OpenFile(ApiLoginRequiredMixin, View):
    """Return a short-lived download URL for a document."""

    login_url = '/login/'

    def post(self, request, file_id, *args, **kwargs):
        try:
            row = snowflake_helpers.fetch_one(
                """
                SELECT id, owner_user_id, s3_key
                FROM WELLS.MINERALS.USER_DOC_DIRECTORY
                WHERE id = %s
                """,
                (str(file_id),),
            )
            if not row:
                return JsonResponse({"detail": "File not found."}, status=404)

            owner_id = _dict_get(row, "OWNER_USER_ID")
            if owner_id != request.user.id:
                return JsonResponse({"detail": "Forbidden."}, status=403)

            s3_key = _dict_get(row, "S3_KEY")
            if not s3_key:
                return JsonResponse({"detail": "File has no S3 key."}, status=400)
        except Exception as exc:  # noqa: BLE001
            return _snowflake_error_response(exc, "opening document download link")

        s3_client = boto3.client("s3", region_name=S3_REGION)
        try:
            url = s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=DOWNLOAD_URL_EXPIRES_IN,
            )
        except ClientError as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        return JsonResponse(
            {
                "download_url": url,
                "expires_in_seconds": DOWNLOAD_URL_EXPIRES_IN,
            }
        )
