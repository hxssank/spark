from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from publish_assets import publish_files


@pytest.mark.parametrize("failure", ["replace", "delete", "interrupt"])
def test_publication_restores_previous_files_after_a_partial_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    stage = tmp_path / "stage"
    output = tmp_path / "output"
    stage.mkdir()
    output.mkdir()
    names = ["new", "first", "second", "report"]
    for name in names:
        (stage / name).write_text(f"new {name}")
        if name != "new":
            (output / name).write_text(f"old {name}")
    obsolete = [output / "obsolete-first", output / "obsolete-second"]
    for path in obsolete:
        path.write_text(f"old {path.name}")
    replace = Path.replace
    unlink = Path.unlink

    def failing_replace(source: Path, target: Path) -> Path:
        if source == stage / "second" and failure in {"replace", "interrupt"}:
            if failure == "interrupt":
                raise KeyboardInterrupt("publication interrupted")
            raise OSError("publication interrupted")
        return replace(source, target)

    def failing_unlink(path: Path, missing_ok: bool = False) -> None:
        if path == obsolete[-1] and failure == "delete":
            raise OSError("publication interrupted")
        unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "replace", failing_replace)
    monkeypatch.setattr(Path, "unlink", failing_unlink)
    error = KeyboardInterrupt if failure == "interrupt" else OSError
    with pytest.raises(error, match="publication interrupted"):
        publish_files({stage / name: output / name for name in names}, obsolete)
    assert not (output / "new").exists()
    for path in output.iterdir():
        assert path.read_text() == f"old {path.name}"
    assert {path.name for path in output.iterdir()} == {*names[1:], *(path.name for path in obsolete)}
    assert not list(output.glob(".spark-publish-*"))


def test_failed_rollback_preserves_recovery_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    output = tmp_path / "output"
    output.mkdir()
    with tempfile.TemporaryDirectory(dir=tmp_path) as temporary:
        stage = Path(temporary)
        for name in ("first", "second"):
            (stage / name).write_text(f"new {name}")
            (output / name).write_text(f"old {name}")
        replace = Path.replace

        def failing_replace(source: Path, target: Path) -> Path:
            if source != stage / "first":
                raise OSError("disk unavailable")
            return replace(source, target)

        monkeypatch.setattr(Path, "replace", failing_replace)
        with pytest.raises(RuntimeError, match="recovery files remain at"):
            publish_files({stage / name: output / name for name in ("first", "second")})
    assert not stage.exists()
    backups = list(output.glob(".spark-publish-*"))
    assert len(backups) == 1
    recovery = json.loads((backups[0] / "recovery-map.json").read_text())
    assert {Path(target).name for target in recovery.values()} == {"first", "second"}
    assert {(backups[0] / name).read_text() for name in recovery} == {"old first", "old second"}


def test_publication_rejects_duplicate_targets_before_changing_them(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    target = tmp_path / "target"
    first.write_text("first")
    second.write_text("second")
    target.write_text("previous")
    with pytest.raises(ValueError, match="distinct output paths"):
        publish_files({first: target, second: tmp_path / "nested" / ".." / "target"})
    assert target.read_text() == "previous"
