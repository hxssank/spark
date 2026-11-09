from __future__ import annotations

import json
from pathlib import Path

import pytest
from render_assets import VIEWS, file_hash, publish_renders, render_inputs


@pytest.fixture
def mechanical(tmp_path: Path) -> Path:
    root = tmp_path / "mechanical"
    (root / "exports").mkdir(parents=True)
    (root / "renders").mkdir()
    for name in ("build_model.py", "render_model.py", "render_assets.py", "publish_assets.py", "requirements.txt"):
        (root / name).write_text("source")
    placement = tmp_path / "electronics/boost-prototype/component-placement.json"
    placement.parent.mkdir(parents=True)
    placement.write_text("placement")
    geometry = root / "exports/geometry-report.json"
    geometry.write_text(json.dumps({"sleeve": {"valid": True}}))
    mesh = root / "exports/sleeve.stl"
    mesh.write_bytes(b"verified mesh")
    report = {"inputs": {path.relative_to(tmp_path).as_posix(): file_hash(path)
                         for path in (root / "build_model.py", root / "publish_assets.py",
                                      root / "requirements.txt", placement)},
              "output": {path.relative_to(tmp_path).as_posix(): file_hash(path)
                         for path in (geometry, mesh)}}
    (root / "exports/build-report.json").write_text(json.dumps(report))
    return root


@pytest.mark.parametrize("changed", ["build_model.py", "exports/sleeve.stl"])
def test_render_rejects_stale_cad(mechanical: Path, changed: str) -> None:
    (mechanical / changed).write_text("changed")
    with pytest.raises(ValueError, match="CAD build is stale"):
        render_inputs(mechanical)


def test_render_requires_hash_for_every_imported_mesh(mechanical: Path) -> None:
    report_path = mechanical / "exports/build-report.json"
    report = json.loads(report_path.read_text())
    del report["output"]["mechanical/exports/sleeve.stl"]
    report_path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="does not cover mechanical/exports/sleeve.stl"):
        render_inputs(mechanical)


@pytest.mark.parametrize("name", ["mechanical/build_model.py", "mechanical/requirements.txt",
                                 "mechanical/publish_assets.py",
                                 "electronics/boost-prototype/component-placement.json"])
def test_render_rejects_omitted_cad_source_hash(mechanical: Path, name: str) -> None:
    report_path = mechanical / "exports/build-report.json"
    report = json.loads(report_path.read_text())
    del report["inputs"][name]
    report_path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="omits required source hashes"):
        render_inputs(mechanical)


def stage_renders(stage: Path, views: list[str]) -> None:
    stage.mkdir()
    for view in views:
        for extension in ("png", "blend"):
            (stage / f"spark_{view}.{extension}").write_text(f"{view} {extension}")


@pytest.mark.parametrize("failure", ["changed_input", "missing_output"])
def test_failed_render_keeps_previous_outputs(mechanical: Path, failure: str) -> None:
    previous = mechanical / "renders/spark_assembled.png"
    previous.write_text("previous image")
    inputs = render_inputs(mechanical)
    stage = mechanical / "staged"
    stage_renders(stage, ["assembled"])
    if failure == "changed_input":
        (mechanical / "render_model.py").write_text("new source")
        error = "Render inputs changed"
    else:
        (stage / "spark_assembled.blend").unlink()
        error = "Render did not produce"
    with pytest.raises(ValueError, match=error):
        publish_renders(mechanical, stage, ["assembled"], inputs, "test")
    assert previous.read_text() == "previous image"
    assert not (mechanical / "renders/build-report.json").exists()


@pytest.mark.parametrize("source_changed", [False, True])
def test_partial_render_keeps_other_hashes_only_for_matching_sources(
    mechanical: Path, source_changed: bool
) -> None:
    stage = mechanical / "staged"
    stage_renders(stage, list(VIEWS))
    publish_renders(mechanical, stage, list(VIEWS), render_inputs(mechanical), "test")
    if source_changed:
        (mechanical / "render_model.py").write_text("new appearance")
    (stage / "spark_assembled.png").write_text("new image")
    (stage / "spark_assembled.blend").write_text("new scene")
    publish_renders(mechanical, stage, ["assembled"], render_inputs(mechanical), "test")
    report = json.loads((mechanical / "renders/build-report.json").read_text())
    assert len(report["output"]) == (2 if source_changed else 6)
    for name, expected in report["output"].items():
        assert file_hash(mechanical.parent / name) == expected


def test_partial_render_does_not_label_old_outputs_with_a_new_blender_version(mechanical: Path) -> None:
    stage = mechanical / "staged"
    stage_renders(stage, list(VIEWS))
    publish_renders(mechanical, stage, list(VIEWS), render_inputs(mechanical), "old")
    (stage / "spark_assembled.png").write_text("new image")
    (stage / "spark_assembled.blend").write_text("new scene")
    publish_renders(mechanical, stage, ["assembled"], render_inputs(mechanical), "new")
    report = json.loads((mechanical / "renders/build-report.json").read_text())
    assert report["blender_version"] == "new"
    assert set(report["output"]) == {"mechanical/renders/spark_assembled.png",
                                     "mechanical/renders/spark_assembled.blend"}
