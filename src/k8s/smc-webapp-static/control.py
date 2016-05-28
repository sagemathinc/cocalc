#!/usr/bin/env python3

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

# For now in all cases, we just call the container the following; really it should
# maybe be smc-webapp-static#sha1hash, which makes switching between versions easy, etc.
NAME='smc-webapp-static'

def test_mesg(tag):
    print("Test locally by doing 'docker run -P {tag}' then check 'docker ps -l' for the port and connect to it.".format(tag=tag))

def build_base(rebuild=False):
    v = ['sudo', 'docker', 'build', '-t', 'smc-webapp-static-base']
    if rebuild:
        v.append("--no-cache")
    v.append('.')
    util.run(v, path='image-base')

def build(tag, rebuild, commit=None):
    """
    Build Docker container by installing and building everything inside the container itself, and
    NOT using ../../static/ on host.
    """
    build_base(False)  # ensure base image exists

    # Build image we will deploy on top of base
    v = ['sudo', 'docker', 'build', '-t', tag]
    if commit:
        v.append("--build-arg")
        v.append("commit={commit}".format(commit=commit))
    if rebuild:
        v.append("--no-cache")
    v.append('.')
    util.run(v, path='image')

def get_tag(args):
    name = NAME
    tag = name
    if args.tag:
        tag += ':' + args.tag
    elif not args.local:
        return util.gcloud_most_recent_image(name)
    if not args.local:
        tag = util.gcloud_docker_repo(tag)
    return tag

def build_docker(args):
    if args.commit:
        args.tag += ('-' if args.tag else '') + args.commit[:6]
    tag = util.get_tag(args, NAME)
    if args.rebuild_all:
        build_base(True)
    build(tag, args.rebuild, args.commit)
    if args.local:
        test_mesg(tag)
    else:
        util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    print('-'*70 + '\n')
    for x in util.gcloud_images(NAME):
        print("%-20s%-60s%-20s"%(x['TAG'], x['REPOSITORY'], x['CREATED'].isoformat()))
    print('\n')

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image=tag, replicas=args.replicas,
                               pull_policy=util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)
    if NAME not in util.get_services():
        util.run(['kubectl', 'expose', 'deployment', NAME])

def stop_on_kubernetes(args):
    util.stop_deployment(NAME)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", default="", help="tag for this build")
    sub.add_argument("-r", "--rebuild", action="store_true", help="update to latest version of SMC from master")
    sub.add_argument("-c", "--commit", default='',
                     help="build a particular sha1 commit;  the commit is automatically appended to the tag")
    sub.add_argument("--rebuild_all", action="store_true", help="rebuild everything including base image")
    sub.add_argument("-l", "--local", action="store_true",
                     help="only build the image locally; don't push it to gcloud docker repo")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster; you must also call "build -p" to push an image'.format(name=NAME))
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (default: most recent tag)")
    sub.add_argument("-r", "--replicas", default=1, help="number of replicas")
    sub.add_argument("-f", "--force",  action="store_true", help="force reload image in k8s")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    util.add_deployment_parsers(NAME, subparsers)

    args = parser.parse_args()
    args.func(args)