from __future__ import annotations

import csv
import json
import re
from itertools import pairwise
from pathlib import Path

from circuit_checks import validate_circuit

ROOT = Path(__file__).resolve().parent
COMPONENTS: dict[str, dict] = {}
NETS: dict[str, int] = {}
PARTS: list[str] = []
PADS: dict[tuple[str, str], tuple[float, float]] = {}
TRACKS: list[str] = []
PLACEMENTS: list[dict] = []
LIB = ROOT / "Spark.pretty"


def xy(x: float, y: float) -> str:
    return f"{x:.4f} {y:.4f}"


def quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def pad(
    ref: str,
    num: str,
    x: float,
    y: float,
    w: float,
    h: float,
    net: str,
    through: bool = False,
    back: bool = False,
) -> str:
    PADS.setdefault((ref, num), (x, y))
    mode = "thru_hole circle" if through else "smd rect"
    layers = (
        '"*.Cu" "*.Mask"'
        if through
        else ('"B.Cu" "B.Paste" "B.Mask"' if back else '"F.Cu" "F.Paste" "F.Mask"')
    )
    drill = "(drill 1.5)" if through else ""
    return f'(pad "{num}" {mode} (at {xy(x, y)}) (size {xy(w, h)}) {drill} (layers {layers}) (net {NETS[net]} {quote(net)}))'


def part(
    ref: str,
    footprint: str,
    pads: list[tuple[str, float, float, float, float]],
    body: tuple[float, float, float, float],
    through: bool = False,
    back: bool = False,
) -> None:
    c = COMPONENTS[ref]
    footprint = f"{ref}_{footprint}"
    if c["footprint"] != f"Spark:{footprint}":
        raise ValueError(f"{ref} footprint does not match this board generator")
    x0, y0, x1, y1 = body
    height = 6.0 if ref == "L1" else 1.0 if ref == "U1" else 2.7 if "1210" in footprint else None
    PLACEMENTS.append({
        "reference": ref,
        "value": c["value"],
        "side": "back" if back else "front",
        "body_bounds_board_xy_mm": [x0, y0, x1, y1],
        "body_xy_basis": "manufacturer maximum" if ref in {"U1", "L1"} or "1210" in footprint else "nominal reference; exact part not qualified",
        "maximum_body_height_mm": height,
        "height_basis": "manufacturer maximum; add solder allowance" if height is not None else "unverified",
        "is_pcb_feature": c["kind"] in {"jumper", "testpoint"},
    })
    lines = [
        f'(footprint "Spark:{footprint}" (layer "F.Cu") (at 0 0)',
        f'(property "Reference" "{ref}" (at {xy((x0 + x1) / 2, y0 - 0.7)}) (layer "F.Fab") (effects (font (size .65 .65) (thickness .1))))',
        f'(property "Value" {quote(c["value"])} (at {xy((x0 + x1) / 2, (y0 + y1) / 2)}) (layer "F.Fab") hide (effects (font (size .6 .6) (thickness .1))))',
        f"(attr {'through_hole' if through else 'smd'})",
        f'(fp_rect (start {xy(x0, y0)}) (end {xy(x1, y1)}) (stroke (width .1) (type default)) (fill none) (layer "F.Fab"))',
    ]
    for num, x, y, w, h in pads:
        lines.append(pad(ref, num, x, y, w, h, c["pins"][num], through, back))
    bounds = (
        min(x - w / 2 for _, x, _, w, _ in pads),
        min(y - h / 2 for _, _, y, _, h in pads),
        max(x + w / 2 for _, x, _, w, _ in pads),
        max(y + h / 2 for _, _, y, _, h in pads),
    )
    ex0, ey0, ex1, ey1 = (
        min(x0, bounds[0]) - 0.1,
        min(y0, bounds[1]) - 0.1,
        max(x1, bounds[2]) + 0.1,
        max(y1, bounds[3]) + 0.1,
    )
    lines.append(
        f'(fp_rect (start {xy(ex0, ey0)}) (end {xy(ex1, ey1)}) (stroke (width .05) (type default)) (fill none) (layer "F.CrtYd"))'
    )
    lines.append(")")
    text = "\n".join(lines)
    if back:
        text = (
            text.replace('(layer "F.Cu")', '(layer "B.Cu")')
            .replace('(layer "F.SilkS")', '(layer "B.SilkS")')
            .replace('(layer "F.Fab")', '(layer "B.Fab")')
            .replace('(layer "F.CrtYd")', '(layer "B.CrtYd")')
        )
    center = ((x0 + x1) / 2, (y0 + y1) / 2)

    def rebase(m: re.Match[str]) -> str:
        return f"({m[1]} {xy(float(m[2]) - center[0], float(m[3]) - center[1])}"

    text = re.sub(r"\((at|start|end) (-?[\d.]+) (-?[\d.]+)", rebase, text)
    text = text.replace(f"(at {xy(-center[0], -center[1])})", f"(at {xy(*center)})", 1)
    if back:
        text = text.replace("(thickness .1))))", "(thickness .1)) (justify mirror)))")
    libtext = re.sub(r'\(net \d+ "(?:[^"\\]|\\.)*"\)', "", text)
    libtext = libtext.replace(f"(at {xy(*center)})", "", 1)
    (LIB / f"{footprint}.kicad_mod").write_text(libtext)
    PARTS.append(text)


