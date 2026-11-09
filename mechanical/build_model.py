from __future__ import annotations

import hashlib
import json
import math
import re
import struct
import tempfile
from collections import Counter
from dataclasses import asdict, dataclass, fields
from itertools import combinations
from pathlib import Path

import cadquery as cq
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from publish_assets import publish_files

PRINTED_PARTS = ("sleeve", "carrier", "front_cover", "bottom_cap")
SLEEVE_TOP_Z = 115.0
END_EDGE_CHAMFER = 0.45
CAPACITOR_WIDTH = 2.7
CAPACITOR_LENGTH = 3.5
CAPACITOR_HEIGHT_WITH_SOLDER = 2.8
PLACEMENT_FILE = Path(__file__).resolve().parents[1] / "electronics/boost-prototype/component-placement.json"
ROOT = Path(__file__).resolve().parents[1]


def component_references(d: Dimensions) -> dict[str, cq.Workplane]:
    placement = json.loads(PLACEMENT_FILE.read_text())
    if placement["board_mm"] != [d.pcb_width, d.pcb_length, d.pcb_thickness]:
        raise ValueError("PCB dimensions differ from the component placement export")
    result = {}
    references = set()
    for item in placement["components"]:
        ref = item["reference"]
        if not isinstance(ref, str) or not re.fullmatch(r"[A-Z]+[0-9]+", ref) or ref in references:
            raise ValueError(f"Duplicate or invalid PCB reference: {ref!r}")
        references.add(ref)
        if item["side"] not in {"front", "back"}:
            raise ValueError(f"{ref} has an invalid PCB side")
        feature = item["is_pcb_feature"]
        maximum_height = item["maximum_body_height_mm"]
        if not isinstance(feature, bool):
            raise TypeError(f"{ref} must declare whether it is a PCB feature")
        if maximum_height is not None and (
            isinstance(maximum_height, bool) or not isinstance(maximum_height, (int, float))
            or not math.isfinite(maximum_height) or maximum_height <= 0
        ):
            raise ValueError(f"{ref} has an invalid component height")
        bounds = item["body_bounds_board_xy_mm"]
        if len(bounds) != 4 or not all(
            not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
            for value in bounds
        ) or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
            raise ValueError(f"{ref} has invalid component bounds")
        height = 0.05 if feature else maximum_height + 0.1 if maximum_height is not None else 1.0
        suffix = "pad_reference" if feature else "unmeasured_reference" if maximum_height is None else "reference"
        name = {"L1": "inductor_reference", "C1": "input_cap_reference"}.get(ref, f"{ref.lower()}_{suffix}")
        x0, z0, x1, z1 = item["body_bounds_board_xy_mm"]
        y = d.pcb_y + d.pcb_thickness + height / 2 if item["side"] == "front" else d.pcb_y - height / 2
        result[name] = box(x1 - x0, height, z1 - z0,
                           x=(x0 + x1) / 2 - d.pcb_width / 2, y=y, z=d.pcb_z + z0)
    return result


@dataclass(frozen=True)
class Dimensions:
    length: float = 116.0
    width: float = 24.0
    thickness: float = 14.8
    shell_wall: float = 1.2
    shell_radius: float = 3.2
    cell_width: float = 18.0
    cell_thickness: float = 7.7
    cell_length: float = 66.0
    cell_z: float = 6.5
    cell_pocket_width: float = 19.2
    cell_pocket_thickness: float = 9.4
    pcb_width: float = 20.0
    pcb_length: float = 38.0
    pcb_thickness: float = 1.0
    pcb_z: float = 76.0
    pcb_y: float = -1.7

    def __post_init__(self) -> None:
        if any(isinstance(value := getattr(self, field.name), bool)
               or not isinstance(value, (int, float)) or not math.isfinite(value)
               for field in fields(self)):
            raise ValueError("Dimensions must be finite numbers")
        if any(getattr(self, field.name) != field.default for field in fields(self)):
            raise ValueError("Dimensions are fixed for prototype A; revise geometry and fit checks together")


def _validate_shape_values(sizes: dict[str, float], **positions: float) -> None:
    for name, value in {**sizes, **positions}.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{name} must be a finite number")
        if name in sizes and value <= 0:
            raise ValueError(f"{name} must be greater than zero")


