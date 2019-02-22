#!/usr/bin/env python

import argparse, os, sys, time, urllib

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
        print "WARNING: psutil not available so not re-nicing build of webapp"


def cmd(s, error=True):
    t0 = time.time()
    os.chdir(SRC)
    s = "umask 022; " + s
    print s
    if os.system(s) and error:
        sys.exit(1)
    print "TOTAL TIME: %.1f seconds" % (time.time() - t0)


def thread_map(callable, inputs, nb_threads=None):
    if len(inputs) == 0:
        return []
    from multiprocessing.pool import ThreadPool
    if not nb_threads:
        nb_threads = min(50, len(inputs))
    tp = ThreadPool(nb_threads)
    return tp.map(callable, inputs)


def pull():
    cmd("git submodule update --init")
    cmd("git pull")


def install_pyutil():
    cmd(SUDO + "pip2 install --upgrade ./smc_pyutil")


def install_sagews():
    if os.system('which sage') == 0:
        cmd("sage -pip install --upgrade ./smc_sagews")
    cmd(SUDO + "pip2 install --upgrade ./smc_sagews")  # as a fallback


def install_project():
    # unsafe-perm below is needed so can build C code as root
    def f(m):
        cmd(SUDO +
            "npm --loglevel=warn --unsafe-perm=true install --upgrade %s -g" %
            m)

    thread_map(
        f,
        './smc-util ./smc-util-node ./smc-project ./smc-webapp coffee-script forever'.
        split())

    # UGLY; hard codes the path -- TODO: fix at some point.
    cmd("cd /usr/lib/node_modules/smc-project/jupyter && %s npm --loglevel=warn install --unsafe-perm=true --upgrade"
        % SUDO)

    # At least run typescript...
    # TODO: currently this errors somewhere in building something in node_modules in smc-webapp, since I can't get
    # tsconfig to just leave that code alone (since it is used?).  Hmm...
    cmd("cd /cocalc/src/smc-project; /cocalc/src/node_modules/.bin/tsc -p tsconfig.json",
        error=False)

    # Pre-compile everything to Javascript, so that loading is much faster and more efficient.
    # This can easily save more than 2 seconds, given how big things have got.
    cmd("cd /usr/lib/node_modules && coffee -c smc-util smc-util-node smc-webapp smc-project smc-project/jupyter smc-webapp/jupyter")

def install_hub():
    for path in ['.', 'smc-util', 'smc-util-node', 'smc-hub']:
        cmd("cd %s; npm --loglevel=warn install" % path)


def install_webapp(*args):
    nice()
    action = args[0].action if args else 'build'
    nothing = True

    if 'build' in action:
        cmd("git submodule update --init")
        cmd("cd examples && env OUTDIR=../webapp-lib/examples make")
        # clean up all package-lock files in cocalc's codebase (before running npm install again)
        cmd("git ls-files '../*/package-lock.json' | xargs rm -f")
        for path in [
                '.', 'smc-util', 'smc-util-node', 'smc-webapp',
                'smc-webapp/jupyter'
        ]:
            cmd("cd %s; npm --loglevel=warn install" % path)

        # react static step must come *before* webpack step
        cmd("update_react_static")

        # download compute environment information
        # TOOD python 3: https://docs.python.org/3.5/library/urllib.request.html#urllib.request.urlretrieve
        if os.environ.get('CC_COMP_ENV') == 'true':
            print(
                "Downloading compute environment information, because 'CC_COMP_ENV' is true"
            )
            try:
                host = 'https://storage.googleapis.com/cocalc-compute-environment/'
                for fn in [
                        'compute-inventory.json', 'compute-components.json'
                ]:
                    out = os.path.join(SRC, 'webapp-lib', fn)
                    urllib.urlretrieve(host + fn, out)
            except Exception as ex:
                print(
                    "WARNING: problem while downloading the compute environment information"
                )
                print(ex)

        # update primus - so client has it.
        install_primus()
        # update term.js
        cmd("cd webapp-lib/term; ./compile")
        wtype = 'debug' if (len(args) > 0 and args[0].debug) else 'production'
        if len(args) > 0 and args[0].debug:
            wtype = 'debug'
            est = 1
        else:
            wtype = 'production'
            est = 5
        print(
            "Building {wtype} webpack -- this should take up to {est} minutes".
            format(wtype=wtype, est=est))
        cmd("npm --loglevel=warn run webpack-{wtype}".format(wtype=wtype))
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
    cmd("cd smc-hub && rm -rf node_modules/primus node_modules/engine.io  && npm --loglevel=warn install primus engine.io && cd .. && webapp-lib/primus/update_primus"
        )


def install_all(compute=False, web=False):
    if compute or web:
        install_hub(
        )  # also contains compute server right now (will refactor later)
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
    parser_sagews.add_argument(
        "--sage",
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
    parser_all.add_argument(
        "--compute", default=False, action="store_const", const=True)
    parser_all.add_argument(
        "--web", default=False, action="store_const", const=True)
    parser_all.set_defaults(
        func=lambda args: install_all(compute=args.compute, web=args.web))

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
