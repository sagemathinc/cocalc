"""
Python3 utility functions, mainly used in the control.py scripts
"""

import argparse, base64, json, os, subprocess, tempfile, time

join = os.path.join

def external_ip():
    """
    The external ip address of the node o which this code is run.
    """
    import requests
    url = "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip"
    headers = {"Metadata-Flavor":"Google"}
    return requests.get(url, headers=headers).content.decode()

def run(v, shell=False, path='.', get_output=False, env=None, verbose=1):
    t = time.time()
    if isinstance(v, str):
        cmd = v
        shell = True
    else:
        cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
    if path != '.':
        cur = os.path.abspath(os.curdir)
        if verbose:
            print('chdir %s'%path)
        os.chdir(path)
    try:
        if verbose:
            print(cmd)
        if shell:
            kwds = {'shell':True, 'executable':'/bin/bash', 'env':env}
        else:
            kwds = {'env':env}
        if get_output:
            output = subprocess.Popen(v, stdout=subprocess.PIPE, **kwds).stdout.read().decode()
        else:
            if subprocess.call(v, **kwds):
                raise RuntimeError("error running '{cmd}'".format(cmd=cmd))
            output = None
        seconds = time.time() - t
        if verbose > 1:
            print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)


def get_default_gcloud_project_name():
    PATH = join(os.environ['HOME'], '.config', 'gcloud')
    active_config = open(join(PATH, 'active_config')).read()
    import configparser
    conf = configparser.ConfigParser()
    conf.read_file(open(join(PATH, 'configurations', 'config_'+active_config)))
    project = conf.get('core', 'project', fallback=None)
    if project is None:
        return get_default_gcloud_project_name_fallback()
    return project

# This works but is very slow and ugly due to parsing output.
def get_default_gcloud_project_name_fallback():
    return json.loads(run(['gcloud', 'info', '--format=json'], get_output=True))['config']['project']

def get_kube_context():
    return run(['kubectl', 'config', 'current-context'], get_output=True).strip()

def get_cluster_prefix():
    return get_kube_context().split('_')[-1].strip()

def get_all_contexts():
    return [x['name'] for x in json.loads(run(['kubectl', 'config', 'view', '-o=json'], get_output=True, verbose=False))['contexts']]

def set_context(name):
    options = [x for x in get_all_contexts() if name in x]
    if len(options) > 1:
        print("WARNING -- AMBIGUOUS so taking first of %s"%options)
    if len(options) >= 1:
        run(['kubectl', 'config', 'use-context', options[0]])
    else:
        raise RuntimeError("unknown context '%s'"%name)


def gcloud_docker_repo(tag):
    return "gcr.io/{project}/{tag}".format(project=get_default_gcloud_project_name(), tag=tag)

def gcloud_docker_push(name):
    run(['gcloud', 'docker', 'push', name])

def gcloud_most_recent_image(name):
    v = gcloud_images(name)
    if len(v) == 0:
        return
    x = v[0]
    return x['REPOSITORY'] + ':' + x['TAG']

def gcloud_auth_token():
    ## This gcloud auth command is SLOW so we cache the result for a few minutes
    access_token = join(os.environ['HOME'], '.config', 'gcloud' ,'access_token')
    if not os.path.exists(access_token) or os.path.getctime(access_token) < time.time() - 5:
        token = run(['gcloud', 'auth', 'print-access-token'], get_output=True).strip()
        open(access_token,'w').write(token)
        return token
    else:
        return open(access_token).read().strip()

def get_gcloud_image_info(name):
    import requests
    # Use the API to get info about the given image (see http://stackoverflow.com/questions/31523945/how-to-remove-a-pushed-image-in-google-container-registry)
    repo = '{project}/{name}'.format(project=get_default_gcloud_project_name(), name=name)
    url = "https://gcr.io/v2/{repo}/tags/list".format(repo=repo)
    r = requests.get(url, auth=('_token', gcloud_auth_token())).content.decode()
    r = json.loads(r)
    return 'gcr.io/'+repo, r