def rounded_prism(width: float, depth: float, length: float, radius: float,
                  z: float = 0.0) -> cq.Workplane:
    _validate_shape_values({"width": width, "depth": depth, "length": length, "radius": radius}, z=z)
    return (cq.Workplane("XY").rect(width, depth).extrude(length)
            .edges("|Z").fillet(radius).translate((0, 0, z)))


def box(width: float, depth: float, length: float, x: float = 0.0,
        y: float = 0.0, z: float = 0.0) -> cq.Workplane:
    _validate_shape_values({"width": width, "depth": depth, "length": length}, x=x, y=y, z=z)
    return (cq.Workplane("XY").box(width, depth, length,
                                   centered=(True, True, False))
            .translate((x, y, z)))


def cylinder(diameter: float, length: float, x: float = 0.0,
             y: float = 0.0, z: float = 0.0) -> cq.Workplane:
    _validate_shape_values({"diameter": diameter, "length": length}, x=x, y=y, z=z)
    return cq.Workplane("XY").circle(diameter / 2).extrude(length).translate((x, y, z))


def shape_bounds(part: cq.Workplane) -> cq.BoundBox:
    bounds = Bnd_Box()
    BRepBndLib.AddOptimal_s(part.val().wrapped, bounds, False, False)
    return cq.BoundBox(bounds)


def build_parts(d: Dimensions | None = None) -> dict[str, cq.Workplane]:
    d = d or Dimensions()
    sleeve = rounded_prism(d.width, d.thickness, SLEEVE_TOP_Z - 3, d.shell_radius, 3).cut(
        rounded_prism(21.6, 12.4, SLEEVE_TOP_Z - 1, 2.0, 2))
    sleeve = sleeve.cut(box(15.4, 3, 17.9, y=-7, z=90.3))
    sleeve = sleeve.cut(box(17.2, 1.6, 19.7, y=-7.6, z=89.4))
    # The lower screw block stays below the cell. The open channel accepts the cell from the front.
    carrier = rounded_prism(21, 11.8, 3, 1.5, 3)
    carrier = carrier.union(box(21, 1.05, 102, y=-5.375, z=6))
    for side in (-1, 1):
        carrier = carrier.union(box(0.9, 9.3, 69, x=side * 10.05, y=-0.2, z=6))
    carrier = carrier.union(box(21, 10.35, 1.0, y=-0.725, z=74))
    carrier = carrier.cut(box(7, 6, 2, y=0.0, z=73.5))
    # Four edge seats retain the PCB without assuming unverified hole positions.
    for side in (-1, 1):
        for pos in (78, 99):
            carrier = carrier.union(box(1.0, 4.2, 3, x=side * 10.0,
                                        y=-3.8, z=pos))
            carrier = carrier.union(box(0.3, 5.2, 3, x=side * 10.35,
                                        y=-3.3, z=pos))
    neck = rounded_prism(21.0, 11.8, SLEEVE_TOP_Z - 108, 1.5, 108)
    bezel = rounded_prism(d.width, d.thickness, d.length - SLEEVE_TOP_Z,
                          d.shell_radius, SLEEVE_TOP_Z).edges(">Z").chamfer(END_EDGE_CHAMFER)
    head = neck.union(bezel)
    head = head.cut(rounded_prism(10.4, 4.6, 9, 1.15, 108).translate((0, 1.2, 0)))
    head = head.cut(box(20.4, 1.4, 7.6, y=-1.2, z=107))
    # This larger internal cavity leaves the last 1 mm as the port-supporting front face.
    head = head.cut(box(19.8, 10.2, 7.0, z=108))
    carrier = carrier.union(head)
    carrier = carrier.intersect(rounded_prism(21, 11.8, SLEEVE_TOP_Z - 3, 1.7, 3).union(bezel))
    carrier = carrier.cut(box(15.4, 4, 17.9, y=-5, z=90.3))
    screen_support = box(16.5, 0.4, 17.9, y=-3.25, z=90.6)
    screen_support = screen_support.cut(box(12.4, 1, 2, y=-3.25, z=107.5))
    carrier = carrier.union(screen_support)
    for side in (-1, 1):
        carrier = carrier.union(box(0.5, 2.65, 18.5, x=side * 7.95, y=-4.375, z=90))
    for xpos in (-6, 6):
        carrier = carrier.cut(cylinder(1.6, 2.4, x=xpos, z=3))
    front_cover = box(20.7, 0.8, 68, y=4.95, z=6).intersect(
        rounded_prism(21, 11.8, 68, 1.7, 6))
    cap = rounded_prism(d.width, d.thickness, 3, d.shell_radius).edges("<Z").chamfer(END_EDGE_CHAMFER)
    for xpos in (-6, 6):
        cap = cap.cut(cylinder(2.3, 4, x=xpos, z=-0.5))
        cap = cap.cut(cylinder(4.2, 2.2, x=xpos))
    battery = rounded_prism(d.cell_width, d.cell_thickness, d.cell_length,
                            0.65, d.cell_z)
    pcb = box(d.pcb_width, d.pcb_thickness, d.pcb_length,
              y=d.pcb_y + d.pcb_thickness / 2, z=d.pcb_z)
    usb_outer = rounded_prism(9.0, 3.2, 8.8, 0.8, 106.7)
    usb_inner = rounded_prism(7.4, 1.7, 9.0, 0.65, 106.6)
    usb = usb_outer.cut(usb_inner).translate((0, 1.2, 0))
    tongue = box(6.6, 0.5, 5.8, y=1.2, z=109.3)
    refs = component_references(d)
    refs.update({"a30_unmeasured_reference": box(6, 6, 12, y=2.6, z=75.1),
                 "display_glass_reference": box(15, 1.2, 17.5, y=-4.05, z=90.5),
                 "display_active_reference": box(10.73, 0.03, 10.73, y=-4.675, z=93.885),
                 "display_lens_reference": box(16.8, 0.5, 19.3, y=-7.15, z=89.6),
                 "display_fpc_keepout_reference": box(12, 1.5, 5, y=-4, z=108)})
    return {**refs, "sleeve": sleeve, "carrier": carrier, "front_cover": front_cover,
            "bottom_cap": cap, "battery_reference": battery,
            "pcb_reference": pcb, "usb_reference": usb,
            "usb_tongue_reference": tongue}


