#!/usr/bin/env python3

"""

TODO:

 - version every container based on the sha1 of the last commit; the static/webpack/ build should hae
   a file that contains this, when the webpack build succeeds, and also a warning file if it
   fails. Probably hsy already implemented that.

 -
"""

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory fo this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

# For now in all cases, we just call the container the following; really it should
# maybe be smc-webapp-static#sha1hash, which makes switching between versions easy, etc.
NAME='smc-webapp-static'

def test_mesg(tag):
    print("Test locally by doing 'docker run -P {tag}' then check 'docker ps -l' for the port and connect to it.".format(tag=tag))

def build_full(tag, rebuild):
    """
    Build Docker container by installing and building everything inside the container itself, and
    NOT using ../../static/ on host.
    """
    # Temporary directory where we do the  build
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(SCRIPT_PATH)
        # Copy Docker and conf files over
        shutil.copyfile(join('image-full', 'Dockerfile'), join(tmp, 'Dockerfile'))
        shutil.copyfile(join('conf', 'default.conf'), join(tmp, 'default.conf'))
        # Run Docker build
        v = ['sudo', 'docker', 'build', '-t', tag]
        if rebuild:
            v.append("--no-cache")
        v.append('.')
        util.run(v, path=tmp)

def build_host(tag):
    """
    Build Docker container using files in ../../static/ on host.
    """
    # Temporary directory where we do the  build
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(SCRIPT_PATH)

        # Copy static files over
        shutil.copytree(join('..', '..', 'static'), join(tmp, 'static'), symlinks=True)

        # Copy Docker and conf files over
        shutil.copyfile(join('image-host', 'Dockerfile'), join(tmp, 'Dockerfile'))
        shutil.copyfile(join('conf', 'default.conf'), join(tmp, 'default.conf'))

        # Run Docker build
        util.run(['sudo', 'docker', 'build', '-t', tag, '--no-cache', '.'], path=tmp)

def rebuild_host_static():
    util.run('. ./smc-env && ./install.py webapp', shell=True, path=join(SCRIPT_PATH, '..', '..'))

def get_tag(args):
    tag = NAME
    if args.full:
        tag += '-full'
    else:
        tag += '-host'
    if args.tag:
        tag += ':' + args.tag
    if not args.local:
        tag = util.gcloud_docker_repo(tag)
    return tag

def build_docker(args):
    tag = get_tag(args)
    if args.rebuild and not args.full:
        rebuild_host_static()
    if args.full:
        build_full(tag, args.rebuild)
    else:
        build_host(tag)
    if args.local:
        test_mesg(tag)
    else:
        util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    r = util.gcloud_docker_repo('smc-webapp-static')
    for x in util.gcloud_images():
        if x['REPOSITORY'].startswith(r):
            print("%-20s%-60s"%(x['TAG'], x['REPOSITORY']))

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = get_tag(args)
    t = open(join('conf', 'smc-webapp-static.template.yaml')).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image=tag, replicas=args.replicas))
        tmp.flush()
        if 'smc-webapp-static' in util.get_deployments():
            util.run(['kubectl', 'replace', '-f', tmp.name])
        else:
            util.run(['kubectl', 'create', '-f', tmp.name])


def stop_on_kubernetes(args):
    util.run(['kubectl', 'delete', 'deployment', 'smc-webapp-static'])

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", default="", help="tag for this build")
    sub.add_argument("-r", "--rebuild", action="store_true",
                     help="rebuild everything without caching")
    sub.add_argument("-f", "--full", action="store_true", help="if not given, use ../../static; if given, builds container by creating static content as part of Docker build process")
    sub.add_argument("-l", "--local", action="store_true",
                     help="only build the image locally; don't push it to gcloud docker repo")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='create/update smc-webapp-static deployment on the currently selected kubernetes cluster; you must also call "build -p" to push an image')
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("-r", "--replicas", default=2, help="number of replicas")
    sub.add_argument("-f", "--full", action="store_true", help="if true, use image built using --full option")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('stop', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list smc-webapp-static tags in gcloud docker repo, from newest to oldest')
    sub.set_defaults(func=images_on_gcloud)



    args = parser.parse_args()
    args.func(args)