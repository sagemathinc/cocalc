#!/usr/bin/env python3
"""
Add .js extensions to relative TypeScript imports for NodeNext/ESM compatibility.

For each .ts/.tsx file, finds relative imports without file extensions and
adds the correct .js suffix:

  import { x } from "./foo"       -> import { x } from "./foo.js"
  import { x } from "../bar"      -> import { x } from "../bar.js"
  export { x } from "./foo"       -> export { x } from "./foo.js"
  import("./foo")                 -> import("./foo.js")

  Directory imports (./dir where dir/index.ts exists):
  import { x } from "./dir"       -> import { x } from "./dir/index.js"

Imports that already have an extension (e.g. "./style.css", "./data.json")
are left unchanged.

Usage:
  python3 scripts/add-esm-extensions.py packages/util
  python3 scripts/add-esm-extensions.py packages/util packages/comm
  python3 scripts/add-esm-extensions.py --dry-run packages/util
"""

import re
import sys
from pathlib import Path

# Matches: from "./path" or from '../path' (relative, no extension)
# Captures: (quote)(path)(quote)
FROM_PATTERN = re.compile(
    r"""(?<!\w)(from\s+)(["'])(\.\.?/[^"']+)(["'])""",
)

# Matches: import("./path") — dynamic imports
DYNAMIC_PATTERN = re.compile(
    r"""((?<!\w)import\s*\(\s*)(["'])(\.\.?/[^"']+)(["'])""",
)

# Matches: import "./path" — side-effect-only imports (no `from`)
SIDEEFFECT_PATTERN = re.compile(
    r"""((?<!\w)import\s+)(["'])(\.\.?/[^"']+)(["'])""",
)


def has_extension(path: str) -> bool:
    """Return True if the last path segment has a file extension."""
    return bool(Path(path).suffix)


def resolve_esm_path(import_path: str, source_file: Path) -> str:
    """
    Given a relative import path and the source file it appears in,
    return the correct ESM path with .js extension.
    Returns the original path unchanged if it already has an extension
    or if the target cannot be resolved.
    """
    if has_extension(import_path):
        return import_path  # already has .css, .json, .js, etc.

    source_dir = source_file.parent
    target_base = source_dir / import_path

    # Check: is there a .ts or .tsx source file at this path?
    for ext in (".ts", ".tsx"):
        if target_base.with_suffix(ext).exists():
            return import_path + ".js"

    # Check: is it a directory with an index.ts or index.tsx?
    if target_base.is_dir():
        for index_name in ("index.ts", "index.tsx"):
            if (target_base / index_name).exists():
                return import_path + "/index.js"

    # Check: pre-compiled .d.ts declaration file (treat as .js at runtime)
    if target_base.with_suffix(".d.ts").exists():
        return import_path + ".js"

    # Check: already a .js file (e.g. hand-written JS utility)
    if target_base.with_suffix(".js").exists():
        return import_path + ".js"

    # Could not resolve — warn and leave unchanged
    print(
        f"  WARN: cannot resolve '{import_path}' from {source_file.name}",
        file=sys.stderr,
    )
    return import_path


def fix_file(filepath: Path, dry_run: bool = False) -> bool:
    """
    Fix all extensionless relative imports in a single file.
    Returns True if the file was (or would be) changed.
    """
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  ERROR reading {filepath}: {e}", file=sys.stderr)
        return False

    changed = False

    def make_replacer(filepath: Path):
        def replacer(m: re.Match) -> str:
            nonlocal changed
            prefix, q1, path, q2 = m.group(1), m.group(2), m.group(3), m.group(4)
            new_path = resolve_esm_path(path, filepath)
            if new_path != path:
                changed = True
                return f"{prefix}{q1}{new_path}{q2}"
            return m.group(0)

        return replacer

    replacer = make_replacer(filepath)
    new_content = FROM_PATTERN.sub(replacer, content)
    new_content = DYNAMIC_PATTERN.sub(replacer, new_content)
    new_content = SIDEEFFECT_PATTERN.sub(replacer, new_content)

    if changed and not dry_run:
        filepath.write_text(new_content, encoding="utf-8")

    return changed


EXCLUDE_DIRS = {"node_modules", "dist", "dist-esm", ".git", "__pycache__"}


def fix_package(package_dir: Path, dry_run: bool = False) -> int:
    """
    Fix all .ts/.tsx source files in a package directory.
    Returns the count of files changed (or that would be changed in dry-run).
    """
    count = 0
    source_files = sorted(
        [
            p
            for p in package_dir.rglob("*.[tj]s")
            if p.suffix in (".ts", ".tsx")
            and not any(part in EXCLUDE_DIRS for part in p.parts)
        ]
    )

    for filepath in source_files:
        if fix_file(filepath, dry_run):
            rel = filepath.relative_to(package_dir)
            print(f"  {'[dry] ' if dry_run else ''}fixed: {rel}")
            count += 1

    return count


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Add .js extensions to TypeScript imports for NodeNext ESM"
    )
    parser.add_argument(
        "packages",
        nargs="+",
        help="Package directories to process (e.g. packages/util)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing files",
    )
    args = parser.parse_args()

    total = 0
    for pkg in args.packages:
        pkg_path = Path(pkg)
        if not pkg_path.is_dir():
            print(f"ERROR: '{pkg}' is not a directory", file=sys.stderr)
            sys.exit(1)
        print(f"\nProcessing {pkg_path.resolve().name}...")
        count = fix_package(pkg_path, args.dry_run)
        print(f"  {'Would change' if args.dry_run else 'Changed'} {count} files")
        total += count

    print(f"\nTotal: {total} files {'affected' if args.dry_run else 'updated'}")


if __name__ == "__main__":
    main()
