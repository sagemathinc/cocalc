"""
Python3 utility functions, mainly used in the control.py scripts
"""

import os, requests, subprocess, time, yaml

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
