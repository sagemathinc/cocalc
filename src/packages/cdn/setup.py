#!/usr/bin/env python3

import os
from os.path import join, abspath, dirname, islink, exists
import json
from shutil import copytree

curdir = dirname(abspath(__file__))
os.chdir(join(curdir, 'dist'))

extra_path = {
    'bootstrap': 'dist/css/',
    'katex': 'dist/',
}

deps = json.load(open(join('..', 'package-lock.json')))["dependencies"]
versions = {}
for path, data in deps.items():
    if '/' in path:
        name = path.split('/')[-1]
    else:
        name = path
    extra = extra_path.get(name, '')
    # links must be relative to the current directory (we want to be able to move the directory around)
    src = join("..", "node_modules", path, extra)
    if not exists(src):
        raise Exception(
            f"target '{src}' does not exist -- did you forget to run 'npm ci' in '{curdir}'?"
        )
    version = data['version']
    copytree(src, name)
    dst = f"{name}-{version}"
    print(f"symlink with    version '{dst}' -> '{src}'")
    os.symlink(name, dst)
    versions[name] = version

# TODO: This pix should not be in this package.  Put it somewhere else.
copytree("../pix", "pix")

# finally, write the version info such that it can be loaded
with open('index.js', 'w') as out:
    out.write(f'exports.versions = {json.dumps(versions)};\n')
    out.write('exports.path = __dirname;\n')