def gcloud_images(name):
    print("gcloud_images '{name}'".format(name=name))
    from datetime import datetime
    w = []
    repo, data = get_gcloud_image_info(name)
    if 'manifest' not in data:
        return []
    for _, v in data['manifest'].items():
        if 'tag' in v:
            if len(v['tag']) > 0:
                w.append([repo, datetime.fromtimestamp(float(v['timeCreatedMs'])/1000), v['tag'][0]])
    w.sort()
    return [dict(zip(['REPOSITORY', 'CREATED', 'TAG'], x)) for x in reversed(w)]

def gcloud_delete_images(name, tag=None):
    """
    Delete all images from the Google Docker Container registry with the given name.
    If tag is given, only delete the one with the given tag, if it exists.

    NOTE: this is complicated and ugly because Google hasn't implemented it yet!  http://goo.gl/rvlPCY
    I just reverse engineered how to do this.
    """

    # Get metadata about images with the given name.
    with tempfile.TemporaryDirectory() as tmp:
        proj = get_default_gcloud_project_name()
        path = "gs://artifacts.{project}.appspot.com/containers/repositories/library/{name}".format(
                    project=proj, name=name)
        meta = join(tmp, 'metadata')
        os.makedirs(meta)
        run(['gsutil', 'rsync', path+'/', meta + '/'])
        print(os.listdir(meta))
        if tag is None:
            tags = [x[4:] for x in os.path.listdir(meta) if x.startswith('tag_')]
        else:
            tags = [str(tag)]
        for tag in tags:
            tag_file = 'tag_'+tag
            if not os.path.exists(join(meta, tag_file)):
                print("skipping already deleted {tag}".format(tag=tag))
                continue
            s = open(join(meta, tag_file)).read()
            manifest_file = join(meta,'manifest_'+s)
            x = json.loads(open(manifest_file).read())
            v = []
            for k in x['fsLayers']:
                v.append("gs://artifacts.{project}.appspot.com/containers/images/{blobSum}".format(
                    project = proj, blobSum = k['blobSum']))
            run(['gsutil', 'rm', '-f'] + v + [join(path, 'tag_'+tag), join(path, 'manifest_'+s)])




def get_deployments():
    return [x.split()[0] for x in run(['kubectl', 'get', 'deployments'], get_output=True).splitlines()[1:]]

def get_services():
    return [x.split()[0] for x in run(['kubectl', 'get', 'services'], get_output=True).splitlines()[1:]]

def update_service(filename_yaml):
    """
    Create or replace the current kubernetes service described by the given file (which should only have one service in it).

    - filename_yaml -- the name of a yaml file that describes a deployment
    """
    import yaml
    name = yaml.load(open(filename_yaml).read())['metadata']['name']
    run(['kubectl', 'replace' if name in get_services() else 'create', '-f', filename_yaml])

def update_deployment(filename_yaml):
    """
    Create or replace the current kubernetes deployment described by the given file.

    - filename_yaml -- the name of a yaml file that describes a deployment
    """
    import yaml
    name = yaml.load(open(filename_yaml).read())['metadata']['name']
    run(['kubectl', 'replace' if name in get_deployments() else 'create', '-f', filename_yaml])

def stop_deployment(name):
    if name in get_deployments():
        run(['kubectl', 'delete', 'deployment', name])

def get_daemonsets():
    return get_resources('daemonsets')

def update_daemonset(filename_yaml):
    import yaml
    name = yaml.load(open(filename_yaml).read())['metadata']['name']
    run(['kubectl', 'replace' if name in get_daemonsets() else 'create', '-f', filename_yaml])

def stop_daemonset(name):
    if name in get_daemonsets():
        run(['kubectl', 'delete', 'daemonset', name])


