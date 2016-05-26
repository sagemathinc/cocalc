#!/usr/bin/env python3

import os, shutil, sys, tempfile
join = os.path.join

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

"""

"""

def cost_of_cluster(node_size, node_disk_type, node_disk_size, min_nodes, max_nodes, preemptible,
                    master_size, master_disk_type, master_disk_size):
    sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', '..', 'scripts', 'gce')))
    import pricing
    def show(v):
        return "low: {low:<8} high: {high:<8}".format(low=pricing.money(v[0]), high=pricing.money(v[1]))
    master_cpu = pricing.cpu_cost(size=master_size, preemptible=False, region='us') # region assumed
    print("master_cpu  = ", show(master_cpu))
    node_cpu   = pricing.cpu_cost(size=node_size, preemptible=preemptible, region='us')
    print("1 node_cpu  = ", show(node_cpu))
    nodes_cpu  = [node_cpu[0]*min_nodes, node_cpu[1]*max_nodes]
    print("nodes_cpus  = ", show(nodes_cpu))
    master_disk = pricing.disk_cost(master_disk_size, master_disk_type)
    print("master_disk = ", show(master_disk))
    node_disk = pricing.disk_cost(node_disk_size, node_disk_type)
    print("1 node_disk = ", show(node_disk))
    nodes_disk = [node_disk[0]*min_nodes, node_disk[1]*max_nodes]
    print("nodes_disk  = ", show(nodes_disk))
    total = [master_cpu[0] + nodes_cpu[0] + master_disk[0] + nodes_disk[0],
             master_cpu[1] + nodes_cpu[1] + master_disk[1] + nodes_disk[1]]
    print("-"*50)
    print("total       = ", show(total))

def create_cluster(args):
    if args.min_nodes > args.max_nodes:
        args.max_nodes = args.min_nodes
    if args.cost:
        c = cost_of_cluster(node_size = args.node_size,
                            node_disk_type = 'pd-ssd' if args.node_ssd else 'pd-standard',
                            node_disk_size = args.node_disk_size,
                            min_nodes = args.min_nodes,
                            max_nodes = args.max_nodes,
                            master_size = args.master_size,
                            master_disk_type = 'pd-ssd' if args.master_ssd else 'pd-standard',
                            master_disk_size = args.master_disk_size,
                            preemptible = not args.non_preemptible)
        print(c)
        return

    # see https://github.com/kubernetes/kubernetes/blob/master/cluster/gce/config-default.sh for env vars
    env = {
        'KUBE_ENABLE_CLUSTER_MONITORING' : 'google',
        'KUBE_GCE_ZONE'                  : args.zone,
        'NODE_SIZE'                      : args.node_size,
        'NUM_NODES'                      : args.min_nodes,
        'MASTER_SIZE'                    : args.master_size,
        'MASTER_DISK_TYPE'               : 'pd-ssd' if args.master_ssd else 'pd-standard',
        'MASTER_DISK_SIZE'               : "%sGB"%args.master_disk_size,
        'NODE_DISK_TYPE'                 : 'pd-ssd' if args.node_ssd else 'pd-standard',
        'NODE_DISK_SIZE'                 : "%sGB"%args.node_disk_size,
        'PREEMPTIBLE_NODE'               : 'false' if args.non_preemptible else 'true',
        'KUBE_GCE_INSTANCE_PREFIX'       : 'k8s-'+args.name,
        'KUBE_ENABLE_NODE_AUTOSCALER'    : args.min_nodes < args.max_nodes,
        'KUBE_AUTOSCALER_MIN_NODES'      : args.min_nodes,
        'KUBE_AUTOSCALER_MAX_NODES'      : args.max_nodes
    }




if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(
            description='Control deployment of Kubernetes clusters',
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('create-cluster', help='create k8s cluster',
                                formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("--name",             type=str,              help="name of the cluster", required=True)
    sub.add_argument("--zone",             default="us-central1-c", help="zone of the cluster")
    sub.add_argument("--master-size",      default="g1-small",    help="node VM type")
    sub.add_argument("--master-ssd",       action="store_true",   help="use SSD on the master")
    sub.add_argument("--master-disk-size", default=10, type=int,  help="size of master disks")
    sub.add_argument("--node-size",        default="g1-small",    help="node VM type")
    sub.add_argument("--node-ssd",         action="store_true",   help="use SSD's on the nodes")
    sub.add_argument("--node-disk-size",   default=30, type=int,  help="size of node disks")
    sub.add_argument("--min-nodes",        default=3, type=int,   help="min number of nodes")
    sub.add_argument("--max-nodes",        default=3, type=int,   help="max number of nodes (if >min, autoscale)")
    sub.add_argument("--non-preemptible",  action="store_true",   help="do NOT use preemptible nodes")
    sub.add_argument("--cost",             action="store_true",   help="instead of creating only estimate monthly cost of cluster")
    sub.set_defaults(func=create_cluster)

    #sub = subparsers.add_parser('delete-cluster', help='delete k8s cluster')
    args = parser.parse_args()
    args.func(args)

