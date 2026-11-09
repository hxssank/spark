from __future__ import annotations

import json
import uuid
from pathlib import Path

from circuit_checks import validate_circuit

ROOT = Path(__file__).resolve().parent
PROJECT = "spark_boost_rev_a"
NAMESPACE = uuid.UUID("65de1cf6-47b8-498c-bf17-8d04856bcd9d")


def uid(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE, name))


def quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def effects(size: float = 1.0, hidden: bool = False) -> str:
    return f'(effects (font (size {size} {size})){" (hide yes)" if hidden else ""})'


def pin(number: str, name: str, x: float, y: float, angle: int,
        electrical: str = "passive", length: float = 3.81) -> str:
    return (f'(pin {electrical} line (at {x} {y} {angle}) (length {length}) '
            f'(name {quote(name)} {effects(0.95)}) '
            f'(number {quote(number)} {effects(0.85)}))')


def symbol_definition(kind: str) -> str:
    prefix = "U" if kind == "ic" else "PWR" if kind == "flag" else "X"
    name = f"Spark:{kind}"
    props = (f'(property "Reference" "{prefix}" (at 0 5.08 0) {effects()}) '
             f'(property "Value" "{kind}" (at 0 -5.08 0) {effects()})')
    if kind == "ic":
        left = [("7", "VIN", "power_in"), ("6", "EN", "input"),
                ("1", "FB", "input"), ("2", "COMP", "output"),
                ("10", "AGND", "power_in"), ("3", "PGND", "power_in")]
        right = [("4", "SW", "passive"), ("9", "SW", "passive"),
                 ("8", "BST", "passive"), ("5", "VOUT", "power_out"),
                 ("11", "VCC", "power_out")]
        graphic = '(rectangle (start -10.16 17.78) (end 10.16 -17.78) (stroke (width 0.254) (type default)) (fill (type background)))'
        pins = " ".join(pin(n, label, -15.24, 12.7 - i * 5.08, 0, typ, 5.08)
                        for i, (n, label, typ) in enumerate(left))
        pins += " " + " ".join(pin(n, label, 15.24, 12.7 - i * 5.08, 180, typ, 5.08)
                                for i, (n, label, typ) in enumerate(right))
    elif kind == "flag":
        graphic = '(polyline (pts (xy 0 0) (xy -1.27 1.27) (xy 1.27 1.27) (xy 0 0)) (stroke (width 0) (type default)) (fill (type none)))'
        pins = pin("1", "PWR_FLAG", 0, 0, 90, "power_out", 0)
    elif kind == "testpoint":
        graphic = '(circle (center 0 0) (radius 1.27) (stroke (width 0.254) (type default)) (fill (type none)))'
        pins = pin("1", "1", -5.08, 0, 0)
    else:
        if kind == "capacitor":
            graphic = " ".join(f'(polyline (pts (xy {x} -1.8) (xy {x} 1.8)) (stroke (width 0.3) (type default)) (fill (type none)))' for x in [-1.27, 1.27])
        elif kind == "jumper":
            graphic = " ".join(f'(circle (center {x} 0) (radius 0.65) (stroke (width 0.254) (type default)) (fill (type none)))' for x in [-1.27, 1.27])
        else:
            graphic = '(rectangle (start -1.27 -1.27) (end 1.27 1.27) (stroke (width 0.254) (type default)) (fill (type none)))'
        pins = pin("1", "1", -5.08, 0, 0) + " " + pin("2", "2", 5.08, 0, 180)
    on_board = "no" if kind == "flag" else "yes"
    return (f'(symbol {quote(name)} (pin_names (offset 0.8){"" if kind == "ic" else " (hide yes)"}) '
            f'(in_bom {on_board}) (on_board {on_board}) {props} '
            f'(symbol "{kind}_0_1" {graphic}) (symbol "{kind}_1_1" {pins}))')


def pin_locations(kind: str) -> dict[str, tuple[float, float]]:
    if kind == "ic":
        left = ["7", "6", "1", "2", "10", "3"]
        right = ["4", "9", "8", "5", "11"]
        return {**{n: (-15.24, -12.7 + i * 5.08) for i, n in enumerate(left)},
                **{n: (15.24, -12.7 + i * 5.08) for i, n in enumerate(right)}}
    if kind == "flag":
        return {"1": (0, 0)}
    return {"1": (-5.08, 0)} if kind == "testpoint" else {"1": (-5.08, 0), "2": (5.08, 0)}


def footprint(component: dict) -> str:
    if component["kind"] == "flag":
        return ""
    if "footprint" in component:
        return component["footprint"]
    ref = component["ref"]
    if ref == "U1":
        return "Spark:TPS61288_RQQ0011A"
    if component["kind"] == "capacitor":
        size = "1210" if "1210" in component["value"] else "0603" if "0603" in component["value"] else "0402"
        metric = {"1210": "3225", "0603": "1608", "0402": "1005"}[size]
        return f"Capacitor_SMD:C_{size}_{metric}Metric"
    if component["kind"] == "resistor":
        return "Resistor_SMD:R_0402_1005Metric"
    if component["kind"] == "inductor":
        return "Spark:XAL1060"
    if component["kind"] == "jumper":
        return "Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm"
    return "Spark:Power_Testpad"


