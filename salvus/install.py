#!/usr/bin/env python

import argparse, os

SRC = os.path.split(os.path.realpath(__file__))[0]

def cmd(s):
    os.chdir(SRC)
    print s
    if os.system(s):
       sys.exit(1)

def install_pyutil():
    cmd("sudo /usr/bin/pip install --upgrade ./smc_pyutil")

def main():
    parser = argparse.ArgumentParser(description="Install components of SageMathCloud into the system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_pyutil = subparsers.add_parser('pyutil', help='install smc_pyutil package system-wide (requires sudo)')
    parser_pyutil.set_defaults(func = lambda *args: install_pyutil())

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