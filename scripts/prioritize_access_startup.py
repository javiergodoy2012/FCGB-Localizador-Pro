#!/usr/bin/env python3
"""Prioriza Firebase Auth antes de procesar la base ferroviaria pesada."""

from __future__ import annotations

import re
import sys
from pathlib import Path


FIREBASE_BLOCK = re.compile(
    r'(<script src="https://www\.gstatic\.com/firebasejs/10\.12\.5/firebase-app-compat\.js"></script>\s*'
    r'<script src="https://www\.gstatic\.com/firebasejs/10\.12\.5/firebase-auth-compat\.js"></script>\s*'
    r'<script src="https://www\.gstatic\.com/firebasejs/10\.12\.5/firebase-firestore-compat\.js"></script>\s*'
    r'<script id="firebase-access-script">.*?</script>\s*)',
    re.DOTALL,
)
INSERT_BEFORE = '<nav class="site-legal-links" aria-label="Privacidad y administración de cuenta">'


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: prioritize_access_startup.py RUTA_INDEX")

    index_path = Path(sys.argv[1])
    html = index_path.read_text(encoding="utf-8")
    matches = list(FIREBASE_BLOCK.finditer(html))
    if len(matches) != 1:
        raise SystemExit(f"Se esperaba un bloque de acceso Firebase y se encontraron {len(matches)}.")
    if html.count(INSERT_BEFORE) != 1:
        raise SystemExit("No se encontró un punto único para priorizar el acceso.")

    match = matches[0]
    access_block = match.group(1)
    html = html[: match.start()] + html[match.end() :]
    html = html.replace(INSERT_BEFORE, access_block + "\n" + INSERT_BEFORE, 1)
    index_path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
