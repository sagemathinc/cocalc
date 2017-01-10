#!/usr/bin/env python

import argparse, os, sys, time

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

def cmd(s):
    t0 = time.time()
    os.chdir(SRC)
    s = "umask 022; " + s
    print s
    if os.system(s):
        sys.exit(1)
    print "TOTAL TIME: %.1f seconds"%(time.time() - t0)

def pull():
    cmd("git pull")

def install_pyutil():
    cmd(SUDO+"pip2 install --upgrade ./smc_pyutil")

def install_sagews():
    if os.system('which sage') == 0:
        cmd("sage -pip install --upgrade ./smc_sagews")
    cmd(SUDO+"pip2 install --upgrade ./smc_sagews")   # as a fallback

def install_project():
    # unsafe-perm below is needed so can build C code as root
    for m in './smc-util ./smc-util-node ./smc-project coffee-script forever'.split():
        cmd(SUDO+"npm --unsafe-perm=true install --upgrade %s -g"%m)

def install_hub():
    for path in ['.', 'smc-util', 'smc-util-node', 'smc-hub']:
        cmd("cd %s; npm install"%path)

def install_webapp(*args):
    nice()
    action = args[0].action if args else 'build'
    nothing = True

    if 'build' in action:
        cmd("cd wizard && make")
        for path in ['.', 'smc-util', 'smc-util-node', 'smc-webapp']:
            cmd("cd %s; npm install"%path)
        # react static step must come *before* webpack step
        cmd("update_react_static")
        # update primus - so client has it.
        install_primus()
        # update term.js
        cmd("cd webapp-lib/term; ./compile")
        print("Building production webpack -- grab a coffee, this will take about 5 minutes")
        cmd("npm run webpack-production")
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
    cmd("cd smc-hub && rm -rf node_modules/primus node_modules/engine.io  && npm install primus engine.io && cd .. && webapp-lib/primus/update_primus")

def install_all(compute=False, web=False):
    if compute or web:
        install_hub()  # also contains compute server right now (will refactor later)
    if compute:
        install_pyutil()
        install_sagews()
        install_project()
    if web:
        install_webapp()

def main():
    parser = argparse.ArgumentParser(description="Install components of SageMathCloud into the system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_pull = subparsers.add_parser('pull', help='pull latest version of code from github')
    parser_pull.set_defaults(func = lambda *args: pull())

    parser_hub = subparsers.add_parser('hub', help='install/update any node.js dependencies for smc-[util/util*/hub]')
    parser_hub.set_defaults(func = lambda *args: install_hub())

    parser_webapp = subparsers.add_parser('webapp', help='install/update any node.js dependencies for smc-[util*/webapp] and use webpack to build production js (takes several minutes!)')
    parser_webapp.add_argument('action', help='either "build" the webapp or "pull/push" compiled files from a repository -- see scripts/webapp-control.sh how this works', choices=['build', 'pull', 'push', 'build-push', 'clean'])
    parser_webapp.set_defaults(func = install_webapp)

    parser_primus = subparsers.add_parser('primus', help='update client-side primus websocket code')
    parser_primus.set_defaults(func = lambda *args: install_primus())

    parser_pyutil = subparsers.add_parser('pyutil', help='install smc_pyutil package system-wide (requires sudo)')
    parser_pyutil.set_defaults(func = lambda *args: install_pyutil())

    parser_sagews = subparsers.add_parser('sagews', help='install sagews server into sage install')
    parser_sagews.add_argument("--sage", help="/path/to/sage (default: 'sage')", default='sage', type=str)
    parser_sagews.set_defaults(func = lambda *args: install_sagews())

    parser_project = subparsers.add_parser('project', help='install project server code system-wide')
    parser_project.set_defaults(func = lambda *args: install_project())

    parser_all = subparsers.add_parser('all', help='install all code that makes sense for the selected classes of servers; use "./install.py all --compute" for compute node and "./install.py all --web" for a web node')
    parser_all.add_argument("--compute", default=False, action="store_const", const=True)
    parser_all.add_argument("--web", default=False, action="store_const", const=True)
    parser_all.set_defaults(func = lambda args: install_all(compute=args.compute, web=args.web))

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
