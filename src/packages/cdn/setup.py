#!/usr/bin/env python3

import os
from os.path import join, abspath, dirname, islink, exists
import json
from shutil import copytree

curdir = dirname(abspath(__file__))
os.chdir(join(curdir, 'dist'))

extra_path = {
    'katex': 'dist/',
}

deps = json.load(open(join('..', 'package-lock.json')))["dependencies"]
targets = list(
    json.load(open(join('..', 'package.json')))["devDependencies"].keys())
BLACKLIST = ["typescript"]

versions = {}
for path, data in deps.items():
    if any(path.startswith(b) for b in BLACKLIST):
        continue
    if '/' in path:
        name = path.split('/')[-1]
    else:
        name = path
    if name not in targets:
        continue
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
    print(f"symlink with version '{dst}' -> '{src}'")
    os.symlink(name, dst)
    versions[name] = version

# copy custom codemirror themes
custom_themes_src = join("..", "cm-custom-theme")
if exists(custom_themes_src):
    custom_themes_dst = "cm-custom-theme"
    copytree(custom_themes_src, custom_themes_dst)
    print(f"copied custom themes from '{custom_themes_src}' to '{custom_themes_dst}'")

# finally, write the version info such that it can be loaded
with open('index.js', 'w') as out:
    out.write(f"""
"use strict";
exports.__esModule = true;
exports.path = exports.versions = void 0;
exports.versions = {json.dumps(versions)};
exports.path = __dirname;
""")
