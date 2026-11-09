from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = ("electronics", "mechanical", "review", "sourcing", "scripts")
MANIFEST = "prototype-sha256.json"
VERIFICATION_REPORT = "scripts/verification-report.json"
ENGINEERING_BUILDS = {
    "mechanical/compact-exports/build-report.json": {
        "inputs": {"mechanical/build_compact_model.py", "mechanical/publish_assets.py",
                   "mechanical/requirements.txt", "electronics/compact-design/layout.json"},
        "output": {"mechanical/compact-exports/geometry-report.json",
                   *(f"mechanical/compact-exports/spark_{version}_packing.step"
                     for version in ("300", "530", "850"))},
    },
    "mechanical/exports/build-report.json": {
        "inputs": {"mechanical/build_model.py", "mechanical/requirements.txt", "mechanical/publish_assets.py",
                   "electronics/boost-prototype/component-placement.json"},
        "output": {"mechanical/mechanical-contract.json", "mechanical/exports/spark_assembly.glb",
                   "mechanical/exports/spark_assembly.step",
                   "mechanical/exports/geometry-report.json", "mechanical/exports/print-mesh-report.json",
                   *(f"mechanical/print_parts/{name}.stl" for name in
                     ("sleeve", "carrier", "front_cover", "bottom_cap"))},
    },
    "electronics/boost-prototype/build-report.json": {
        "inputs": {f"electronics/boost-prototype/{name}" for name in
                   ("circuit.json", "circuit_checks.py", "generate_board.py", "generate_schematic.py", "build_electronics.py",
                    "spark_boost_rev_a.kicad_pro", "manufacturing-review/status.json")},
        "output": {f"electronics/boost-prototype/{name}" for name in
                   ("spark_boost_rev_a.kicad_pcb", "spark_boost_rev_a.kicad_sch",
                    "spark_boost_rev_a.net.xml", "component-placement.json", "BOM.csv", "electrical-report.json",
                    "erc-report.txt", "drc-parity-report.txt", "drc.txt", "Spark.kicad_sym",
                    "fp-lib-table", "sym-lib-table", "spark_boost_rev_a.pdf", "preview/pcb-front.svg",
                    "manufacturing-review/spark_boost_rev_a.drl",
                    *(f"manufacturing-review/spark_boost_rev_a-{suffix}" for suffix in
                      ("B_Cu.gbl", "B_Mask.gbs", "B_Paste.gbp", "Edge_Cuts.gm1", "F_Cu.gtl",
                       "F_Mask.gts", "F_Paste.gtp", "In1_Cu.g1", "In2_Cu.g2", "b_silkscreen.gbo",
                       "f_silkscreen.gto", "job.gbrjob")))},
    },
    "mechanical/renders/build-report.json": {
        "inputs": {"mechanical/render_model.py", "mechanical/render_assets.py", "mechanical/publish_assets.py",
                   "mechanical/exports/geometry-report.json", "mechanical/exports/build-report.json"},
        "output": {f"mechanical/renders/spark_{view}.{extension}"
                   for view in ("assembled", "exploded", "cutaway")
                   for extension in ("png", "blend")},
    },
}
REVIEW_PAGES = {"review/index.html", "review/parts.html", "review/comparison.html"}
REVIEW_OUTPUTS = REVIEW_PAGES | {"review/part-catalog.mjs"}


