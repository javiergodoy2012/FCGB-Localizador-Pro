#!/usr/bin/env python3
"""Bake validated railway alignment anchors into VisionSite's NETWORK geometry."""

from __future__ import annotations

import json
from pathlib import Path
import sys


NETWORK_MARKER = "const NETWORK="
APP_MARKER = "const $="


def network_bounds(source: str) -> tuple[int, int]:
    start = source.find(NETWORK_MARKER)
    if start < 0:
        raise SystemExit("No se encontró NETWORK.")
    start += len(NETWORK_MARKER)
    app_start = source.find(APP_MARKER, start)
    end = source.rfind("};", start, app_start) + 1
    if app_start < 0 or end <= start:
        raise SystemExit("No se pudo delimitar NETWORK.")
    return start, end


def apply_anchors(points: list[list[float]], anchors: list[dict]) -> list[list[float]]:
    if len(anchors) < 2:
        raise SystemExit("La corrección no contiene suficientes anclajes.")
    corrected: list[list[float]] = []
    anchor_index = 0
    for pk, lat, lon in points:
        while anchor_index < len(anchors) - 2 and anchors[anchor_index + 1]["pk"] < pk:
            anchor_index += 1
        left = anchors[anchor_index]
        right = anchors[min(anchor_index + 1, len(anchors) - 1)]
        width = right["pk"] - left["pk"]
        ratio = 0 if not width else max(0, min(1, (pk - left["pk"]) / width))
        dlat = left["dLat"] + ratio * (right["dLat"] - left["dLat"])
        dlon = left["dLon"] + ratio * (right["dLon"] - left["dLon"])
        corrected.append([pk, lat + dlat, lon + dlon])
    return corrected


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Uso: apply_rail_corrections.py RUTA_INDEX [DIRECTORIO_CORRECCIONES]")
    index_path = Path(sys.argv[1])
    corrections_dir = Path(sys.argv[2]) if len(sys.argv) == 3 else Path("rail-corrections")
    source = index_path.read_text(encoding="utf-8")
    start, end = network_bounds(source)
    network = json.loads(source[start:end])
    applied: list[str] = []

    for correction_path in sorted(corrections_dir.glob("*.json")):
        if correction_path.name.endswith("-report.json") or correction_path.name == "junction-overrides.json":
            continue
        correction = json.loads(correction_path.read_text(encoding="utf-8"))
        ramal = correction.get("ramal")
        if ramal not in network:
            raise SystemExit(f"La corrección {correction_path} referencia un ramal inexistente: {ramal}")
        original_points = network[ramal]["puntos"]
        corrected_points = apply_anchors(original_points, correction["anchors"])
        if len(corrected_points) != len(original_points):
            raise SystemExit(f"Cambió la cantidad de puntos del ramal {ramal}.")
        if any(a[0] != b[0] for a, b in zip(original_points, corrected_points)):
            raise SystemExit(f"Cambió una progresiva PK del ramal {ramal}.")
        network[ramal]["puntos"] = corrected_points
        applied.append(ramal)

    replacement = json.dumps(network, ensure_ascii=False, separators=(",", ":"))
    result = source[:start] + replacement + source[end:]
    if source[:start] != result[:start] or source[end:] != result[start + len(replacement):]:
        raise SystemExit("Se detectó una modificación fuera de NETWORK.")
    index_path.write_text(result, encoding="utf-8")
    print("Trazas aplicadas: " + ", ".join(applied))


if __name__ == "__main__":
    main()
