#!/usr/bin/env python3

"""
HAPROXY management/deployment script

"""

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory fo this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='haproxy'

def build(tag, rebuild):
    # Next build smc-hub, which depends on smc-hub-base.
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

def expose():
    if NAME not in util.get_services():
        util.run(['kubectl', 'expose', 'deployment', NAME, '--type=LoadBalancer'])
        print("Type 'kubectl get services haproxy' in about 2 minutes to see the external IP address.")

def run_on_kubernetes(args):
    ensure_ssl()
    if args.replicas is None:
        args.replicas = util.get_desired_replicas(NAME, 2)
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build)
    print("tag='{tag}', replicas='{replicas}'".format(tag=tag, replicas=args.replicas))
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image=tag, replicas=args.replicas,
                        pull_policy=util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)
    expose()

def stop_on_kubernetes(args):
    util.stop_deployment(NAME)

def ensure_ssl():
    if 'ssl-cert' not in util.get_secrets():
        # generate a self-signed cert and load, so at least things work
        with tempfile.TemporaryDirectory() as tmp:
            util.run(['openssl', 'req', '-new', '-x509', '-nodes', '-out', 'server.crt',
                      '-keyout', 'server.key',
                      '-subj', '/C=US/ST=WA/L=WA/O=Network/OU=IT Department/CN=sagemath'], path=tmp)
            s  = open(join(tmp, 'server.crt')).read() + open(join(tmp, 'server.key')).read()
            open(join(tmp, 'nopassphrase.pem'),'w').write(s)
            util.create_secret('ssl-cert', tmp)

def load_ssl(args):
    path = args.path
    if not os.path.exists(path):
        os.makedirs(path)
    if not os.path.isdir(path):
        raise RuntimeError("path='{path}' must be a directory".format(path=path))
    pem = join(path,'nopassphrase.pem')
    if not os.path.exists(pem):
        raise RuntimeError("'{pem}' must exist".format(pem=pem))
    util.create_secret('ssl-cert', path)

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
    sub.add_argument("-r", "--replicas", default=None, help="number of replicas") # todo -- need to run as daemon-- one on each node for best HA
    sub.add_argument("-f", "--force", action="store_true", help="force reload image in k8s")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='delete the deployment')
    sub.set_defaults(func=stop_on_kubernetes)

    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=images_on_gcloud)

    sub = subparsers.add_parser('load-ssl', help='load the ssl cert into k8s from disk',
                                formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument('--path', type=str, help='path to directory that contains the file nopassphrase.pem',
                    default=os.path.abspath(join(SCRIPT_PATH, '..', '..', 'data', 'secrets', 'sagemath.inc')))
    sub.set_defaults(func=load_ssl)

    util.add_deployment_parsers(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
