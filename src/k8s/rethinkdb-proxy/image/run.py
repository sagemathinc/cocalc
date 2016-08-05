#!/usr/bin/env python3
import json, os, requests, socket, subprocess, sys
from datetime import datetime

def log(*args, **kwds):
    print(str(datetime.now()), *args, **kwds)
    sys.stdout.flush()

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        log('KUBERNETES_SERVICE_HOST environment variable not set')
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=os.environ.get('POD_NAMESPACE', 'default'),   # must be explicitly set in deployment yaml using downward api -- https://github.com/kubernetes/kubernetes/blob/release-1.0/docs/user-guide/downward-api.md
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    headers={'Authorization':'Bearer {token}'.format(token=token)}
    log("Getting k8s information about '{service}' from '{URL}'".format(service=service, URL=URL))
    x = requests.get(URL, headers=headers, verify='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').json()
    log("Got {x}".format(x=x))
    return x

def start_rethinkdb_proxy():
    LOG = '/rethinkdb.log'

    v = ['rethinkdb', 'proxy', '--daemon', '--bind', 'all', '--no-http-admin', '--no-update-check',
         '--log-file', LOG]

    cluster_info = get_service('rethinkdb-cluster')
    if 'subsets' in cluster_info:
        if len(cluster_info['subsets']) == 0:
            log("Nothing to join -- giving up.")
            return
        for x in cluster_info['subsets'][0].get('addresses', []):
            v.append('--join')
            v.append(x['ip'])

    # CRITICAL: The database we join *must* have a password, or "--initial-password auto" will break.
    # That's why we open and read the rethinkdb password.
    log("opening password file")
    if open('/secrets/rethinkdb/rethinkdb').read().strip():
        log('there is a password')
        v.append('--initial-password')
        v.append('auto')

    log("launching rethinkdb")
    subprocess.call(v)
    subprocess.call(['tail', '-f', LOG])

if __name__ == "__main__":
    start_rethinkdb_proxy()