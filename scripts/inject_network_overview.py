#!/usr/bin/env python3
"""Incorpora la vista general interactiva de la red al artefacto publicado."""

from __future__ import annotations

import sys
from pathlib import Path


SCRIPT_TAG = '<script src="network-overview.js?v=5"></script>\n'
OLD_CHANGE_HANDLER = "$('ramal').addEventListener('change',changeRamal);"
NEW_CHANGE_HANDLER = "$('ramal').addEventListener('change',()=>changeRamal());"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: inject_network_overview.py RUTA_INDEX")

    index_path = Path(sys.argv[1])
    html = index_path.read_text(encoding="utf-8")

    if SCRIPT_TAG in html:
        raise SystemExit("La vista general ya está incorporada en el documento.")

    if html.count(OLD_CHANGE_HANDLER) != 1:
        raise SystemExit("No se encontró un único manejador del selector de ramales.")
    html = html.replace(OLD_CHANGE_HANDLER, NEW_CHANGE_HANDLER, 1)

    marker = '<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>'
    if html.count(marker) != 1:
        raise SystemExit("No se encontró un punto único para incorporar la vista general.")

    html = html.replace(marker, SCRIPT_TAG + marker, 1)
    index_path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
