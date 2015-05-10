#!/usr/bin/env python

"""

Development setup:

gce.py create_smc_server --machine_type g1-small --disk_size=0 0-devel
gce.py create_compute_server --machine_type g1-small  0-devel

"""

import os, sys, argparse, json, time

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"

import locale
locale.setlocale( locale.LC_ALL, '' )
def money(s):
    return locale.currency(s)

# https://cloud.google.com/compute/pricing

# all storage prices are per GB per month.
PRICING = {
    'snapshot'         : 0.026,
    'local-ssd'        : 0.218,
    'pd-ssd'           : 0.17,
    'pd-standard'      : 0.04,

    'n1-standard-hour' : 0.063,          # for equivalent of -1, so multiply by number of cpu's (the suffix)
    'n1-standard-month': 0.045*30.5*24,  # price for sustained use for a month
    'n1-standard-ram'  : 3.75,           # amount in GB of base machine

    'n1-highmem-hour'  : 0.074,
    'n1-highmem-month' : 0.052*30.5*24,
    'n1-highmem-ram'   : 6.5,

    'n1-highcpu-hour'  : 0.04,
    'n1-highcpu-month' : 0.028*30.5*24,
    'n1-highcpu-ram'   : 0.9,

    'g1-small-hour'    : 0.032,
    'g1-small-month'   : 0.023*30.5*24,
    'g1-small-ram'     : 1.7,

    'f1-small-hour'    : 0.012,
    'f1-small-month'   : 0.009*30.5*24,
    'f1-small-ram'     : 0.60,

    'europe'           : 1.096,
    'asia'             : 1.096,
    'us'               : 1,

    'egress'           : 0.12,
    'egress-china'     : 0.23,
    'egress-australia' : 0.19,
}


sys.path.append(os.path.join(os.environ['SALVUS_ROOT'], 'scripts'))
from smc_firewall import log, cmd


