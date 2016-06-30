#!/usr/bin/env python3

import json, os, shutil, sys, tempfile
join = os.path.join

# Where Kubernetes is installed from https://github.com/kubernetes/kubernetes/releases

KUBE_ROOT = join(os.environ['HOME'], 'kubernetes')
CLUSTER   = join(KUBE_ROOT, 'cluster')

if not os.path.exists(CLUSTER):
    print("Install Kubernetes from https://github.com/kubernetes/kubernetes/releases in {dest}.".format(dest=KUBE_ROOT))
    sys.exit(1)

# Boilerplate to ensure we are in the directory of this path and make the util module available.
SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

def cost_of_cluster(node_size, node_disk_type, node_disk_size, min_nodes, max_nodes, preemptible,
                    master_size=None, master_disk_type=None, master_disk_size=None):
    sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', '..', 'scripts', 'gce')))
    import pricing
    def show(v, period='monthly'):
        return "{low:<8} <= {period:<8} cost <= {high:<8}    ".format(
                low=pricing.money(v[0]), high=pricing.money(v[1]), period=period)
    node_cpu   = pricing.cpu_cost(size=node_size, preemptible=preemptible, region='us')
    print("1 node_cpu  = ", show(node_cpu))
    nodes_cpu  = [node_cpu[0]*min_nodes, node_cpu[1]*max_nodes]
    print("nodes_cpus  = ", show(nodes_cpu))
    node_disk = pricing.disk_cost(node_disk_size, node_disk_type)
    print("1 node_disk = ", show(node_disk))
    nodes_disk = [node_disk[0]*min_nodes, node_disk[1]*max_nodes]
    print("nodes_disk  = ", show(nodes_disk))
    total = [nodes_cpu[0] + nodes_disk[0], nodes_cpu[1] + nodes_disk[1]]
    if master_size is not None:
        master_cpu = pricing.cpu_cost(size=master_size, preemptible=False, region='us') # region assumed
        print("master_cpu  = ", show(master_cpu))
        master_disk = pricing.disk_cost(master_disk_size, master_disk_type)
        print("master_disk = ", show(master_disk))
        total[0] += master_cpu[0] + master_disk[0]
        total[1] += master_cpu[1] + master_disk[1]
    print("-"*50)
    print("total       = ", show(total))
    print("total       = ", show([total[0]/30.5, total[1]/30.5], 'daily'))

def create_cluster(args):
    if '_' in args.name:
        raise ValueError("name must not contain an underscore (_)")
    if args.min_nodes > args.max_nodes:
        args.max_nodes = args.min_nodes
    if args.cost:
        c = cost_of_cluster(node_size = args.node_size,
                            node_disk_type = 'pd-ssd' if args.node_ssd else 'pd-standard',
                            node_disk_size = args.node_disk_size,
                            min_nodes = args.min_nodes,
                            max_nodes = args.max_nodes,
                            master_size = args.master_size,
                            master_disk_type = 'pd-ssd',  # forced by k8s
                            master_disk_size = args.master_disk_size,
                            preemptible = args.preemptible)
        print(c)
        return

    # Determine available ip range. TODO: this is NOT rock solid -- it's just enough to
    # prevent collisions with other clusters, which is all we need.  However, be nervous.
    routes = json.loads(util.run(['gcloud', '--format=json', 'compute', 'routes', 'list'], get_output=True))
    n = 245
    while True:
        for route in routes:
            if route['destRange'].startswith('10.%s'%n):
                n += 1
                continue
        break
    cluster_ip_range = '10.%s.0.0/16'%n


    # see https://github.com/kubernetes/kubernetes/blob/master/cluster/gce/config-default.sh for env vars
    env = {
        'KUBE_ENABLE_CLUSTER_MONITORING' : 'google',
        'KUBE_GCE_ZONE'                  : args.zone,
        'NODE_SIZE'                      : args.node_size,
        'NUM_NODES'                      : str(args.min_nodes),
        'MASTER_SIZE'                    : args.master_size,
        'MASTER_DISK_SIZE'               : "%sGB"%args.master_disk_size,
        'NODE_DISK_TYPE'                 : 'pd-ssd' if args.node_ssd else 'pd-standard',
        'NODE_DISK_SIZE'                 : "%sGB"%args.node_disk_size,
        'PREEMPTIBLE_NODE'               : 'true' if args.preemptible else 'false',
        'KUBE_GCE_INSTANCE_PREFIX'       : 'k8s-'+args.name,
        'KUBE_ENABLE_NODE_AUTOSCALER'    : 'true' if args.min_nodes < args.max_nodes else 'false',
        'KUBE_AUTOSCALER_MIN_NODES'      : str(args.min_nodes),
        'KUBE_AUTOSCALER_MAX_NODES'      : str(args.max_nodes),
        'CLUSTER_IP_RANGE'               : cluster_ip_range,
        'KUBE_GCE_MASTER_PROJECT'        : 'google-containers',   # gcloud compute images list --project google-containers
        'KUBE_OS_DISTRIBUTION'           : 'debian',
        'KUBE_GCE_MASTER_IMAGE'          : 'container-v1-3-v20160604',
        'KUBE_GCE_NODE_IMAGE'            : 'container-v1-3-v20160604',
        #'KUBE_GCE_MASTER_PROJECT'        : 'ubuntu-os-cloud',   # gcloud compute images list --project google-containers
        #'KUBE_OS_DISTRIBUTION'           : 'trusty',
        #'KUBE_GCE_MASTER_IMAGE'          : 'ubuntu-1404-trusty-v20160627',
        #'KUBE_GCE_NODE_IMAGE'            : 'ubuntu-1404-trusty-v20160627',  # ubuntu didn't work -- NO DNS!

    }

    env.update(os.environ)
    util.run(join(CLUSTER, 'kube-up.sh'), env=env)
    update_firewall()

