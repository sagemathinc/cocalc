#!/usr/bin/env python3
"""
Consistency check for npm packages across node modules

Hint: to get a "real time" info while working on resolving this, run
      $ /usr/bin/watch -n1 check_npm_packages.py
      in the COCALC_ROOT dir in a separate terminal.
"""

import os
from os.path import abspath, dirname, basename
import json
from collections import defaultdict
from pprint import pprint
from subprocess import run, PIPE
from typing import List, Set, Dict, Tuple, Optional
from typing_extensions import Final

T_installs = Dict[str, Dict[str, str]]

root: Final[str] = os.environ.get('COCALC_ROOT', abspath(os.curdir))

# these packages are known to be inconsistent on purpose
# async and immutable are a little bit more modern in packages/frontend,
# while they are behind elsewhere (but at the same vesion)
# we don't want to introduce any other inconsistencies...

# whitelisting typescript is temporary really just for @cocalc/util -- see https://github.com/sagemathinc/cocalc/issues/5888
whitelist: Final[List[str]] = ['async', 'immutable', 'typescript']


# NOTE: test/puppeteer is long dead...
def pkg_dirs() -> List[str]:
    search = run(['git', 'ls-files', '--', '../**/package.json'], stdout=PIPE)
    data = search.stdout.decode('utf8')
    packages = [
        abspath(x) for x in data.splitlines() if 'test/puppeteer/' not in x
    ]
    return packages


def get_versions(packages) -> Tuple[T_installs, Set[str]]:
    installs: T_installs = defaultdict(dict)
    modules: Set[str] = set()

    for pkg in packages:
        for dep_type in ['dependencies', 'devDependencies']:
            pkgs = json.load(open(pkg))
            module = basename(dirname(pkg))
            modules.add(module)
            for name, vers in pkgs.get(dep_type, {}).items():
                assert installs[name].get(module) is None, \
                    f"{name}/{module} already exists as a depdency – don't add it as a devDepedency as well"
                installs[name][module] = vers
    return installs, modules


def print_table(installs: T_installs, modules) -> Tuple[str, int, List[str]]:
    cnt = 0
    incon = []  # new, not whitelisted inconsistencies
    table = ""

    table += f"{'':<30s}"
    for mod in sorted(modules):
        table += f"{mod:<15s}"
    table += "\n"

    for pkg, inst in sorted(installs.items()):
        if len(set(inst.values())) == 1: continue
        cnt += 1
        if pkg not in whitelist and not pkg.startswith('@cocalc'):
            incon.append(pkg)
        table += f"{pkg:<30s}"
        for mod in sorted(modules):
            vers = inst.get(mod, '')
            table += f"{vers:<15s}"
        table += "\n"
    return table, cnt, incon


def main() -> None:
    packages: Final = pkg_dirs()

    # We mix up dependencies and devDepdencies into one. Otherwise cross-inconsistencies do not show up.
    # Also, get_versions fails if there is the same module as a dependencies AND devDependencies in the same package.
    main_pkgs, main_mods = get_versions(packages)

    table, cnt, incon = print_table(main_pkgs, main_mods)

    if cnt > 0:
        print(table)
        print(f"\nThere are {cnt} inconsistencies")
        if len(incon) > 0:
            print(
                f"of which these are not whitelisted: {incon} -- they must be fixed"
            )
            raise RuntimeError(
                f"fix new package version inconsistencies of {incon}\n\n\n")
        else:
            if cnt > 0:
                print(f"All are whitelisted and no action is warranted.")


if __name__ == '__main__':
    main()
