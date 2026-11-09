import csv
import importlib.util
import json
import re
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


def test_repeated_generation_does_not_duplicate_components_or_routes(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("spark_board", ROOT / "generate_board.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    module.LIB = tmp_path / "Spark.pretty"
    shutil.copy2(ROOT / "circuit.json", tmp_path / "circuit.json")
    module.main()
    first = {path.relative_to(tmp_path): path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    module.main()
    second = {path.relative_to(tmp_path): path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    assert first == second
    assert first[Path("spark_boost_rev_a.kicad_pcb")].count(b'(footprint "') == 25


def test_generation_reads_current_source_without_rewriting_it(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("spark_board_fresh", ROOT / "generate_board.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    module.LIB = tmp_path / "Spark.pretty"
    data = json.loads((ROOT / "circuit.json").read_text())
    source = tmp_path / "circuit.json"
    for resistance in ["100k 0402", "110k 0402"]:
        next(c for c in data["components"] if c["ref"] == "R5")["value"] = resistance
        source.write_text(json.dumps(data, indent=4))
        original = source.read_bytes()
        module.main()
        assert source.read_bytes() == original
        assert resistance in (tmp_path / "spark_boost_rev_a.kicad_pcb").read_text()
        assert resistance in (tmp_path / "BOM.csv").read_text()


def test_generation_round_trips_quoted_and_multiline_values(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("spark_board_quoted", ROOT / "generate_board.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    module.LIB = tmp_path / "Spark.pretty"
    data = json.loads((ROOT / "circuit.json").read_text())
    value = '100k "sample"\\alternate\n0402 µΩ'
    next(c for c in data["components"] if c["ref"] == "R5")["value"] = value
    (tmp_path / "circuit.json").write_text(json.dumps(data))
    module.main()
    for path in [tmp_path / "spark_boost_rev_a.kicad_pcb", module.LIB / "R5_R_0402.kicad_mod"]:
        assert "µΩ" in path.read_text()
        properties = re.findall(r'\(property "Value" ("(?:[^"\\]|\\.)*")', path.read_text())
        assert value in [json.loads(prop) for prop in properties]
    with (tmp_path / "BOM.csv").open(newline="") as stream:
        row = next(row for row in csv.DictReader(stream) if row["Reference"] == "R5")
    assert row["Value"] == value


def test_library_footprints_remove_escaped_board_net_assignments(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("spark_board_nets", ROOT / "generate_board.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.LIB = tmp_path
    net = 'Power "test"\\sense'
    module.NETS = {net: 1}
    module.COMPONENTS = {"J1": {
        "value": "Test", "kind": "testpoint", "footprint": "Spark:J1_WirePad",
        "pins": {"1": net},
    }}
    module.part("J1", "WirePad", [("1", 5, 3, 3, 3)], (3.5, 1.5, 6.5, 4.5), True)
    board_net = re.search(r'\(net 1 ("(?:[^"\\]|\\.)*")\)', module.PARTS[0])
    assert json.loads(board_net[1]) == net
    assert "(net " not in (tmp_path / "J1_WirePad.kicad_mod").read_text()


def test_bom_matches_current_circuit_values_and_purchase_quantities() -> None:
    circuit = json.loads((ROOT / "circuit.json").read_text())
    with (ROOT / "BOM.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len(circuit["components"])
    by_ref = {row["Reference"]: row for row in rows}
    for component in circuit["components"]:
        row = by_ref[component["ref"]]
        assert row["Value"] == component["value"]
        assert row["Footprint"] == component["footprint"]
        assert row["MPN"] == component.get("mpn", "")
        assert row["Quantity"] == ("0" if component["kind"] in {"jumper", "testpoint"} else "1")


def test_board_stackup_matches_manufacturing_review() -> None:
    board = (ROOT / "spark_boost_rev_a.kicad_pcb").read_text()
    status = json.loads((ROOT / "manufacturing-review/status.json").read_text())
    copper = [float(value) for value in re.findall(r'\(type "copper"\)\s*\(thickness ([\d.]+)\)', board)]
    dielectric = [float(value) for value in re.findall(r'\(type "(?:core|prepreg)"\)\s*\(thickness ([\d.]+)\)', board)]
    assert len(copper) == status["copper_layers"]
    assert copper == pytest.approx([ounces * 0.035 for ounces in status["copper_oz"]])
    assert sum(copper + dielectric) == pytest.approx(status["board_mm"][2])


def test_project_checks_courtyards_and_footprint_types() -> None:
    project = json.loads((ROOT / "spark_boost_rev_a.kicad_pro").read_text())
    severities = project["board"]["design_settings"]["rule_severities"]
    for name in ["missing_courtyard", "malformed_courtyard", "courtyards_overlap",
                 "footprint_type_mismatch", "footprint_filters_mismatch",
                 "track_not_centered_on_via", "tuning_profile_track_geometries"]:
        assert severities[name] == "error"
    circuit = json.loads((ROOT / "circuit.json").read_text())
    for component in circuit["components"]:
        name = component["footprint"].removeprefix("Spark:")
        footprint = (ROOT / "Spark.pretty" / f"{name}.kicad_mod").read_text()
        assert re.search(r'\(fp_rect .*?\(layer "[FB]\.CrtYd"\)', footprint)
