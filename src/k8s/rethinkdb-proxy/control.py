#!/usr/bin/env python3
"""
Rethinkdb-proxy management/deployment script.
"""

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='rethinkdb-proxy'

def build(tag, rebuild):
    v = ['sudo', 'docker', 'build', '-t', tag]
    if rebuild:  # will cause a git pull to happen
        v.append("--no-cache")
    v.append('.')
    util.run(v, path=join(SCRIPT_PATH, 'image'))

def build_docker(args):
    tag = util.get_tag(args, NAME)
    build(tag, args.rebuild)
    if not args.local:
        util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    for x in util.gcloud_images(NAME):
        print("%-20s%-60s"%(x['TAG'], x['REPOSITORY']))

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME)
    print("tag='{tag}', replicas='{replicas}'".format(tag=tag, replicas=args.replicas))
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image=tag, replicas=args.replicas))
        tmp.flush()
        util.update_deployment(tmp.name)

    if NAME not in util.get_services():
        util.run(['kubectl', 'expose', 'deployment', NAME])

def stop_on_kubernetes(args):
    util.stop_deployment(NAME)

def expose(args):
    util.run(['kubectl', 'expose', 'deployment', NAME])

def forward_test(args):
    v = util.get_pods(run='rethinkdb-proxy')
    v = [x for x in v if x['STATUS'] == 'Running']
    if len(v) == 0:
        print("No rethinkdb-proxy nodes available")
    else:
        print("\n\nYou may connect to rethinkdb-proxy on localhost:\n\n")
        util.run(['kubectl', 'port-forward', v[0]['NAME'], '28015:28015'])

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", default="", help="tag for this build")
    sub.add_argument("-r", "--rebuild", action="store_true", help="rebuild from scratch")
    sub.add_argument("-l", "--local", action="store_true",
                     help="only build the image locally; don't push it to gcloud docker repo")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster'.format(name=NAME))
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (default: most recent tag)")
    sub.add_argument("-r", "--replicas", default=3, help="number of replicas")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('test', help='forward 28015 port from some pod to localhost for testing purposes')
    sub.set_defaults(func=forward_test)

    sub = subparsers.add_parser('stop', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    util.add_autoscale_parser(NAME, subparsers)
    util.add_bash_parser(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
