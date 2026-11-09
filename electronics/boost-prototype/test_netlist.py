import importlib.util
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


def test_schematic_values_use_utf8_instead_of_json_unicode_escapes(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("spark_schematic_unicode", ROOT / "generate_schematic.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    circuit = json.loads((ROOT / "circuit.json").read_text())
    next(c for c in circuit["components"] if c["ref"] == "R5")["value"] = "100kΩ ±1%"
    (tmp_path / "circuit.json").write_text(json.dumps(circuit))
    schematic = module.generate().read_text()
    assert '(property "Value" "100kΩ ±1%" ' in schematic


def test_exported_schematic_matches_circuit_connections() -> None:
    circuit = json.loads((ROOT / "circuit.json").read_text())
    expected = {
        (component["ref"], pin): net
        for component in circuit["components"]
        for pin, net in component["pins"].items()
    }
    schematic = ET.parse(ROOT / "spark_boost_rev_a.net.xml").getroot()
    actual = {}
    for net in schematic.findall("./nets/net"):
        for node in net.findall("node"):
            key = (node.attrib["ref"], node.attrib["pin"])
            assert key not in actual, f"Duplicate schematic pin {key}"
            actual[key] = net.attrib["name"].removeprefix("/")
    assert actual == expected


def test_voltage_selection_and_default_disable() -> None:
    circuit = json.loads((ROOT / "circuit.json").read_text())
    parts = {component["ref"]: component for component in circuit["components"]}
    top, bottom, selectable = [
        float(parts[ref]["value"].split("k")[0]) * 1000
        for ref in ["R1", "R2", "R3"]
    ]
    assert 0.6 * (1 + top / bottom) == pytest.approx(5)
    assert 0.6 * (1 + top / (1 / (1 / bottom + 1 / selectable))) == pytest.approx(9)
    assert parts["R5"]["pins"] == {"1": "EN", "2": "GND"}
    assert parts["JP1"]["pins"] == {"1": "SEL9", "2": "GND"}
    assert "OPEN" in parts["JP1"]["value"]


def test_schematic_pinout_against_ti_slvsfp3c_table_6_1() -> None:
    circuit = json.loads((ROOT / "circuit.json").read_text())
    ic = next(component for component in circuit["components"] if component["ref"] == "U1")
    assert ic["pins"] == {
        "1": "FB", "2": "COMP", "3": "GND", "4": "SW", "5": "VOUT",
        "6": "EN", "7": "VIN", "8": "BST", "9": "SW", "10": "GND", "11": "VCC",
    }