class GCE(object):
    def __init__(self):
        self.project = "sage-math-inc"

    def instance_name(self, node, prefix, zone):
        # this if below is temporary until I re-make the SMC nodes
        return '%s%s-%s'%(prefix, node, self.expand_zone(zone) if prefix.startswith('smc') else self.short_zone(zone))

    def snapshots(self, prefix=''):
        w = []
        usage = 0
        for x in cmd(['gcloud', 'compute', 'snapshots', 'list']).splitlines()[1:]:
            v = x.split()
            if len(v) > 0:
                if v[0].startswith(prefix):
                    w.append(v[0])
                usage += int(v[1])
        w.sort()
        return w

    def newest_snapshot(self, prefix=''):
        return self.snapshots(prefix)[-1]

    def short_zone(self, zone):
        return zone.split('-')[0]

    def expand_zone(self, zone):
        # See https://cloud.google.com/compute/docs/zones
        # Haswell processors are much better than Ivy Bridge and Sandy Bridge.
        if zone == 'us':
            return 'us-central1-c'
        elif zone == 'eu' or zone == 'europe':
            return 'europe-west1-d'
        elif zone == 'asia':
            return 'asia-east1-c'   # not Haswell
        else:
            return zone

    def create_compute_server(self, node, zone='us-central1-c',
                              machine_type='n1-highmem-4', network='default',
                              local_ssd=False, base_ssd=False):
        zone = self.expand_zone(zone)
        name = self.instance_name(node=node, prefix='compute', zone=zone)

        log("creating root filesystem image")
        try:
            opts = ['gcloud', 'compute', '--project', self.project, 'disks', 'create', name,
                 '--zone', zone, '--source-snapshot', self.newest_snapshot('compute-')]
            if base_ssd:
                opts.extend(['--type', 'pd-ssd'])
            cmd(opts)
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise
            log("%s already exists", name)

        log("creating and starting compute instance")
        opts = ['gcloud', 'compute', '--project', self.project, 'instances', 'create', name,
             '--zone', zone, '--machine-type', machine_type, '--network', network,
             '--maintenance-policy', 'MIGRATE', '--scopes',
             'https://www.googleapis.com/auth/devstorage.full_control',
             'https://www.googleapis.com/auth/logging.write',
             '--disk', 'name=%s'%name, 'device-name=%s'%name,
             'mode=rw', 'boot=yes']
        if local_ssd:
            opts.append('--local-ssd')
        cmd(opts, system=True)

    def create_boot_snapshot(self, node, prefix, zone='us-central1-c'):
        """
        Snapshot the boot disk on the give machine.  Typically used for
        replicating configuration.
        """
        zone = self.expand_zone(zone)
        instance_name = self.instance_name(node, prefix, zone)
        snapshot_name = "%s-%s"%(prefix, time.strftime(TIMESTAMP_FORMAT))
        cmd(['gcloud', 'compute', 'disks', 'snapshot', '--project', self.project,
            instance_name,
            '--snapshot-names', snapshot_name,
            '--zone', zone], system=True)

    def create_data_snapshot(self, node, prefix, zone='us-central1-c'):
        """
        Snapshot the data disk on the given machine.  Typically used for
        backing up very important data.
        """
        zone = self.expand_zone(zone)
        instance_name = self.instance_name(node, prefix, zone)
        info = json.loads(cmd(['gcloud', 'compute', 'instances', 'describe',
                               instance_name, '--zone', zone, '--format=json'], verbose=0))
        for disk in info['disks']:
            if disk.get('boot', False):
                continue
            src = disk['deviceName']
            target = 'data-%s-%s'%(src, time.strftime(TIMESTAMP_FORMAT))
            log("%s --> %s", src, target)
            cmd(['gcloud', 'compute', 'disks', 'snapshot',
                 '--project', self.project,
                src,
                 '--snapshot-names', target,
                 '--zone', zone], system=True)

    def create_smc_server(self, node, zone='us-central1-c', machine_type='n1-highmem-2',
                          disk_size=100, network='default'):
        zone = self.expand_zone(zone)
        name = self.instance_name(node=node, prefix='smc', zone=zone)
        disk_name = "%s-cassandra"%name

        log("creating HD root filesystem image")
        try:
            cmd(['gcloud', 'compute', '--project', self.project, 'disks', 'create', name,
                 '--zone', zone, '--source-snapshot', self.newest_snapshot('smc-'),
                 '--type', 'pd-standard'])
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise

        if disk_size:
            log("creating persistent SSD disk on which to store Cassandra's files")
            try:
                cmd(['gcloud', 'compute', '--project', self.project, 'disks', 'create', disk_name,
                    '--size', disk_size, '--zone', zone, '--type', 'pd-ssd'])
            except Exception, mesg:
                if 'already exists' not in str(mesg):
                    raise

        log("create and starting smc compute instance")
        opts = ['gcloud', 'compute', '--project', self.project, 'instances', 'create', name,
             '--zone', zone, '--machine-type', machine_type, '--network', network,
             '--maintenance-policy', 'MIGRATE', '--scopes',
             'https://www.googleapis.com/auth/devstorage.full_control',
             'https://www.googleapis.com/auth/logging.write',
             '--tags', 'http-server', 'https-server',
             '--disk', 'name=%s'%name, 'device-name=%s'%name, 'mode=rw', 'boot=yes',
            ]
        if disk_size:
            opts.extend(['--disk', 'name=%s'%disk_name, 'device-name=%s'%disk_name, 'mode=rw'])
        cmd(opts, system=True)

    def set_metadata(self, prefix=''):
        if not prefix:
            for p in ['smc', 'compute', 'admin', 'storage']:
                self.set_metadata(p)
            return
        names = []
        for x in cmd(['gcloud', 'compute', 'instances', 'list']).splitlines()[1:]:
            v = x.split()
            if v[-1] != 'RUNNING':
                continue
            name = v[0]
            if name.startswith(prefix):
                names.append(name)
        names = ','.join(names)
        cmd(['gcloud', 'compute', 'project-info', 'add-metadata', '--metadata', "%s-servers=%s"%(prefix, names)])

    def delete_old_snapshots(self, prefix=''):
        """
        Delete all but the newest snapshot with the given prefix.
        """
        if not prefix:
            for prefix in ['smc', 'compute']:
                self.delete_old_snapshots(prefix)
            return
        w = self.snapshots(prefix)[:-1]
        if len(w) == 0:
            log("no old snapshots to delete")
        else:
            log("deleting these snapshots: %s", w)
            cmd(['gcloud', 'compute', 'snapshots', 'delete'] + w, system=True)

    def snapshot_usage(self):
        return sum([int(x.split()[1]) for x in cmd(['gcloud', 'compute', 'snapshots', 'list']).splitlines()[1:]])

    def snapshot_costs(self):
        usage = self.snapshot_usage()
        cost = usage*PRICING['snapshot']
        log("-"*70)
        log("The cost for snapshot storage is at most %s/month", money(cost))
        log("-"*70)
        return cost

    def disk_costs(self):
        cost = 0
        for x in cmd(['gcloud', 'compute', 'disks', 'list']).splitlines()[1:]:
            v = x.split()
            size = int(v[2]); typ = v[3]
            cost += size * PRICING[typ]
        # no easy way to see local ssd; for now, assume there is one on each compute machine and no others
        local_ssd = len([x for x in cmd(['gcloud', 'compute', 'instances', 'list']).splitlines() if x.startswith('compute')])
        cost += local_ssd*375*PRICING['local-ssd']

        log("-"*70)
        log("The cost for disk storage is %s/month", money(cost))
        log("-"*70)
        return cost

    def instance_costs(self):
        cost = cost_upper = 0
        n_compute = 0
        n_smc = 0
        for x in cmd(['gcloud', 'compute', 'instances', 'list']).splitlines()[1:]:
            v = x.split()
            zone         = v[1]
            machine_type = v[2]
            status       = v[-1]
            if v[0].startswith('compute'):
                n_compute += 1
            elif v[0].startswith('smc'):
                n_smc += 1
            if status == "RUNNING":
                t = machine_type.split('-')
                if len(t) == 3:
                    b = '-'.join(t[:2])
                    cpus = int(t[2])
                else:
                    b = machine_type
                    cpus = 1
                cost += PRICING[b+'-month'] * cpus * PRICING[zone.split('-')[0]]
                cost_upper += PRICING[b+'-hour'] *30.5*24* cpus * PRICING[zone.split('-')[0]]
        log("-"*70)
        log("Compute nodes: %s        SMC nodes: %s", n_compute, n_smc)
        log("The cost for sustained use of currently running instances is %s/month (but could be as high as %s)", money(cost), money(cost_upper))
        log("-"*70)
        return cost

    def network_costs(self):
        # These are estimates based on usage during March and April.  May be lower in future
        # do to moving everything to GCE.  Not sure.
        costs = 1000 * PRICING['egress'] + 10*PRICING['egress-australia'] + 10*PRICING['egress-china']
        log("-"*70)
        log("Total network cost estimate: %s/month", money(costs))
        log("-"*70)
        return costs

    def costs(self):
        costs = {}
        total = 0
        for t in ['snapshot', 'disk', 'instance', 'network']:
            costs[t] = getattr(self, '%s_costs'%t)()
            total += costs[t]
        log("-"*70)
        log("Total sustained use cost estimate: %s/month", money(total))
        log("-"*70)
        return costs


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Create VM instances on Google Compute Engine")
    subparsers = parser.add_subparsers(help='sub-command help')

    def f(subparser):
        function = subparser.prog.split()[-1]
        def g(args):
            special = [k for k in args.__dict__.keys() if k not in ['func']]
            out = []
            errors = False
            kwds = dict([(k,getattr(args, k)) for k in special])
            try:
                result = getattr(GCE(), function)(**kwds)
            except Exception, mesg:
                raise #-- for debugging
                errors = True
                result = {'error':str(mesg)}
            print json.dumps(result)
            if errors:
                sys.exit(1)
        subparser.set_defaults(func=g)

    parser_create_compute_server = subparsers.add_parser('create_compute_server', help='')
    parser_create_compute_server.add_argument('node', help="", type=str)
    parser_create_compute_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_compute_server.add_argument('--machine_type', help="", type=str, default="n1-highmem-4")
    parser_create_compute_server.add_argument('--network', help="default or devel", type=str, default="default")
    parser_create_compute_server.add_argument("--local_ssd", default=False, action="store_const", const=True)
    parser_create_compute_server.add_argument("--base_ssd", default=False, action="store_const", const=True)
    f(parser_create_compute_server)

    parser_create_smc_server = subparsers.add_parser('create_smc_server', help='')
    parser_create_smc_server.add_argument('node', help="", type=str)
    parser_create_smc_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_smc_server.add_argument('--machine_type', help="", type=str, default="n1-highmem-2")
    parser_create_smc_server.add_argument('--disk_size', help="", type=int, default=100)
    parser_create_smc_server.add_argument('--network', help="default or devel", type=str, default="default")
    f(parser_create_smc_server)

    parser_create_boot_snapshot = subparsers.add_parser('create_boot_snapshot', help='')
    parser_create_boot_snapshot.add_argument('node', help="", type=str)
    parser_create_boot_snapshot.add_argument('prefix', help="", type=str)
    parser_create_boot_snapshot.add_argument('--zone', help="", type=str, default="us-central1-c")
    f(parser_create_boot_snapshot)

    parser_create_data_snapshot = subparsers.add_parser('create_data_snapshot', help='')
    parser_create_data_snapshot.add_argument('node', help="", type=str)
    parser_create_data_snapshot.add_argument('prefix', help="", type=str)
    parser_create_data_snapshot.add_argument('--zone', help="", type=str, default="us-central1-c")
    f(parser_create_data_snapshot)

    for cost in ['snapshot_', 'disk_', 'instance_', 'network_', '']:
        f(subparsers.add_parser('%scosts'%cost))

    p = subparsers.add_parser('delete_old_snapshots')
    p.add_argument('--prefix', help="", type=str, default="")
    f(p)


    parser_set_metadata = subparsers.add_parser('set_metadata', help='')
    parser_set_metadata.add_argument('--prefix', help="", type=str, default="")
    f(parser_set_metadata)

    args = parser.parse_args()
    args.func(args)
