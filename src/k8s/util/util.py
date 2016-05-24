"""
Python3 utility functions, mainly used in the control.py scripts
"""

import json, os, requests, subprocess, time, yaml

join = os.path.join

def external_ip():
    """
    The external ip address of the node o which this code is run.
    """
    url = "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip"
    headers = {"Metadata-Flavor":"Google"}
    return requests.get(url, headers=headers).content.decode()

def run(v, shell=False, path='.', get_output=False):
    t = time.time()
    if isinstance(v, str):
        cmd = v
        shell = True
    else:
        cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
    if path != '.':
        print('chdir %s'%path)
        os.chdir(path)
    print(cmd)
    if shell:
        kwds = {'shell':True, 'executable':'/bin/bash'}
    else:
        kwds = {}
    if get_output:
        print(kwds)
        output = subprocess.Popen(v, stdout=subprocess.PIPE, **kwds).stdout.read().decode()
    else:
        if subprocess.call(v, **kwds):
            raise RuntimeError("error running '{cmd}'".format(cmd=cmd))
        output = None
    seconds = time.time() - t
    print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
    return output

# Fast, but relies on stability of gcloud config path (I reversed engineered this).
# Failed for @hal the first time, so don't use...
#def get_default_gcloud_project_name():
#    PATH = join(os.environ['HOME'], '.config', 'gcloud')
#    active_config = open(join(PATH, 'active_config')).read()
#    conf = open(join(PATH, 'configurations', 'config_'+active_config)).read()
#    i = conf.find("project = ")
#    if i == -1:
#        raise RuntimeError
#    return conf[i:].split('=')[1].strip()

# This works but is very slow and ugly due to parsing output.
def get_default_gcloud_project_name():
    a = run(['gcloud', 'info'], get_output=True)
    i = a.find("project: ")
    if i == -1:
        raise RuntimeError
    return a[i:].split()[1].strip('[]')

def get_kube_context():
    return run(['kubectl', 'config', 'current-context'], get_output=True).split('_')[1].strip()

def gcloud_docker_repo(tag):
    return "gcr.io/{project}/{tag}".format(project=get_default_gcloud_project_name(), tag=tag)

def gcloud_docker_push(name):
    run(['gcloud', 'docker', 'push', name])

def gcloud_most_recent_image(prefix):
    x = gcloud_images(prefix=prefix)[0]
    return x['REPOSITORY'] + ':' + x['TAG']

def gcloud_images(prefix=''):
    if prefix:
        prefix = gcloud_docker_repo(prefix)
    x = run(['gcloud', 'docker', 'images'], get_output=True)
    i = x.find("REPOSITORY")
    if i == 1:
        raise RuntimeError
    x = x[i:]
    v = x.splitlines()
    headers = v[0].split()[:2]
    a = []
    for w in v[1:]:
        a.append(dict(zip(headers, w.split()[:2])))
    return [x for x in a if x['REPOSITORY'].startswith(prefix)]

def get_deployments():
    return [x.split()[0] for x in run(['kubectl', 'get', 'deployments'], get_output=True).splitlines()[1:]]

def get_services():
    return [x.split()[0] for x in run(['kubectl', 'get', 'services'], get_output=True).splitlines()[1:]]

def update_service(filename_yaml):
    """
    Create or replace the current kubernetes service described by the given file (which should only have one service in it).

    - filename_yaml -- the name of a yaml file that describes a deployment
    """
    name = yaml.load(open(filename_yaml).read())['metadata']['name']
    run(['kubectl', 'replace' if name in get_services() else 'create', '-f', filename_yaml])

def update_deployment(filename_yaml):
    """
    Create or replace the current kubernetes deployment described by the given file.

    - filename_yaml -- the name of a yaml file that describes a deployment
    """
    name = yaml.load(open(filename_yaml).read())['metadata']['name']
    run(['kubectl', 'replace' if name in get_deployments() else 'create', '-f', filename_yaml])

def stop_deployment(name):
    if name in get_deployments():
        run(['kubectl', 'delete', 'deployment', name])

def secret_names():
    return [x.split()[0] for x in run(['kubectl','get','secrets'], get_output=True).splitlines()[1:]]

def create_secret(name, filename):
    if name in secret_names():
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

def get_tag(args, name):
    tag = name
    if args.tag:
        tag += ':' + args.tag
    elif not args.local:
        return gcloud_most_recent_image(name)
    if not args.local:
        tag = gcloud_docker_repo(tag)
    return tag

def get_pods(**selector):
    """
    Return all pods that match the given selector, e.g.

        get_pods(db='rethikdb', instance=0)

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

def exec_bash(**selector):
    """
    Run bash on the first Running pod that matches the given selector.
    """
    v = get_pods(**selector)
    print(v)
    v = [x for x in v if x['STATUS'] == 'Running']
    if len(v) == 0:
        print("No running matching pod %s"%selector)
    else:
        run(['kubectl', 'exec', '-it', v[0]['NAME'], 'bash'])


