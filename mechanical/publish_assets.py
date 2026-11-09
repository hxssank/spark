from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path


def publish_files(staged: dict[Path, Path], obsolete: list[Path] | None = None) -> None:
    destinations = [*staged.values(), *(obsolete or [])]
    if not staged or len({target.resolve() for target in destinations}) != len(destinations):
        raise ValueError("Publication requires distinct output paths")
    for source, target in staged.items():
        if source.is_symlink() or not source.is_file() or source.resolve() == target.resolve():
            raise ValueError(f"Publication input must be a separate regular file: {source}")
    for target in destinations:
        if target.is_symlink() or target.exists() and not target.is_file():
            raise ValueError(f"Publication target must be a regular file: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix=".spark-publish-", dir=next(iter(staged.values())).parent))
    cleanup = True
    try:
        saved = {}
        for index, target in enumerate(destinations):
            if target.exists():
                saved[target] = backup / str(index)
                shutil.copy2(target, saved[target])
        (backup / "recovery-map.json").write_text(json.dumps(
            {path.name: str(target) for target, path in saved.items()}, indent=2
        ) + "\n")
        changed = []
        try:
            for target in obsolete or []:
                if target.exists():
                    target.unlink()
                    changed.append(target)
            for source, target in staged.items():
                source.replace(target)
                changed.append(target)
        except BaseException as error:
            failures = []
            for target in reversed(changed):
                try:
                    if target in saved:
                        saved[target].replace(target)
                    else:
                        target.unlink(missing_ok=True)
                except OSError:
                    failures.append(str(target))
            if failures:
                cleanup = False
                raise RuntimeError(f"Could not restore {', '.join(failures)}; recovery files remain at {backup}") from error
            raise
    finally:
        if cleanup:
            shutil.rmtree(backup)