def create_instance_group(args):
    if '_' in args.name:
        raise ValueError("name must not contain an underscore (_)")
    if args.min_nodes > args.max_nodes:
        args.max_nodes = args.min_nodes
    if args.cost:
        c = cost_of_cluster(node_size = args.node_size,
                            node_disk_type = 'pd-ssd' if args.node_ssd else 'pd-standard',
                            node_disk_size = args.node_disk_size,
                            min_nodes = args.min_nodes,
                            max_nodes = args.max_nodes,
                            preemptible = not args.non_preemptible)
        print(c)
        return

    if not args.name:
        raise RuntimeError("you must specify a name")


    prefix = util.get_cluster_prefix()

    # KUBE_USE_EXISTING_MASTER -- figured out by looking at https://github.com/kubernetes/kubernetes/blob/master/cluster/gce/util.sh
    env = {
        'KUBERNETES_PROVIDER'            : 'gce',
        'KUBE_MASTER'                    : prefix + '-master',
        'KUBE_ENABLE_CLUSTER_MONITORING' : 'google',
        'KUBE_GCE_ZONE'                  : args.zone,
        'NODE_SIZE'                      : args.node_size,
        'NUM_NODES'                      : str(args.min_nodes),
        'NODE_DISK_TYPE'                 : 'pd-ssd' if args.node_ssd else 'pd-standard',
        'NODE_DISK_SIZE'                 : "%sGB"%args.node_disk_size,
        'PREEMPTIBLE_NODE'               : 'false' if args.non_preemptible else 'true',
        'KUBE_GCE_INSTANCE_PREFIX'       : prefix,
        'NEW_GROUP_PREFIX'               : prefix + '-' + args.name,
        'KUBE_ENABLE_NODE_AUTOSCALER'    : 'true' if args.min_nodes < args.max_nodes else 'false',
        'KUBE_AUTOSCALER_MIN_NODES'      : str(args.min_nodes),
        'KUBE_AUTOSCALER_MAX_NODES'      : str(args.max_nodes),
        'KUBE_ROOT'                      : KUBE_ROOT  # required by the kube-add.sh script
    }

    env.update(os.environ)
    # Copy over and run our own script for adding a new managed instance group!
    # I wrote this script based on reading the kubernetes shell scripts for hours... (ws)
    os.chdir(SCRIPT_PATH)
    util.run('./kube-add.sh', env=env)

def delete_instance_group(args):
    base     = util.get_cluster_prefix() + '-' + args.name + "-minion"
    group    = base + '-group'
    template = base + '-template'
    util.run(["gcloud", "--quiet", "compute", "instance-groups", "managed", "delete", group])
    util.run(["gcloud", "--quiet", "compute", "instance-templates", "delete", template])