def space_budget(parts: dict[str, cq.Workplane], d: Dimensions) -> dict:
    rounded_volume = rounded_prism(d.width, d.thickness, d.length, d.shell_radius).val().Volume()
    occupied_volume = sum(part.val().Volume() for part in parts.values())
    boundaries = (("Base and screw clearance", 0, d.cell_z),
                  ("Cell", d.cell_z, d.cell_z + d.cell_length),
                  ("Lead gap", d.cell_z + d.cell_length, d.pcb_z),
                  ("Electronics bay", d.pcb_z, d.pcb_z + d.pcb_length),
                  ("Port end", d.pcb_z + d.pcb_length, d.length))
    return {
        "external_box_volume_mm3": round(d.width * d.thickness * d.length, 3),
        "rounded_case_volume_mm3": round(rounded_volume, 3),
        "modeled_occupancy_mm3": round(occupied_volume, 3),
        "unallocated_volume_mm3": round(rounded_volume - occupied_volume, 3),
        "longitudinal_bays": [
            {"label": label, "start_z_mm": start, "end_z_mm": end, "length_mm": end - start}
            for label, start, end in boundaries
        ],
        "note": "Modeled occupancy includes solid parts and component reservations. Unallocated volume includes assembly clearances and space for circuits, connectors and wiring that are not designed. It is not a usable PCB volume or permission to reduce cell clearance.",
    }


