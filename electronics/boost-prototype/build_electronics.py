from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from circuit_checks import electrical_report

ROOT = Path(__file__).resolve().parent
PROJECT = "spark_boost_rev_a"
INPUTS = (
    "circuit.json", "circuit_checks.py", "generate_board.py", "generate_schematic.py", "build_electronics.py",
    f"{PROJECT}.kicad_pro", "manufacturing-review/status.json",
)
FIXED_OUTPUTS = {
    "BOM.csv", "Spark.kicad_sym", "component-placement.json", "electrical-report.json", "drc.txt",
    "drc-parity-report.txt", "erc-report.txt", "fp-lib-table", "sym-lib-table",
    "preview/pcb-front.svg",
    *(f"{PROJECT}.{extension}" for extension in
      ("kicad_pcb", "kicad_sch", "net.xml", "pdf")),
    *(f"manufacturing-review/{PROJECT}-{suffix}" for suffix in (
        "B_Cu.gbl", "B_Mask.gbs", "B_Paste.gbp", "Edge_Cuts.gm1",
        "F_Cu.gtl", "F_Mask.gts", "F_Paste.gtp", "In1_Cu.g1", "In2_Cu.g2",
        "b_silkscreen.gbo", "f_silkscreen.gto", "job.gbrjob",
    )),
    f"manufacturing-review/{PROJECT}.drl",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def required_outputs(circuit: bytes) -> set[str]:
    outputs = set(FIXED_OUTPUTS)
    for component in json.loads(circuit)["components"]:
        namespace, separator, name = component["footprint"].partition(":")
        if namespace != "Spark" or not separator or not name or name in {".", ".."} \
                or "/" in name or "\\" in name:
            raise ValueError(f"Invalid local footprint for {component['ref']}")
        outputs.add(f"Spark.pretty/{name}.kicad_mod")
    return outputs


def find_kicad(explicit: str | None, project_root: Path) -> Path:
    requested = explicit or os.environ.get("KICAD_CLI")
    if requested:
        path = Path(requested)
        if not path.is_file():
            raise FileNotFoundError(f"KiCad CLI not found: {requested}")
        return path.resolve()
    candidates = [shutil.which("kicad-cli")]
    candidates.extend([
        "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
        str(project_root / ".tooling/kicad/mount/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
    ])
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate).resolve()
    raise FileNotFoundError("Install KiCad 10 and pass --kicad-cli or set KICAD_CLI")


def run(arguments: list[str], directory: Path) -> str:
    completed = subprocess.run(arguments, cwd=directory, check=True, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return completed.stdout.strip()


def build(root: Path, cli: Path) -> dict:
    root = root.resolve()
    project_root = root.parents[1]
    prefix = root.relative_to(project_root).as_posix()
    inputs = {name: (root / name).read_bytes() for name in INPUTS}
    calculations = electrical_report(json.loads(inputs["circuit.json"]))
    if any(not case["crossover_screen_passes"] for case in calculations["low_input_cases"]):
        raise ValueError("Compensation crossover exceeds the calculated switching-frequency or RHP-zero bound")
    required = required_outputs(inputs["circuit.json"])
    version = run([str(cli), "version"], root)
    if version.split(".")[0] != "10":
        raise ValueError(f"KiCad 10 is required for these generators; found {version}")
    with tempfile.TemporaryDirectory(prefix="spark-electronics-") as temporary:
        staged = Path(temporary)
        for name, data in inputs.items():
            destination = staged / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        for script in ["generate_board.py", "generate_schematic.py"]:
            run([sys.executable, script], staged)
        (staged / "electrical-report.json").write_text(json.dumps(calculations, indent=2) + "\n")
        schematic = f"{PROJECT}.kicad_sch"
        board = f"{PROJECT}.kicad_pcb"
        commands = [
            ["sch", "erc", schematic, "--output", "erc-report.txt", "--exit-code-violations"],
            ["sch", "export", "netlist", schematic, "--format", "kicadxml",
             "--output", f"{PROJECT}.net.xml"],
            ["sch", "export", "pdf", schematic, "--output", f"{PROJECT}.pdf"],
            ["pcb", "drc", board, "--refill-zones", "--save-board", "--schematic-parity",
             "--output", "drc.txt", "--exit-code-violations"],
            ["pcb", "export", "gerbers", board, "--output", "manufacturing-review/",
             "--layers", "F.Cu,In1.Cu,In2.Cu,B.Cu,F.Paste,B.Paste,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts"],
            ["pcb", "export", "drill", board, "--output", "manufacturing-review/"],
            ["pcb", "export", "svg", board, "--output", "preview/pcb-front.svg",
             "--layers", "F.Cu,F.SilkS,Edge.Cuts", "--mode-single", "--fit-page-to-board",
             "--exclude-drawing-sheet"],
        ]
        for command in commands:
            run([str(cli), *command], staged)
        # Keep the legacy parity report link bound to the check that includes parity.
        shutil.copyfile(staged / "drc.txt", staged / "drc-parity-report.txt")
        outputs = {}
        for path in sorted(staged.rglob("*")):
            if not path.is_file():
                continue
            relative_path = path.relative_to(staged)
            relative = relative_path.as_posix()
            if relative in inputs or "__pycache__" in relative_path.parts \
                    or path.suffix in {".pyc", ".pyo", ".kicad_prl"}:
                continue
            data = path.read_bytes()
            if path.suffix in {".xml", ".txt"}:
                data = data.replace(str(staged).encode(), str(root).encode())
            outputs[relative] = data
        if any((root / name).read_bytes() != data for name, data in inputs.items()):
            raise ValueError("Electronics source changed during the build; retry after edits finish")
        missing = sorted(name for name in required if not outputs.get(name))
        if missing:
            raise ValueError("Electronics build produced missing or empty outputs: " + ", ".join(missing))
        report = {
            "kicad_version": version,
            "scope": "Generated design and KiCad rule checks; no electrical or thermal bench test",
            "inputs": {f"{prefix}/{name}": sha256(data) for name, data in inputs.items()},
            "output": {f"{prefix}/{name}": sha256(data) for name, data in outputs.items()},
        }
        # Invalidate the old report before publishing. An interrupted copy cannot pass packaging.
        (root / "build-report.json").unlink(missing_ok=True)
        for name, data in outputs.items():
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        (root / "build-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate, check and export the Spark boost prototype")
    parser.add_argument("--kicad-cli", help="Path to KiCad 10's kicad-cli executable")
    args = parser.parse_args()
    try:
        report = build(ROOT, find_kicad(args.kicad_cli, ROOT.parents[1]))
    except subprocess.CalledProcessError as error:
        parser.exit(1, f"Electronics build failed; published files retained.\n{error.stdout}\n")
    except (OSError, ValueError, TypeError) as error:
        parser.exit(1, f"Electronics build failed: {error}\n")
    print(f"KiCad {report['kicad_version']}: ERC and DRC with schematic parity passed; "
          f"published {len(report['output'])} generated files")


if __name__ == "__main__":
    main()