def update_firewall():
    """
    We manually modify the firewall so that the rule default-default-internal only allows traffic
    from k8s clusters, and not everything.  By default kube-up.sh creates the firewall and allows
    traffic from everything inside the GCE project to everything... which is **BAD** since
    the compute projects would then be able to connect directly to the database, and could otherwise
    cause trouble (e.g., DOS).  Of course, the database has along random password, but still.
    So we change the tags for this firewall rule to all tags starting in k8s.
    """
    # see http://stackoverflow.com/questions/37047089/fastest-way-to-fetch-tags-and-status-of-gce-instances
    tags = []
    for x in util.run(['gcloud', 'compute', 'instances', 'list', '--format', 'table(tags.list())'], get_output=True).splitlines():
        v = x.split("items=")
        if len(v) > 1:
            for t in eval(v[-1]):
                tags.append(t)
    tags = set(tags)
    tags = [x for x in tags if x.startswith('k8s')]
    util.run(['gcloud', 'compute', 'firewall-rules', 'update', 'default-default-internal',
              '--target-tags', ','.join(tags)])

def select_cluster(args):
    print('selecting ', args.name)
    util.set_context(args.name)

def list_clusters(args):
    print('\n'.join(util.get_all_contexts()))

def delete_cluster(args):
    if input("**This is VERY dangerous. **  Delete Cluster '%s'?  type 'yes sir' to delete it: "%util.get_kube_context()) != 'yes sir':
        print("canceling")
        return
    # IMPORTANT: shutdown all deployments *and* services first; otherwise we end up with
    # a random load balancer left laying around, which costs, and will never be used again.
    delete_all()

    env = {
        'KUBE_GCE_INSTANCE_PREFIX' : util.get_cluster_prefix(),
        'KUBE_GCE_ZONE'            : args.zone
    }
    env.update(os.environ)
    util.run(join(CLUSTER, 'kube-down.sh'), env=env)

def autoscale_cluster(args):
    if args.min_nodes is not None and args.max_nodes < args.min_nodes:
        args.min_nodes = args.max_nodes
    prefix = util.get_cluster_prefix()
    if args.name:
        group = '{prefix}-{name}-minion-group'.format(prefix=prefix, name=args.name)
    else:
        group = '{prefix}-minion-group'.format(prefix=prefix)
    v = ['gcloud', 'compute', 'instance-groups', 'managed', 'set-autoscaling', group,
         '--max-num-replicas', str(args.max_nodes)]
    if args.min_nodes is not None:
        v.append('--min-num-replicas')
        v.append(str(args.min_nodes))
    if args.cpu_percent is not None:
        v.append("--scale-based-on-cpu")
        v.append("--target-cpu-utilization")
        v.append(str(args.cpu_percent/100.0))
    util.run(v)

def resize_cluster(args):
    util.run(['gcloud', 'compute', 'instance-groups', 'managed', 'resize', util.get_cluster_prefix() + '-minion-group',
         '--size', str(args.size)])

def run_all():
    x = util.get_deployments()
    for name in ['rethinkdb-proxy', 'smc-webapp-static', 'smc-hub', 'haproxy']:
        if name not in x:
            if name == 'rethinkdb0':
                name = 'rethinkdb'
            print('\n******\nRUNNING {name}\n******\n'.format(name=name))
            util.run([join(SCRIPT_PATH,'..',name,'control.py'), 'run'])

def delete_all():
    x = util.get_deployments()
    s = util.get_services()
    for name in ['rethinkdb0', 'rethinkdb-proxy', 'smc-webapp-static', 'smc-hub', 'haproxy']:
        if name in x:
            if name == 'rethinkdb0':
                name = 'rethinkdb'
            print('\n******\nDELETING {name}\n******\n'.format(name=name))
            util.run([join(SCRIPT_PATH,'..',name,'control.py'), 'delete'])
        if name in s:
            util.run(['kubectl', 'delete', 'services', name])

def ssh(args):
    v = util.get_nodes()
    if args.name:
        prefix = util.get_cluster_prefix() + '-' + args.name + '-'
        v = [x for x in v if x.startswith(prefix)]
    util.tmux_ssh(v, sync=not args.no_sync)

