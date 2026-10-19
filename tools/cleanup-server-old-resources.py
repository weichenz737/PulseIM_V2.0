from __future__ import annotations

import argparse
import os
import re
import shutil
import tarfile
from pathlib import Path


ROOT = Path("/opt/pulseim")
CURRENT_DESKTOP_ARCHIVE = ROOT / "pulse-desktop-web-20260822-182800.tgz"
CURRENT_MOBILE_ARCHIVE = ROOT / "pulse-mobile-web-20260822-175215.tgz"

OLD_ARCHIVES = [
    "pulse-desktop-web-20260820-172834.tgz",
    "pulse-desktop-web-20260820-182015.tgz",
    "desktop-web-20260822.tgz",
    "pulse-desktop-web-20260822.tgz",
    "pulse-desktop-web-20260822-175856.tgz",
    "pulse-desktop-web-20260822-180215.tgz",
    "pulse-desktop-web-20260822-180520.tgz",
    "pulse-desktop-web-20260822-181640.tgz",
    "pulse-desktop-web-20260822-182400.tgz",
    "mobile-web-20260822.tgz",
    "mobile-web-20260822-173302.tgz",
]


def mobile_archive_files() -> set[str]:
    with tarfile.open(CURRENT_MOBILE_ARCHIVE, "r:gz") as archive:
        names = {name.lstrip("./") for name in archive.getnames() if not name.endswith("/")}
    return {name.removeprefix("dist/") for name in names}


def current_desktop_assets() -> set[str]:
    html = (ROOT / "desktop" / "index.html").read_text(encoding="utf-8")
    return {Path(match).name for match in re.findall(r"assets/[^\"' ]+", html)}


def collect_targets() -> list[Path]:
    targets: list[Path] = []
    targets.extend(ROOT / name for name in OLD_ARCHIVES)

    old_dist = ROOT / "desktop" / "dist"
    if (ROOT / "desktop" / "index.html").is_file() and (old_dist / "index.html").is_file():
        targets.append(old_dist)

    desktop_assets = ROOT / "desktop" / "assets"
    keep_desktop = current_desktop_assets()
    targets.extend(path for path in desktop_assets.iterdir() if path.is_file() and path.name not in keep_desktop)

    mobile_root = ROOT / "artifacts" / "mobile" / "dist"
    keep_mobile = mobile_archive_files()
    for path in mobile_root.rglob("*"):
        if path.is_file() and path.relative_to(mobile_root).as_posix() not in keep_mobile:
            targets.append(path)
    return sorted(set(targets), key=lambda path: str(path))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    targets = [path for path in collect_targets() if path.exists()]
    print(f"TARGET_COUNT {len(targets)}")
    for path in targets:
        print(path)
    if args.dry_run:
        return
    for path in targets:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    print(f"REMOVED_COUNT {len(targets)}")


if __name__ == "__main__":
    main()