def required_build_files(files: dict[str, bytes], name: str) -> dict[str, set[str]]:
    if name == "review/build-report.json":
        sources = {path for path in files if path.startswith("review/")
                   and path not in REVIEW_OUTPUTS
                   and ((path.endswith((".js", ".mjs")) and not path.endswith(".test.mjs"))
                        or path.endswith(".template.html"))}
        return {
            "inputs": sources | {"review/build.mjs", "review/template.html", "review/package.json",
                                 "review/package-lock.json", "mechanical/mechanical-contract.json",
                                 "electronics/compact-design/layout.json",
                                 "mechanical/exports/spark_assembly.glb"},
            "output": REVIEW_OUTPUTS,
        }
    required = {section: paths.copy() for section, paths in ENGINEERING_BUILDS[name].items()}
    if name == "electronics/boost-prototype/build-report.json":
        circuit = json.loads(files["electronics/boost-prototype/circuit.json"])
        for component in circuit["components"]:
            namespace, separator, footprint = component["footprint"].partition(":")
            if namespace != "Spark" or not separator or not footprint or footprint in {".", ".."} \
                    or "/" in footprint or "\\" in footprint:
                raise ValueError(f"Invalid local footprint for {component['ref']}")
            required["output"].add(f"electronics/boost-prototype/Spark.pretty/{footprint}.kicad_mod")
    folders = {
        "mechanical/compact-exports/build-report.json": ("mechanical/compact-exports/",),
        "mechanical/exports/build-report.json": ("mechanical/exports/", "mechanical/print_parts/"),
        "mechanical/renders/build-report.json": ("mechanical/renders/",),
        "electronics/boost-prototype/build-report.json": (
            "electronics/boost-prototype/Spark.pretty/",
            "electronics/boost-prototype/manufacturing-review/",
            "electronics/boost-prototype/preview/"),
    }[name]
    if name == "mechanical/renders/build-report.json":
        required["inputs"].update(path for path in files
                                  if path.startswith("mechanical/exports/") and path.endswith(".stl"))
    required["output"].update(path for path in files
                              if path.startswith(folders) and path != name
                              and path not in required["inputs"])
    return required


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def project_files(root: Path) -> dict[str, bytes]:
    paths = [root / "prototype-status.json"]
    for folder in FOLDERS:
        paths.extend(sorted((root / folder).rglob("*")))
    files = {}
    for path in paths:
        relative = path.relative_to(root)
        if any(part.startswith(".") or part in {"__pycache__", "node_modules"}
               or part.endswith("-backups") for part in relative.parts):
            continue
        if path.name.endswith((".blend1", ".pyc", ".kicad_prl")):
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Package input must be a local file: {relative}")
        if path.is_file():
            files[relative.as_posix()] = path.read_bytes()
    return files


class ViewerHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[tuple[str, str]] = []
        self.model = ""
        self.in_model = False
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "a" and attributes.get("href"):
            self.references.append(("link", attributes["href"]))
        resource_attribute = {"img": "src", "script": "src", "link": "href"}.get(tag)
        if resource_attribute and attributes.get(resource_attribute):
            self.references.append(("resource", attributes[resource_attribute]))
        if tag == "script" and attributes.get("id") == "model-data":
            self.in_model = True

    def handle_data(self, data: str) -> None:
        if self.in_model:
            self.model += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_model = False


def validate_page_references(files: dict[str, bytes], name: str, page: ViewerHTML,
                             pages: dict[str, ViewerHTML]) -> None:
    for kind, reference in page.references:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            continue
        path = unquote(url.path)
        if path.startswith("/"):
            raise ValueError(f"Review page {name} {kind}s must be relative for the extracted package: {reference}")
        parts = list(Path(name).parent.parts) if path else list(Path(name).parts)
        for part in path.split("/"):
            if part == "..":
                if not parts:
                    raise ValueError(f"Review page {name} {kind} leaves the package: {reference}")
                parts.pop()
            elif part and part != ".":
                parts.append(part)
        target = "/".join(parts)
        directory_link = kind == "link" and any(path.startswith(target + "/") for path in files)
        if target not in files and not directory_link:
            raise ValueError(f"Review page {name} {kind} is missing from the package: {reference}")
        if url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            raise ValueError(f"Review page {name} fragment is missing from {target}: {reference}")


