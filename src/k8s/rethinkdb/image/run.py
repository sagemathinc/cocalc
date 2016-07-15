#!/usr/bin/env python3
import json, os, requests, socket, subprocess

# (Inspired by https://github.com/rosskukulinski/kubernetes-rethinkdb-cluster/blob/master/image/run.sh)

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=os.environ.get('POD_NAMESPACE', 'default'),  # must be explicitly set in deployment yaml using downward api -- https://github.com/kubernetes/kubernetes/blob/release-1.0/docs/user-guide/downward-api.md
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    print("Getting k8s information about '{service}' from '{URL}'".format(service=service, URL=URL))
    headers={'Authorization':'Bearer {token}'.format(token=token)}
    x = requests.get(URL, headers=headers, verify='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').json()
    print("Got {x}".format(x=x))
    return x

def get_replicas():
    """
    Return the ip addresses of all Rethinkdb servers in the clusters.  These are
    the replicas that hold actual data.
    """
    d = get_service('rethinkdb-cluster')
    if d is None:  # not in kubernetes
        return []
    if len(d['subsets']) == 0:
        # no other nodes yet (no service?)
        return []
    return [x['ip'] for x in d['subsets'][0].get('addresses',[])]

def other_replicas():
    our_ip = socket.gethostbyname(socket.gethostname())
    return [x for x in get_replicas() if x != our_ip]

def start_rethinkdb():
    if not os.path.exists('/data'):
        os.makedirs('/data')
    os.chdir('/data')
    NAME = socket.gethostname().split('-')[0]
    # CRITICAL: http admin interface **Must** only be on 127.0.0.1 to avoid potential security issues!
    v = ['rethinkdb', '--bind-cluster', 'all', '--bind-driver', 'all', '--bind-http', '127.0.0.1', '--server-name', NAME]
    for ip in other_replicas():
        v.append("--join")
        v.append(ip)
    print("opening password file")
    if os.path.exists('/secrets/rethinkdb/rethinkdb') and open('/secrets/rethinkdb/rethinkdb').read().strip():
        print('there is a password')
        # Just in case we don't have a password already, but there is one set.
        v.append('--initial-password')
        v.append('auto')
    subprocess.call("touch /data/rethinkdb_data/log_file; tail -f /data/rethinkdb_data/log_file & ", shell=True)
    print(" ".join(v))
    subprocess.call(v)

if __name__ == "__main__":
    start_rethinkdb()