def clearance_report(parts: dict[str, cq.Workplane], d: Dimensions) -> list[dict]:
    def distance(first: str, second: str) -> float:
        return round(parts[first].val().distance(parts[second].val()), 3)

    body = parts["carrier"].intersect(box(d.width, d.thickness, 105, z=3))
    cell = shape_bounds(parts["battery_reference"])
    rear_wall = parts["carrier"].intersect(box(19.2, 4, d.cell_length, y=-6, z=d.cell_z))
    side_walls = [parts["carrier"].intersect(box(
        d.width, d.thickness, cell.zlen,
        x=edge + side * d.width / 2, z=cell.zmin,
    )) for side, edge in ((-1, cell.xmin), (1, cell.xmax))]
    side_gap = min(parts["battery_reference"].val().distance(wall.val()) for wall in side_walls)
    entries = [
        ("sleeve_carrier", "Sleeve to carrier", round(body.val().distance(parts["sleeve"].val()), 3), "Running clearance below the head flange; printer tolerance unverified"),
        ("cell_side", "Cell to side wall", round(side_gap, 3), "Nominal cell only; swelling allowance unverified"),
        ("cell_front", "Cell to front cover", distance("battery_reference", "front_cover"), "Nominal cell only; swelling allowance unverified"),
        ("cell_back", "Cell to rear wall", round(parts["battery_reference"].val().distance(rear_wall.val()), 3), "Nominal cell only; swelling allowance unverified"),
        ("inductor_sleeve", "Inductor to sleeve", distance("inductor_reference", "sleeve"), "Maximum body plus solder; assembly and print tolerances unverified"),
        ("rear_cap_carrier", "Rear capacitors to carrier", min(distance(f"c{i}_reference", "carrier") for i in range(5, 11)), "Maximum body plus solder; assembly and print tolerances unverified"),
        ("display_cap", "OLED to rear capacitors", min(distance("display_glass_reference", f"c{i}_reference") for i in range(5, 11)), "Nominal panel position; PCB and panel placement tolerances unverified"),
        ("usb_output_pad", "USB shell to output pad", distance("usb_reference", "j3_pad_reference"), "Generic shell and bare pad only; solder joint, wire and connector feet are missing"),
    ]
    return [{"key": key, "label": label, "nominal_mm": gap, "status": status}
            for key, label, gap, status in entries]


