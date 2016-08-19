#!/usr/bin/env python3

#
# Manage running projects
#

import json, os, shutil, sys, tempfile, uuid, yaml
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
path_to_util = join(SCRIPT_PATH, '..', '..', 'util')
sys.path.insert(0, path_to_util)
import util

NAME='project-manager'

def build(tag, rebuild):
    v = ['sudo', 'docker', 'build', '-t', tag]
    if rebuild:  # will cause a git pull to happen
        v.append("--no-cache")
    v.append('.')

    path     = join(SCRIPT_PATH, 'image')
    with util.util_coffee(path):
        os.system('ls -l %s'%path)
        kubectl  = join(path, 'kubectl')

        yaml = '{name}.template.yaml'.format(name='smc-project')
        template = join(path, yaml)
        print(template)
        src  = join(os.environ['HOME'], 'kubernetes', 'platforms', 'linux', 'amd64', 'kubectl')
        spec_src = join(SCRIPT_PATH, '..', '..', '..', 'smc-util', 'upgrade-spec.coffee')
        spec_dest = join(path, 'upgrade-spec.coffee')
        try:
            shutil.copyfile(join(SCRIPT_PATH, '..', 'conf', yaml), template)
            shutil.copyfile(src, kubectl)
            shutil.copymode(src, kubectl)
            shutil.copyfile(spec_src, spec_dest)
            util.run(v, path=path)
        finally:
            for k in [kubectl, template, spec_dest]:
                try:
                    os.unlink(k)
                except Exception as err:
                    print("WARNING: ", err)

def build_docker(args):
    tag = util.get_tag(args, NAME)
    build(tag, args.rebuild)
    if not args.local:
        util.gcloud_docker_push(tag)

def images_on_gcloud(args):
    for x in util.gcloud_images(NAME):
        print("%-20s%-60s"%(x['TAG'], x['REPOSITORY']))

def node_selector():
    # 1 below due to master always being non-preemptible
    if len(util.run('kubectl get nodes -l preemptible=false --no-headers', get_output=True, verbose=False).strip().split('\n')) > 1:
        print("good - there are non pre-emptible nodes!")
        return 'nodeSelector: {preemptible: "false", scopes: "default"}'
    else:
        print("no non-preemptible nodes")
        return 'nodeSelector: {scopes: "default"}'

def run_on_kubernetes(args):
    create_kubectl_secret()
    args.local = False # so tag is for gcloud
    tag = util.get_tag(args, NAME, build)
    t = open(join('conf', '{name}.template.yaml'.format(name=NAME))).read()

    if args.project_tag:
        default_image = util.gcloud_docker_repo('smc-project:' + args.project_tag)
    else:
        default_image = util.gcloud_most_recent_image('smc-project')
    default_image = default_image[:default_image.rfind('-')]  # remove final -[which image]

    with tempfile.NamedTemporaryFile(suffix='.yaml', mode='w') as tmp:
        tmp.write(t.format(image          = tag,
                           namespace      = util.get_current_namespace(),
                           cluster_prefix = util.get_cluster_prefix(),
                           default_image  = default_image,
                           node_selector  = node_selector(),
                           pull_policy    = util.pull_policy(args)))
        tmp.flush()
        util.update_deployment(tmp.name)

def delete(args):
    util.stop_deployment(NAME)

def logs(args):
    v = util.run(['kubectl', 'get', 'pods', '--selector', 'run=project-manager', '--no-headers'], verbose=False, get_output=True).split()
    if len(v) == 0:
        print('no pods')
    else:
        util.run(['kubectl', 'logs', '--tail=100', '-f', v[0]])


SECRET_NAME = 'cluster-manager-kubectl-secret'
def create_kubectl_secret():
    """
    Ensure that the kubectl secret needed for using kubectl instead of the pod to
    use this cluster/namespace exists.
    """
    if SECRET_NAME not in util.get_secrets():
        with tempfile.TemporaryDirectory() as tmp:
            target = join(tmp, 'config')
            config = json.loads(util.run(['kubectl', 'config', 'view', '--raw', '-o=json'], get_output=True, verbose=False))
            prefix = util.get_cluster_prefix()
            # Include only secret info that is relevant to this cluster (a mild security measure -- we can't restrict namespace btw).
            for k in ['contexts', 'clusters', 'users']:
                config[k] = [x for x in config[k] if x['name'].endswith(prefix)]
            open(join(tmp, 'config'), 'w').write(yaml.dump(config))
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

    sub = subparsers.add_parser('run', help='run the deployment', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("-t", "--tag", default="", help="tag of the image to run")
    sub.add_argument("--project-tag", default="", help="tag to use when starting projects (will default to newest when this deployment started)")
    sub.add_argument("-f", "--force",  action="store_true", help="force re-download image in k8s")
    sub.set_defaults(func=run_on_kubernetes)

    sub = subparsers.add_parser('delete', help='kill the deployment')
    sub.set_defaults(func=delete)

    util.add_deployment_parsers(NAME, subparsers, exclude='autoscale')

    # Must be after add_deployment_parsers!
    sub = subparsers.add_parser('logs', help='tail log')
    sub.set_defaults(func=logs)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
