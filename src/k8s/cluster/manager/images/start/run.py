#!/usr/bin/env python3
import os, sys, time

KUBERNETES_CLUSTER_PREFIX = os.environ['KUBERNETES_CLUSTER_PREFIX']

def log(*args):
    print(*args)
    sys.stdout.flush()

def cmd(s):
    z = os.popen(s+" 2>&1 ")
    t = z.read()
    if z.close():
        raise RuntimeError(t)
    return t

def start_stopped_minions():
    # k8s-dev-master                    us-central1-c  g1-small                    10.240.0.7      146.148.35.43    RUNNING
    # k8s-dev-minion-group-zu5z         us-central1-c  n1-standard-1  true         10.240.0.9      104.197.43.49    RUNNING
    to_start = []
    log("start_stopped_minions with prefix %s..."%KUBERNETES_CLUSTER_PREFIX)
    for x in cmd('gcloud compute instances list | grep ^%s-'%KUBERNETES_CLUSTER_PREFIX).splitlines():
        v = x.split()
        if len(v) >= 7:
            if v[3] == 'true' and v[-1] != 'RUNNING':  # preemptible and not running
                to_start.append(v[0])
    if len(to_start) > 0:
        log("starting %s"%to_start)
        cmd('gcloud compute instances start -q ' + ' '.join(to_start))
    else:
        log("nothing to start")

def cluster_manager():
    log("running cluster_manager")
    while True:
        start_stopped_minions()
        time.sleep(15)

if __name__ == "__main__":
    cluster_manager()
