#!/usr/bin/env python3

import os, shutil, sys, tempfile, uuid
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', '..', 'util')))
import util

NAME='cluster-manager'

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
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image          = tag,
                           pull_policy    = util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)

def delete(args):
    util.stop_deployment(NAME)

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

    sub = subparsers.add_parser('run', help='run the deployment', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("-f", "--force",  action="store_true", help="force re-download image in k8s")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='kill the deployment')
    sub.set_defaults(func=delete)

    util.add_deployment_parsers(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
