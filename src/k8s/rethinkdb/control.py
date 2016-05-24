#!/usr/bin/env python3
"""
Basic script to do a little bit toward automating creating rethinkdb cluster.

TODO:

 - automatic creation of PD
 - template conf/rethinkdb-template.yaml, e.g,. kubetest is hard coded now?
 - creating the other two services in conf/
 - auto create service rethinkdb-cluster to make non-containerized external database available inside k8s cluster
"""


import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
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

def run_on_kubernetes(args):
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME)
    context = util.get_kube_context()
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    for number in args.number:
        with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
            tmp.write(t.format(image=tag, number=number, context=context))
            tmp.flush()
            util.update_deployment(tmp.name)
            
def forward_admin(args):
    if args.number == -1:
        v = util.get_pods(db='rethinkdb')
    else:
        v = util.get_pods(db='rethinkdb', instance=args.number)
    v = [x for x in v if x['STATUS'] == 'Running']
    if len(v) == 0:
        print("rethinkdb node number #{args.number} not available")
    else:
        fwd = "ssh -L 8080:localhost:8080 salvus@{ip}".format(ip=util.external_ip())
        print("{dashes}Type this on your laptop, then visit http://localhost:8080\n\n    {fwd}{dashes}".format(fwd=fwd,dashes='\n\n'+'-'*70+'\n\n'))
        util.run(['kubectl', 'port-forward', v[0]['NAME'], '8080:8080'])

def stop_on_kubernetes(args):
    for number in args.number:
        util.stop_deployment('{NAME}{number}'.format(NAME=NAME, number=number))

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
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run (default: most recent tag)")
    sub.add_argument('number', type=int, help='which node or nodes to run', nargs='+')
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('admin', help='forward port for an admin interface to localhost')
    sub.add_argument('-n', '--number', type=int, default=-1, help='which node to forward (if not given uses random node)')
    sub.set_defaults(func=forward_admin)

    sub = subparsers.add_parser('stop', help='stop running nodes')
    sub.add_argument('number', type=int, help='which node or nodes to stop running', nargs='+')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
