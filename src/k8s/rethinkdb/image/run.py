#!/usr/bin/env python3
import json, os, socket, subprocess as sub

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.

    (Based on https://github.com/rosskukulinski/kubernetes-rethinkdb-cluster/blob/master/image/run.sh)
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=os.environ.get('POD_NAMESPACE', 'default'),
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    # TODO: use the Python3's http.client lib natively
    # 1. https://docs.python.org/3/library/http.client.html#http.client.HTTPSConnection
    # 2. https://docs.python.org/3/library/http.client.html#http.client.HTTPConnection.request
    cmd='curl -s {URL} --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt --header "Authorization: Bearer {token}"'
    cmd = cmd.format(URL=URL, token=token)
    x = sub.Popen(cmd, stdout=sub.PIPE, shell=True).stdout.read().decode()
    return json.loads(x)

def get_replicas():
    """
    Return the ip addresses of all Rethinkdb servers in the clusters.  These are
    the replicas that hold actual data.
    """
    d = get_service('rethinkdb-cluster')
    if d is None:  # not in kubernetes
        return []
    return [x['ip'] for x in d['subsets'][0]['addresses']]

def other_replicas():
    our_ip = socket.gethostbyname(socket.gethostname())
    return [x for x in get_replicas() if x != our_ip]

def start_rethinkdb():
    if not os.path.exists('/data'):
        os.makedirs('/data')
    os.chdir('/data')
    NAME = socket.gethostname().split('-')[0]
    v = ['rethinkdb', '--bind', 'all', '--no-http-admin', '--server-name', NAME]
    for ip in other_replicas():
        v.append("--join")
        v.append(ip)
    print(" ".join(v))
    sub.call(v)

if __name__ == "__main__":
    start_rethinkdb()