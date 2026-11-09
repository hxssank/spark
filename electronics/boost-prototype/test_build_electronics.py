import importlib.util
import json
import subprocess
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parent


def builder() -> ModuleType:
    spec = importlib.util.spec_from_file_location("spark_build", ROOT / "build_electronics.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_explicit_missing_kicad_does_not_silently_use_another_version(tmp_path: Path) -> None:
    module = builder()
    with pytest.raises(FileNotFoundError, match="missing-cli"):
        module.find_kicad(str(tmp_path / "missing-cli"), tmp_path)


def test_failed_rule_check_retains_previous_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = builder()
    root = tmp_path / "electronics" / "boost-prototype"
    root.mkdir(parents=True)
    for name in module.INPUTS:
        path = root / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes((ROOT / name).read_bytes())
    old_board = root / f"{module.PROJECT}.kicad_pcb"
    old_board.write_text("previous board")
    old_report = root / "build-report.json"
    old_report.write_text("previous report")

    def fail_drc(arguments: list[str], directory: Path) -> str:
        if arguments[-1] == "version":
            return "10.0.7"
        if arguments[1:3] == ["pcb", "drc"]:
            raise subprocess.CalledProcessError(5, arguments, output="clearance violation")
        return ""

    monkeypatch.setattr(module, "run", fail_drc)
    with pytest.raises(subprocess.CalledProcessError):
        module.build(root, Path("/test/kicad-cli"))
    assert old_board.read_text() == "previous board"
    assert old_report.read_text() == "previous report"


def test_build_refuses_sources_changed_during_checks(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = builder()
    root = tmp_path / "electronics" / "boost-prototype"
    root.mkdir(parents=True)
    for name in module.INPUTS:
        path = root / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes((ROOT / name).read_bytes())
    old_report = root / "build-report.json"
    old_report.write_text("previous report")

    def concurrent_edit(arguments: list[str], directory: Path) -> str:
        if arguments[-1] == "version":
            return "10.0.7"
        if arguments[1:3] == ["pcb", "drc"]:
            (directory / "drc.txt").write_text("checked")
            (root / "circuit.json").write_text("changed concurrently")
        return ""

    monkeypatch.setattr(module, "run", concurrent_edit)
    with pytest.raises(ValueError, match="source changed"):
        module.build(root, Path("/test/kicad-cli"))
    assert old_report.read_text() == "previous report"


def test_failed_compensation_screen_retains_previous_files(tmp_path: Path) -> None:
    module = builder()
    root = tmp_path / "electronics" / "boost-prototype"
    root.mkdir(parents=True)
    for name in module.INPUTS:
        path = root / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes((ROOT / name).read_bytes())
    circuit_path = root / "circuit.json"
    circuit = json.loads(circuit_path.read_text())
    next(part for part in circuit["components"] if part["ref"] == "R4")["value"] = "100k 1% 0402"
    circuit_path.write_text(json.dumps(circuit))
    old_report = root / "build-report.json"
    old_report.write_text("previous report")
    with pytest.raises(ValueError, match="Compensation crossover exceeds"):
        module.build(root, Path("/test/kicad-cli"))
    assert old_report.read_text() == "previous report"


@pytest.mark.parametrize("filename", [
    "manufacturing-review/spark_boost_rev_a-F_Cu.gtl",
    "Spark.pretty/U1_TPS61288_RQQ0011A.kicad_mod",
    "spark_boost_rev_a.net.xml",
])
@pytest.mark.parametrize("empty", [False, True], ids=["missing", "empty"])
def test_incomplete_exports_retain_previous_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, filename: str, empty: bool,
) -> None:
    module = builder()
    root = tmp_path / "electronics" / "boost-prototype"
    root.mkdir(parents=True)
    for name in module.INPUTS:
        path = root / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes((ROOT / name).read_bytes())
    old_board = root / f"{module.PROJECT}.kicad_pcb"
    old_board.write_text("previous board")
    old_report = root / "build-report.json"
    old_report.write_text("previous report")

    def incomplete_export(arguments: list[str], directory: Path) -> str:
        if arguments[-1] == "version":
            return "10.0.7"
        if arguments[1:3] == ["pcb", "drc"]:
            (directory / "drc.txt").write_text("checked")
        if arguments[1:4] == ["pcb", "export", "svg"]:
            for name in module.required_outputs((root / "circuit.json").read_bytes()):
                if name == filename and not empty:
                    continue
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("" if name == filename else "generated")
        return ""

    monkeypatch.setattr(module, "run", incomplete_export)
    with pytest.raises(ValueError, match="missing or empty outputs") as error:
        module.build(root, Path("/test/kicad-cli"))
    assert filename in str(error.value)
    assert old_board.read_text() == "previous board"
    assert old_report.read_text() == "previous report"


def test_runtime_caches_are_neither_published_nor_hashed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = builder()
    root = tmp_path / "electronics" / "boost-prototype"
    root.mkdir(parents=True)
    for name in module.INPUTS:
        path = root / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes((ROOT / name).read_bytes())
    caches = {"__pycache__/circuit_checks.cpython-314.pyc", "__pycache__/cache-metadata.txt",
              "circuit_checks.pyc", "circuit_checks.pyo"}
    required = module.required_outputs((root / "circuit.json").read_bytes())

    def successful_export(arguments: list[str], directory: Path) -> str:
        if arguments[-1] == "version":
            return "10.0.7"
        if arguments[1:4] == ["pcb", "export", "svg"]:
            for name in required | caches:
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("generated")
        return ""

    monkeypatch.setattr(module, "run", successful_export)
    report = module.build(root, Path("/test/kicad-cli"))
    assert set(report["output"]) == {f"electronics/boost-prototype/{name}" for name in required}
    assert all(not (root / name).exists() for name in caches)
