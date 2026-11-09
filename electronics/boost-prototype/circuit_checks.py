from __future__ import annotations

import math
import re

DATASHEET = "https://www.ti.com/lit/ds/symlink/tps61288.pdf"
REFERENCE_V = 0.6
SWITCHING_MIN_HZ = 440_000
ERROR_AMPLIFIER_S = 180e-6
POWER_STAGE_A_PER_V = 13.5
PIN_NETS = {
    "U1": {"1": "FB", "2": "COMP", "3": "GND", "4": "SW", "5": "VOUT",
           "6": "EN", "7": "VIN", "8": "BST", "9": "SW", "10": "GND", "11": "VCC"},
    "L1": {"1": "VIN", "2": "SW"},
    "C1": {"1": "VIN", "2": "GND"}, "C2": {"1": "VIN", "2": "GND"},
    "C3": {"1": "VCC", "2": "GND"}, "C4": {"1": "BST", "2": "SW"},
    **{f"C{i}": {"1": "VOUT", "2": "GND"} for i in range(5, 11)},
    "R1": {"1": "VOUT", "2": "FB"}, "R2": {"1": "FB", "2": "GND"},
    "R3": {"1": "FB", "2": "SEL9"}, "JP1": {"1": "SEL9", "2": "GND"},
    "R4": {"1": "COMP", "2": "COMP_Z"}, "C11": {"1": "COMP_Z", "2": "GND"},
    "C12": {"1": "COMP", "2": "GND"}, "R5": {"1": "EN", "2": "GND"},
    **{f"J{i}": {"1": net} for i, net in enumerate(("VIN", "GND", "VOUT", "GND", "EN"), 1)},
}


def positive_number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) \
            or not math.isfinite(value) or value <= 0:
        raise ValueError(f"{label} must be a finite positive number")
    return float(value)


def component_value(component: dict) -> float:
    expected_unit = {"resistor": "Ω", "capacitor": "F", "inductor": "H"}[component["kind"]]
    match = re.match(r"^(\d+(?:\.\d+)?)([pnuµmkM]?)([FHΩ]?)(?=\s|$)", component["value"])
    if not match or match[3] != expected_unit and not (expected_unit == "Ω" and not match[3]):
        raise ValueError(f"{component['ref']} needs a numeric {expected_unit} value")
    scale = {"p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6,
             "m": 1e-3, "": 1, "k": 1e3, "M": 1e6}[match[2]]
    return positive_number(float(match[1]) * scale, component["ref"])


def validate_circuit(circuit: dict) -> dict[str, dict]:
    if not isinstance(circuit, dict):
        raise TypeError("Circuit must be an object")
    for field in ("title", "status"):
        if not isinstance(circuit.get(field), str) or not circuit[field]:
            raise ValueError(f"Circuit needs a {field}")
    components = circuit.get("components")
    if not isinstance(components, list) or not all(isinstance(part, dict) for part in components):
        raise ValueError("Circuit components must be a list of objects")
    parts = {}
    for part in components:
        reference = part.get("ref")
        if not isinstance(reference, str) or reference in parts:
            raise ValueError("Circuit contains duplicate or invalid component references")
        parts[reference] = part
    if parts.keys() != PIN_NETS.keys():
        raise ValueError("Circuit references differ from the fixed prototype A layout")
    for ref, part in parts.items():
        kind = "jumper" if ref == "JP1" else {
            "U": "ic", "L": "inductor", "C": "capacitor", "R": "resistor", "J": "testpoint",
        }[ref[0]]
        if part.get("kind") != kind or part.get("pins") != PIN_NETS[ref]:
            raise ValueError(f"{ref} kind or connections differ from the fixed prototype A layout")
        if not isinstance(part.get("value"), str) or not part["value"]:
            raise ValueError(f"{ref} needs a component value")
        footprint = part.get("footprint", "")
        if not isinstance(footprint, str) or not re.fullmatch(r"Spark:[A-Za-z0-9_]+", footprint):
            raise ValueError(f"{ref} needs a local Spark footprint")
        if kind in {"resistor", "capacitor", "inductor"}:
            component_value(part)
    if parts["U1"].get("mpn") != "TPS61288LRQQR":
        raise ValueError("Electrical calculations require the selected TPS61288LRQQR")
    if "NORMALLY OPEN" not in parts["JP1"]["value"]:
        raise ValueError("JP1 must describe the normally open board jumper")
    inputs = circuit.get("input_range_v")
    if not isinstance(inputs, list) or len(inputs) != 2:
        raise ValueError("input_range_v must contain minimum and maximum voltages")
    minimum, maximum = [positive_number(value, "Input voltage") for value in inputs]
    if not 2.4 <= minimum < maximum <= 18:
        raise ValueError("Input range must be ordered and within TPS61288 startup and operating limits")
    targets = circuit.get("target_output", {})
    if not isinstance(targets, dict):
        raise TypeError("target_output must be an object")
    for key in ("default_v", "jumper_closed_v", "power_target_w", "stress_test_a"):
        positive_number(targets.get(key), key)
    r1, r2, r3 = [component_value(parts[ref]) for ref in ("R1", "R2", "R3")]
    for mode, bottom in (("default_v", r2), ("jumper_closed_v", 1 / (1 / r2 + 1 / r3))):
        output = REFERENCE_V * (1 + r1 / bottom)
        if not 4.5 <= output <= 18 or output <= maximum:
            raise ValueError(f"{mode} must be a supported boost voltage above the input range")
        if not math.isclose(output, targets[mode], rel_tol=1e-6):
            raise ValueError(f"{mode} target disagrees with the feedback resistor network: {output:g} V")
    if targets["power_target_w"] > targets["jumper_closed_v"] * targets["stress_test_a"]:
        raise ValueError("Power target exceeds the selected high-voltage current study")
    assumptions = circuit.get("calculation_assumptions", {})
    if not isinstance(assumptions, dict):
        raise TypeError("calculation_assumptions must be an object")
    for key in ("efficiency_nominal", "efficiency_low", "inductance_tolerance_fraction",
                "effective_output_capacitance_f"):
        positive_number(assumptions.get(key), key)
    if not assumptions["efficiency_low"] <= assumptions["efficiency_nominal"] <= 1:
        raise ValueError("Calculation efficiencies must be ordered fractions no greater than one")
    if assumptions["inductance_tolerance_fraction"] >= 1:
        raise ValueError("Inductance tolerance must be less than one")
    nominal_capacitance = sum(component_value(parts[f"C{i}"]) for i in range(5, 11))
    if assumptions["effective_output_capacitance_f"] > nominal_capacitance:
        raise ValueError("Effective output capacitance exceeds the nominal capacitor bank")
    return parts


