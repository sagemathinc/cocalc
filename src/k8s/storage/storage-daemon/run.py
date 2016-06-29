#!/usr/bin/env python3
import json, os, requests, shutil, socket, subprocess, time

HOSTS = '/node/etc/hosts'

def run(v, shell=False, path='.', get_output=False, env=None, verbose=True):
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
        if verbose:
            print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        print('KUBERNETES_SERVICE_HOST environment variable not set')
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=os.environ.get('POD_NAMESPACE', 'default'),   # must be explicitly set in deployment yaml using downward api -- https://github.com/kubernetes/kubernetes/blob/release-1.0/docs/user-guide/downward-api.md
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    headers={'Authorization':'Bearer {token}'.format(token=token)}
    print("Getting k8s information about '{service}' from '{URL}'".format(service=service, URL=URL))
    x = requests.get(URL, headers=headers, verify='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').json()
    print("Got {x}".format(x=x))
    return x

def update_etc_hosts():
    v = get_service('storage-projects')
    if v.get('status', None) == 'Failure':
        return
    try:
        namespace = v['metadata']['namespace']
        hosts = ["{ip}    {namespace}-{name}".format(ip=x['ip'], namespace=namespace,
                              name=x['targetRef']['name'].split('-')[0]) for x in v['subsets'][0]['addresses']]
        start = "# start smc-storage dns - namespace="+namespace+"\n\n"
        end = "# end smc-storage dns - namespace="+namespace+"\n\n"
        block = '\n'.join([start] + hosts + [end])
        current = open(HOSTS).read()
        if block in current:
            return
        i = current.find(start)
        j = current.find(end)
        if i == -1 or j == -1:
            new = current + '\n' + block
        else:
            new = current[:i] + block + current[j+len(end):]
        open(HOSTS,'w').write(new)
    except Exception as err:
        print("Problem in update_etc_hosts", err)

MINION_IP = 'unknown'
def enable_ssh_access_to_minion():
    global MINION_IP
    # create our own local ssh key
    if os.path.exists('/root/.ssh'):
        shutil.rmtree('/root/.ssh')
    run(['ssh-keygen', '-b', '2048', '-N', '', '-f', '/root/.ssh/id_rsa'])
    # make root user of minion allow login using this (and only this) key.
    shutil.copyfile('/root/.ssh/id_rsa.pub', '/node/root/.ssh/authorized_keys')
    # true who we connect to
    open("/root/.ssh/config",'w').write("StrictHostKeyChecking no\nUserKnownHostsFile=/dev/null\n")
    # record hostname of minion
    for x in open("/node/etc/hosts").readlines():
        if 'group' in x:
            MINION_IP = x.split()[0]
            open("/node/minion_ip",'w').write(MINION_IP)

def minion_ip():
    global MINION_IP
    if MINION_IP == 'unknown':
        if os.path.exists("/node/minion_ip"):
            MINION_IP = open("/node/minion_ip").read()
            return MINION_IP
        else:
            enable_ssh_access_to_minion()
            if MINION_IP == 'unknown':
                raise RuntimeError("first run enable_ssh_access_to_minion")
            else:
                return MINION_IP
    else:
        return MINION_IP

def run_on_minion(v, *args, **kwds):
    if isinstance(v, str):
        v = "ssh " + minion_ip() + " '%s'"%v
    else:
        v = ['ssh', minion_ip() ] + v
    run(v)

def install_flexvolume_plugin():
    # we always copy it over, which at least upgrades it if necessary.
    shutil.copyfile("/install/smc-storage", "/node/plugin/smc-storage")

def install_zfs():
    try:
        run_on_minion('zpool status')
        print("excellent -- zfs is already installed")
    except:
        print("zfs not installed, so installing it")
        run(['scp', '-r', '/install/gke-zfs', minion_ip()+":"])
        run_on_minion("cd /root/gke-zfs/3.16.0-4-amd64/ && ./install.sh")

def start_storage_daemon():
    print("launching storage daemon")
    install_flexvolume_plugin()
    enable_ssh_access_to_minion()
    install_zfs()
    while True:
        update_etc_hosts()
        time.sleep(15)
        print("sleeping...")

if __name__ == "__main__":
    start_storage_daemon()