def create_secret(name, filename):
    if name in get_secrets():
        # delete first
        run(['kubectl', 'delete', 'secret', name])
    v = ['kubectl', 'create', 'secret', 'generic', name]
    if os.path.exists(filename):
        v.append('--from-file='+filename)
    else:
        print("WARNING! using fake empty secret for '{name}' -- please properly create '{filename}'".format(
                name=name, filename=filename))
        v.append('--from-literal={basename}='.format(basename=os.path.split(filename)[1]))
    run(v)

def ensure_secret_exists(name, basename):
    if name not in get_secrets():
        run(['kubectl', 'create', 'secret', 'generic', name,
         '--from-literal={basename}='.format(basename=basename)])

def get_tag(args, name, build=None):
    tag = name
    if args.tag:
        tag += ':' + args.tag
    elif not args.local:
        t = gcloud_most_recent_image(name)
        if t is None:
            from argparse import Namespace
            tag = get_tag(Namespace(tag='init', local=False), name)
            if build is not None:
                # There are no images, and there is a function to build one, so we
                # build it and push it to gcloud.
                build(tag, True)
                gcloud_docker_push(tag)
            return tag
        else:
            return t
    if not args.local:
        tag = gcloud_docker_repo(tag)
    return tag

def get_pods(**selector):
    """
    Return all pods that match the given selector, e.g.

        get_pods(db='rethinkdb', instance=0)

    returns a list of objects like this:

        [{'READY': '1/1',
          'STATUS': 'Running',
          'NAME': 'rethinkdb0-1345666166-u06zx',
          'RESTARTS': '0',
          'AGE': '35m'}]
    """
    s = ','.join(["{k}={v}".format(k=k,v=v) for k, v in selector.items()])
    v = run(['kubectl', 'get', 'pods', '--selector', s], get_output=True).splitlines()
    if len(v) == 0:
        return []
    headings = v[0].split()
    return [dict(zip(headings,x.split())) for x in v[1:]]

def get_pod_ip(**selector):
    """
    Return ip address of a pod that match the given selector, if there are any.  Otherwise, returns None.
    """
    for x in get_pods(**selector):
        if x['STATUS'] == 'Running':
            s = json.loads(run(['kubectl', 'get', 'pods', x['NAME'], '-o', 'json'], get_output=True))
            return s['status']['podIP']
    return None


def ensure_persistent_disk_exists(name, size=10, disk_type='standard', zone=None):
    """
    Ensure that there is a persistent disk with the given name.
    If not, create the disk with the given size and type.

    If the disk already exists and is smaller than the given size,
    we will attempt to enlarge it to that size (which can be done even live!).
    The disk will never be shrunk, and the type will not be changed.
    """
    v = run(['gcloud', 'compute', 'disks', 'list', name], get_output=True).splitlines()
    print(v)
    if len(v) <= 1:
        # create disk
        w = ['gcloud', 'compute', 'disks', 'create', name,
             '--size', "{size}GB".format(size=size),
             '--type', "pd-{type}".format(type=disk_type)]
        resize = False
    else:
        # try to increase size of disk
        if int(v[1].split()[2]) < size:
            w = ['gcloud', '--quiet', 'compute', 'disks', 'resize', name,
                 '--size', "{size}GB".format(size=size)]
            resize = True
        else:
            return
    if zone:
        w.append('--zone')
        w.append(zone)
    run(w)

    if resize:
        resizefs_disk(name)

def get_persistent_disk_names():
    return [x.split()[0] for x in run(['gcloud', 'compute', 'disks', 'list'], get_output=True).splitlines()[1:]]

def resizefs_disk(name):
    host = get_instance_with_disk(name)
    if host:
        print("ssh into {host}, determine mount point of {name}, and do resize2fs".format(host=host, name=name))
        v = run_on(host, "sudo df | grep {name}".format(name=name), get_output=True).split()
        if len(v) > 0:
            run_on(host, ['sudo', 'resize2fs', v[0]])
    else:
        print("disk {name} not mounted".format(name=name))

