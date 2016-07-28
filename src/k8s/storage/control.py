#!/usr/bin/env python3

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME     = 'storage'
SERVICES = os.listdir(os.path.join(SCRIPT_PATH, 'images'))

def full_tag(tag, service):
    return "{tag}-{service}".format(service=service, tag=tag)

def build(tag, rebuild):
    for service in SERVICES:
        v = ['sudo', 'docker', 'build', '-t', full_tag(tag, service)]
        if rebuild:
            v.append("--no-cache")
        v.append('.')
        util.run(v, path=join(SCRIPT_PATH, 'images', service))

def build_docker(args):
    tag = util.get_tag(args, NAME)
    build(tag, args.rebuild)
    if not args.local:
        for service in SERVICES:
            util.gcloud_docker_push(full_tag(tag, service))

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
    create_gcloud_secret()
    context = util.get_cluster_prefix()
    namespace = util.get_current_namespace()
    if len(args.number) == 0:
        # Figure out the nodes based on the names of persistent disks, or just node 0 if none.
        args.number = range(max(1,len(get_persistent_disks(context, namespace))))
    if 'storage-projects' not in util.get_services():
        util.run(['kubectl', 'create', '-f', 'conf/service.yaml'])
    args.local = False # so tag is for gcloud

    tag = util.get_tag(args, NAME, build)
    if not args.tag:
        tag = tag[:tag.rfind('-')]   # get rid of the final -[service] part of the tag.

    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()

    ensure_ssh()
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

def ensure_persistent_disk_exists(context, namespace, number, size, disk_type):
    name = pd_name(context, namespace, number)
    util.ensure_persistent_disk_exists(name, size=size, disk_type=disk_type)

def delete_persistent_disks(context, namespace, numbers):
    names = [pd_name(context, namespace, number) for number in numbers]
    util.delete_persistent_disks(names, maxtime_s=60*3)  # try for up to 3 minutes

def delete(args):
    if len(args.number) == 0:
        if args.obliterate_disk:
            raise ValueError("you must explicitly specify the nodes when using --obliterate-disk")
        args.number = all_node_numbers()
    for number in args.number:
        deployment_name = "{name}{number}".format(name=NAME, number=number)
        util.stop_deployment(deployment_name)
    if args.obliterate_disk and args.number:
        context = util.get_cluster_prefix()
        namespace = util.get_current_namespace()
        what = "%s-%s"%(context, namespace)
        if args.obliterate_disk == what:
            delete_persistent_disks(context, namespace, args.number)
        else:
            raise ValueError("to obliterate the disk you must do --obliterate-disk=%s"%what)

def ensure_ssh():
    if 'storage-ssh' not in util.get_secrets():
        # generate a public/private ssh key pair that will be used for sshfs
        with tempfile.TemporaryDirectory() as tmp:
            util.run(['ssh-keygen', '-b', '2048', '-f', join(tmp, 'id-rsa'), '-N', ''])
            util.create_secret('storage-ssh', tmp)

SECRET_NAME = 'gcloud-access-token'

def create_gcloud_secret():
    if SECRET_NAME not in util.get_secrets():
        with tempfile.TemporaryDirectory() as tmp:
            target = join(tmp, 'access-token')
            shutil.copyfile(os.path.join(os.environ['HOME'], '.config', 'gcloud', 'access_token'), target)
            util.create_secret(SECRET_NAME, tmp)

def delete_kubectl_secret():
    util.delete_secret(SECRET_NAME)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Control deployment of {name}'.format(name=NAME))
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='build docker image')
    sub.add_argument("-t", "--tag", required=True, help="tag for this build")
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

    sub = subparsers.add_parser('delete', help='delete specified (or all) running pods, services, etc.; does **not** delete persistent disks, unless you pass the --obliterate-disk option')
    sub.add_argument('number', type=int, help='which node or nodes to stop running; stops all if not given', nargs='*')
    sub.add_argument("--obliterate-disk", type=str, default='', help="give --obliterate-disk=k8s-[cluster]-[namespace] to delete the deployment *and* delete the persistent disk; try with --obliterate-disk=help to get the current value of k8s-[cluster]-[namespace]")
    sub.set_defaults(func=delete)

    util.add_images_parser(NAME, subparsers)
    util.add_edit_parser(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
