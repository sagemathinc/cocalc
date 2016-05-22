"""
Python3 utility functions, mainly used in the control.py scripts
"""

import os, subprocess, time

join = os.path.join

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
def get_default_gcloud_project_name():
    PATH = join(os.environ['HOME'], '.config', 'gcloud')
    active_config = open(join(PATH, 'active_config')).read()
    conf = open(join(PATH, 'configurations', 'config_'+active_config)).read()
    i = conf.find("project = ")
    if i == -1:
        raise RuntimeError
    return conf[i:].split('=')[1].strip()

def gcloud_docker_repo(tag):
    return "gcr.io/{project}/{tag}".format(project=get_default_gcloud_project_name(), tag=tag)

def gcloud_docker_push(name):
    run(['gcloud', 'docker', 'push', name])

def gcloud_images():
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
    return a

def get_deployments():
    return [x.split()[0] for x in run(['kubectl', 'get', 'deployments'], get_output=True).splitlines()[1:]]