def hpa(args):
    util.show_horizontal_pod_autoscalers(args.namespace)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(
            description='Control deployment of Kubernetes clusters',
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    subparsers = parser.add_subparsers(help='sub-command help')

    # Example: time c create-cluster --master-size=g1-small --node-size=g1-small --min-nodes=2 --max-nodes=2 --node-disk-size=20 --preemptible mycluster
    sub = subparsers.add_parser('create-cluster', help='create a new k8s cluster',
                                formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("name",               type=str,                help="name of the cluster")
    sub.add_argument("--zone",             default="us-central1-c", help="zone of the cluster")
    sub.add_argument("--master-size",      default="n1-standard-2", help="node VM type")
    sub.add_argument("--master-disk-size", default=20, type=int,    help="size of master disks")
    sub.add_argument("--node-size",        default="n1-standard-2", help="node VM type")
    sub.add_argument("--node-ssd",         action="store_true",     help="use SSD's on the nodes")
    sub.add_argument("--node-disk-size",   default=60, type=int,    help="size of node disks")
    sub.add_argument("--min-nodes",        default=2,  type=int,    help="min number of nodes; can change later")
    sub.add_argument("--max-nodes",        default=2,  type=int,    help="max number of nodes (if >min, autoscale); can change later")
    sub.add_argument("--preemptible",      action="store_true",     help="use preemptible nodes")
    sub.add_argument("--cost",             action="store_true",     help="instead of creating only estimate monthly cost of cluster")
    sub.set_defaults(func=create_cluster)

    sub = subparsers.add_parser('select-cluster', help='select a given cluster')
    sub.add_argument('name', type=str, help='name of the cluster to switch to (so is default for kubectl)')
    sub.set_defaults(func=select_cluster)

    sub = subparsers.add_parser('list-clusters', help='list of all clusters running in this project')
    sub.set_defaults(func=list_clusters)

    sub = subparsers.add_parser('delete-cluster', help='delete k8s cluster')
    sub.add_argument("--zone", default="us-central1-c", help="zone of the cluster")
    sub.set_defaults(func=delete_cluster)

    sub = subparsers.add_parser('create-instance-group', help='add a managed instance group to the cluster',
                                formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    sub.add_argument("--zone",             default="us-central1-c", help="zone of the instance group")
    sub.add_argument("--node-size",        default="n1-standard-2", help="node VM type")
    sub.add_argument("--node-ssd",         action="store_true",     help="use SSD's on the nodes")
    sub.add_argument("--node-disk-size",   default=100, type=int,    help="size of node disks")
    sub.add_argument("--min-nodes",        default=2,  type=int,    help="min number of nodes; can change later")
    sub.add_argument("--max-nodes",        default=2,  type=int,    help="max number of nodes (if >min, autoscale); can change later")
    sub.add_argument("--non-preemptible",  action="store_true",     help="do NOT use preemptible nodes")
    sub.add_argument("--cost",             action="store_true",     help="instead of creating instance group, only estimate monthly cost of the instance group")
    sub.add_argument("name", help="instance group will be named k8s-[cluster]-[name]")
    sub.set_defaults(func=create_instance_group)

    sub = subparsers.add_parser('delete-instance-group', help='delete k8s instance group and template')
    sub.add_argument("name", help="will delete k8s-[cluster]-[name]")
    sub.set_defaults(func=delete_instance_group)

    sub = subparsers.add_parser('autoscale', help='enable autoscale of an instance group')
    sub.add_argument("--max-nodes",   type=int,     help="max number of nodes -- required and must be at least 1")
    sub.add_argument("--min-nodes",   type=int, default=None, help="minimum number of nodes")
    sub.add_argument("--cpu-percent", type=int, default=60, help="target average cpu percentage (number between 1 and 100)")
    sub.add_argument("name", type=str, default='', nargs='?', help="if given, autoscale group created using create-instance-group")
    sub.set_defaults(func=autoscale_cluster)

    sub = subparsers.add_parser('resize', help='set the number of nodes')
    sub.add_argument("--size",  type=int, help="number of nodes", required=True)
    sub.set_defaults(func=resize_cluster)

    sub = subparsers.add_parser('run-deployments', help="starts minimal latest versions of all deployments running in the current cluster, **EXCEPT** for rethinkdb.")
    sub.set_defaults(func=lambda args: run_all())

    sub = subparsers.add_parser('delete-deployments', help='delete all smc deployments (and service!) in the current cluster')
    sub.set_defaults(func=lambda args: delete_all())

    sub = subparsers.add_parser('ssh', help='use tmux to ssh to all nodes at once')
    sub.add_argument("name", type=str, default='', nargs='?', help="if given, only ssh to nodes with hostname that starts k8s-{name}-")
    sub.add_argument("-n" , "--no-sync",  action="store_true",     help="do not syncrhonize panes")
    sub.set_defaults(func=ssh)

    sub = subparsers.add_parser('namespace', help='set the current namespace, e.g., default, prod, test, etc.')
    sub.add_argument("namespace", type=str, help="a valid namespace")
    sub.set_defaults(func=lambda args: util.set_namespace(args.namespace))

    sub = subparsers.add_parser('hpa', help='show horizontal pod autoscaler info')
    sub.add_argument("--namespace", type=str, default='', help="a valid namespace")
    sub.set_defaults(func=hpa)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)

