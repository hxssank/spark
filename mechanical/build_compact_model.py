from __future__ import annotations

import hashlib
import json
import math
import tempfile
from itertools import combinations
from pathlib import Path

import cadquery as cq
from publish_assets import publish_files

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "electronics/compact-design/layout.json"
OUTPUT = ROOT / "mechanical/compact-exports"


def load_layout() -> dict:
    return json.loads(LAYOUT.read_text())


def _numbers(values: list, count: int, label: str) -> None:
    if len(values) != count or any(isinstance(value, bool) or not isinstance(value, (int, float))
                                   or not math.isfinite(value) for value in values):
        raise ValueError(f"{label} must contain {count} finite numbers")


def _overlap(first: list[float], second: list[float]) -> bool:
    return min(first[2], second[2]) - max(first[0], second[0]) > 1e-8 \
        and min(first[3], second[3]) - max(first[1], second[1]) > 1e-8


def component_z(version: dict, component: dict, side: str) -> list[float]:
    bottom = version["boardZMm"]
    top = bottom + version["boardMm"][2]
    if side == "front":
        return [top, top + component["heightMm"]]
    height = component.get("rearHeightMm", component["heightMm"]) if component["side"] == "both" else component["heightMm"]
    return [bottom - height, bottom]


def validate_layout(layout: dict) -> dict:
    reports = []
    identifiers = set()
    for version in layout["versions"]:
        identifier = version["id"]
        if identifier in identifiers:
            raise ValueError(f"Duplicate version {identifier}")
        identifiers.add(identifier)
        for key in ("caseMm", "cellMm", "boardMm", "previousCaseMm"):
            _numbers(version[key], 3, key)
            if min(version[key]) <= 0:
                raise ValueError(f"{key} must be positive")
        length, width, thickness = version["caseMm"]
        cell_length, cell_width, cell_thickness = version["cellMm"]
        board_width, board_length, board_thickness = version["boardMm"]
        base, transition, end, wall = [version[key] for key in ("baseMm", "transitionMm", "endMm", "wallMm")]
        _numbers([base, transition, end, wall, version["boardZMm"]], 5, "stack dimensions")
        if min(base, transition, end, wall) <= 0 or board_thickness <= 0:
            raise ValueError("Stack allowances must be positive")
        if abs(length - base - cell_length - transition - board_length - end) > 1e-8:
            raise ValueError("Case length does not equal its allocation")
        side_gap = (width - 2 * wall - cell_width) / 2
        face_gap = (thickness - 2 * wall - cell_thickness) / 2
        if side_gap < layout["rules"]["minimumCellSideGapMm"] - 1e-8 \
                or face_gap < layout["rules"]["minimumCellFaceGapMm"] - 1e-8:
            raise ValueError("Cell clearance falls below the declared allowance")
        if board_width > width - 2 * wall:
            raise ValueError("Board crosses the case wall")
        seen = set()
        occupied = {"front": [], "back": []}
        for component in version["components"]:
            ref = component["reference"]
            if ref in seen:
                raise ValueError(f"Duplicate component {ref}")
            seen.add(ref)
            bounds = component["boundsMm"]
            _numbers(bounds, 4, ref)
            x0, y0, x1, y1 = bounds
            if x0 < 0 or y0 < 0 or x1 > board_width or y1 > board_length or x1 <= x0 or y1 <= y0:
                raise ValueError(f"{identifier} {ref} crosses the board boundary")
            _numbers([component["heightMm"]], 1, ref)
            if component["heightMm"] <= 0:
                raise ValueError(f"{ref} height must be positive")
            if component["side"] not in {"front", "back", "both"}:
                raise ValueError(f"Invalid side for {ref}")
            sides = ["front", "back"] if component["side"] == "both" else [component["side"]]
            for side in sides:
                z0, z1 = component_z(version, component, side)
                if z0 < -thickness / 2 + wall - 1e-8 or z1 > thickness / 2 - wall + 1e-8:
                    raise ValueError(f"{identifier} {ref} crosses the case wall in thickness")
                occupied[side].append(component)
                display = version["display"]
                if _overlap(bounds, display["boundsMm"]) \
                        and min(z1, display["zMm"][1]) - max(z0, display["zMm"][0]) > 1e-8:
                    raise ValueError(f"{identifier} {ref} intersects the display")
            if "capacitorSites" in component:
                site_width, site_length = layout["rules"]["capacitorSiteMm"]
                available = math.floor((x1 - x0 + 1e-8) / site_width) * math.floor((y1 - y0 + 1e-8) / site_length)
                if component["capacitorSites"] > available:
                    raise ValueError(f"{ref} capacitor sites exceed its reservation")
        for side, items in occupied.items():
            for first, second in combinations(items, 2):
                if _overlap(first["boundsMm"], second["boundsMm"]):
                    raise ValueError(f"{identifier} {side} overlap: {first['reference']} and {second['reference']}")
        display = version["display"]
        _numbers(display["boundsMm"], 4, "display bounds")
        _numbers(display["zMm"], 2, "display thickness")
        if display["zMm"][0] < -thickness / 2 + wall or display["zMm"][1] > thickness / 2 - wall:
            raise ValueError("Display crosses the inner case envelope")
        x0, y0, x1, y1 = display["boundsMm"]
        if x0 < 0 or x1 > board_width or y0 < 0 or y1 > board_length:
            raise ValueError("Display exceeds the electronics bay")
        front_max = max(component_z(version, item, "front")[1] for item in occupied["front"])
        back_min = min(component_z(version, item, "back")[0] for item in occupied["back"])
        reports.append({"id": identifier, "case_mm": version["caseMm"], "board_mm": version["boardMm"],
                        "non_cell_length_mm": length - cell_length,
                        "previous_non_cell_length_mm": version["previousCaseMm"][0] - cell_length,
                        "cell_side_gap_each_mm": round(side_gap, 3), "cell_face_gap_each_mm": round(face_gap, 3),
                        "front_case_gap_mm": round(thickness / 2 - wall - front_max, 3),
                        "rear_case_gap_mm": round(back_min + thickness / 2 - wall, 3),
                        "reservation_count": len(version["components"]), "same_face_overlaps": 0,
                        "note": "Zero overlap means reservation boxes fit. It does not validate actual footprints, routing, assembly tolerances, insulation or temperature."})
    return {"status": "passed", "scope": "Nominal component reservations and case envelopes only; no routed circuit or physical tests",
            "versions": reports}