def contract(d: Dimensions | None = None, parts: dict[str, cq.Workplane] | None = None) -> dict:
    d = d or Dimensions()
    parts = parts or build_parts(d)
    bounds = {name: shape_bounds(part) for name, part in parts.items()}

    def envelope(name: str) -> list[float]:
        shape = bounds[name]
        return [round(value, 3) for value in (shape.xlen, shape.ylen, shape.zlen)]

    def origin(name: str) -> list[float]:
        shape = bounds[name]
        return [round(value, 3) for value in (shape.xmin, shape.ymin, shape.zmin)]

    components = [bounds[name] for name in component_references(d)]
    clearances = clearance_report(parts, d)
    gaps = {entry["key"]: entry["nominal_mm"] for entry in clearances}
    return {
        "revision": "A-fit-prototype", "units": "mm",
        "coordinate_system": "x=width, y=thickness, z=length; base z=0; USB end z=116",
        "dimensions": asdict(d),
        "exterior": {"sleeve_z": [3.0, SLEEVE_TOP_Z],
                     "top_band_height_mm": d.length - SLEEVE_TOP_Z,
                     "end_edge_chamfer_mm": END_EDGE_CHAMFER},
        "space_budget": space_budget(parts, d),
        "clearances": clearances,
        "pcb": {"width": d.pcb_width, "length": d.pcb_length,
                "thickness": d.pcb_thickness, "origin": origin("pcb_reference"),
                "top_component_max_y": round(max(component.ymax for component in components), 3),
                "bottom_component_min_y": round(min(component.ymin for component in components), 3),
                "sleeve_inner_y": [-6.2, 6.2], "carrier_rear_face_y": -4.85,
                "head_internal_width_z108_to115": 19.8,
                "usb_reserved_zone": {"x": [-4.5, 4.5], "y": [-0.4, 2.8], "z": [106.7, 115.5]},
                "component_model": "U1, L1 and 1210 envelopes use manufacturer maximum bodies plus 0.1 mm solder; other bodies use unverified 1.0 mm installed-height allowances",
                "capacitor_1210_max_envelope": [CAPACITOR_WIDTH, CAPACITOR_HEIGHT_WITH_SOLDER,
                                               CAPACITOR_LENGTH],
                "capacitor_dimensions_source": "https://www.murata.com/en-global/api/pdfdownloadapi?cate=luCeramicCapacitorsSMD&partno=GRM32ER71E226KE15%23",
                "component_placement_source": "electronics/boost-prototype/component-placement.json",
                "unselected_component_height_allowance": 1.0,
                "unselected_component_height_status": "visual allowance only; exact parts and heights unverified",
                "edge_seat_keepouts": [
                    {"x_abs_min": 9.5, "z_min": 78, "z_max": 81},
                    {"x_abs_min": 9.5, "z_min": 99, "z_max": 102}],
                "status": "placement envelope; complete charger/PD/protection integration unverified"},
        "cell": {"model": "GNB8501S60WHV", "envelope": envelope("battery_reference"),
                 "origin": origin("battery_reference"),
                 "minimum_radial_clearance_each_side": gaps["cell_side"],
                 "back_clearance": gaps["cell_back"], "front_clearance": gaps["cell_front"],
                 "lead_bay_z": [round(bounds["battery_reference"].zmax, 3), round(bounds["pcb_reference"].zmin, 3)],
                 "status": "nominal envelope; tabs, lead exit, swelling allowance need sample measurement"},
        "usb": {"opening": [10.4, 4.6], "mouth_z": 115.5,
                "recess": 0.5, "center_y": 1.2, "status": "generic receptacle envelope; match purchased connector drawing; solder joints, wires and connector feet are not modeled"},
        "a30_reference": {"envelope": envelope("a30_unmeasured_reference"),
                          "origin": origin("a30_unmeasured_reference"),
                          "status": "unmeasured generic envelope; not a supplier drawing or verified lead bend"},
        "display": {"candidate": "RB060-6464TDDBG01", "technology": "colour OLED",
                    "glass_envelope": envelope("display_glass_reference"),
                    "glass_origin": origin("display_glass_reference"),
                    "active_area": [round(bounds["display_active_reference"].xlen, 3),
                                    round(bounds["display_active_reference"].zlen, 3)], "resolution_px": [64, 64],
                    "active_area_position": "centred visual reference; drawing unverified",
                    "outward_normal": [0, -1, 0],
                    "lens_envelope": envelope("display_lens_reference"),
                    "lens_origin": origin("display_lens_reference"),
                    "fpc_keepout_envelope": envelope("display_fpc_keepout_reference"),
                    "fpc_keepout_origin": origin("display_fpc_keepout_reference"),
                    "source": "https://www.ronboe.com/shop/rb060-6464tddbg01/",
                    "status": "provisional fit; FPC drawing, connector, controller, retention and thermal isolation unverified",
                    "assembly": "panel stays on carrier; lens stays on sleeve during sleeve removal; remove lens to extract panel through rear opening",
                    "panel_retention": "edge adhesive in 0.2 mm side clearance; material and retention strength unverified",
                    "lens_retention": "0.1 mm bond allowance; adhesive and service method unverified"},
        "fasteners": {"quantity": 2, "type": "M2 x 3 socket-head cap screw",
                      "max_head_diameter": 4.0, "max_head_height": 2.0,
                      "pilot_diameter": 1.6, "pilot_depth": 2.4,
                      "positions_xy": [[-6, 0], [6, 0]],
                      "status": "prototype plastic threads; retention untested"},
        "limits": ["Fit model only. Do not infer 25 W thermal capability.",
                   "Battery is a reference solid, not a printable part.",
                   "PCB, USB and components are reference envelopes, not an assembled electrical design.",
                   "0.6 mm cell clearance is design allowance, not a validated swelling specification.",
                   "Do not machine this printed sleeve design directly in aluminium without adding insulation and revising retention."]
    }


def validate_parts(parts: dict[str, cq.Workplane]) -> None:
    for name, part in parts.items():
        solid = part.val()
        if not solid.isValid() or len(part.solids().vals()) != 1 or solid.Volume() <= 0:
            raise ValueError(f"{name} must be one valid solid with positive volume")
    for first, second in combinations(parts, 2):
        overlap = parts[first].intersect(parts[second]).val().Volume()
        if overlap > 0.001:
            raise ValueError(f"{first} intersects {second} by {overlap:.3f} mm^3")


def validate_sleeve_removal(parts: dict[str, cq.Workplane], d: Dimensions | None = None) -> None:
    d = d or Dimensions()
    # This uninterrupted shell covers every sleeve position on the downward removal path.
    travel = SLEEVE_TOP_Z
    swept_shell = rounded_prism(d.width, d.thickness, SLEEVE_TOP_Z - 3 + travel,
                               d.shell_radius, 3 - travel)
    swept_shell = swept_shell.cut(rounded_prism(21.6, 12.4, SLEEVE_TOP_Z - 1 + travel,
                                               2.0, 2 - travel))
    for name, part in parts.items():
        if name in {"sleeve", "bottom_cap", "display_lens_reference"}:
            continue
        if swept_shell.intersect(part).val().Volume() > 0.001:
            raise ValueError(f"Sleeve removal path intersects {name}")
    if parts["display_lens_reference"].cut(swept_shell).val().Volume() > 0.001:
        raise ValueError("Sleeve lens projects into the continuous removal clearance")