def run_on(host, cmd, *args, **kwds):
    v = ['ssh', '-o', 'StrictHostKeyChecking=no', host]
    if isinstance(cmd, list):
        v = v + cmd
    else:
        v = ' '.join(v) + ' ' + cmd
    return run(v, *args, **kwds)

def get_instance_with_disk(name):
    """
    If disk with given name is mounted on (at least) one instance,
    return one with it mounted; otherwise, return None.

    Raises exception if disk does not exist at all.
    """
    x = json.loads(run(['gcloud', '--format=json', 'compute', 'disks', 'describe', name], get_output=True))
    if not 'users' in x:
        return
    users = x['users']
    if len(users) <= 0:
        return
    return users[0].split('/')[-1]

def exec_command(pods, command, container, **selector):
    """
    Run command on pods that matches the given selector (using tmux if more than one).
    """
    if '__tmux_sync__' in selector:
        sync = selector['__tmux_sync__']
        del selector['__tmux_sync__']
    else:
        sync = True
    v = get_pods(**selector)
    v = [x for x in v if x['STATUS'] == 'Running']
    if len(pods) == 0:
        pods = range(len(v))
    cmds = ["kubectl exec -it {name} {container} -- {command}".format(
                name    = v[i]['NAME'],
                container = "" if not container else ' --container="{container}" '.format(container=container),
                command = command) for i in pods if i < len(v)]
    if len(cmds) == 0:
        print("No running matching pod %s"%selector)
    elif len(cmds) == 1:
        run(cmds[0])
    else:
        tmux_commands(cmds, sync=sync)

def get_resources(resource_type):
    return [x.split()[0] for x in run(['kubectl', 'get', resource_type], get_output=True).splitlines()[1:]]

def get_nodes():
    return get_resources('nodes')

def get_secrets():
    return get_resources('secrets')

def get_secret(name):
    if name not in get_secrets():
        return {}
    else:
        d = {}
        for k, v in json.loads(run(['kubectl', 'get', 'secrets', name, '-o', 'json'], get_output=True))['data'].items():
            d[k] = base64.b64decode(v) if v is not None else v
        return d

def random_password(n=31):
    return base64.b64encode(os.urandom(n)).decode()[:n]

def get_pod_autoscalers():
    return get_resources('horizontalpodautoscalers')

def autoscale_pods(deployment, min=None, max=None, cpu_percent=None):
    if deployment in get_pod_autoscalers():
        run(['kubectl', 'delete', 'hpa', deployment])
    v = ['kubectl', 'autoscale', 'deployment']
    if min is not None:
        v.append("--min")
        v.append(str(min))
    if max is not None:
        v.append("--max")
        v.append(str(max))
    if cpu_percent is not None:
        v.append("--cpu-percent")
        v.append(str(cpu_percent))
    v.append(deployment)
    run(v)

def add_exec_parser(name, subparsers, command_name,  command, custom_selector=None, default_container=''):
    def f(args):
        if custom_selector is not None:
            selector = custom_selector(args)
        else:
            selector = {'run':name}
        exec_command(args.number if custom_selector is None else [], command, args.container, __tmux_sync__=not args.no_sync, **selector)
    sub = subparsers.add_parser(command_name, help='run '+command_name+' on node(s)')
    sub.add_argument('number', type=int, nargs='*', help='pods by number to connect to (0, 1, etc.); connects to all using tmux if more than one')
    sub.add_argument("-n" , "--no-sync",  action="store_true", help="do not tmux synchronize panes")
    sub.add_argument("-c" , "--container",  default=default_container, type=str, help="name of container in pod to exec code on")
    sub.set_defaults(func=f)

def add_bash_parser(name, subparsers, custom_selector=None, default_container=''):
    add_exec_parser(name, subparsers, 'bash', 'bash -c "export TERM=xterm; clear; bash"',
                    custom_selector=custom_selector, default_container=default_container)