def validate_build(files: dict[str, bytes], name: str,
                   required: dict[str, set[str]] | None = None) -> None:
    if name not in files:
        raise ValueError(f"Missing build report: {name}; regenerate its outputs before packaging")
    report = json.loads(files[name])
    for section in ("inputs", "output"):
        hashes = report.get(section) if isinstance(report, dict) else None
        if not isinstance(hashes, dict) or not hashes:
            raise ValueError(f"Invalid {section} hashes in {name}")
        if required and not required[section].issubset(hashes):
            raise ValueError(f"Incomplete {section} hashes in {name}")
        for path, expected in hashes.items():
            if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise ValueError(f"Invalid SHA256 for {path} in {name}")
            if path not in files or digest(files[path]) != expected:
                raise ValueError(f"Build is stale for {path}; regenerate {name} before packaging")


def validate_viewer(files: dict[str, bytes]) -> None:
    missing = REVIEW_PAGES - files.keys()
    if missing:
        raise ValueError("Missing review pages: " + ", ".join(sorted(missing)))
    pages = {}
    for name, data in files.items():
        path = Path(name)
        if path.parts[0] != "review" or path.suffix != ".html":
            continue
        if path.name == "template.html" or path.name.endswith(".template.html"):
            continue
        page = ViewerHTML()
        page.feed(data.decode())
        pages[name] = page
    try:
        embedded = base64.b64decode(pages["review/index.html"].model.strip(), validate=True)
    except ValueError as error:
        raise ValueError("Viewer model is not valid base64; rebuild review/index.html") from error
    if embedded != files["mechanical/exports/spark_assembly.glb"]:
        raise ValueError("Viewer contains an outdated model; run npm --prefix review run build")
    for name, page in pages.items():
        validate_page_references(files, name, page, pages)
    validate_build(files, "review/build-report.json", required_build_files(files, "review/build-report.json"))


def package_name(files: dict[str, bytes]) -> str:
    revision = json.loads(files["prototype-status.json"])["revision"]
    if not isinstance(revision, str) or not re.fullmatch(r"[A-Za-z0-9-]+", revision):
        raise ValueError("Prototype revision must contain only letters, numbers or hyphens")
    return f"Spark-prototype-{revision}"


def verify_archive(path: Path, files: dict[str, bytes], prefix: str) -> None:
    with zipfile.ZipFile(path) as archive:
        expected = {f"{prefix}/{name}" for name in files}
        names = archive.namelist()
        if len(names) != len(expected) or set(names) != expected:
            raise ValueError("Archive file list differs from the current package")
        for name, data in files.items():
            if archive.read(f"{prefix}/{name}") != data:
                raise ValueError(f"Archive is stale or damaged: {name}")


def validate_project(files: dict[str, bytes]) -> None:
    for report in ENGINEERING_BUILDS:
        validate_build(files, report, required_build_files(files, report))
    validate_viewer(files)
    validate_contracts(files)


def validate_contracts(files: dict[str, bytes]) -> None:
    status = json.loads(files["prototype-status.json"])
    contract = json.loads(files["mechanical/mechanical-contract.json"])
    circuit = json.loads(files["electronics/boost-prototype/circuit.json"])
    expected = {
        "enclosure_mm": [contract["dimensions"][key] for key in ("length", "width", "thickness")],
        "pcb_mm": [contract["pcb"][key] for key in ("width", "length", "thickness")],
        "cell_candidate": contract["cell"]["model"],
        "target_power_w": circuit["target_output"]["power_target_w"],
    }
    for key, value in expected.items():
        if status.get(key) != value:
            raise ValueError(f"Prototype status {key} disagrees with the engineering source")
    display = contract["display"]
    glass = display["glass_envelope"]
    for key, value in {"candidate": display["candidate"], "glass_mm": [glass[0], glass[2], glass[1]],
                       "active_area_mm": display["active_area"], "resolution_px": display["resolution_px"]}.items():
        if status.get("display", {}).get(key) != value:
            raise ValueError(f"Prototype status display.{key} disagrees with the mechanical contract")


