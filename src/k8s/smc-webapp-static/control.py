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

        # Copy static files over, resolving symlinks
        util.run(['rsync', '-axvL', join('..', '..', 'static') + '/', join(tmp, 'static') + '/'])

        # Copy Docker and conf files over
        shutil.copyfile(join('image-host', 'Dockerfile'), join(tmp, 'Dockerfile'))
        shutil.copyfile(join('conf', 'default.conf'), join(tmp, 'default.conf'))

        # Run Docker build
        util.run(['sudo', 'docker', 'build', '-t', tag, '--no-cache', '.'], path=tmp)

def rebuild_host_static():
    util.run('. ./smc-env && ./install.py webapp', shell=True, path=join(SCRIPT_PATH, '..', '..'))

def get_tag(args):
    name = NAME
    if args.full:
        name += '-full'
    else:
        name += '-host'
    tag = name
    if args.tag:
        tag += ':' + args.tag
    elif not args.local:
        return util.gcloud_most_recent_image(name)
    if not args.local:
        tag = util.gcloud_docker_repo(tag)
    return tag

def build_docker(args):
    tag = util.get_tag(args, NAME)
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
    v = sum([[x for x in util.gcloud_images(NAME+'-'+k)] for k in ['full', 'host']], [])
    print('-'*70 + '\n')
    for x in v:
        print("%-20s%-60s%-20s"%(x['TAG'], x['REPOSITORY'], x['CREATED'].isoformat()))
    print('\n')

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build_full)
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
    sub.add_argument("-r", "--rebuild", action="store_true",
                     help="rebuild everything without caching")
    sub.add_argument("-f", "--full", action="store_true", help="if not given, use ../../static; if given, builds container by creating static content as part of Docker build process")
    sub.add_argument("-l", "--local", action="store_true",
                     help="only build the image locally; don't push it to gcloud docker repo")
    sub.set_defaults(func=build_docker)

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster; you must also call "build -p" to push an image'.format(name=NAME))
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (default: most recent tag)")
    sub.add_argument("-r", "--replicas", default=1, help="number of replicas")
    sub.add_argument("-f", "--force",  action="store_true", help="force reload image in k8s")
    sub.add_argument("--full", action="store_true", help="if true, use image built using --full option")
    sub.set_defaults(func=run_on_kubernetes)


    sub = subparsers.add_parser('delete', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    util.add_deployment_parsers(NAME, subparsers)

    args = parser.parse_args()
    args.func(args)