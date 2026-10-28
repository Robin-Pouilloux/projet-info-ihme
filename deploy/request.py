#!/usr/bin/env python3
"""Demande le déploiement d'une image GHCR par digest sans journaliser les jetons."""

import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


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
    except (ValueError, OSError, urllib.error.URLError):
        print(
            "Déploiement refusé ou indisponible. Vérifier les paramètres privés et le résumé du workflow.",
            file=sys.stderr,
        )
        sys.exit(1)
