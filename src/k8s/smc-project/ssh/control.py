#!/usr/bin/env python3

# Ssh Gateway, to provide ssh access to running projects.

import json, os, shutil, sys, tempfile, uuid, yaml
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
path_to_util = join(SCRIPT_PATH, '..', '..', 'util')
sys.path.insert(0, path_to_util)
import util

NAME='project-ssh'

def build(tag, rebuild):
    v = ['sudo', 'docker', 'build', '-t', tag]
    if rebuild:  # will cause a git pull to happen
        v.append("--no-cache")
    v.append('.')
    path = join(SCRIPT_PATH, 'image')
    util.run(v, path=path)

def build_docker(args):
    tag = util.get_tag(args, NAME)
    build(tag, args.rebuild)
    util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    for x in util.gcloud_images(NAME):
        print("%-20s%-60s"%(x['TAG'], x['REPOSITORY']))

def run_on_kubernetes(args):
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image          = tag,
                           replicas       = args.replicas,
                           pull_policy    = util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)
    if NAME not in util.get_services():
        util.run(['kubectl', 'expose', 'deployment', NAME])

def delete(args):
    util.stop_deployment(NAME)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", required=True, help="tag for this build")
    sub.add_argument("-r", "--rebuild", action="store_true", help="rebuild from scratch")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='run the deployment', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("--project-tag", default="", help="tag to use when starting projects (will default to newest when this deployment started)")
    sub.add_argument("-f", "--force",  action="store_true", help="force re-download image in k8s")
    sub.add_argument("-r", "--replicas", default=2, help="number of replicas (default: 2)")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='kill the deployment')
    sub.set_defaults(func=delete)

    util.add_deployment_parsers(NAME, subparsers, exclude='autoscale')

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
