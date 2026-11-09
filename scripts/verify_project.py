from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

from package_prototype import (
    ROOT,
    VERIFICATION_REPORT,
    package,
    project_files,
    publish_files,
    validate_project,
    verification_hashes,
)

TEST_FIELDS = {
    "mechanical/test_model.py": "mechanical_pytest_passed",
    "mechanical/test_compact_model.py": "compact_geometry_pytest_passed",
    "mechanical/test_render_assets.py": "render_pipeline_pytest_passed",
    "mechanical/test_publish_assets.py": "asset_publication_pytest_passed",
    "electronics/boost-prototype/test_netlist.py": "schematic_netlist_pytest_passed",
    "electronics/boost-prototype/test_generated_board.py": "board_generation_pytest_passed",
    "electronics/boost-prototype/test_build_electronics.py": "electronics_build_pytest_passed",
    "electronics/boost-prototype/test_circuit_checks.py": "circuit_checks_pytest_passed",
    "scripts/test_package_prototype.py": "package_pytest_passed",
    "scripts/test_verify_project.py": "verification_runner_pytest_passed",
}


def run(arguments: list[str], root: Path) -> str:
    environment = os.environ.copy()
    if "pytest" in arguments:
        environment.pop("PYTEST_ADDOPTS", None)
        environment.pop("PYTEST_PLUGINS", None)
        environment["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    result = subprocess.run(arguments, cwd=root, text=True, capture_output=True,
                            timeout=600, check=False, env=environment)
    if result.returncode:
        raise ValueError(f"Command failed: {' '.join(arguments)}\n{result.stdout[-6000:]}\n{result.stderr[-6000:]}")
    return result.stdout


def python_results(path: Path) -> dict:
    cases = list(ET.parse(path).getroot().iter("testcase"))
    if not cases or any(case.find("failure") is not None or case.find("error") is not None for case in cases):
        raise ValueError("Python test report is empty or contains failures")
    by_file: dict[str, int] = {}
    skipped = 0
    for case in cases:
        if case.find("skipped") is not None:
            skipped += 1
            continue
        name = case.get("file")
        if not name:
            raise ValueError("Python report lacks file names; use junit_family=xunit1")
        name = name.replace("\\", "/")
        by_file[name] = by_file.get(name, 0) + 1
    if not by_file:
        raise ValueError("No Python tests passed")
    return {"passed": sum(by_file.values()), "skipped": skipped, "by_file": dict(sorted(by_file.items()))}


def node_results(output: str) -> dict:
    counts = {key: int(value) for key, value in re.findall(
        r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$", output, re.MULTILINE
    )}
    if set(counts) != {"tests", "pass", "fail", "cancelled", "skipped", "todo"} \
            or counts["pass"] == 0 or counts["fail"] or counts["cancelled"] or counts["todo"] \
            or counts["tests"] != counts["pass"] + counts["skipped"]:
        raise ValueError("Node test report is incomplete or contains unfinished tests")
    return {"passed": counts["pass"], "skipped": counts["skipped"]}


def verify(root: Path, python: str, node: str) -> dict:
    before = project_files(root)
    validate_project(before)
    with tempfile.TemporaryDirectory(prefix=".spark-verify-", dir=root) as temporary:
        stage = Path(temporary)
        print("Running Python tests", flush=True)
        junit = stage / "pytest.xml"
        run([python, "-m", "pytest", "-q", "mechanical", "electronics/boost-prototype", "scripts",
             "-o", "addopts=", "-o", "junit_family=xunit1", f"--junitxml={junit}"], root)
        py = python_results(junit)
        missing = sorted(set(TEST_FIELDS) - py["by_file"].keys())
        if missing or py["skipped"]:
            raise ValueError("Full verification requires every Python suite without skipped tests: "
                             + ", ".join(missing))
        print("Running browser-module tests", flush=True)
        node_tests = sorted(name for name in before if name.startswith("review/") and name.endswith(".test.mjs"))
        if not node_tests:
            raise ValueError("No browser-module tests found")
        js = node_results(run([node, "--test", "--test-reporter=tap", *node_tests], root))
        if js["skipped"]:
            raise ValueError("Full verification does not accept skipped Node tests")
        print("Checking Python lint", flush=True)
        run([python, "-m", "ruff", "check", "scripts", "mechanical", "electronics"], root)
        after = project_files(root)
        if before != after:
            raise ValueError("Project changed during verification; retry after edits finish")
        validate_project(after)
        status = json.loads(after["prototype-status.json"])
        validation = status.setdefault("validation", {})
        for name, field in TEST_FIELDS.items():
            validation[field] = py["by_file"].get(name, 0)
        validation.update({"python_pytest_passed": py["passed"], "viewer_node_tests_passed": js["passed"],
                           "total_automated_tests_passed": py["passed"] + js["passed"],
                           "automated_tests_skipped": py["skipped"] + js["skipped"], "ruff": "passed"})
        status["verification_report"] = VERIFICATION_REPORT
        status.setdefault("package_commands", {})["verify"] = "python3 scripts/verify_project.py --package"
        after["prototype-status.json"] = (json.dumps(status, indent=2) + "\n").encode()
        report = {
            "status": "passed", "verified_at": datetime.now(UTC).isoformat(),
            "scope": "Automated software, geometry and export checks; no physical hardware tests",
            "checks": {"python": py, "node": js, "ruff": "passed"},
            "inputs": verification_hashes(after),
        }
        staged_status = stage / "status.json"
        staged_status.write_bytes(after["prototype-status.json"])
        staged_report = stage / "verification.json"
        staged_report.write_text(json.dumps(report, indent=2) + "\n")
        publish_files({root / "prototype-status.json": staged_status,
                       root / VERIFICATION_REPORT: staged_report})
        return report


def find_python(root: Path, requested: str | None) -> str:
    if requested:
        return requested
    for relative in (".tooling/mechanical/venv/bin/python", ".tooling/mechanical/venv/Scripts/python.exe"):
        if (root / relative).is_file():
            return str(root / relative)
    return sys.executable


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Spark sources and exports, then record the exact files checked")
    parser.add_argument("--python", help="Python with mechanical/requirements.txt and Ruff installed")
    parser.add_argument("--package", action="store_true", help="Rebuild the ZIP after successful verification")
    args = parser.parse_args()
    try:
        node = shutil.which("node")
        if not node:
            raise ValueError("Node.js is required for the review tests")
        report = verify(ROOT, find_python(ROOT, args.python), node)
        checks = report["checks"]
        print(f"Passed {checks['python']['passed']} Python and {checks['node']['passed']} Node tests; Ruff passed")
        if args.package:
            archive, count = package(ROOT, write=True)
            print(f"Verified {count} files in {archive.name}")
    except (OSError, ValueError, KeyError, RuntimeError, ET.ParseError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Project verification failed: {error}\n")


if __name__ == "__main__":
    main()
