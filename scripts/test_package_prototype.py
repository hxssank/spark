import base64
import json
import zipfile
from pathlib import Path

import pytest
from package_prototype import (
    ENGINEERING_BUILDS,
    VERIFICATION_REPORT,
    digest,
    package,
    project_files,
    required_build_files,
    verification_hashes,
)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    model = b"glTF test model"
    files = {
        "prototype-status.json": json.dumps({
            "revision": "A", "enclosure_mm": [116, 24, 14.8], "pcb_mm": [20, 38, 1],
            "cell_candidate": "cell", "target_power_w": 25,
            "display": {"candidate": "panel", "glass_mm": [15, 17.5, 1.2],
                        "active_area_mm": [10.73, 10.73], "resolution_px": [64, 64]},
        }).encode(),
        "mechanical/mechanical-contract.json": json.dumps({
            "dimensions": {"length": 116, "width": 24, "thickness": 14.8},
            "pcb": {"width": 20, "length": 38, "thickness": 1}, "cell": {"model": "cell"},
            "display": {"candidate": "panel", "glass_envelope": [15, 1.2, 17.5],
                        "active_area": [10.73, 10.73], "resolution_px": [64, 64]},
        }).encode(),
        "mechanical/exports/spark_assembly.glb": model,
        "mechanical/print_parts/carrier.stl": b"test mesh",
        "electronics/power-design.md": b"bench design",
        "electronics/compact-design/layout.json": b"{}",
        "electronics/boost-prototype/circuit.json": json.dumps({
            "components": [{"ref": "R1", "footprint": "Spark:R1_R_0402"}],
            "target_output": {"power_target_w": 25},
        }).encode(),
        "review/viewer.js": b"source",
        "review/build.mjs": b"build source",
        "review/package.json": b"{}",
        "review/package-lock.json": b"{}",
        "review/part-catalog.mjs": b"export default {};",
        "review/comparison.html": b"<p>Comparison</p>",
        "review/parts.css": b"body { color: black; }",
        "review/parts.js": b"void 0;",
        "review/images/board.png": b"test image",
        "review/template.html": b'<a href="__GENERATED_LINK__">Template</a>',
        "review/parts-page.template.html": b'<img src="__GENERATED_IMAGE__">',
        "review/parts.html": (
            b'<a href="../electronics/power-design.md">Power design</a>'
            b'<img src="images/board.png" alt="Board">'
            b'<link rel="stylesheet" href="parts.css">'
            b'<script src="parts.js"></script>'
        ),
        "review/index.html": (
            '<a href="../mechanical/print_parts/carrier.stl">Carrier</a>'
            '<script id="model-data" type="application/octet-stream">'
            + base64.b64encode(model).decode() + "</script>"
        ).encode(),
    }
    for report, sections in ENGINEERING_BUILDS.items():
        for paths in sections.values():
            for name in paths:
                files.setdefault(name, b"engineering fixture")
        sections = required_build_files(files, report)
        for paths in sections.values():
            for name in paths:
                files.setdefault(name, b"engineering fixture")
        files[report] = json.dumps({
            section: {name: digest(files[name]) for name in paths}
            for section, paths in sections.items()
        }).encode()
    files["review/build-report.json"] = json.dumps({
        section: {name: digest(files[name]) for name in paths}
        for section, paths in required_build_files(files, "review/build-report.json").items()
    }).encode()
    files[VERIFICATION_REPORT] = json.dumps({"status": "passed", "inputs": verification_hashes(files)}).encode()
    for name, data in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return tmp_path


def test_package_round_trip_excludes_local_tooling(project: Path) -> None:
    for name in ("review/node_modules/package/file.js", "mechanical/__pycache__/model.pyc",
                 "mechanical/renders/old.blend1", "electronics/board-backups/old.zip"):
        path = project / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("local only")
    archive, count = package(project, write=True)
    assert count == len(project_files(project)) + 1
    assert package(project) == (archive, count)
    with zipfile.ZipFile(archive) as saved:
        assert not any("local only" == saved.read(name).decode(errors="replace")
                       for name in saved.namelist())


def test_changed_source_requires_viewer_rebuild(project: Path) -> None:
    package(project, write=True)
    (project / "review/viewer.js").write_text("changed")
    with pytest.raises(ValueError, match="Build is stale"):
        package(project, write=True)


def test_changed_geometry_requires_viewer_rebuild(project: Path) -> None:
    (project / "mechanical/exports/spark_assembly.glb").write_bytes(b"new model")
    with pytest.raises(ValueError, match="Build is stale"):
        package(project, write=True)


def test_missing_download_blocks_packaging(project: Path) -> None:
    (project / "mechanical/print_parts/carrier.stl").unlink()
    with pytest.raises(ValueError, match="Build is stale"):
        package(project, write=True)


def test_missing_parts_page_link_blocks_packaging(project: Path) -> None:
    (project / "electronics/power-design.md").unlink()
    with pytest.raises(ValueError, match=r"review/parts\.html link is missing.*power-design\.md"):
        package(project, write=True)


