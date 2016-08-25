#!/usr/bin/env python3

import os, shutil, sys, tempfile, uuid
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='smc-project'  # DO *NOT* change this; it's also assumed elsewhere, e.g., in manager/control.py

def build(tag, rebuild):
    v = ['sudo', 'docker', 'build', '-t', tag]
    if rebuild:  # will cause a git pull to happen
        v.append("--no-cache")
    if args.commit:
        commit = args.commit
    else:
        # We always build the latest version of the given branch
        commit = util.run("git fetch origin && git log -1 --pretty=format:%H {branch}".format(branch=args.branch), get_output=True).strip()
    v.append("--build-arg")
    v.append("commit={commit}".format(commit=commit))
    v.append('.')
    util.run(v, path=join(SCRIPT_PATH, 'image-dev'))

def build2(tag, rebuild):
    v = ['sudo', 'docker', 'build', '-t', tag]
    if rebuild:
        v.append("--no-cache")
    v.append('.')
    util.run(v, path=join(SCRIPT_PATH, 'images/control'))

def build_docker(args):
    # user project
    tag = util.get_tag(args, NAME)
    build(tag+'-main', args.rebuild_all)
    util.gcloud_docker_push(tag+'-main')

    # control container (network iptables, etc.)
    tag2 = tag + '-control'
    build2(tag2, args.rebuild_all)
    util.gcloud_docker_push(tag2)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", required=True, help="tag for this build")
    sub.add_argument("--rebuild-all", action="store_true", help="rebuild image from scratch")
    sub.add_argument("-b", "--branch", default='master', help="branch of SMC to build (default: 'master'); will build HEAD of this")
    sub.add_argument("-c", "--commit", default='', help="optional -- explicit commit to checkout (instead of HEAD of branch)")
    sub.set_defaults(func=build_docker)

    def selector(args):
        return {'run':'smc-project'}

    util.add_bash_parser(NAME, subparsers, custom_selector=selector)
    util.add_top_parser(NAME,  subparsers, custom_selector=selector)
    util.add_htop_parser(NAME, subparsers, custom_selector=selector)
    util.add_logs_parser(NAME, subparsers)

    util.add_images_parser(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
