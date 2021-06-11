#!/usr/bin/env python3

import os, shutil


def handle_path(s, path=None):
    desc = s
    if path is not None:
        os.chdir(path)
        desc += " # in '%s'" % path
    print(desc)


def cmd(s, path=None):
    home = os.path.abspath(os.curdir)
    try:
        handle_path(s, path)
        if os.system(s):
            raise RuntimeError("Error executing '%s'" % s)
    finally:
        os.chdir(home)

def app_version():
    # We also create a versioned app.html file, named "app-[version].html", where
    # version is taken from package.json.  We do this entirely so we easily
    # run specific versions of the cocalc client code by slightly changing
    # the URL.  Nothing else should depend on this.
    cmd("cp dist/app.html dist/app-`npm view @cocalc/static version`.html")

def main():
    try:
        # Build with production BASE_URL:
        # TODO -- this is dumb and we must get rid of hardcoding of the base url. But that is another problem for later...
        # This is necessary for now, since webpack gets content -- such as the primus script that hardcodes the base url --
        # from webapp-lib, so for our bundle files to be correct, we have to build webapp-lib.
        cmd('BASE_URL="" npm run build', '../../webapp-lib')
        if os.path.exists('dist'):
            shutil.rmtree('dist')
        NODE_ENV = os.environ.get('NODE_ENV', 'production')
        cmd(f"NODE_ENV={NODE_ENV} NODE_OPTIONS=--max_old_space_size=8000 COCALC_BASE_URL='/' webpack --progress --color"
            )
        app_version()
    finally:
        # Build again with non-production base url.
        cmd('npm run build', '../../webapp-lib')

if __name__ == "__main__":
    main()

