#!/usr/bin/env python3
"""Aplica la identidad visual de Site Visión al artefacto de producción."""

from __future__ import annotations

import re
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"No se pudo actualizar {label}: se esperaban 1 coincidencia y hay {count}.")
    return text.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: apply_dashboard_brand.py RUTA_INDEX")

    index_path = Path(sys.argv[1])
    html = index_path.read_text(encoding="utf-8")

    replacements = (
        ("<title>UP Salta Vision</title>", "<title>Site Visión | Plataforma de Consulta Ferroviaria</title>", "el título del documento"),
        ('<meta property="og:title" content="UP Salta Vision">', '<meta property="og:title" content="Site Visión | Plataforma de Consulta Ferroviaria">', "el título Open Graph"),
        ('<meta property="og:site_name" content="UP Salta Vision">', '<meta property="og:site_name" content="Site Visión — UP Salta">', "el nombre Open Graph"),
        ('<meta name="twitter:title" content="UP Salta Vision">', '<meta name="twitter:title" content="Site Visión | Plataforma de Consulta Ferroviaria">', "el título para redes"),
        ("<h1>UP Salta Vision</h1>", '<h1>Site Visión</h1>\n<p class="brand-subtitle">Plataforma de Consulta Ferroviaria — UP Salta</p>', "la cabecera principal"),
        ("<div><h1>UP Salta Visión</h1><p>Acceso al dashboard operativo</p></div>", "<div><h1>Site Visión</h1><p>Plataforma de Consulta Ferroviaria — UP Salta</p></div>", "la identidad de acceso"),
    )

    for old, new, label in replacements:
        html = replace_once(html, old, new, label)

    logo_pattern = re.compile(
        r'<div class="logo-box"><img alt="Trenes Argentinos Cargas" class="logo-img" '
        r'src="data:image/png;base64,[^"]+"/></div>'
    )
    html, logo_count = logo_pattern.subn(
        '<div class="logo-box"><img alt="Site Visión — UP Salta" class="logo-img" src="site-vision-logo-v2-512.png"/></div>',
        html,
        count=1,
    )
    if logo_count != 1:
        raise SystemExit(f"No se pudo reemplazar el logo anterior: coincidencias {logo_count}.")

    stylesheet = '<link href="dashboard-brand.css" rel="stylesheet"/>\n'
    html = replace_once(html, "</head>", stylesheet + "</head>", "la hoja de identidad")

    index_path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
