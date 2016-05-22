#!/usr/bin/env python3
"""
Basic script to do a little bit toward automating creating rethinkdb cluster.

TODO:

 - tons
 - automatic creation of PD
 - don't hardcode kubetest in conf/rethinkdb-template.yaml
 - creating the other two services in conf/

"""

import subprocess, tempfile

def deploy_run_replica(number):
    s = open("conf/rethinkdb-template.yaml").read().format(number=number)
    t = tempfile.NamedTemporaryFile(suffix='.yaml', mode='w')
    t.write(s)
    t.flush()
    subprocess.call(['kubectl', 'create', '-f', t.name])

def run_replicas(args):
    for number in args.number:
        deploy_run_replica(number)

def delete_replica(number):
    subprocess.call(['kubectl', 'delete', 'deployment', 'rethinkdb{number}'.format(number=number)])

def delete_replicas(args):
    for number in args.number:
        delete_replica(number)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(help='sub-command help')

    # https://docs.python.org/3/library/argparse.html#module-argparse
    sub = subparsers.add_parser('run', help='run a rethinkdb node as a deployment')
    sub.add_argument('number', type=int, help='which node or nodes to run', nargs='+')
    sub.set_defaults(func=run_replicas)

    # https://docs.python.org/3/library/argparse.html#module-argparse
    sub = subparsers.add_parser('delete', help='delete a rethinkdb node deployment (does not delete data)')
    sub.add_argument('number', type=int, help='which node or nodes to delete', nargs='+')
    sub.set_defaults(func=delete_replicas)

    args = parser.parse_args()
    args.func(args)