def _box(bounds: list[float]) -> cq.Workplane:
    x0, y0, z0, x1, y1, z1 = bounds
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, y0, z0))


def _frame(length: float, width: float, thickness: float) -> cq.Workplane:
    size = .15
    bars = []
    for x in (-width / 2, width / 2 - size):
        for z in (-thickness / 2, thickness / 2 - size):
            bars.append(_box([x, 0, z, x + size, length, z + size]))
    for y in (0, length - size):
        for z in (-thickness / 2, thickness / 2 - size):
            bars.append(_box([-width / 2, y, z, width / 2, y + size, z + size]))
        for x in (-width / 2, width / 2 - size):
            bars.append(_box([x, y, -thickness / 2, x + size, y + size, thickness / 2]))
    result = bars[0]
    for bar in bars[1:]:
        result = result.union(bar)
    return result


def build_parts(version: dict) -> dict[str, cq.Workplane]:
    length, width, thickness = version["caseMm"]
    cell_length, cell_width, cell_thickness = version["cellMm"]
    board_width, board_length, board_thickness = version["boardMm"]
    board_y = version["baseMm"] + cell_length + version["transitionMm"]
    board_z = version["boardZMm"]
    parts = {
        "case_envelope_frame": _frame(length, width, thickness),
        "cell_envelope": _box([-cell_width / 2, version["baseMm"], -cell_thickness / 2,
                               cell_width / 2, version["baseMm"] + cell_length, cell_thickness / 2]),
        "board_reservation": _box([-board_width / 2, board_y, board_z,
                                   board_width / 2, board_y + board_length, board_z + board_thickness]),
    }
    for component in version["components"]:
        x0, y0, x1, y1 = component["boundsMm"]
        sides = ["front", "back"] if component["side"] == "both" else [component["side"]]
        for side in sides:
            z0, z1 = component_z(version, component, side)
            parts[f"{component['reference']}_{side}_reservation"] = _box(
                [x0 - board_width / 2, board_y + y0, z0, x1 - board_width / 2, board_y + y1, z1])
    for name, bounds_key, z_key in (("display_glass_reservation", "boundsMm", "zMm"),
                                  ("display_lens_reservation", "lensBoundsMm", "lensZMm")):
        x0, y0, x1, y1 = version["display"][bounds_key]
        z0, z1 = version["display"][z_key]
        parts[name] = _box([x0 - board_width / 2, board_y + y0, z0,
                           x1 - board_width / 2, board_y + y1, z1])
    return parts