def placed_symbol(component: dict, x: float, y: float, root_uuid: str) -> list[str]:
    x, y = round(round(x / 1.27) * 1.27, 4), round(round(y / 1.27) * 1.27, 4)
    ref, kind = component["ref"], component["kind"]
    value = component["value"]
    ref_y = y - (23 if kind == "ic" else 4.2)
    val_y = y - 20 if kind == "ic" else y + 4.2
    fields = [f'(property "Reference" {quote(ref)} (at {x} {ref_y} 0) {effects(1.2)})',
              f'(property "Value" {quote(value)} (at {x} {val_y} 0) {effects(1.05)})',
              f'(property "Footprint" {quote(footprint(component))} (at {x} {y} 0) {effects(1, True)})']
    instances = f'(instances (project "{PROJECT}" (path "/{root_uuid}" (reference {quote(ref)}) (unit 1))))'
    pins = " ".join(f'(pin {quote(n)} (uuid {uid(ref + "_pin_" + n)}))' for n in component["pins"])
    on_board = "no" if kind == "flag" else "yes"
    symbol = (f'(symbol (lib_id "Spark:{kind}") (at {x} {y} 0) (unit 1) '
              f'(in_bom {on_board}) (on_board {on_board}) (dnp no) (uuid {uid(ref)}) '
              f'{" ".join(fields)} {pins} {instances})')
    result = [symbol]
    for n, net in component["pins"].items():
        px, py = pin_locations(kind)[n]
        px, py = x + px, y + py
        lx = px + (7.62 if px >= x else -7.62)
        result.append(f'(wire (pts (xy {px:.4f} {py:.4f}) (xy {lx:.4f} {py:.4f})) (stroke (width 0) (type default)) (uuid {uid(ref + "wire" + n)}))')
        result.append(f'(global_label {quote(net)} (shape input) (at {lx:.4f} {py:.4f} 0) (effects (font (size 1 1)) (justify left)) (uuid {uid(ref + "label" + n)}))')
    return result


def generate() -> Path:
    circuit = json.loads((ROOT / "circuit.json").read_text())
    validate_circuit(circuit)
    root_uuid = uid("root")
    definitions = " ".join(symbol_definition(k) for k in ["ic", "resistor", "capacitor", "inductor", "jumper", "testpoint", "flag"])
    content = [f'(kicad_sch (version 20250114) (generator "eeschema") (uuid {root_uuid}) (paper "A3")',
               f'(title_block (title {quote(circuit["title"])}) (date "2026-10-28") (rev "A") (comment 1 "BENCH PROTOTYPE - NO USB PD OR BATTERY PROTECTION"))',
               f'(lib_symbols {definitions})']
    positions = {"U1": (72, 82), "C1": (163, 50), "C2": (163, 72), "L1": (163, 96),
                 "C3": (163, 120), "C4": (163, 144), "R1": (48, 178), "R2": (48, 202),
                 "R3": (115, 178), "JP1": (115, 202), "R4": (195, 178), "C11": (195, 202),
                 "C12": (263, 178), "R5": (263, 202), "J1": (40, 247), "J2": (106, 247),
                 "J3": (172, 247), "J4": (238, 247), "J5": (318, 247)}
    for i, ref in enumerate(["C5", "C6", "C7", "C8", "C9", "C10"]):
        positions[ref] = (265 + (i // 3) * 82, 50 + (i % 3) * 32)
    for component in circuit["components"]:
        content.extend(placed_symbol(component, *positions[component["ref"]], root_uuid))
    targets = circuit["target_output"]
    input_min, input_max = circuit["input_range_v"]
    high_current = targets["power_target_w"] / targets["jumper_closed_v"]
    notes = [(20, 18, "BENCH SUPPLY + ELECTRONIC LOAD ONLY. Do not connect a cell or phone."),
             (20, 26, f'Default {targets["default_v"]:g} V. JP1 closed: {targets["jumper_closed_v"]:g} V. Input {input_min:g}-{input_max:g} V.'),
             (20, 34, f'{targets["power_target_w"]:g} W target at {targets["jumper_closed_v"]:g} V / {high_current:.2f} A. {targets["stress_test_a"]:g} A is a stress calculation, not a verified rating.'),
             (230, 132, "C5-C10: 132 uF nominal; effective capacitance at bias must be >=60 uF."),
             (20, 155, "Feedback and loop compensation. Verify stability with load steps and Bode measurement."),
             (20, 225, "Test pads. Drive EN externally; R5 holds converter disabled when EN is open."),
             (20, 270, "Matching net names connect. TI SLVSFP3C pinout and design equations. No charge circuit, UVLO or temperature cutoff.")]
    for i, (x, y, note) in enumerate(notes):
        content.append(f'(text {quote(note)} (at {x} {y} 0) (effects (font (size 1.25 1.25)) (justify left)) (uuid {uid("note" + str(i))}))')
    for i, net in enumerate(["VIN", "GND"]):
        component = {"ref": f"#FLG0{i+1}", "kind": "flag", "value": "Bench supply reference", "pins": {"1": net}}
        content.extend(placed_symbol(component, 335 + i * 40, 202, root_uuid))
    content += ["(embedded_fonts no)", ")"]
    path = ROOT / f"{PROJECT}.kicad_sch"
    path.write_text("\n".join(content) + "\n")
    library = definitions.replace('(symbol "Spark:', '(symbol "')
    (ROOT / "Spark.kicad_sym").write_text(
        '(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")\n'
        + library + '\n)\n'
    )
    (ROOT / "sym-lib-table").write_text(
        '(sym_lib_table (version 7) (lib (name "Spark") (type "KiCad") '
        '(uri "${KIPRJMOD}/Spark.kicad_sym") (options "") (descr "Spark prototype symbols")))\n'
    )
    return path


if __name__ == "__main__":
    print(generate())
