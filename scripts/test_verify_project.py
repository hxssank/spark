from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
import verify_project
from package_prototype import VERIFICATION_REPORT, project_files, validate_verification

TAP = "# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "scripts").mkdir()
    (tmp_path / "review").mkdir()
    (tmp_path / "review/example.test.mjs").write_text("test source")
    (tmp_path / "prototype-status.json").write_text(json.dumps({
        "revision": "A", "validation": {"total_automated_tests_passed": 99, "physical_hardware_tests_run": 0},
    }))
    (tmp_path / VERIFICATION_REPORT).write_text("previous report")
    monkeypatch.setattr(verify_project, "validate_project", lambda files: None)
    monkeypatch.setattr(verify_project, "TEST_FIELDS", {"mechanical/test_model.py": "mechanical_pytest_passed"})
    return tmp_path


def successful_command(arguments: list[str], root: Path) -> str:
    if "pytest" in arguments:
        report = Path(next(arg.split("=", 1)[1] for arg in arguments if arg.startswith("--junitxml=")))
        report.write_text('<testsuites><testsuite tests="2">'
                          '<testcase file="mechanical/test_model.py" name="first" />'
                          '<testcase file="mechanical/test_model.py" name="second" />'
                          '</testsuite></testsuites>')
    return TAP if "--test" in arguments else "passed"


def test_successful_verification_records_actual_counts_and_all_checked_files(
    project: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(verify_project, "run", successful_command)
    report = verify_project.verify(project, "python", "node")
    assert report["checks"]["python"]["passed"] == 2
    assert report["checks"]["node"]["passed"] == 3
    status = json.loads((project / "prototype-status.json").read_text())
    assert status["validation"]["total_automated_tests_passed"] == 5
    assert status["validation"]["mechanical_pytest_passed"] == 2
    assert status["validation"]["physical_hardware_tests_run"] == 0
    validate_verification(project_files(project))


@pytest.mark.parametrize("failure", ["pytest", "ruff", "source_change"])
def test_failed_or_raced_verification_preserves_previous_status_and_report(
    project: Path, monkeypatch: pytest.MonkeyPatch, failure: str,
) -> None:
    prior = {name: (project / name).read_bytes() for name in ("prototype-status.json", VERIFICATION_REPORT)}

    def command(arguments: list[str], root: Path) -> str:
        if failure in arguments:
            raise ValueError("simulated check failure")
        output = successful_command(arguments, root)
        if failure == "source_change" and "ruff" in arguments:
            (project / "review/example.test.mjs").write_text("concurrent source change")
        return output

    monkeypatch.setattr(verify_project, "run", command)
    with pytest.raises(ValueError, match="check failure|Project changed"):
        verify_project.verify(project, "python", "node")
    assert {name: (project / name).read_bytes() for name in prior} == prior


def test_report_publication_failure_restores_status(project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(verify_project, "run", successful_command)
    prior = {name: (project / name).read_bytes() for name in ("prototype-status.json", VERIFICATION_REPORT)}
    replace = Path.replace

    def fail_report(source: Path, target: Path) -> Path:
        if source.name == "verification.json":
            raise OSError("simulated report write failure")
        return replace(source, target)

    monkeypatch.setattr(Path, "replace", fail_report)
    with pytest.raises(OSError, match="report write failure"):
        verify_project.verify(project, "python", "node")
    assert {name: (project / name).read_bytes() for name in prior} == prior


def test_missing_required_suite_cannot_certify_project(project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(verify_project, "run", successful_command)
    monkeypatch.setitem(verify_project.TEST_FIELDS, "electronics/test_critical.py", "critical_pytest_passed")
    with pytest.raises(ValueError, match="every Python suite.*electronics/test_critical.py"):
        verify_project.verify(project, "python", "node")
    assert (project / VERIFICATION_REPORT).read_text() == "previous report"


def test_verification_clears_inherited_pytest_filters(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PYTEST_ADDOPTS", "-k only_one_test --lf")
    monkeypatch.setenv("PYTEST_PLUGINS", "external_test_filter")
    recorded = {}

    def command(arguments: list[str], **options: object) -> subprocess.CompletedProcess:
        recorded.update(options)
        return subprocess.CompletedProcess(arguments, 0, stdout="passed", stderr="")

    monkeypatch.setattr(verify_project.subprocess, "run", command)
    verify_project.run(["python", "-m", "pytest"], tmp_path)
    assert "PYTEST_ADDOPTS" not in recorded["env"]
    assert "PYTEST_PLUGINS" not in recorded["env"]
    assert recorded["env"]["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] == "1"


@pytest.mark.parametrize("output", [
    "", TAP.replace("# pass 3", "# pass 0"), TAP.replace("# fail 0", "# fail 1"),
    TAP.replace("# cancelled 0", "# cancelled 1"), TAP.replace("# todo 0", "# todo 1"),
    TAP.replace("# tests 3", "# tests 4"),
])
def test_incomplete_node_reports_cannot_pass(output: str) -> None:
    with pytest.raises(ValueError, match="incomplete|unfinished"):
        verify_project.node_results(output)


@pytest.mark.parametrize("case", [
    "", '<testcase file="test.py"><failure /></testcase>',
    '<testcase file="test.py"><error /></testcase>', '<testcase name="missing-file" />',
    '<testcase file="test.py"><skipped /></testcase>',
])
def test_empty_failed_or_unidentifiable_python_reports_cannot_pass(tmp_path: Path, case: str) -> None:
    path = tmp_path / "pytest.xml"
    path.write_text(f"<testsuites><testsuite>{case}</testsuite></testsuites>")
    with pytest.raises(ValueError):
        verify_project.python_results(path)
