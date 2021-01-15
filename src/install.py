#!/usr/bin/env python3
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

from __future__ import print_function
import argparse, os, sys, time
from concurrent.futures import ThreadPoolExecutor

# This install script is not the place to do type checking -- that
# should happen only during development.
os.environ['TS_TRANSPILE_ONLY'] = 'true'

# Building some things definitely uses too much memory and
# crashes without this option, e.g., running tsc on smc-project!
os.environ['NODE_OPTIONS'] = '--max-old-space-size=8192'

WORKERS = 3
SRC = os.path.split(os.path.realpath(__file__))[0]

# Only use sudo if not running as root already (this avoids having to install sudo)
import getpass
if getpass.getuser() != 'root':
    SUDO = "sudo "
else:
    SUDO = ""


def nice():
    try:
        import psutil  # not available by default (e.g., when building with docker)
        os.nice(10)
        psutil.Process(os.getpid()).ionice(ioclass=psutil.IOPRIO_CLASS_IDLE)
    except:
        print("WARNING: psutil not available so not re-nicing build of webapp")


def cmd(s, error=True):
    t0 = time.time()
    os.chdir(SRC)
    s = "umask 022; " + s
    print(s)
    if os.system(s) and error:
        sys.exit(1)
    elapsed = time.time() - t0
    print("TOTAL TIME: %.1f seconds" % elapsed)
    return elapsed


def pull():
    cmd("git submodule update --init")
    cmd("git pull")


def install_pyutil():
    cmd(SUDO + "pip3 install --upgrade ./smc_pyutil")


def install_sagews():
    if os.system('which sage') == 0:
        cmd("sage -pip install --upgrade ./smc_sagews")
    cmd(SUDO + "pip3 install --upgrade ./smc_sagews")  # as a fallback


def install_project():
    # unsafe-perm below is needed so can build C code as root

    # global install, hence no "npm ci" (!)
    for pkg in ['coffeescript', 'forever']:
        c = f"npm --loglevel=warn --unsafe-perm=true --progress=false install --upgrade {pkg} -g"
        cmd(SUDO + c)

    pkgs = ['./smc-project', './smc-webapp', './smc-util-node', './smc-util']

    # TODO switch to use npm ci to install these (which doesn't exist for global installs, AFAIU)
    def build_op(pkg):
        c = f"npm --loglevel=warn --unsafe-perm=true --progress=false install {pkg} -g"
        return cmd(SUDO + c)

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        total = sum(_ for _ in executor.map(build_op, pkgs))
        print(f"TOTAL PROJECT PKG BUILD TIME: {total:.1f}s")

    # UGLY; hard codes the path -- TODO: fix at some point.
    try:
        cmd("cd /usr/local/lib/node_modules/smc-project/jupyter && %s npm --loglevel=warn ci --unsafe-perm=true --progress=false --upgrade"
            % SUDO)
    except:
        cmd("cd /usr/lib/node_modules/smc-project/jupyter && %s npm --loglevel=warn ci --unsafe-perm=true --progress=false --upgrade"
            % SUDO)

    # At least run typescript...
    # TODO: currently this errors somewhere in building something in node_modules in smc-webapp, since I can't get
    # tsconfig to just leave that code alone (since it is used?).  Hmm...
    cmd("cd /cocalc/src/smc-project; /cocalc/src/node_modules/.bin/tsc -p tsconfig.json",
        error=False)

    # Pre-compile everything to Javascript, so that loading is much faster and more efficient.
    # This can easily save more than 2 seconds, given how big things have got.
    try:
        cmd("cd /usr/local/lib/node_modules && coffee -c smc-util smc-util-node smc-webapp smc-project smc-project/jupyter"
            )
    except:
        cmd("cd /usr/lib/node_modules && coffee -c smc-util smc-util-node smc-webapp smc-project smc-project/jupyter"
            )


def install_hub():
    paths = [
        '.', 'smc-hub', 'smc-util-node', 'smc-util', 'webapp-lib/resources'
    ]

    # npm ci for using pkg lock file
    def build_op(path):
        return cmd(f"cd {path} && npm --loglevel=warn --progress=false ci")

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        total = sum(_ for _ in executor.map(build_op, paths))
        print(f"TOTAL HUB BUILD TIME: {total:.1f}s")


