#!/usr/bin/env python3

import os, shutil, sys, tempfile, uuid
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

NAME='smc-project'

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

def validate_project_ids(args):
    if uuid.UUID(args.project_id).version != 4:
        raise ValueError("invalid project_id='%s'"%args.project_id)

def run_on_kubernetes(args):
    validate_project_ids(args)
    context = util.get_cluster_prefix()
    namespace = util.get_current_namespace()
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()
    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image          = tag,
                           project_id     = args.project_id,
                           namespace      = namespace,
                           storage_server = args.storage_server,
                           disk_size      = args.disk_size,
                           pull_policy    = util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)

def delete(args):
    validate_project_ids(args)
    util.stop_deployment("project-" + args.project_id)

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

    sub = subparsers.add_parser('run', help='run the given project', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("-s", "--storage-server", type=int, help="(required) storage server number: 0, 1, 2, 3", required=True)
    sub.add_argument("-d", "--disk-size",  default='3G', help="disk size")
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("-f", "--force",  action="store_true", help="force re-download image in k8s")
    sub.add_argument('project_id', type=str, help='which project to run')
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='kill the running project')
    sub.add_argument('project_id', type=str, help='which node or nodes to stop running')
    sub.set_defaults(func=delete)


    def selector(args):
        return {'run':'project'}

    util.add_bash_parser(NAME, subparsers, custom_selector=selector)
    util.add_top_parser(NAME,  subparsers, custom_selector=selector)
    util.add_htop_parser(NAME, subparsers, custom_selector=selector)
    util.add_logs_parser(NAME, subparsers)

    util.add_images_parser(NAME, subparsers)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
