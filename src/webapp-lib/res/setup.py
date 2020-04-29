#!/usr/bin/env python3

import os
from os.path import join, abspath, dirname, islink, exists
import json

curdir = dirname(abspath(__file__))
os.chdir(curdir)
# os.symlink(src, dst)

extra_path = {
    'bootstrap': 'dist/css/',
    'katex': 'dist/',
    'lozad': 'dist/',
}

# remove symlinks
for fn in os.listdir('.'):
    if islink(fn):
        os.unlink(fn)

deps = json.load(open('package-lock.json'))["dependencies"]
for path, data in deps.items():
    if '/' in path:
        name = path.split('/')[-1]
    else:
        name = path
    extra = extra_path.get(name, '')
    src = join(curdir, "node_modules", path, extra)
    if not exists(src):
        raise Exception(
            f"target '{src}' does not exist -- did you forget to run 'npm ci' in '{curdir}'?"
        )
    dst = f"{name}-{data['version']}"
    print(f"creating symlink '{dst}' → '{src}'")
    os.symlink(src, dst)
