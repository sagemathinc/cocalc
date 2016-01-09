#!/usr/bin/env python3

import argparse, os, sys, time, tempfile

SRC = os.path.split(os.path.realpath(__file__))[0]

templates_default_path = '/projects/templates'

def cmd(s):
    t0 = time.time()
    os.chdir(SRC)
    s = "umask 022; " + s
    print(s)
    if os.system(s):
        sys.exit(1)
    print("TOTAL TIME: %.1f seconds"%(time.time() - t0))

def pull():
    cmd("git pull")

def install_pyutil():
    cmd("sudo /usr/bin/pip install --upgrade ./smc_pyutil")

def install_sagews():
    cmd("sage -pip install --upgrade ./smc_sagews")
    cmd("sudo /usr/bin/pip install --upgrade ./smc_sagews")   # as a fallback

def install_project():
    # unsafe-perm below is needed so can build C code as root
    for m in './smc-util ./smc-util-node ./smc-project coffee-script forever'.split():
        cmd("sudo npm --unsafe-perm=true install --upgrade %s -g"%m)

def install_hub():
    cmd("sudo /usr/bin/npm install --upgrade forever -g")   # since "forever list" is useful
    for path in ['.', 'smc-util', 'smc-util-node', 'smc-hub']:
        cmd("cd %s; npm install"%path)

def install_webapp():
    cmd("cd wizard && make")
    for path in ['.', 'smc-util', 'smc-util-node', 'smc-webapp']:
        cmd("cd %s; npm install"%path)
    cmd("update_react_static")
    print("Building production webpack -- this will take about 3 minutes")
    cmd("npm run webpack-production")

def install_primus():
    cmd("static/primus/update_primus")

def install_templates(path):
    '''
    This installs all templates into an empty (or cleaned up) `path` directory.
    '''
    from os.path import join
    if os.path.exists(path):
        cmd("sudo rm -rf %s" % path)

    # cloud examples from github
    tmpdir = tempfile.mkdtemp()
    try:
        tmpzip =  join(tmpdir, 'master.zip')
        # --location tells curl to follow redirects
        cmd("sudo curl --silent --location -o %s https://github.com/sagemath/cloud-examples/archive/master.zip" % tmpzip)
        cmd("sudo unzip -q %s -d %s" % (tmpzip, path))
        cmd("sudo chown -R salvus:salvus %s" % path)
        cloud_examples = join(path, "cloud-examples")
        cmd("sudo mv %s %s" % (join(path, "cloud-examples-master"), cloud_examples))
        cmd("cd %s; make" % cloud_examples)
    finally:
        cmd("sudo rm -rf %s" % tmpdir)

    # TODO: other templates

def install_all(compute=False, web=False):
    if compute or web:
        pull()
        install_hub()  # also contains compute server right now (will refactor later)
        install_templates()
    if compute:
        install_pyutil()
        install_sagews()
        install_project()
    if web:
        install_primus()
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

    parser_primus = subparsers.add_parser('primus', help='update client-side primus websocket code')
    parser_primus.set_defaults(func = lambda *args: install_primus())

    parser_pyutil = subparsers.add_parser('pyutil', help='install smc_pyutil package system-wide (requires sudo)')
    parser_pyutil.set_defaults(func = lambda *args: install_pyutil())

    parser_sagews = subparsers.add_parser('sagews', help='install sagews server into sage install')
    parser_sagews.add_argument("--sage", help="/path/to/sage (default: 'sage')", default='sage', type=str)
    parser_sagews.set_defaults(func = lambda *args: install_sagews())

    parser_project = subparsers.add_parser('project', help='install project server code system-wide')
    parser_project.set_defaults(func = lambda *args: install_project())

    parser_templates = subparsers.add_parser('templates', help='globally install template files')
    parser_templates.add_argument("--path", help="/path/to/templates (default: %s)"%templates_default_path, default=templates_default_path)
    parser_templates.set_defaults(func = lambda args: install_templates(path=args.path))

    parser_all = subparsers.add_parser('all', help='install all code that makes sense for the selected classes of servers')
    parser_all.add_argument("--compute", default=False, action="store_const", const=True)
    parser_all.add_argument("--web", default=False, action="store_const", const=True)
    parser_all.set_defaults(func = lambda args: install_all(compute=args.compute, web=args.web))

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
