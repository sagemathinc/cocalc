#!/usr/bin/env python3
"""
Create artificial versioned Jupyter kernels for testing the "versioned
kernels / kernel update awareness" feature.

See src/docs/jupyter.md -> "Versioned Kernels" -> "Local testing plan".

Run this INSIDE the project/user environment you want to test in (so that
$HOME points at that environment). It writes throwaway kernelspecs next to
your existing ones under the Jupyter data dir:

    $JUPYTER_DATA_DIR/kernels/   (default: ~/.local/share/jupyter/kernels)

It reuses the `argv` of the already-installed `python3` kernel, so the test
kernels actually launch. They are all the same Python interpreter; only the
cocalc metadata and the `language` label differ. Two languages are used so
the per-language grouping is exercised: the real "python" and a fake
"snake".

Kernels created:

  language "python":
    testfam-1.0, testfam-1.1  (prio 0), testfam-2.0 (prio 10)
      -> select 1.0 -> yellow "Update..." offering 2.0; 1.1 compact.
         testfam-2.0 has priority 10, so it is also "Suggested"/starred.
    otherfam-3.4, otherfam-3.5                      (family otherfam, prio 0)
    otherfam-3.7                                    (family otherfam, prio -1)
      -> second family group; otherfam-3.4 must offer 3.5 (NOT the
         negative-priority 3.7), and 3.7 must not be "Suggested".

  language "snake" (fake):
    snakefam-1.0, snakefam-2.0                      (family snakefam, prio 0)
    cobra-5.1, cobra-5.2                            (family cobra, prio 0)
      -> a separate language group with two families of its own.

  plain kernels (no family/version) -> never show "Update", render in the
  ungrouped section after the final menu divider:
    plainkernel-a  (no metadata.cocalc at all, like the stock python3)
    plainkernel-b  (metadata.cocalc present but no family/version)
    plainkernel-c  (language "snake")

The pre-existing `python3` kernel (no family/version) also stays untouched
and likewise verifies non-participation + the ungrouped section.

Usage:
    src/scripts/make_test_kernels.py            # create / refresh them
    src/scripts/make_test_kernels.py --clean    # remove them again
    src/scripts/make_test_kernels.py --list     # show kernels dir contents

After creating/removing, click "Refresh" in the CoCalc kernel selector
(the frontend caches kernelspecs for 5 minutes).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

# (family, version, display_name, language, priority)
# priority 10 -> "Suggested" / starred (needs >=10); newest in a family
#                normally gets this, mirroring the real Sage convention.
# priority 0  -> out of "Suggested" but update-eligible (>=0).
# priority -1 -> filtered out of "Suggested", update detection and
#                closest_kernel_match (but still selectable in the full
#                kernel list / Change Kernel menu).
#
# All kernels run the same Python under the hood; `language` is just a
# label so we can exercise the per-language grouping. We use two languages:
# the real "python" and a fake "snake".
TEST_KERNELS = [
    # language: python
    ("testfam", "1.0", "Test Family 1.0", "python", 0),
    ("testfam", "1.1", "Test Family 1.1", "python", 0),
    # newest in testfam: priority 10 -> also shows in "Suggested"/starred,
    # while still being the version-based update target.
    ("testfam", "2.0", "Test Family 2.0", "python", 10),
    ("otherfam", "3.4", "Other Family 3.4", "python", 0),
    ("otherfam", "3.5", "Other Family 3.5", "python", 0),
    # negative priority: must NOT be offered as an update for otherfam-3.4
    # (so 3.5 stays the latest), and must not appear in "Suggested".
    ("otherfam", "3.7", "Other Family 3.7", "python", -1),
    # language: snake (fake) -- two families, so the "Snake" group/submenu
    # also shows family grouping + a divider between groups.
    ("snakefam", "1.0", "Snake Family 1.0", "snake", 0),
    ("snakefam", "2.0", "Snake Family 2.0", "snake", 0),
    ("cobra", "5.1", "Cobra 5.1", "snake", 0),
    ("cobra", "5.2", "Cobra 5.2", "snake", 0),
]

# Plain kernels WITHOUT family/version -> must never show an "Update"
# button and must render in the ungrouped section (after the final menu
# divider). (name, display_name, language, cocalc_metadata_or_None)
#  - plainkernel-a: no metadata.cocalc at all (like the stock python3).
#  - plainkernel-b: has metadata.cocalc but no family/version, to confirm
#    that presence of cocalc metadata alone does not opt a kernel in.
PLAIN_KERNELS = [
    ("plainkernel-a", "Plain Kernel A", "python", None),
    (
        "plainkernel-b",
        "Plain Kernel B",
        "python",
        {
            "priority": 0,
            "description": "Artificial test kernel without family/version.",
            "url": "https://doc.cocalc.com/jupyter.html",
        },
    ),
    # a plain kernel in the fake "snake" language
    ("plainkernel-c", "Plain Kernel C", "snake", None),
]

# kernel.json prefixes we own and may delete with --clean
OWNED_PREFIXES = (
    "testfam-",
    "otherfam-",
    "snakefam-",
    "cobra-",
    "plainkernel-",
)

DEFAULT_ARGV = [
    "python",
    "-m",
    "ipykernel_launcher",
    "-f",
    "{connection_file}",
]


def kernels_dir() -> str:
    data_dir = os.environ.get("JUPYTER_DATA_DIR") or os.path.join(
        os.path.expanduser("~"), ".local", "share", "jupyter"
    )
    return os.path.join(data_dir, "kernels")


def has_ipykernel(py: str) -> bool:
    """True if `py -m ipykernel_launcher` can at least import ipykernel."""
    try:
        r = subprocess.run(
            [py, "-c", "import ipykernel"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        return r.returncode == 0
    except Exception:
        return False


def resolve_interpreter(argv0: str) -> tuple:
    """Pick an absolute interpreter path that can import ipykernel.

    Kernels are spawned by the CoCalc project server, whose PATH may not
    contain a bare `python` (the stock python3 kernelspec has this same
    fragility -> 'spawn python ENOENT'); and even when found, the wrong
    interpreter may lack ipykernel -> the kernel exits and CoCalc reports
    'timeout'. So we build a candidate list, prefer the first that can
    `import ipykernel`, and report whether any could.

    Returns (path, has_ipykernel)."""
    candidates = [sys.executable]  # run THIS script with the project python
    if os.path.isabs(argv0) and os.path.exists(argv0):
        candidates.append(argv0)
    for cand in (argv0, "python3", "python"):
        w = shutil.which(cand)
        if w:
            candidates.append(w)
    # de-duplicate, preserve order
    seen = set()
    ordered = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            ordered.append(c)
    for c in ordered:
        if has_ipykernel(c):
            return c, True
    return (ordered[0] if ordered else sys.executable), False


def discover_python_argv(kdir: str) -> tuple:
    """Reuse the argv of an existing real python kernel so the test
    kernels actually start, but force argv[0] to an absolute interpreter
    that has ipykernel. Falls back to a sane default.

    Returns (argv, has_ipykernel)."""
    argv = list(DEFAULT_ARGV)
    for name in ("python3", "python"):
        path = os.path.join(kdir, name, "kernel.json")
        if os.path.isfile(path):
            try:
                with open(path) as f:
                    spec = json.load(f)
                found = spec.get("argv")
                if isinstance(found, list) and found:
                    argv = list(found)
                    break
            except (OSError, ValueError):
                pass
    argv[0], ok = resolve_interpreter(argv[0])
    return argv, ok


def kernel_name(family: str, version: str) -> str:
    return f"{family}-{version}"


def write_kernel(kdir: str, name: str, argv: list, display_name: str,
                 language: str, cocalc) -> str:
    """Write a kernels/<name>/kernel.json. `cocalc` is the
    metadata.cocalc dict, or None for no cocalc metadata at all."""
    path = os.path.join(kdir, name)
    os.makedirs(path, exist_ok=True)
    metadata = {"cocalc": cocalc} if cocalc is not None else {}
    spec = {
        "argv": list(argv),
        "display_name": display_name,
        "language": language,
        "metadata": metadata,
    }
    with open(os.path.join(path, "kernel.json"), "w") as f:
        json.dump(spec, f, indent=1)
        f.write("\n")
    return name


def make_kernel(kdir: str, argv: list, family: str, version: str,
                display_name: str, language: str, priority: int = 0) -> str:
    return write_kernel(
        kdir,
        kernel_name(family, version),
        argv,
        display_name,
        language,
        {
            "priority": priority,
            "description": f"Artificial test kernel ({family} {version}).",
            "url": "https://doc.cocalc.com/jupyter.html",
            "family": family,
            "version": version,
        },
    )


def clean(kdir: str) -> None:
    if not os.path.isdir(kdir):
        print(f"nothing to clean: {kdir} does not exist")
        return
    removed = 0
    for entry in sorted(os.listdir(kdir)):
        if entry.startswith(OWNED_PREFIXES):
            shutil.rmtree(os.path.join(kdir, entry), ignore_errors=True)
            print(f"  removed {entry}")
            removed += 1
    print(f"removed {removed} test kernel(s) from {kdir}")


def list_dir(kdir: str) -> None:
    if not os.path.isdir(kdir):
        print(f"{kdir} does not exist")
        return
    print(f"kernels in {kdir}:")
    for entry in sorted(os.listdir(kdir)):
        marker = " (test)" if entry.startswith(OWNED_PREFIXES) else ""
        print(f"  {entry}{marker}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create artificial versioned Jupyter test kernels."
    )
    parser.add_argument(
        "--clean", action="store_true",
        help="remove the test kernels instead of creating them",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="list the kernels directory and exit",
    )
    args = parser.parse_args()

    kdir = kernels_dir()

    if args.list:
        list_dir(kdir)
        return 0

    if args.clean:
        clean(kdir)
        return 0

    os.makedirs(kdir, exist_ok=True)
    argv, ipykernel_ok = discover_python_argv(kdir)
    print(f"kernels dir : {kdir}")
    print(f"interpreter : {argv[0]}")
    print(f"full argv   : {argv}")
    if not ipykernel_ok:
        print()
        print("WARNING: none of the candidate interpreters could "
              "'import ipykernel'.")
        print("  The kernels will spawn but fail with a 3s timeout.")
        print("  Re-run this script with the project's Python (the one")
        print("  that has ipykernel installed), e.g.:")
        print("    /path/to/project/python make_test_kernels.py")
        print("  or:  python -m pip install ipykernel")
        print()
    for family, version, display_name, language, priority in TEST_KERNELS:
        name = make_kernel(
            kdir, argv, family, version, display_name, language, priority
        )
        print(
            f"  created {name}  "
            f"(family={family} version={version} priority={priority})"
        )
    for name, display_name, language, cocalc in PLAIN_KERNELS:
        write_kernel(kdir, name, argv, display_name, language, cocalc)
        kind = "no metadata.cocalc" if cocalc is None else "no family/version"
        print(f"  created {name}  ({kind})")
    print()
    print("Done. In CoCalc: open a notebook, click 'Refresh' in the kernel")
    print("selector, then select 'Test Family 1.0' to see the Update button.")
    print("Run with --clean to remove these again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