def verification_hashes(files: dict[str, bytes]) -> dict[str, str]:
    return {name: digest(data) for name, data in sorted(files.items()) if name != VERIFICATION_REPORT}


def validate_verification(files: dict[str, bytes]) -> None:
    if VERIFICATION_REPORT not in files:
        raise ValueError("Missing verification report; run scripts/verify_project.py before packaging")
    report = json.loads(files[VERIFICATION_REPORT])
    if not isinstance(report, dict) or report.get("status") != "passed":
        raise ValueError("Project verification did not pass; run scripts/verify_project.py")
    if report.get("inputs") != verification_hashes(files):
        raise ValueError("Project verification is stale; run scripts/verify_project.py before packaging")


def publish_files(staged: dict[Path, Path]) -> None:
    backup = Path(tempfile.mkdtemp(prefix=".spark-publication-", dir=next(iter(staged)).parent))
    cleanup = True
    try:
        previous = {}
        published = []
        for index, destination in enumerate(staged):
            if destination.exists():
                saved = backup / f"previous-{index}"
                shutil.copyfile(destination, saved)
                previous[destination] = saved
        (backup / "recovery-map.json").write_text(json.dumps(
            {saved.name: str(destination) for destination, saved in previous.items()}, indent=2
        ) + "\n")
        try:
            for destination, source in staged.items():
                source.replace(destination)
                published.append(destination)
        except BaseException as error:
            failed = []
            for destination in reversed(published):
                try:
                    if destination in previous:
                        previous[destination].replace(destination)
                    else:
                        destination.unlink(missing_ok=True)
                except OSError:
                    failed.append(str(destination))
            if failed:
                cleanup = False
                raise RuntimeError(f"Could not restore {', '.join(failed)}; recovery files remain at {backup}") from error
            raise
    finally:
        if cleanup:
            shutil.rmtree(backup)


def package(root: Path, write: bool = False) -> tuple[Path, int]:
    files = project_files(root)
    validate_project(files)
    validate_verification(files)
    prefix = package_name(files)
    archive_path = root / f"{prefix}.zip"
    manifest = {name: digest(data) for name, data in sorted(files.items())}
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    files[MANIFEST] = manifest_bytes
    if write:
        with tempfile.TemporaryDirectory(prefix=".spark-package-", dir=root) as temporary:
            staged = Path(temporary) / archive_path.name
            with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as archive:
                for name, data in sorted(files.items()):
                    entry = zipfile.ZipInfo(f"{prefix}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    entry.create_system = 3
                    entry.external_attr = 0o100644 << 16
                    archive.writestr(entry, data)
            verify_archive(staged, files, prefix)
            # Detect edits during packaging before replacing the existing deliverable.
            if project_files(root) != {name: data for name, data in files.items() if name != MANIFEST}:
                raise ValueError("Project changed while packaging; retry after edits finish")
            staged_manifest = Path(temporary) / MANIFEST
            staged_manifest.write_bytes(manifest_bytes)
            publish_files({archive_path: staged, root / MANIFEST: staged_manifest})
    else:
        saved = json.loads((root / MANIFEST).read_text())
        if saved != manifest:
            changed = sorted(name for name in saved.keys() | manifest.keys()
                             if saved.get(name) != manifest.get(name))
            raise ValueError("Package needs rebuilding: " + ", ".join(changed))
        # Preserve the saved manifest's formatting when checking the ZIP.
        files[MANIFEST] = (root / MANIFEST).read_bytes()
        verify_archive(archive_path, files, prefix)
    return archive_path, len(files)


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Spark's viewer, hashes and ZIP, or rebuild the ZIP.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="Replace the manifest and ZIP after validation")
    mode.add_argument("--check", action="store_true", help="Verify without changing files; the default")
    args = parser.parse_args()
    try:
        archive, count = package(ROOT, write=args.write)
    except (ValueError, KeyError, OSError, RuntimeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Package check failed: {error}\n")
    print(f"Verified {count} files in {archive.name}")


if __name__ == "__main__":
    main()