def test_missing_parts_page_image_blocks_packaging(project: Path) -> None:
    (project / "review/images/board.png").unlink()
    with pytest.raises(ValueError, match=r"review/parts\.html resource is missing.*board\.png"):
        package(project, write=True)


def test_changed_file_detected_without_modifying_archive(project: Path) -> None:
    archive, _ = package(project, write=True)
    before = archive.read_bytes()
    (project / "mechanical/print_parts/carrier.stl").write_bytes(b"updated mesh")
    with pytest.raises(ValueError, match="Build is stale"):
        package(project)
    assert archive.read_bytes() == before


def test_archive_corruption_detected(project: Path) -> None:
    archive, _ = package(project, write=True)
    archive.write_bytes(b"broken")
    with pytest.raises(zipfile.BadZipFile):
        package(project)


def test_archive_payload_change_detected(project: Path) -> None:
    archive, _ = package(project, write=True)
    with zipfile.ZipFile(archive) as saved:
        entries = {name: saved.read(name) for name in saved.namelist()}
    entries["Spark-prototype-A/mechanical/print_parts/carrier.stl"] = b"wrong mesh"
    with zipfile.ZipFile(archive, "w") as saved:
        for name, data in entries.items():
            saved.writestr(name, data)
    with pytest.raises(ValueError, match="Archive is stale or damaged"):
        package(project)


def test_symlink_not_packaged(project: Path, tmp_path: Path) -> None:
    (project / "review/linked").symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError, match="must be a local file"):
        package(project, write=True)


def test_root_relative_link_rejected_for_offline_package(project: Path) -> None:
    page = project / "review/index.html"
    page.write_text(page.read_text().replace("../mechanical/", "/mechanical/"))
    with pytest.raises(ValueError, match="links must be relative"):
        package(project, write=True)


@pytest.mark.parametrize("name", [
    "mechanical/build_model.py",
    "mechanical/exports/spark_assembly.step",
    "electronics/boost-prototype/generate_board.py",
    "electronics/boost-prototype/spark_boost_rev_a.kicad_pcb",
    "mechanical/render_model.py",
    "mechanical/renders/spark_assembled.png",
])
def test_stale_engineering_build_blocks_packaging(project: Path, name: str) -> None:
    archive, _ = package(project, write=True)
    original = archive.read_bytes()
    (project / name).write_bytes(b"changed since build")
    with pytest.raises(ValueError, match="Build is stale"):
        package(project, write=True)
    assert archive.read_bytes() == original


@pytest.mark.parametrize("report", ENGINEERING_BUILDS)
def test_missing_engineering_report_blocks_packaging(project: Path, report: str) -> None:
    (project / report).unlink()
    with pytest.raises(ValueError, match="Missing build report"):
        package(project, write=True)


def test_incomplete_engineering_report_blocks_packaging(project: Path) -> None:
    path = project / "mechanical/exports/build-report.json"
    report = json.loads(path.read_text())
    report["inputs"].pop("mechanical/build_model.py")
    path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="Incomplete inputs hashes"):
        package(project, write=True)


@pytest.mark.parametrize("reference", ["parts.html#absent", "#absent"])
def test_missing_fragment_blocks_packaging(project: Path, reference: str) -> None:
    page = project / "review/index.html"
    page.write_text(page.read_text() + f'<a href="{reference}">Part details</a>')
    with pytest.raises(ValueError, match="fragment is missing"):
        package(project, write=True)


def test_valid_encoded_fragment_is_accepted(project: Path) -> None:
    page = project / "review/index.html"
    page.write_text(page.read_text() + '<a href="parts.html#part%20one">Details</a>')
    parts = project / "review/parts.html"
    parts.write_text(parts.read_text() + '<section id="part one"></section>')
    report_path = project / "review/build-report.json"
    report = json.loads(report_path.read_text())
    for path in (page, parts):
        report["output"][path.relative_to(project).as_posix()] = digest(path.read_bytes())
    report_path.write_text(json.dumps(report))
    (project / VERIFICATION_REPORT).write_text(json.dumps({
        "status": "passed", "inputs": verification_hashes(project_files(project)),
    }))
    package(project, write=True)


def test_untested_edit_blocks_release_without_replacing_previous_archive(project: Path) -> None:
    archive, _ = package(project, write=True)
    previous = archive.read_bytes()
    (project / "scripts/test_new_check.py").write_text("def test_example(): pass\n")
    with pytest.raises(ValueError, match="verification is stale"):
        package(project, write=True)
    assert archive.read_bytes() == previous


def test_missing_verification_blocks_release(project: Path) -> None:
    (project / VERIFICATION_REPORT).unlink()
    with pytest.raises(ValueError, match="Missing verification report"):
        package(project, write=True)


