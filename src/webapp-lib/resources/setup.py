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
}

# remove symlinks
for fn in os.listdir('.'):
    if islink(fn):
        os.unlink(fn)

deps = json.load(open('package-lock.json'))["dependencies"]
versions = {}
for path, data in deps.items():
    if '/' in path:
        name = path.split('/')[-1]
    else:
        name = path
    extra = extra_path.get(name, '')
    # links must be relative to the current directory (we want to be able to move the directory around)
    src = join("node_modules", path, extra)
    if not exists(src):
        raise Exception(
            f"target '{src}' does not exist -- did you forget to run 'npm ci' in '{curdir}'?"
        )
    version = data['version']
    dst = f"{name}-{version}"
    print(f"symlink with    version '{dst}' -> '{src}'")
    os.symlink(src, dst)
    # now, we also symlink from just the name to the versioned symlink
    src = dst
    dst = f"{name}"
    print(f"symlink without version '{dst}' -> '{src}'")
    os.symlink(src, dst)
    versions[name] = version

# finally, write the version info such that it can be loaded
with open('versions.ts', 'w') as out:
    out.write(f'const versions = {json.dumps(versions)};')
    out.write('export default versions;')