def two(
    ref: str,
    p1: tuple[float, float],
    p2: tuple[float, float],
    size: tuple[float, float] = (0.6, 0.6),
    package: str = "0402",
    back: bool = False,
) -> None:
    w, h = size
    padlist = [("1", *p1, w, h), ("2", *p2, w, h)]
    center = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    length, width = {
        "0402": (1, 0.5),
        "0603": (1.6, 0.8),
        "1210": (3.5, 2.7),
        "SolderJumper_OPEN": (1.7, 0.8),
    }[package]
    hx, hy = (length / 2, width / 2) if p1[1] == p2[1] else (width / 2, length / 2)
    part(
        ref,
        f"{ref[0]}_{package}",
        padlist,
        (center[0] - hx, center[1] - hy, center[0] + hx, center[1] + hy),
        back=back,
    )


def track(
    net: str, points: list[tuple[float, float]], width: float = 0.2, layer: str = "F.Cu"
) -> None:
    for a, b in pairwise(points):
        if a != b:
            TRACKS.append(
                f'(segment (start {xy(*a)}) (end {xy(*b)}) (width {width}) (layer "{layer}") (net {NETS[net]}))'
            )


def via(net: str, x: float, y: float, size: float = 0.5, drill: float = 0.25) -> None:
    TRACKS.append(
        f'(via (at {xy(x, y)}) (size {size}) (drill {drill}) (layers "F.Cu" "B.Cu") (net {NETS[net]}))'
    )


def plane(
    net: str, layer: str, rect: tuple[float, float, float, float], priority: int = 0
) -> str:
    x0, y0, x1, y1 = rect
    return f'(zone (net {NETS[net]}) (net_name {quote(net)}) (layer "{layer}") (hatch edge .5) (priority {priority}) (connect_pads yes (clearance .18)) (min_thickness .15) (fill yes (thermal_gap .3) (thermal_bridge_width .3)) (polygon (pts (xy {xy(x0, y0)}) (xy {xy(x1, y0)}) (xy {xy(x1, y1)}) (xy {xy(x0, y1)}))))'


