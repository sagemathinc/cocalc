#!/usr/bin/env python

import argparse, os, sys, time

SRC = os.path.split(os.path.realpath(__file__))[0]

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
    cmd("sudo /usr/bin/pip install --upgrade ./smc_pyutil")

def install_sagews():
    cmd("sage -pip install --upgrade ./smc_sagews")

def install_project():
    cmd("sudo /usr/bin/npm install --upgrade ./smc-util ./smc-util-node ./smc-project -g")

def install_hub():
    for path in ['.', 'smc-util', 'smc-util-node', 'smc-hub']:
        cmd("cd %s; npm install"%path)

def install_webapp():
    cmd("cd wizard && make")
    for path in ['.', 'smc-util', 'smc-util-node']:
        cmd("cd %s; npm install"%path)
    cmd("update_react_static")
    print("Building production webpack -- this will take about 3 minutes")
    cmd("npm run webpack-production")

def install_all(compute=False, web=False):
    if compute or web:
        pull()
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
    parser_webapp.set_defaults(func = lambda *args: install_webapp())

    parser_pyutil = subparsers.add_parser('pyutil', help='install smc_pyutil package system-wide (requires sudo)')
    parser_pyutil.set_defaults(func = lambda *args: install_pyutil())

    parser_sagews = subparsers.add_parser('sagews', help='install sagews server into sage install')
    parser_sagews.add_argument("--sage", help="/path/to/sage (default: 'sage')", default='sage', type=str)
    parser_sagews.set_defaults(func = lambda *args: install_sagews())

    parser_project = subparsers.add_parser('project', help='install project server code system-wide')
    parser_project.set_defaults(func = lambda *args: install_project())

    parser_all = subparsers.add_parser('all', help='install all code that makes sense for the selected classes of servers')
    parser_all.add_argument("--compute", default=False, action="store_const", const=True)
    parser_all.add_argument("--web", default=False, action="store_const", const=True)
    parser_all.set_defaults(func = lambda args: install_all(compute=args.compute, web=args.web))

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()

"""
#set -e
set -v
cd $SALVUS_ROOT

# Pull the latest version of this branch
git pull

# Install/upgrade any npm packages that haven't been installed or upgraded.
npm install

# Build updated backend code.
./make_coffee

# If this is running on a development machine, build and copy over the local_hub template files.
if [ -d /projects/sagemathcloud/ ]; then
    cd $SALVUS_ROOT/local_hub_template
    npm install
    update_local_hub
fi

# Update the primus client-side websocket/etc. drivers
cd $SALVUS_ROOT/static/primus
./update_primus
cd $SALVUS_ROOT

# Render any static React-js based pages, which get served from the backend.
update_react_static

# Build production webpack -- client page app files
echo "Building production webpack'ing of client site.  This *will* take several minutes."
npm run webpack-production
"""