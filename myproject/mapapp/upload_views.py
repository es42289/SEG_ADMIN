from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import View
from django.utils.text import get_valid_filename

from . import snowflake_helpers


S3_BUCKET_NAME = "seg-user-document-uploads"
S3_REGION = "us-east-2"
UPLOAD_URL_EXPIRES_IN = 600  # 10 minutes
DOWNLOAD_URL_EXPIRES_IN = 90  # seconds


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


@method_decorator(csrf_exempt, name="dispatch")
class StartUpload(LoginRequiredMixin, View):
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

        return JsonResponse(
            {
                "file_id": file_id,
                "s3_key": s3_key,
                "upload_url": upload_url,
                "headers": {"Content-Type": content_type},
                "expires_in": UPLOAD_URL_EXPIRES_IN,
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class FinalizeUpload(LoginRequiredMixin, View):
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

        return JsonResponse({"ok": True})


@method_decorator(csrf_exempt, name="dispatch")
class ListMyFiles(LoginRequiredMixin, View):
    """List uploaded documents for the current user."""

    login_url = '/login/'

    def get(self, request, *args, **kwargs):
        rows = snowflake_helpers.fetch_all(
            """
            SELECT id, filename, note, bytes, content_type, created_at
            FROM WELLS.MINERALS.USER_DOC_DIRECTORY
            WHERE owner_user_id = %s
            ORDER BY created_at DESC
            """,
            (request.user.id,),
        )

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
class FileDetail(LoginRequiredMixin, View):
    """Update or delete a stored document record."""

    login_url = '/login/'

    def patch(self, request, file_id, *args, **kwargs):
        try:
            payload = _json_from_body(request)
        except ValueError:
            return JsonResponse({"detail": "Invalid JSON payload."}, status=400)

        note = _normalize_note(payload.get("note"))

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

        return JsonResponse({"ok": True, "note": note})

    def delete(self, request, file_id, *args, **kwargs):
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

        if s3_key:
            s3_client = boto3.client("s3", region_name=S3_REGION)
            try:
                s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
            except ClientError:
                pass

        return JsonResponse({"ok": True})


@method_decorator(csrf_exempt, name="dispatch")
class OpenFile(LoginRequiredMixin, View):
    """Return a short-lived download URL for a document."""

    login_url = '/login/'

    def post(self, request, file_id, *args, **kwargs):
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