def main() -> None:
    data = json.loads((ROOT / "circuit.json").read_text())
    COMPONENTS.clear()
    COMPONENTS.update(validate_circuit(data))
    NETS.clear()
    NETS.update({name: i + 1 for i, name in enumerate(sorted({
        net for component in data["components"] for net in component["pins"].values()
    }))})
    PARTS.clear()
    PADS.clear()
    TRACKS.clear()
    PLACEMENTS.clear()
    LIB.mkdir(exist_ok=True)
    cx, cy = 10.0, 16.0
    lands = [
        ("1", -1.4125, -0.875, 0.575, 0.25),
        ("1", -1.2375, -1.10, 0.225, 0.70),
        ("2", -1.425, -0.375, 0.55, 0.25),
        ("3", -1.075, 0.2, 1.25, 0.4),
        ("3", -0.65, 0.725, 0.4, 1.45),
        ("4", 0, 0.25, 0.4, 1.0),
        ("5", 1.075, 0.2, 1.25, 0.4),
        ("5", 0.65, 0.725, 0.4, 1.45),
        ("6", 1.425, -0.375, 0.55, 0.25),
        ("7", 1.4125, -0.875, 0.575, 0.25),
        ("7", 1.2375, -1.10, 0.225, 0.70),
        ("8", 0.75, -1.175, 0.25, 0.55),
        ("9", 0.25, -1.175, 0.25, 0.55),
        ("10", -0.25, -1.175, 0.25, 0.55),
        ("11", -0.75, -1.175, 0.25, 0.55),
    ]
    part(
        "U1",
        "TPS61288_RQQ0011A",
        [(n, cx + x, cy + y, w, h) for n, x, y, w, h in lands],
        (8.45, 14.7, 11.55, 17.3),
    )
    part(
        "L1",
        "Coilcraft_XAL1060",
        [("1", 10, 27.325, 9, 2.38), ("2", 10, 20.675, 9, 2.38)],
        (4.1, 18.75, 15.9, 29.25),
    )
    two("C1", (3.2, 31), (3.2, 33.8), (2.8, 1.5), "1210")
    two("C2", (15, 13), (15, 14))
    two("C3", (8.1, 13.3), (6.45, 13.3), (0.9, 0.95), "0603")
    two("C4", (12.2, 13.3), (11.2, 13.3))
    for ref, x, y in [
        ("C5", 4.5, 8),
        ("C6", 9.5, 8),
        ("C7", 14.5, 8),
        ("C8", 4.5, 12.5),
        ("C9", 9.5, 12.5),
        ("C10", 14.5, 12.5),
    ]:
        two(ref, (x, y - 1.4), (x, y + 1.4), (2.8, 1.5), "1210", back=True)
    two("R1", (3.5, 11), (4.5, 11))
    two("R2", (5.5, 15.125), (4.5, 15.125))
    two("R3", (5.5, 17), (4.5, 17))
    two("JP1", (1.8, 17), (2.8, 17), (0.7, 0.8), "SolderJumper_OPEN")
    two("R4", (6, 20), (5, 20), back=True)
    two("C11", (3, 22), (2, 22), back=True)
    two("C12", (8, 22), (7, 22), back=True)
    two("R5", (17, 24), (18, 24))
    for ref, x, y in [
        ("J1", 5, 3),
        ("J2", 15, 3),
        ("J3", 13, 35),
        ("J4", 17, 35),
        ("J5", 17, 19),
    ]:
        side = 1.5 if ref == "J5" else 3
        part(
            ref,
            "WirePad",
            [("1", x, y, side, side)],
            (x - side / 2, y - side / 2, x + side / 2, y + side / 2),
            ref != "J5",
        )
    track("SW", [(10, 16.25), (10, 17.8)], 0.4)
    track("SW", [(10, 17.8), (10, 18.6)], 0.8)
    track("SW", [(10, 18.6), (10, 20.675)], 2.0)
    track("SW", [(10.25, 14.825), (10.25, 15.5), (10, 15.75), (10, 16.25)], 0.18)
    track("SW", [(11.2, 13.3), (10.25, 13.3), (10.25, 14.825)], 0.18)
    track("BST", [(10.75, 14.825), (10.75, 14.0), (12.2, 14.0), (12.2, 13.3)], 0.18)
    track("VCC", [(9.25, 14.825), (9.25, 13.3), (8.1, 13.3)], 0.18)
    track(
        "VIN",
        [(11.4125, 15.125), (12.9, 15.125), (14.6, 13.425), (14.6, 13), (15, 13)],
        0.18,
    )
    via("VIN", 15.6, 12.5)
    track("VIN", [(15, 13), (15.6, 12.5)], 0.25)
    track("VOUT", [(11.075, 16.2), (13.5, 16.2)], 0.6)
    for x, y in [(12.4, 16.2), (13, 16.2), (13.5, 16.2)]:
        via("VOUT", x, y)
    for ref in ["C5", "C6", "C7", "C8", "C9", "C10"]:
        x, y = PADS[(ref, "2")]
        if ref == "C8":
            via("GND", 4.5, 13.9)
        elif ref == "C9":
            via("GND", 9.75, 14.1, 0.4, 0.2)
        elif ref == "C10":
            via("GND", 14.7, 14.4)
        else:
            via("GND", x - 0.6, y)
            via("GND", x + 0.6, y)
    for x, y in [(8.1, 16.2), (8.8, 17.7)]:
        via("GND", x, y)
    track("GND", [(8.925, 16.2), (8.1, 16.2)], 0.5)
    track("GND", [(9.35, 16.725), (9.35, 17.3), (8.8, 17.7)], 0.4)
    track("GND", [(9.75, 14.825), (9.75, 14.1)], 0.15)
    for ref, pin in [
        ("C1", "2"),
        ("C2", "2"),
        ("C3", "2"),
        ("R2", "2"),
        ("JP1", "2"),
        ("C11", "2"),
        ("R5", "2"),
    ]:
        x, y = PADS[(ref, pin)]
        via("GND", x, y)
    via("GND", 7, 23)
    track("GND", [(7, 22), (7, 23)], 0.2, "B.Cu")
    for x in [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5]:
        via("VIN", x, 27.325, 0.6, 0.3)
    for x in [2.7, 3.7]:
        via("VIN", x, 31, 0.6, 0.3)
    track("FB", [(8.5875, 15.125), (5.5, 15.125)], 0.15)
    track("FB", [(4.5, 11), (5.5, 12), (5.5, 15.125)], 0.15)
    track("FB", [(5.5, 17), (6.5, 17), (6.5, 15.125)], 0.15)
    via("VOUT", 3.5, 11)
    track("SEL9", [(4.5, 17), (4.5, 18), (1.8, 18), (1.8, 17)], 0.15)
    track("COMP", [(8.575, 15.625), (7.3, 15.625), (7.3, 16.3)], 0.15)
    via("COMP", 7.3, 16.3, 0.45, 0.2)
    track("COMP", [(7.3, 16.3), (8, 17), (8, 22)], 0.15, "B.Cu")
    track("COMP", [(8, 20), (6, 20)], 0.15, "B.Cu")
    track("COMP_Z", [(5, 20), (4.5, 20.5), (4.5, 22), (3, 22)], 0.15, "B.Cu")
    track(
        "EN",
        [(11.425, 15.625), (13.1, 15.625), (14.9, 15.625), (17, 17.725), (17, 24)],
        0.15,
    )
    for x, y in [(1, 1), (19, 1), (1, 37), (19, 37), (1, 29), (18, 30)]:
        via("GND", x, y)
    zones = [
        plane("GND", "In1.Cu", (0.3, 0.3, 19.7, 37.7)),
        plane("VIN", "In2.Cu", (0.3, 0.3, 19.7, 37.7)),
        plane("GND", "F.Cu", (0.3, 0.3, 19.7, 37.7)),
        plane("VOUT", "B.Cu", (0.3, 0.3, 19.7, 37.7)),
    ]
    edge = "\n".join(
        f'(gr_line (start {xy(*a)}) (end {xy(*b)}) (stroke (width .05) (type default)) (layer "Edge.Cuts"))'
        for a, b in [
            ((0, 0), (20, 0)),
            ((20, 0), (20, 38)),
            ((20, 38), (0, 38)),
            ((0, 38), (0, 0)),
        ]
    )
    text = '(gr_text "SPARK BOOST A\\nBENCH ONLY 5V/9V\\nNO USB / NO CELL" (at 10 7.5) (layer "F.SilkS") (effects (font (size .8 .8) (thickness .12))))'
    labels = "\n".join(
        f'(gr_text "{label}" (at {xy(x, y)}) (layer "F.SilkS") (effects (font (size .8 .8) (thickness .12))))'
        for label, x, y in [
            ("VIN+", 5, 0.75), ("GND", 15, 0.75),
            ("OUT+", 12.5, 37.2), ("GND", 17.5, 37.2),
            ("EN", 17, 21), ("9V", 2, 15.2), ("OPEN\\n5V", 2.2, 20.5),
            ("SW", 13.5, 18.1),
        ]
    )
    labels += '\n(gr_circle (center 8.1 14.4) (end 8.25 14.4) (stroke (width .1) (type default)) (fill solid) (layer "F.SilkS"))'
    head = '(kicad_pcb (version 20241229) (generator "spark_generator") (general (thickness 1.0)) (paper "A4") (layers (0 "F.Cu" signal) (2 "In1.Cu" signal) (4 "In2.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (34 "B.Paste" user) (35 "F.Paste" user) (46 "B.CrtYd" user) (47 "F.CrtYd" user) (48 "B.Fab" user) (49 "F.Fab" user)) (setup (pad_to_mask_clearance .03))'
    stackup = '''(stackup
        (layer "F.SilkS" (type "Top Silk Screen"))
        (layer "F.Paste" (type "Top Solder Paste"))
        (layer "F.Mask" (type "Top Solder Mask"))
        (layer "F.Cu" (type "copper") (thickness 0.07))
        (layer "dielectric 1" (type "prepreg") (thickness 0.14) (material "FR4"))
        (layer "In1.Cu" (type "copper") (thickness 0.035))
        (layer "dielectric 2" (type "core") (thickness 0.51) (material "FR4"))
        (layer "In2.Cu" (type "copper") (thickness 0.035))
        (layer "dielectric 3" (type "prepreg") (thickness 0.14) (material "FR4"))
        (layer "B.Cu" (type "copper") (thickness 0.07))
        (layer "B.Mask" (type "Bottom Solder Mask"))
        (layer "B.Paste" (type "Bottom Solder Paste"))
        (layer "B.SilkS" (type "Bottom Silk Screen"))
        (dielectric_constraints no))'''
    head = head.replace('(setup ', f'(setup {stackup} ')
    nets = "\n".join(f'(net {n} {quote(name)})' for name, n in NETS.items())
    (ROOT / "spark_boost_rev_a.kicad_pcb").write_text(
        "\n".join([head, nets, *PARTS, *TRACKS, *zones, edge, text, labels, ")"])
    )
    (ROOT / "component-placement.json").write_text(json.dumps({
        "coordinates": "KiCad board XY in millimetres; origin at top-left board corner",
        "board_mm": [20, 38, 1],
        "components": PLACEMENTS,
    }, indent=2) + "\n")
    (ROOT / "fp-lib-table").write_text(
        '(fp_lib_table (lib (name "Spark")(type "KiCad")(uri "${KIPRJMOD}/Spark.pretty")(options "")(descr "Spark prototype footprints")))\n'
    )
    with (ROOT / "BOM.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Reference", "Quantity", "Value", "Manufacturer", "MPN", "Footprint", "Status", "Source"])
        for component in data["components"]:
            pcb_feature = component["kind"] in {"jumper", "testpoint"}
            status = component.get("qualification", "Specification only; exact manufacturer part and ratings still require selection")
            if pcb_feature:
                status = "PCB feature; no purchased component"
            writer.writerow([
                component["ref"], 0 if pcb_feature else 1, component["value"],
                component.get("manufacturer", ""), component.get("mpn", ""),
                component["footprint"], status, component.get("source", ""),
            ])
    print(
        f"Wrote {len(PARTS)} components and {len(TRACKS)} copper items to spark_boost_rev_a.kicad_pcb"
    )


if __name__ == "__main__":
    main()
