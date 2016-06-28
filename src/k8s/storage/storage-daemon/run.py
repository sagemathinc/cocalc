#!/usr/bin/env python3
import json, os, requests, socket, subprocess, time

HOSTS = '/node/etc/hosts'

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
        start = "# start smc-storage dns - namespace="+namespace
        end = "# end smc-storage dns - namespace="+namespace
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


def start_storage_daemon():
    print("launching rethinkdb")
    while True:
        update_etc_hosts()
        time.sleep(15)
        print("sleeping...")

if __name__ == "__main__":
    start_storage_daemon()