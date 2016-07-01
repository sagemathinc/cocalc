#!/usr/bin/env python3

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='storage'

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

def pd_name(context, namespace, number=''):
    return "{context}-storage-{namespace}-server{number}".format(context=context, number=number, namespace=namespace)

def ensure_persistent_disk_exists(context, namespace, number, size, disk_type):
    name = pd_name(context, namespace, number)
    util.ensure_persistent_disk_exists(name, size=size, disk_type=disk_type)

def get_persistent_disks(context, namespace):
    name = pd_name(context=context, namespace=namespace)
    return [x for x in util.get_persistent_disk_names() if x.startswith(name)]

def run_on_kubernetes(args):
    context = util.get_cluster_prefix()
    namespace = util.get_current_namespace()
    if len(args.number) == 0:
        # Figure out the nodes based on the names of persistent disks, or just node 0 if none.
        args.number = range(max(1,len(get_persistent_disks(context, namespace))))
    if 'storage-projects' not in util.get_services():
        util.run(['kubectl', 'create', '-f', 'conf/service.yaml'])
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    for number in args.number:
        deployment_name = "{name}{number}".format(name=NAME, number=number)
        ensure_persistent_disk_exists(context, namespace, number, args.size, args.type)
        with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
            tmp.write(t.format(image        = tag,
                               number       = number,
                               pd_name      = pd_name(context=context, namespace=namespace, number=number),
                               health_delay = args.health_delay,
                               pull_policy  = util.pull_policy(args)))
            tmp.flush()
            util.update_deployment(tmp.name)

def all_node_numbers():
    n = len('storage')
    v = []
    for x in util.get_deployments():
        print(x)
        if x.startswith(NAME):
            m = x[n:]
            try:
                v.append(int(m))
            except:
                pass
    return v

def delete(args):
    if len(args.number) == 0:
        args.number = all_node_numbers()
    for number in args.number:
        util.stop_deployment('{NAME}{number}'.format(NAME=NAME, number=number))
        deployment_name = "{name}{number}".format(name=NAME, number=number)

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

    sub = subparsers.add_parser('run', help='create/update {name} deployment on the currently selected kubernetes cluster'.format(name=NAME), formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument('number', type=int, help='which node or nodes to run', nargs='*')
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (or use recent image if not specified)")
    sub.add_argument("-f", "--force",  action="store_true", help="force reload image in k8s")
    sub.add_argument('--size', default=10, type=int, help='size of persistent disk in GB (can be used to dynamically increase size!)')
    sub.add_argument('--type', default='standard', help='"standard" or "ssd" -- type of persistent disk (ignored if disk already exists)')
    sub.add_argument('--health-delay', default=60, type=int, help='time in seconds before starting health checks')
    sub.set_defaults(func=run_on_kubernetes)

    def selector(args):
        if len(args.number) == 0:
            return {'storage':'projects'}
        else:
            # can only do one
            return {'storage':'projects', 'instance':args.number[0]}
    util.add_bash_parser(NAME, subparsers, custom_selector=selector)
    util.add_top_parser(NAME, subparsers, custom_selector=selector)
    util.add_htop_parser(NAME, subparsers, custom_selector=selector)

    util.add_logs_parser(NAME, subparsers)

    sub = subparsers.add_parser('delete', help='delete specified (or all) running pods, services, etc.; does **not** delete persistent disks')
    sub.add_argument('number', type=int, help='which node or nodes to stop running', nargs='*')
    sub.set_defaults(func=delete)

    util.add_images_parser(NAME, subparsers)
    util.add_edit_parser(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
