from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from publish_assets import publish_files

VIEWS = ("assembled", "exploded", "cutaway")


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_inputs(mechanical: Path) -> dict[str, str]:
    project = mechanical.parent
    build_report = mechanical / "exports/build-report.json"
    report = json.loads(build_report.read_text())
    if not isinstance(report, dict):
        raise TypeError("CAD build report must be an object")
    required_inputs = {"mechanical/build_model.py", "mechanical/requirements.txt",
                       "mechanical/publish_assets.py", "electronics/boost-prototype/component-placement.json"}
    for section in ("inputs", "output"):
        hashes = report.get(section)
        if not isinstance(hashes, dict) or not hashes:
            raise ValueError(f"CAD build report has no {section} hashes")
        if section == "inputs" and not required_inputs.issubset(hashes):
            raise ValueError("CAD build report omits required source hashes")
        for name, expected in hashes.items():
            path = project / name
            if path.is_symlink() or not path.resolve().is_relative_to(project.resolve()):
                raise ValueError(f"CAD build report contains a nonlocal path: {name}")
            if not path.is_file() or file_hash(path) != expected:
                raise ValueError(f"CAD build is stale for {name}; regenerate before rendering")
    geometry = mechanical / "exports/geometry-report.json"
    parts = json.loads(geometry.read_text())
    if not isinstance(parts, dict) or not parts or any(
        not re.fullmatch(r"[a-z][a-z0-9_]*", name) for name in parts
    ):
        raise ValueError("Geometry report must name the CAD parts")
    required = [geometry, *(mechanical / "exports" / f"{name}.stl" for name in parts)]
    for path in required:
        name = path.relative_to(project).as_posix()
        if report["output"].get(name) != file_hash(path):
            raise ValueError(f"CAD build report does not cover {name}")
    paths = [build_report, mechanical / "render_model.py", mechanical / "render_assets.py",
             mechanical / "publish_assets.py", *required]
    return {path.relative_to(project).as_posix(): file_hash(path) for path in paths}


def publish_renders(mechanical: Path, stage: Path, views: list[str],
                    inputs: dict[str, str], blender_version: str) -> None:
    if not views or len(set(views)) != len(views) or any(view not in VIEWS for view in views):
        raise ValueError("Render publication requires distinct named views")
    if render_inputs(mechanical) != inputs:
        raise ValueError("Render inputs changed; rerun after edits finish")
    project = mechanical.parent
    output = mechanical / "renders"
    report_path = output / "build-report.json"
    hashes = {}
    if report_path.exists():
        previous = json.loads(report_path.read_text())
        if previous.get("inputs") == inputs and previous.get("blender_version") == blender_version:
            for view in VIEWS:
                for extension in ("png", "blend"):
                    name = f"mechanical/renders/spark_{view}.{extension}"
                    path = project / name
                    if path.is_file() and previous.get("output", {}).get(name) == file_hash(path):
                        hashes[name] = file_hash(path)
    staged = [stage / f"spark_{view}.{extension}" for view in views for extension in ("png", "blend")]
    for path in staged:
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Render did not produce {path.name}")
        hashes[f"mechanical/renders/{path.name}"] = file_hash(path)
    report = {"blender_version": blender_version, "inputs": inputs, "output": dict(sorted(hashes.items()))}
    staged_report = stage / "build-report.json"
    staged_report.write_text(json.dumps(report, indent=2) + "\n")
    output.mkdir(exist_ok=True)
    publish_files({**{path: output / path.name for path in staged}, staged_report: report_path})
