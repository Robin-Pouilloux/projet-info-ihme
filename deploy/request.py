#!/usr/bin/env python3
"""Demande le déploiement d'une image GHCR par digest sans journaliser les jetons."""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


SENSITIVE_KEY = re.compile(
    r"(?i)(authorization|access[_-]?token|refresh[_-]?token|token|secret|password|"
    r"credential|api[_-]?key|registry[_-]?token|cookie|private[_-]?key)"
)


def sanitize_response_excerpt(body, token):
    text = body.decode("utf-8", errors="replace")
    if token:
        text = text.replace(token, "[REDACTED]")

    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        payload = None

    def redact_fields(value):
        if isinstance(value, dict):
            return {
                key: "[REDACTED]" if SENSITIVE_KEY.search(str(key)) else redact_fields(item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [redact_fields(item) for item in value]
        return value

    if payload is not None:
        text = json.dumps(redact_fields(payload), ensure_ascii=False)

    text = re.sub(
        r"(?i)(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/-]+=*",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(
        r"""(?i)(["']?(?:authorization|access[_-]?token|refresh[_-]?token|token|secret|password|credential|api[_-]?key|registry[_-]?token|cookie|private[_-]?key)["']?\s*[:=]\s*["']?)[^"'\s,;&}]+""",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(
        r"(?i)([?&](?:access_token|refresh_token|token|secret|password|api_key)=)[^&#\s]+",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", text).strip()
    return text[:1000]


def request_deployment(url, token):
    address = urllib.parse.urlsplit(url)
    if (
        address.scheme != "https"
        or not address.hostname
        or address.username
        or address.password
        or address.query
        or address.fragment
        or not re.fullmatch(r"/__deploy/(suivi|p[0-9]{2})", address.path)
    ):
        raise ValueError("URL HTTPS de déploiement invalide.")
    if not token:
        raise ValueError("Jeton privé requis.")
    request = urllib.request.Request(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
        },
        method="POST",
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None

    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=450) as response:
            return response.status
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            return error.code
        raise


if __name__ == "__main__":
    try:
        result = request_deployment(
            os.environ.get("DEPLOY_URL", ""),
            os.environ.get("DEPLOY_TOKEN", ""),
        )
        print(f"Demande de déploiement acceptée par le serveur (HTTP {result}).")
    except urllib.error.HTTPError as error:
        excerpt = sanitize_response_excerpt(error.read(8192), os.environ.get("DEPLOY_TOKEN", ""))
        print(
            f"Erreur HTTP {error.code} du serveur de déploiement. "
            f"Extrait expurgé : {excerpt or '(réponse vide)'}",
            file=sys.stderr,
        )
        sys.exit(1)
    except (ValueError, OSError, urllib.error.URLError):
        print(
            "Déploiement refusé ou indisponible. Vérifier les paramètres privés et le résumé du workflow.",
            file=sys.stderr,
        )
        sys.exit(1)