def install_webapp(*args):
    nice()
    action = args[0].action if args else 'build'
    nothing = True

    if 'build' in action:
        cmd("git submodule update --init")
        cmd("cd examples && env OUTDIR=../webapp-lib/examples make")

        paths = ['smc-webapp', '.', 'smc-util', 'webapp-lib/resources']

        # npm ci for using pkg lock file
        def build_op(path):
            return cmd(f"cd {path} && npm --loglevel=warn --progress=false ci")

        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            total = sum(_ for _ in executor.map(build_op, paths))
            print(f"TOTAL WEBAPP BUILD TIME: {total:.1f}s")

        # this depends on running npm ci first, see above
        cmd("python3 webapp-lib/resources/setup.py")

        # react static step must come *before* webpack step
        cmd("update_react_static")

        # download compute environment information
        if os.environ.get('CC_COMP_ENV') == 'true':
            print(
                "Downloading compute environment information, because 'CC_COMP_ENV' is true"
            )
            # this is python3-only
            from urllib.request import urlretrieve
            try:
                host = 'https://storage.googleapis.com/cocalc-compute-environment/'
                files = ['compute-inventory.json', 'compute-components.json']
                for fn in files:
                    out = os.path.join(SRC, 'webapp-lib', fn)
                    urlretrieve(host + fn, out)
            except Exception as ex:
                print(
                    "WARNING: problem while downloading the compute environment information"
                )
                raise ex

        # update primus - so client has it.
        install_primus()
        # update term.js
        cmd("cd webapp-lib/term; ./compile")
        wtype = 'debug' if (len(args) > 0 and args[0].debug) else 'production'
        if len(args) > 0 and args[0].debug:
            wtype = 'debug'
            est = 3
        else:
            wtype = 'production'
            est = 10
        print(
            f"Building {wtype} webpack -- this should take up to {est} minutes"
        )
        cmd(f"npm --loglevel=warn --progress=false run webpack-{wtype}")
        nothing = False

    if 'pull' == action:
        cmd("webapp-control.sh pull")
        nothing = False

    if 'push' in action:
        cmd("webapp-control.sh push")
        nothing = False

    if 'clean' == action:
        cmd("webapp-control.sh clean")
        nothing = False

    # some fallback check, just in case ...
    if nothing:
        raise ValueError("action %s unknown" % action)


def install_primus():
    # The rm works around a bug in npm...
    ops = [
        "cd smc-hub",
        "rm -rf node_modules/primus node_modules/engine.io",
        "npm --loglevel=warn --progress=false install primus engine.io",
        "cd ..",
        "webapp-lib/primus/update_primus",
    ]
    cmd(" && ".join(ops))


def install_all(compute=False, web=False):
    if compute or web:
        # also contains compute server right now (will refactor later)
        install_hub()
    if compute:
        install_pyutil()
        install_sagews()
        install_project()
    if web:
        install_webapp()


def main():
    parser = argparse.ArgumentParser(
        description="Install components of CoCalc into the system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_pull = subparsers.add_parser(
        'pull', help='pull latest version of code from github')
    parser_pull.set_defaults(func=lambda *args: pull())

    parser_hub = subparsers.add_parser(
        'hub',
        help='install/update any node.js dependencies for smc-[util/util*/hub]'
    )
    parser_hub.set_defaults(func=lambda *args: install_hub())

    parser_webapp = subparsers.add_parser(
        'webapp',
        help=
        'install/update any node.js dependencies for smc-[util*/webapp] and use webpack to build production js (takes several minutes!)'
    )
    parser_webapp.add_argument(
        'action',
        help=
        'either "build" the webapp or "pull/push" compiled files from a repository -- see scripts/webapp-control.sh how this works',
        choices=['build', 'pull', 'push', 'build-push', 'clean'])
    parser_webapp.add_argument(
        "--debug",
        action="store_true",
        help="if set, build debug version of code (rather than production)")
    parser_webapp.set_defaults(func=install_webapp)

    parser_primus = subparsers.add_parser(
        'primus', help='update client-side primus websocket code')
    parser_primus.set_defaults(func=lambda *args: install_primus())

    parser_pyutil = subparsers.add_parser(
        'pyutil',
        help='install smc_pyutil package system-wide (requires sudo)')
    parser_pyutil.set_defaults(func=lambda *args: install_pyutil())

    parser_sagews = subparsers.add_parser(
        'sagews', help='install sagews server into sage install')
    parser_sagews.add_argument("--sage",
                               help="/path/to/sage (default: 'sage')",
                               default='sage',
                               type=str)
    parser_sagews.set_defaults(func=lambda *args: install_sagews())

    parser_project = subparsers.add_parser(
        'project', help='install project server code system-wide')
    parser_project.set_defaults(func=lambda *args: install_project())

    parser_all = subparsers.add_parser(
        'all',
        help=
        'install all code that makes sense for the selected classes of servers; use "./install.py all --compute" for compute node and "./install.py all --web" for a web node'
    )
    parser_all.add_argument("--compute",
                            default=False,
                            action="store_const",
                            const=True)
    parser_all.add_argument("--web",
                            default=False,
                            action="store_const",
                            const=True)
    parser_all.set_defaults(
        func=lambda args: install_all(compute=args.compute, web=args.web))

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
