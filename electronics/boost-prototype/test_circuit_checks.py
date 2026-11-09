from __future__ import annotations

import json
from pathlib import Path

import pytest
from circuit_checks import electrical_report, validate_circuit

ROOT = Path(__file__).resolve().parent


@pytest.fixture
def circuit() -> dict:
    return json.loads((ROOT / "circuit.json").read_text())


def test_voltage_metadata_cannot_drift_from_feedback_resistors(circuit: dict) -> None:
    circuit["target_output"]["jumper_closed_v"] = 12
    with pytest.raises(ValueError, match="target disagrees with the feedback resistor network"):
        validate_circuit(circuit)


def test_feedback_change_requires_matching_target(circuit: dict) -> None:
    next(part for part in circuit["components"] if part["ref"] == "R1")["value"] = "100k 0.1% 0402"
    with pytest.raises(ValueError, match="target disagrees with the feedback resistor network"):
        validate_circuit(circuit)


@pytest.mark.parametrize("defect", ["added", "removed", "duplicate", "pins", "kind", "jumper"])
def test_fixed_routes_cannot_silently_accept_a_changed_circuit(circuit: dict, defect: str) -> None:
    if defect == "added":
        circuit["components"].append({**circuit["components"][-1], "ref": "J6"})
    elif defect == "removed":
        circuit["components"].pop()
    elif defect == "duplicate":
        circuit["components"].append(circuit["components"][-1])
    elif defect == "pins":
        circuit["components"][0]["pins"]["5"] = "GND"
    elif defect == "kind":
        circuit["components"][0]["kind"] = "resistor"
    else:
        next(part for part in circuit["components"] if part["ref"] == "JP1")["value"] = "NORMALLY CLOSED"
    with pytest.raises(ValueError):
        validate_circuit(circuit)


@pytest.mark.parametrize("voltage_range", [[4.2, 3], [2.3, 4.2], [3, 5.1], [True, 4.2], [3, float("nan")]])
def test_invalid_or_nonboost_input_range_is_rejected(circuit: dict, voltage_range: list) -> None:
    circuit["input_range_v"] = voltage_range
    with pytest.raises(ValueError):
        validate_circuit(circuit)


@pytest.mark.parametrize(("field", "value"), [
    ("efficiency_nominal", 1.1), ("efficiency_low", 0), ("efficiency_low", 0.95),
    ("effective_output_capacitance_f", 200e-6), ("inductance_tolerance_fraction", 1),
])
def test_invalid_calculation_assumptions_are_rejected(circuit: dict, field: str, value: float) -> None:
    circuit["calculation_assumptions"][field] = value
    with pytest.raises(ValueError):
        validate_circuit(circuit)


def test_design_target_and_stress_current_are_separate(circuit: dict) -> None:
    report = electrical_report(circuit)
    assert report["power_target_w"] == 25
    assert report["measured_output_w"] is None
    assert report["nominal_output_capacitance_f"] == pytest.approx(132e-6)
    cases = report["low_input_cases"]
    target = next(case for case in cases if case["output_v"] == 9
                  and case["study"] == "design_target" and case["assumed_efficiency"] == 0.9)
    assert target["output_a"] == pytest.approx(25 / 9)
    assert target["input_a"] == pytest.approx(9.259259259)
    assert target["converter_loss_w"] == pytest.approx(2.777777778)
    assert target["inductor_ripple_a_pp"] == pytest.approx(2.951593861)
    stress = next(case for case in cases if case["output_v"] == 9
                  and case["study"] == "current_stress" and case["assumed_efficiency"] == 0.85)
    assert stress["output_w"] == 27
    assert stress["inductor_peak_a"] == pytest.approx(12.064032225)
    assert stress["inductor_peak_a"] > report["datasheet_current_limit"]["minimum_a"]
    assert report["datasheet_current_limit"]["verified_at_project_input"] is False
    low_voltage = next(case for case in cases if case["output_v"] == 5 and case["study"] == "design_target")
    assert low_voltage["output_w"] == 15


def test_compensation_screen_uses_source_resistance(circuit: dict) -> None:
    assert all(case["crossover_screen_passes"] for case in electrical_report(circuit)["low_input_cases"])
    next(part for part in circuit["components"] if part["ref"] == "R4")["value"] = "100k 1% 0402"
    assert not all(case["crossover_screen_passes"] for case in electrical_report(circuit)["low_input_cases"])