def electrical_report(circuit: dict) -> dict:
    parts = validate_circuit(circuit)
    targets = circuit["target_output"]
    assumptions = circuit["calculation_assumptions"]
    vin = circuit["input_range_v"][0]
    inductance = component_value(parts["L1"])
    inductance_min = inductance * (1 - assumptions["inductance_tolerance_fraction"])
    inductance_max = inductance * (1 + assumptions["inductance_tolerance_fraction"])
    capacitance = assumptions["effective_output_capacitance_f"]
    cases = []
    for mode in ("default_v", "jumper_closed_v"):
        vout = targets[mode]
        current_target = min(targets["stress_test_a"], targets["power_target_w"] / vout)
        for study, output_a in (("design_target", current_target), ("current_stress", targets["stress_test_a"])):
            ripple = vin * (1 - vin / vout) / (SWITCHING_MIN_HZ * inductance_min)
            rhpz = (vout / output_a) * (vin / vout) ** 2 / (2 * math.pi * inductance_max)
            crossover = (component_value(parts["R4"]) * (vin / vout) * REFERENCE_V
                         * ERROR_AMPLIFIER_S * POWER_STAGE_A_PER_V / (2 * math.pi * vout * capacitance))
            for efficiency in (assumptions["efficiency_nominal"], assumptions["efficiency_low"]):
                power = vout * output_a
                input_a = power / (vin * efficiency)
                cases.append({"mode": mode, "study": study, "input_v": vin, "output_v": vout,
                              "output_a": output_a, "output_w": power, "assumed_efficiency": efficiency,
                              "input_a": input_a, "converter_loss_w": power * (1 / efficiency - 1),
                              "inductor_ripple_a_pp": ripple, "inductor_peak_a": input_a + ripple / 2,
                              "estimated_crossover_hz": crossover, "estimated_rhp_zero_hz": rhpz,
                              "crossover_screen_passes": crossover < min(SWITCHING_MIN_HZ / 10, rhpz / 5)})
    return {
        "scope": "Analytical design checks only; no measured efficiency, stability, output capability or temperature",
        "source": DATASHEET,
        "source_sections": ["6.1", "7.5", "9.2.2.1", "9.2.2.2", "9.2.2.5"],
        "power_target_w": targets["power_target_w"],
        "measured_output_w": None,
        "assumptions": {**assumptions, "switching_frequency_hz": SWITCHING_MIN_HZ,
                        "inductance_min_h": inductance_min, "inductance_max_h": inductance_max},
        "nominal_output_capacitance_f": sum(component_value(parts[f"C{i}"]) for i in range(5, 11)),
        "datasheet_current_limit": {"minimum_a": 12, "typical_a": 15, "maximum_a": 17.1,
                                    "test_condition": "VIN 7.2 V, VOUT 16 V, L 2.2 uH, junction -20 to 125 C",
                                    "verified_at_project_input": False},
        "low_input_cases": cases,
        "unverified": ["Effective capacitance under DC bias", "Current limit at 3.0 V input",
                       "Loop phase and gain margins", "Component, PCB, cell and enclosure temperature"],
    }
