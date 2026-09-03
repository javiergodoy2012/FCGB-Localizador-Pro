#!/usr/bin/env python3
"""Extiende C15 desde PK 1455.362 hasta el límite internacional en PK 1456.200."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


NETWORK_MARKER = "const NETWORK="
APP_MARKER = "const $="
START_PK = 1455.362
END_PK = 1456.200
BORDER_PATH = [
    (-22.0518523, -63.6862773),
    (-22.0511427, -63.6860660),
    (-22.0498257, -63.6855606),
    (-22.0495787, -63.6854424),
    (-22.0491801, -63.6851752),
    (-22.0486678, -63.6847324),
    (-22.0484540, -63.6845231),
    (-22.0480351, -63.6840320),
]


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


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    radius = 6_371_000
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def point_along(path: list[tuple[float, float]], ratio: float) -> tuple[float, float]:
    lengths = [distance(a, b) for a, b in zip(path, path[1:])]
    target = sum(lengths) * ratio
    travelled = 0.0
    for index, length in enumerate(lengths):
        if travelled + length >= target or index == len(lengths) - 1:
            local = 0.0 if not length else (target - travelled) / length
            lat = path[index][0] + local * (path[index + 1][0] - path[index][0])
            lon = path[index][1] + local * (path[index + 1][1] - path[index][1])
            return lat, lon
        travelled += length
    return path[-1]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: extend_c15_to_border.py RUTA_INDEX")

    index_path = Path(sys.argv[1])
    source = index_path.read_text(encoding="utf-8")
    start, end = network_bounds(source)
    network = json.loads(source[start:end])
    c15 = network.get("C15")
    if not c15 or not c15.get("puntos"):
        raise SystemExit("No se encontró la geometría C15.")

    points = c15["puntos"]
    last_pk, last_lat, last_lon = points[-1]
    if abs(last_pk - START_PK) > 0.0005:
        raise SystemExit(f"El extremo C15 esperado era {START_PK:.3f} y se encontró {last_pk:.3f}.")

    path = [(float(last_lat), float(last_lon)), *BORDER_PATH]
    physical_length = sum(distance(a, b) for a, b in zip(path, path[1:]))
    if not 750 <= physical_length <= 900:
        raise SystemExit(f"La extensión física C15 resultó inesperada: {physical_length:.1f} m.")

    target_pks = []
    pk = round(START_PK + 0.010, 3)
    while pk < END_PK:
        target_pks.append(pk)
        pk = round(pk + 0.010, 3)
    target_pks.append(END_PK)

    extension = []
    for target_pk in target_pks:
        ratio = (target_pk - START_PK) / (END_PK - START_PK)
        lat, lon = point_along(path, ratio)
        extension.append([target_pk, round(lat, 7), round(lon, 7)])

    if extension[-1][1:] != [BORDER_PATH[-1][0], BORDER_PATH[-1][1]]:
        raise SystemExit("El extremo generado no coincide con el límite internacional.")
    if any(b[0] <= a[0] for a, b in zip(points[-1:] + extension[:-1], extension)):
        raise SystemExit("La extensión C15 no conserva PK estrictamente crecientes.")

    c15["puntos"] = points + extension
    c15["km_fin"] = END_PK
    c15["nombre"] = "Perico – Límite Internacional"
    c15["nota"] = "C15 extendido sobre la vía principal hasta el límite internacional."

    replacement = json.dumps(network, ensure_ascii=False, separators=(",", ":"))
    result = source[:start] + replacement + source[end:]
    index_path.write_text(result, encoding="utf-8")
    print(f"C15 extendido: {len(extension)} puntos nuevos · {physical_length:.1f} m de geometría.")


if __name__ == "__main__":
    main()