def validate_enclosure(parts: dict[str, cq.Workplane], d: Dimensions | None = None) -> None:
    d = d or Dimensions()
    envelope = rounded_prism(d.width, d.thickness, d.length, d.shell_radius)
    for name, part in parts.items():
        if part.cut(envelope).val().Volume() > 0.001:
            raise ValueError(f"{name} extends outside the enclosure")


def build_print_parts(parts: dict[str, cq.Workplane]) -> dict[str, cq.Workplane]:
    result = {}
    for name in PRINTED_PARTS:
        part = parts[name]
        if name == "front_cover":
            part = part.rotate((0, 0, 0), (1, 0, 0), 90)
        elif name == "bottom_cap":
            part = part.rotate((0, 0, 0), (1, 0, 0), 180)
        result[name] = part.translate((0, 0, -shape_bounds(part).zmin))
    return result


def print_mesh_report(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 84:
        raise ValueError(f"{path.name} is not a binary STL")
    count = struct.unpack_from("<I", data, 80)[0]
    if count == 0 or len(data) != 84 + 50 * count:
        raise ValueError(f"{path.name} has an invalid STL triangle count")
    edges = Counter()
    directed_edges = Counter()
    edge_triangles: dict[tuple, list[int]] = {}
    volumes = []
    minimum_z = math.inf
    for triangle, record in enumerate(struct.iter_unpack("<12fH", data[84:])):
        vertices = [tuple(record[offset:offset + 3]) for offset in (3, 6, 9)]
        if not all(math.isfinite(coordinate) for vertex in vertices for coordinate in vertex):
            raise ValueError(f"{path.name} has a nonfinite vertex")
        a, b, c = vertices
        ab = tuple(b[index] - a[index] for index in range(3))
        ac = tuple(c[index] - a[index] for index in range(3))
        normal = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
                  ab[0] * ac[1] - ab[1] * ac[0])
        if not any(normal):
            raise ValueError(f"{path.name} has a zero-area triangle")
        cross = (b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0])
        volumes.append(sum(a[index] * cross[index] for index in range(3)) / 6)
        minimum_z = min(minimum_z, *(vertex[2] for vertex in vertices))
        for start, end in ((a, b), (b, c), (c, a)):
            if start == end:
                raise ValueError(f"{path.name} has a collapsed triangle edge")
            edge = tuple(sorted((start, end)))
            edges[edge] += 1
            edge_triangles.setdefault(edge, []).append(triangle)
            directed_edges[(start, end)] += 1
    watertight = all(value == 2 for value in edges.values())
    winding = all(directed_edges[(start, end)] == directed_edges[(end, start)] == 1
                  for start, end in edges)
    volume = math.fsum(volumes)
    if not watertight or not winding or volume <= 0 or not -0.001 <= minimum_z <= 0.035:
        raise ValueError(f"{path.name} must be watertight, consistently wound, positive-volume and on the build plane")
    neighbors = [set() for _ in range(count)]
    for first, second in edge_triangles.values():
        neighbors[first].add(second)
        neighbors[second].add(first)
    reached = {0}
    pending = [0]
    while pending:
        for neighbor in neighbors[pending.pop()] - reached:
            reached.add(neighbor)
            pending.append(neighbor)
    if len(reached) != count:
        raise ValueError(f"{path.name} contains disconnected mesh shells")
    return {"watertight": watertight, "winding_consistent": winding,
            "connected": True, "volume_mm3": round(volume, 3),
            "min_z_mm": round(minimum_z, 6), "triangles": count}


