#!/usr/bin/env python3
"""
Consistency check for npm packages across node modules
"""

import os
from os.path import abspath, dirname, basename
import json
from collections import defaultdict
from pprint import pprint
from subprocess import run, PIPE
from typing import List, Set, Dict, Tuple, Optional
from typing_extensions import Final

root: Final[str] = os.environ.get('SMC_ROOT', os.curdir)
search = run(['git', 'ls-files', '--', '../**/package.json'], stdout=PIPE)
data = search.stdout.decode('utf8')
packages: Final[List[str]] = [abspath(_) for _ in data.splitlines()]

installs: Dict[str, Dict[str, str]] = defaultdict(dict)
modules: Set[str] = set()

for pkg in packages:
    pkgs = json.load(open(pkg))
    module = basename(dirname(pkg))
    modules.add(module)
    for name, vers in pkgs.get('dependencies', {}).items():
        installs[name][module] = vers

smodules: Final = sorted(modules)

print(f"{'':<30s}", end="")
for mod in smodules:
    print(f"{mod:<15s}", end="")
print()

for pkg, inst in sorted(installs.items()):
    if len(set(inst.values())) == 1: continue
    print(f"{pkg:<30s}", end="")
    for mod in smodules:
        vers = inst.get(mod, '')
        print(f"{vers:<15s}", end="")
    print()
