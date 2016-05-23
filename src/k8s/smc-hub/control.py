#!/usr/bin/env python3

"""
Hub management script

"""

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory fo this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

# For now in all cases, we just call the container the following; really it should
# maybe be smc-webapp-static#sha1hash, which makes switching between versions easy, etc.
NAME='smc-hub'

def build(tag, pull, upgrade):
    """
    Build Docker container by installing and building everything inside the container itself, and
    NOT using ../../static/ on host.
    """
    # First build smc-hub-base, which is generic install of ubuntu packages, so we should rarely
    # clear the cache for this.
    v = ['sudo', 'docker', 'build', '-t', '{name}-base'.format(name=NAME)]
    if upgrade:
        v.append("--no-cache")
    v.append(".")
    util.run(v, path=join(SCRIPT_PATH, 'image-base'))

    # Next build smc-hub, which depends on smc-hub-base.
    v = ['sudo', 'docker', 'build', '-t', tag]
    if pull:  # will cause a git pull to happen
        v.append("--no-cache")
    v.append('.')
    util.run(v, path=join(SCRIPT_PATH,'image'))

def get_tag(args):
    tag = NAME
    if args.tag:
        tag += ':' + args.tag
    if not args.local:
        tag = util.gcloud_docker_repo(tag)
    return tag

def build_docker(args):
    tag = get_tag(args)
    build(tag, args.pull, args.upgrade)
    if not args.local:
        util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    for x in util.gcloud_images(NAME):
        print("%-20s%-60s"%(x['TAG'], x['REPOSITORY']))

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = get_tag(args)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image=tag, replicas=args.replicas))
        tmp.flush()
        util.update_deployment(tmp.name)

def stop_on_kubernetes(args):
    util.stop_deployment(NAME)

def secrets(args):
    path = os.path.abspath(join(SCRIPT_PATH, '..', '..', 'data', 'secrets'))
    if not os.path.exists(path):
        os.makedirs(path)
    util.create_secret('rethinkdb-password', join(path, 'rethinkdb'))
    util.create_secret('sendgrid-api-key',   join(path, 'sendgrid'))
    util.create_secret('zendesk-api-key',    join(path, 'zendesk'))

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", default="", help="tag for this build")
    sub.add_argument("-p", "--pull", action="store_true",
                     help="repull latest hub source code from git and install any dependencies")
    sub.add_argument("-u", "--upgrade", action="store_true",
                     help="re-install the base Ubuntu packages")
    sub.add_argument("-l", "--local", action="store_true",
                     help="only build the image locally; don't push it to gcloud docker repo")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster'.format(name=NAME))
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("-r", "--replicas", default=2, help="number of replicas")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('stop', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    sub = subparsers.add_parser('secrets', help='load secrets needed by the {name} pods'.format(name=NAME))
    sub.set_defaults(func=secrets)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
