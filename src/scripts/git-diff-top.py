#!/usr/bin/env python3
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

from subprocess import run, PIPE

x = run('git diff --numstat', stdout=PIPE, shell=True).stdout.decode('utf-8')

data = {}
for line in x.splitlines():
    add, rem, fn = line.split(maxsplit=3)
    add = int(add)
    rem = int(rem)
    if rem > 1:
        data[fn] = (add, rem)

for fn, (add, rem) in sorted(data.items(), key=lambda k_v: -k_v[1][1]):
    print(fn, add, rem)
