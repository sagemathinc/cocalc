#!/usr/bin/env python3
"""
Basic script to do a little bit toward automating creating rethinkdb cluster.

"""


import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='rethinkdb'

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

def ensure_persistent_disk_exists(context, number, size, disk_type):
    name = "{context}-rethinkdb-{number}".format(context=context, number=number)
    util.ensure_persistent_disk_exists(name, size=size, disk_type=disk_type)

def ensure_services_exist():
    v = util.get_services()
    for s in ['driver', 'cluster']:
        n = 'rethinkdb-'+s
        if n not in v:
            filename = join('conf', s + '.yaml')
            print("creating service defined in '{filename}'".format(filename=filename))
            util.update_service(filename)

def run_on_kubernetes(args):
    if len(args.number) == 0:
        args.number = [0]
    ensure_services_exist()
    util.ensure_secret_exists('rethinkdb-password', 'rethinkdb')
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME)
    context = util.get_kube_context()
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    for number in args.number:
        ensure_persistent_disk_exists(context, number, args.size, args.type)
        with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
            tmp.write(t.format(image=tag, number=number, context=context,
                               pull_policy=util.pull_policy(args)))
            tmp.flush()
            util.update_deployment(tmp.name)

def forward_admin(args):
    port = 8080
    fwd = "ssh -L {port}:localhost:{port} salvus@{ip}".format(port=port, ip=util.external_ip())
    mesg = "Type this on your laptop, then visit http://localhost:{port}\n\n    {fwd}".format(port=port, fwd=fwd)
    forward_port(args, 8080, mesg)

def forward_db(args):
    forward_port(args, 28015, 'Point your rethinkdb client at localhost.')

def forward_port(args, port, mesg):
    if args.number == -1:
        v = util.get_pods(db='rethinkdb')
    else:
        v = util.get_pods(db='rethinkdb', instance=args.number)
    v = [x for x in v if x['STATUS'] == 'Running']
    if len(v) == 0:
        raise RuntimeError("rethinkdb node {number} not available".format(args.number))
    print("{dashes}{mesg}{dashes}".format(mesg=mesg, dashes='\n\n'+'-'*70+'\n\n'))
    util.run(['kubectl', 'port-forward', v[0]['NAME'], '{port}:{port}'.format(port=port)])

def bash(args):
    util.exec_bash(db='rethinkdb', instance=args.number)

def all_node_numbers():
    n = len('rethinkdb')
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
    delete_services()
    if len(args.number) == 0:
        args.number = all_node_numbers()
    for number in args.number:
        util.stop_deployment('{NAME}{number}'.format(NAME=NAME, number=number))


def create_password(args):
    """
    Change the rethinkdb admin password.
    """
    host = util.get_pod_ip(db='rethinkdb')
    if not host:
        raise RuntimeError("no running rethinkdb servers, so can't change password")

    path = args.path
    if not os.path.exists(path):
        os.makedirs(path)
    elif not os.path.isdir(path):
        raise RuntimeError('path must be a directory')

    new_password = util.random_password(63)

    name = 'rethinkdb-password'

    # Get the current RethinkDB password from Kubernetes
    old_password = util.get_secret(name).get('rethinkdb', None)
    if old_password:
        if input("Password already set.  Are you sure you want to change it?  type 'YES'") != 'YES':
            raise RuntimeError("NOT changing password")
    if old_password == '':
        old_password = None

    # Write the new password to disk (better to have it so if we set it below and die then at least it isn't lost!)
    open(os.path.join(path, 'rethinkdb'), 'w').write(new_password)

    # Set the new password in rethinkdb
    import rethinkdb as r
    conn = r.connect(host=host, auth_key=old_password)
    r.db('rethinkdb').table('users').get('admin').update({'password': new_password}).run(conn)

    # Load the new password into Kubernetes
    util.create_secret(name, path)

def load_password(args):
    """
    Load the admin password into Kubernetes from disk
    """
    path = args.path
    if not os.path.isdir(path):
        raise RuntimeError('path must be a directory')
    if not os.path.exists(os.path.join(path, 'rethinkdb')):
        raise RuntimeError("the password filename must be named 'rethinkdb'")
    util.create_secret('rethinkdb-password', path)

def delete_services():
    services = util.get_services()
    for n in ['cluster', 'driver']:
        s = 'rethinkdb-' + n
        if s in services:
            util.run(['kubectl', 'delete', 'service', s])

def external(args):
    """
    Configure external service (without selectors) and endpoints so the rethinkdb-driver
    and rethinkdb-cluster services point outside the k8s cluster.
    This makes it possible to use an external rethinkdb database without having
    to change anything else.
    """
    import socket, yaml
    ips = [socket.gethostbyname(host) for host in args.instances]
    x = yaml.dump([{'ip':ip} for ip in ips]).replace('-','    -')
    t = open(join('conf', 'external.template.yaml')).read().format(ips=x)

    delete_services()

    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t)
        tmp.flush()
        util.run(['kubectl', 'create', '-f', tmp.name])

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
    sub.add_argument('number', type=int, help='which node or nodes to run', nargs='*')
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (default: most recent tag)")
    sub.add_argument("-f", "--force",  action="store_true", help="force reload image in k8s")
    sub.add_argument('--size', default=10, type=int, help='size of persistent disk in GB (ignored if disk already exists)')
    sub.add_argument('--type', default='standard', help='"standard" (default) or "ssd" -- type of persistent disk (ignored if disk already exists)')
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('forward-admin', help='forward port for an admin interface to localhost')
    sub.add_argument('-n', '--number', type=int, default=-1, help='which node to forward (if not given uses random node)')
    sub.set_defaults(func=forward_admin)

    sub = subparsers.add_parser('forward-db', help='forward database to localhost so you can directly connect')
    sub.add_argument('-n', '--number', type=int, default=-1, help='which node to forward (if not given uses random node)')
    sub.set_defaults(func=forward_db)

    sub = subparsers.add_parser('create-password', help='create or regenerate the rethinkdb admin password (both in the database and in k8s)')
    sub.add_argument('path', type=str, help='path to directory that will contain the new password in a file "rethinkdb"')
    sub.set_defaults(func=create_password)

    sub = subparsers.add_parser('load-password', help='load the rethinkdb admin password into k8s from a file on disk')
    sub.add_argument('path', type=str, help='path to directory that contains the password in a file named "rethinkdb"')
    sub.set_defaults(func=load_password)

    sub = subparsers.add_parser('bash', help='get a bash shell on the given rethinkdb pod')
    sub.add_argument('-n', '--number', type=int, default=0, help='pod number')
    sub.set_defaults(func=bash)

    sub = subparsers.add_parser('delete', help='delete specified (or all) running pods, services, etc.; does **not** delete persistent disks')
    sub.add_argument('number', type=int, help='which node or nodes to stop running', nargs='*')
    sub.set_defaults(func=delete)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    sub = subparsers.add_parser('external', help='create service that is external to kubernetes')
    sub.add_argument('instances', type=str, help='one or more names of GCE instances serving RethinkDB', nargs='+')
    sub.set_defaults(func=external)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
