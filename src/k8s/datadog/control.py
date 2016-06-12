#!/usr/bin/env python3

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

# datadog api key stored in src/data/config/datadog (new newline)
# if doesn't exist, raise exception, don't install datadog
datadog_fn = os.path.abspath(os.path.join(SCRIPT_PATH, '..', '..', 'data', 'config', 'datadog'))

# For now in all cases, we just call the container the following; really it should
# maybe be smc-webapp-static#sha1hash, which makes switching between versions easy, etc.
NAME='dd-agent'

# config file as tmp file for run and stop
from contextlib import contextmanager
@contextmanager
def config():
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    if not os.path.exists(datadog_fn):
        raise Exception('No datadog API key stored in "%s"' % datadog_fn)
    API_KEY = open(datadog_fn).read().strip()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(API_KEY=API_KEY))
        tmp.flush()
        # report back the temp filename
        yield tmp.name

def run_on_kubernetes(args):
    # TODO
    print("WARNING: update_deployent doesn't work. first do delete, then run again")
    with config() as cfn:
        util.update_deployment(cfn)

def stop_on_kubernetes(args):
    with config() as cfn:
        util.run(['kubectl', 'delete', '-f', cfn])

def print_template(args):
    with config() as cfn:
        util.run(['cat', cfn])

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('template', help='show the template after rendering')
    sub.set_defaults(func=print_template)

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster; you must also call "build -p" to push an image'.format(name=NAME))
    sub.add_argument("-f", "--force",  action="store_true", help="force reload image in k8s")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    util.add_deployment_parsers(NAME, subparsers)

    args = parser.parse_args()
    args.func(args)