def test_failed_manifest_publication_restores_both_package_files(
    project: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    archive, _ = package(project, write=True)
    manifest = project / "prototype-sha256.json"
    previous = {path: path.read_bytes() for path in (archive, manifest)}
    original = Path.replace

    def fail_manifest(source: Path, target: Path) -> Path:
        if source.name == "prototype-sha256.json":
            raise OSError("simulated manifest disk failure")
        return original(source, target)

    monkeypatch.setattr(Path, "replace", fail_manifest)
    with pytest.raises(OSError, match="manifest disk failure"):
        package(project, write=True)
    assert {path: path.read_bytes() for path in previous} == previous


def test_failed_package_rollback_keeps_recovery_files_after_staging_cleanup(
    project: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    archive, _ = package(project, write=True)
    original_archive = archive.read_bytes()
    replace = Path.replace

    def fail_publication_and_restore(source: Path, target: Path) -> Path:
        if source.name == "prototype-sha256.json" or source.name.startswith("previous-"):
            raise OSError("simulated disk failure")
        return replace(source, target)

    monkeypatch.setattr(Path, "replace", fail_publication_and_restore)
    with pytest.raises(RuntimeError, match="recovery files remain"):
        package(project, write=True)
    recovery, = project.glob(".spark-publication-*")
    mapping = json.loads((recovery / "recovery-map.json").read_text())
    saved_name = next(name for name, target in mapping.items() if target == str(archive))
    assert (recovery / saved_name).read_bytes() == original_archive
    assert not list(project.glob(".spark-package-*"))


@pytest.mark.parametrize(("key", "value"), [
    ("enclosure_mm", [100, 20, 10]), ("pcb_mm", [10, 20, 1]),
    ("cell_candidate", "different cell"), ("target_power_w", 40),
    ("display", {"candidate": "different panel"}),
])
def test_status_cannot_publish_dimensions_or_targets_that_disagree_with_cad(
    project: Path, key: str, value: object,
) -> None:
    path = project / "prototype-status.json"
    status = json.loads(path.read_text())
    status[key] = value
    path.write_text(json.dumps(status))
    with pytest.raises(ValueError, match="disagrees with"):
        package(project, write=True)


@pytest.mark.parametrize(("section", "name"), [
    ("inputs", "review/viewer.js"),
    ("inputs", "review/parts-page.template.html"),
    ("output", "review/comparison.html"),
    ("output", "review/part-catalog.mjs"),
])
def test_incomplete_review_report_blocks_packaging(project: Path, section: str, name: str) -> None:
    report_path = project / "review/build-report.json"
    report = json.loads(report_path.read_text())
    report[section].pop(name)
    changed = b"changed without a recorded hash"
    for other_section in ("inputs", "output"):
        if name in report[other_section]:
            report[other_section][name] = digest(changed)
    report_path.write_text(json.dumps(report))
    (project / name).write_bytes(changed)
    with pytest.raises(ValueError, match=f"Incomplete {section} hashes"):
        package(project, write=True)


def test_missing_unlinked_review_page_blocks_packaging(project: Path) -> None:
    (project / "review/comparison.html").unlink()
    with pytest.raises(ValueError, match="Missing review pages: review/comparison.html"):
        package(project, write=True)


@pytest.mark.parametrize("name", [
    "mechanical/exports/obsolete_part.step",
    "mechanical/print_parts/obsolete_part.stl",
    "mechanical/renders/obsolete_render.png",
    "electronics/boost-prototype/Spark.pretty/obsolete_part.kicad_mod",
    "electronics/boost-prototype/manufacturing-review/obsolete_layer.gbr",
    "electronics/boost-prototype/preview/obsolete_board.svg",
])
def test_unrecorded_generated_output_blocks_packaging(project: Path, name: str) -> None:
    path = project / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"output left over from an older build")
    with pytest.raises(ValueError, match="Incomplete output hashes"):
        package(project, write=True)


def test_archive_has_reproducible_metadata(project: Path) -> None:
    archive, _ = package(project, write=True)
    before = archive.read_bytes()
    with zipfile.ZipFile(archive) as saved:
        for entry in saved.infolist():
            assert entry.date_time == (1980, 1, 1, 0, 0, 0)
            assert entry.create_system == 3
            assert entry.external_attr >> 16 == 0o100644
    package(project, write=True)
    assert archive.read_bytes() == before


@pytest.mark.parametrize("name", [
    "electronics/boost-prototype/manufacturing-review/spark_boost_rev_a-F_Cu.gtl",
    "electronics/boost-prototype/manufacturing-review/spark_boost_rev_a.drl",
    "electronics/boost-prototype/Spark.pretty/R1_R_0402.kicad_mod",
])
def test_missing_output_and_hash_cannot_bypass_completeness(project: Path, name: str) -> None:
    (project / name).unlink()
    report_path = project / "electronics/boost-prototype/build-report.json"
    report = json.loads(report_path.read_text())
    report["output"].pop(name)
    report_path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="Incomplete output hashes"):
        package(project, write=True)