# NOTE: explicit terminal size not supported by k8s or docker; but, we can explicitly set
# it below by doing "stty cols 150;"
def add_top_parser(name, subparsers, custom_selector=None, default_container=''):
    c = 'bash -c "TERM=xterm top || (apt-get update&& apt-get install -y top&& TERM=xterm top)"'
    add_exec_parser(name, subparsers, 'top', c, custom_selector=custom_selector,
                   default_container=default_container)

def add_htop_parser(name, subparsers, custom_selector=None, default_container=''):
    c = 'bash -c "TERM=xterm htop || (apt-get update&& apt-get install -y htop&& TERM=xterm htop)"'
    add_exec_parser(name, subparsers, 'htop', c, custom_selector=custom_selector,
                    default_container=default_container)

def add_edit_parser(name, subparsers):
    def f(args):
        run(['kubectl', 'edit', 'deployment', name])
    sub = subparsers.add_parser('edit', help='edit the deployment')
    sub.set_defaults(func=f)

def add_autoscale_parser(name, subparsers):
    sub = subparsers.add_parser('autoscale', help='autoscale the deployment', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("--min",  default=None, help="MINPODS")
    sub.add_argument("--max", help="MAXPODS (required and must be at least 1)", required=True)
    sub.add_argument("--cpu-percent", default=60, help="CPU")
    def f(args):
        autoscale_pods(name, min=args.min, max=args.max, cpu_percent=args.cpu_percent)
    sub.set_defaults(func=f)

def pull_policy(args):
    if args.force:
        return 'Always'
    else:
        return 'IfNotPresent'

def images_on_gcloud(NAME, args):
    v = gcloud_images(NAME)
    print('-'*100)
    print("%-40s%-40s%-20s"%('TAG', 'REPOSITORY', 'CREATED'))
    for x in v:
        print("%-40s%-40s%-20s"%(x['TAG'], x['REPOSITORY'], x['CREATED'].isoformat()))

def add_images_parser(NAME, subparsers):
    sub = subparsers.add_parser('images', help='list {name} tags in gcloud docker repo, from newest to oldest'.format(name=NAME))
    sub.set_defaults(func=lambda args: images_on_gcloud(NAME, args))

def add_deployment_parsers(NAME, subparsers, default_container=''):
    add_edit_parser(NAME, subparsers)
    add_autoscale_parser(NAME, subparsers)
    add_images_parser(NAME, subparsers)
    add_logs_parser(NAME, subparsers, default_container=default_container)
    add_bash_parser(NAME, subparsers, default_container=default_container)
    add_top_parser(NAME, subparsers, default_container=default_container)
    add_htop_parser(NAME, subparsers, default_container=default_container)

def get_desired_replicas(deployment_name, default=1):
    x = json.loads(run(['kubectl', 'get', 'deployment', deployment_name, '-o', 'json'], get_output=True))
    if 'status' in x:
        return x['status']['replicas']
    else:
        return default

def logs(deployment_name, grep_args, container):
    SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
    cmd = join(SCRIPT_PATH, 'kubetail.sh') + ' ' + deployment_name
    if container:
        cmd += ' --container "{container}" '.format(container=container)
    if len(grep_args) > 0:
        cmd += " | grep -a {grep_args} 2>/dev/null".format(grep_args=' '.join(["'%s'"%x for x in grep_args]))
    try:
        run(cmd + ' 2>/dev/null | more')
    except:
        return

def add_logs_parser(NAME, subparsers, default_container=''):
    sub = subparsers.add_parser('logs', help='tail log files for all pods at once')
    sub.add_argument('grep_args', type=str, nargs='*', help='if given, passed to grep, so you can do "./control.py logs blah stuff"')
    sub.add_argument("-c" , "--container",  default=default_container, type=str, help="name of container in pod to exec code on")
    sub.set_defaults(func=lambda args: logs(NAME, args.grep_args, args.container))


def tmux_commands(cmds, sync=True):
    """
    Assuming in tmux, will open up ssh sessions to the given hosts
    in separate windows all in the same pane.
    """
    # Try this to see the idea...
    # tmux split-window -d 'python' \; split-window -d 'python' \; split-window -d 'python'; python
    s = 'tmux'
    s += ' ' + r' \; select-layout tiled \; '.join(["split-window -d '{cmd}'".format(cmd=cmd) for cmd in cmds[:-1]])
    if sync:
        s += ' \; setw synchronize-panes on '
    else:
        s += ' \; setw synchronize-panes off '   # important to turn it off if it was on!
    s += ' \; select-layout tiled ; {cmd} '.format(cmd=cmds[-1])
    run(s)

def tmux_ssh(hosts, sync=True):
    """
    Assuming in tmux, will open up ssh sessions to the given hosts
    in separate windows all in the same pane.
    """
    tmux_commands(['ssh {host}'.format(host=host) for host in hosts], sync=sync)

def get_namespaces():
    return get_resources('namespaces')

def set_namespace(namespace):
    if namespace not in get_namespaces():
        run(['kubectl', 'create', 'namespace', namespace])
        # CRITICAL: also create default limits
        run(['kubectl', 'create', '-f', 'conf/limits.template.conf', '--namespace', namespace])
    context = run(['kubectl', 'config', 'current-context'], get_output=True).strip()
    run(['kubectl', 'config', 'set-context', context, '--namespace', namespace])

def get_current_namespace():
    x = json.loads(run(['kubectl', 'config', 'view', '-o', 'json'], get_output=True, verbose=0))
    for c in x['contexts']:
        if c['name'] == x['current-context']:
            return c['context']['namespace']
    raise RuntimeError("no current namespace")

def show_horizontal_pod_autoscalers(namespace=''):
    """
    This is like "kubectl get hpa", but MUCH better since it includes the missing column
    with the current number of pods.  It's in the JSON, but not in their normal display
    for some reason.
    """
    import dateutil.relativedelta, datetime
    v = ['kubectl', 'get', 'hpa',  '-o', 'json']
    if namespace:
        v.append("--namespace")
        v.append(namespace)
    x = json.loads(run(v, get_output=True, verbose=False))
    if not 'items' in x:
        return
    HEADINGS = ['NAME', 'TARGET', 'CURRENT', 'NUMBER', 'MINPODS', 'MAXPODS', 'AGE']
    fmt = "{name:<20}{target:<13}{current:<13}{number:<13}{minpods:<13}{maxpods:<13}{age:<25}"
    print(fmt.format(**dict(zip([x.lower() for x in HEADINGS], HEADINGS))))
    attrs = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']  # see http://stackoverflow.com/questions/6574329/how-can-i-produce-a-human-readable-difference-when-subtracting-two-unix-timestam
    human_readable = lambda delta: ', '.join(['%d %s' % (getattr(delta, attr), getattr(delta, attr) > 1 and attr or attr[:-1]) for attr in attrs if getattr(delta, attr)])
    for v in x['items']:
        created = datetime.datetime.strptime( v['metadata']['creationTimestamp'][:-1], "%Y-%m-%dT%H:%M:%S" )
        rd = dateutil.relativedelta.relativedelta(datetime.datetime.now(), created)
        age = human_readable(rd)
        cur = str(v['status'].get('currentCPUUtilizationPercentage',''))
        if cur:
            cur += '%'
        else:
            cur = '<waiting>'
        if 'cpuUtilization' in v['spec']:
            # Api change between 1.2....
            target = v['spec']['cpuUtilization']['targetPercentage']
        else:
            # and 1.3
            target = v['spec']['targetCPUUtilizationPercentage']
        print(fmt.format(name    = v['metadata']['name'],
                         target  = "%s%%"%target,
                         current = cur,
                         number  = v['status']["currentReplicas"],
                         minpods = v['spec']['minReplicas'],
                         maxpods = v['spec']['maxReplicas'],
                         age     = age))


def get_logs(*names, **kwds):
    v = ['kubectl', 'logs']
    for a,b in kwds.items():
        v.append('--%s'%a)
        v.append(str(b))
    return run(v + list(names), get_output=True, verbose=False)