def geometry_report(layout: dict) -> tuple[dict, dict[str, dict[str, cq.Workplane]]]:
    report = validate_layout(layout)
    all_parts = {}
    for version, result in zip(layout["versions"], report["versions"], strict=True):
        parts = build_parts(version)
        all_parts[version["id"]] = parts
        length, width, thickness = version["caseMm"]
        for name, part in parts.items():
            shape = part.val()
            if not shape.isValid() or len(part.solids().vals()) != 1 or shape.Volume() <= 0:
                raise ValueError(f"Invalid solid {name}")
            bb = shape.BoundingBox()
            if bb.xmin < -width / 2 - 1e-6 or bb.xmax > width / 2 + 1e-6 or bb.ymin < -1e-6 \
                    or bb.ymax > length + 1e-6 or bb.zmin < -thickness / 2 - 1e-6 or bb.zmax > thickness / 2 + 1e-6:
                raise ValueError(f"Part outside case envelope: {name}")
        for (first_name, first), (second_name, second) in combinations(parts.items(), 2):
            if first.intersect(second).val().Volume() > 1e-6:
                raise ValueError(f"Solid overlap: {first_name} / {second_name}")
        result.update({"valid_single_solids": len(parts), "solid_intersections": 0})
    return report, all_parts


def main() -> None:
    initial = {path: path.read_bytes() for path in (LAYOUT, Path(__file__).resolve(),
               Path(__file__).with_name("publish_assets.py"), Path(__file__).with_name("requirements.txt"))}
    layout = json.loads(initial[LAYOUT])
    report, all_parts = geometry_report(layout)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".compact-build-", dir=OUTPUT.parent) as temporary:
        stage = Path(temporary)
        for identifier, parts in all_parts.items():
            assembly = cq.Assembly(name=f"Spark_{identifier}_unrouted_packing")
            for name, part in parts.items():
                color = (.12, .35, .24) if "board" in name else (.65, .68, .71) if "cell" in name else (.25, .26, .27)
                if name.startswith("C"):
                    color = (.72, .55, .29)
                if name == "case_envelope_frame":
                    color = (.35, .45, .55)
                assembly.add(part, name=name, color=cq.Color(*color))
            assembly.export(str(stage / f"spark_{identifier}_packing.step"))
            assembly.export(str(stage / f"spark_{identifier}_packing.glb"))
        (stage / "geometry-report.json").write_text(json.dumps(report, indent=2) + "\n")
        if any(path.read_bytes() != data for path, data in initial.items()):
            raise ValueError("Compact model sources changed during export; retry after edits finish")
        outputs = {OUTPUT / path.name: path for path in stage.iterdir()}
        build_report = {
            "inputs": {str(path.relative_to(ROOT)): hashlib.sha256(data).hexdigest() for path, data in initial.items()},
            "output": {str(path.relative_to(ROOT)): hashlib.sha256(source.read_bytes()).hexdigest() for path, source in outputs.items()},
        }
        (stage / "build-report.json").write_text(json.dumps(build_report, indent=2) + "\n")
        outputs[OUTPUT / "build-report.json"] = stage / "build-report.json"
        publish_files({source: target for target, source in outputs.items()})
    print(json.dumps({"files": [str(path.relative_to(ROOT)) for path in outputs], "geometry": report}))


if __name__ == "__main__":
    main()