def _write_exports(output: Path, parts: dict[str, cq.Workplane]) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    colors = {"sleeve": (0.25, 0.27, 0.30), "carrier": (0.12, 0.13, 0.15),
              "front_cover": (0.15, 0.16, 0.18), "bottom_cap": (0.12, 0.13, 0.15),
              "battery_reference": (0.72, 0.73, 0.75), "pcb_reference": (0.03, 0.2, 0.14),
              "usb_reference": (0.75, 0.76, 0.79), "usb_tongue_reference": (0.1, 0.1, 0.1),
              "display_glass_reference": (0.03, 0.04, 0.05),
              "display_active_reference": (0.03, 0.16, 0.20),
              "display_lens_reference": (0.65, 0.76, 0.8, 0.12),
              "display_fpc_keepout_reference": (0.85, 0.5, 0.15, 0.25)}
    assembly = cq.Assembly(name="Spark_A_fit_prototype")
    report = {}
    for name, part in parts.items():
        solid = part.val()
        bounds = shape_bounds(part)
        cq.exporters.export(part, str(output / f"{name}.step"))
        cq.exporters.export(part, str(output / f"{name}.stl"), tolerance=0.035, angularTolerance=0.12)
        fallback_color = (0.75, 0.57, 0.18) if name.endswith("pad_reference") else (0.18, 0.19, 0.22)
        assembly.add(part, name=name, color=cq.Color(*colors.get(name, fallback_color)))
        report[name] = {"valid": solid.isValid(), "solids": len(part.solids().vals()),
                        "volume_mm3": round(solid.Volume(), 3),
                        "bounds_mm": [round(bounds.xlen, 3), round(bounds.ylen, 3), round(bounds.zlen, 3)]}
    print_dir = output.parent / "print_parts"
    print_dir.mkdir(exist_ok=True)
    for name, print_part in build_print_parts(parts).items():
        cq.exporters.export(print_part, str(print_dir / f"{name}.stl"), tolerance=0.035, angularTolerance=0.12)
    mesh_report = {f"{name}.stl": print_mesh_report(print_dir / f"{name}.stl") for name in PRINTED_PARTS}
    (output / "print-mesh-report.json").write_text(json.dumps(mesh_report, indent=2) + "\n")
    assembly.export(str(output / "spark_assembly.step"))
    assembly.export(str(output / "spark_assembly.glb"))
    (output.parent / "mechanical-contract.json").write_text(json.dumps(contract(parts=parts), indent=2) + "\n")
    (output / "geometry-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def obsolete_exports(output: Path, current_outputs: dict[str, str]) -> list[Path]:
    previous_report = output / "build-report.json"
    if not previous_report.exists():
        return []
    previous_outputs = json.loads(previous_report.read_text())["output"]
    base = ROOT if output.is_relative_to(ROOT) else output.parent
    obsolete = []
    for name, expected in previous_outputs.items():
        if name in current_outputs:
            continue
        path = base / name
        owned = (path.parent == output and path.suffix in {".step", ".stl"}
                 or path.parent == output.parent / "print_parts" and path.suffix == ".stl")
        if not owned or not path.exists():
            continue
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Obsolete CAD export has local changes: {path}")
        obsolete.append(path)
    return obsolete


def export_all(output: Path) -> dict:
    output = output.resolve()
    inputs = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in (Path(__file__).resolve(), PLACEMENT_FILE,
                           Path(__file__).with_name("requirements.txt"),
                           Path(__file__).with_name("publish_assets.py"))}
    parts = build_parts()
    validate_parts(parts)
    validate_enclosure(parts)
    validate_sleeve_removal(parts)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".spark-cad-", dir=output.parent) as temporary:
        stage = Path(temporary)
        report = _write_exports(stage / output.name, parts)
        staged_files = sorted(path for path in stage.rglob("*") if path.is_file())
        outputs = {}
        for path in staged_files:
            target = output.parent / path.relative_to(stage)
            relative = target.relative_to(ROOT) if target.is_relative_to(ROOT) else path.relative_to(stage)
            outputs[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        if any(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != value
               for name, value in inputs.items()):
            raise ValueError("CAD inputs changed during export; rebuild after edits finish")
        obsolete = obsolete_exports(output, outputs)
        build_report = stage / "build-report.json"
        build_report.write_text(json.dumps({"inputs": inputs, "output": outputs}, indent=2) + "\n")
        publication = {path: output.parent / path.relative_to(stage) for path in staged_files}
        publication[build_report] = output / "build-report.json"
        publish_files(publication, obsolete)
    return report


if __name__ == "__main__":
    print(json.dumps(export_all(Path(__file__).parent / "exports"), indent=2))
