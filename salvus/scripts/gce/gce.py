#!/usr/bin/env python

"""

Development setup:

gce.py create_smc_server --machine_type g1-small --disk_size=0 0-devel
gce.py create_compute_server --machine_type g1-small  0-devel

"""

import math, os, sys, argparse, json, time

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"

import locale
locale.setlocale( locale.LC_ALL, '' )
def money(s):
    return locale.currency(s)

# https://cloud.google.com/compute/pricing

# all storage prices are per GB per month.
PRICING = {
    'gcs-standard'     : 0.026,
    'gcs-reduced'      : 0.02,
    'gcs-nearline'     : 0.01,
    'snapshot'         : 0.026,
    'local-ssd'        : 0.218,
    'pd-ssd'           : 0.17,
    'pd-standard'      : 0.04,

    'n1-standard-hour' : 0.055,          # for equivalent of -1, so multiply by number of cpu's (the suffix)
    'n1-standard-pre'  : 0.0165,
    'n1-standard-month': 0.039*30.5*24,  # price for sustained use for a month
    'n1-standard-ram'  : 3.75,           # amount in GB of base machine

    'n1-highmem-hour'  : 0.0695,
    'n1-highmem-pre'   : 0.01925,
    'n1-highmem-month' : 0.0485*30.5*24,
    'n1-highmem-ram'   : 6.5,

    'n1-highcpu-hour'  : 0.042,
    'n1-highcpu-pre'   : 0.011,
    'n1-highcpu-month' : 0.0295*30.5*24,
    'n1-highcpu-ram'   : 0.9,

    'g1-small-hour'    : 0.032,
    'g1-small-pre'     : 0.011,
    'g1-small-month'   : 0.023*30.5*24,
    'g1-small-ram'     : 1.7,

    'f1-micro-hour'    : 0.012,
    'f1-micro-pre'     : 0.0055,
    'f1-micro-month'   : 0.009*30.5*24,
    'f1-micro-ram'     : 0.60,

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

    def instance_name(self, node, prefix, zone, devel):
        # the zone names have got annoyingly non-canonical...
        if prefix.startswith('smc'):
            zone = "-"+self.expand_zone(zone)
        elif prefix.startswith('compute') or prefix.startswith('storage'):
            zone = "-"+self.short_zone(zone)
        else:
            zone = ''
        return '%s%s%s%s'%(prefix, node, '-devel' if devel else '', zone)

    def snapshots(self, prefix, devel=False):
        w = []
        usage = 0
        if devel:
            p = 'devel-%s'%prefix
        else:
            p = prefix
        for x in cmd(['gcloud', 'compute', 'snapshots', 'list']).splitlines()[1:]:
            v = x.split()
            if len(v) > 0:
                if v[0].startswith(p):
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

    def _create_compute_server(self, node, zone='us-central1-c',
                              machine_type='n1-highmem-4', network='default',
                              projects_ssd=False, base_ssd=False,
                               projects_size=150,
                              devel=False):
        zone = self.expand_zone(zone)
        name = self.instance_name(node=node, prefix='compute', zone=zone, devel=devel)

        log("creating root filesystem image")
        try:
            opts = ['gcloud', 'compute', '--project', self.project, 'disks', 'create', name,
                 '--zone', zone, '--source-snapshot', self.newest_snapshot('compute')]
            if base_ssd:
                opts.extend(['--type', 'pd-ssd'])
            cmd(opts)
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise
            log("%s already exists", name)

        log("creating /dev/sdb persistent disk")
        disk_name = "%s-projects"%name
        try:
            opts = ['gcloud', 'compute', '--project', self.project, 'disks', 'create', disk_name,
                    '--size', projects_size, '--zone', zone]
            if projects_ssd:
                opts.extend(['--type', 'pd-ssd'])
            cmd(opts)
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise


        log("creating and starting compute instance")
        opts = ['gcloud', 'compute', '--project', self.project, 'instances', 'create', name,
             '--zone', zone, '--machine-type', machine_type, '--network', network,
             '--maintenance-policy', 'MIGRATE', '--scopes',
             'https://www.googleapis.com/auth/logging.write',
             '--disk', 'name=%s,device-name=%s,mode=rw,boot=yes'%(name, name)]
        #if local_ssd:
        #    opts.append('--local-ssd')
        #else:
        opts.extend(['--disk', 'name=%s'%disk_name, 'device-name=%s'%disk_name, 'mode=rw'])
        cmd(opts, system=True)

        if devel:
            self.set_boot_auto_delete(name=name, zone=zone)

    def create_compute_server0(self, node, zone='us-central1-c', machine_type='n1-highmem-4'):
        self._create_compute_server(node=node, zone=zone,
                                    machine_type=machine_type, projects_ssd=True,
                                    projects_size=150,
                                    base_ssd=True, network='default')

    def create_compute_server(self, node, zone='us-central1-c', machine_type='n1-highmem-4',
                             projects_size=500):
        self._create_compute_server(node=node, zone=zone,
                                    machine_type=machine_type, projects_ssd=False,
                                    projects_size=projects_size,
                                    base_ssd=False, network='default')

    def create_devel_compute_server(self, node, zone='us-central1-c', machine_type='g1-small'):
        self._create_compute_server(node=node, zone=zone,
                                    machine_type = machine_type,
                                    projects_ssd = False,
                                    projects_size = 10,
                                    base_ssd  = False,
                                    network   = 'devel',
                                    devel     = True)

    def create_boot_snapshot(self, node, prefix, zone='us-central1-c', devel=False):
        """
        Snapshot the boot disk on the give machine.  Typically used for
        replicating configuration.
        """
        zone = self.expand_zone(zone)
        instance_name = self.instance_name(node, prefix, zone, devel=devel)
        snapshot_name = "%s-%s"%(prefix, time.strftime(TIMESTAMP_FORMAT))
        cmd(['gcloud', 'compute', 'disks', 'snapshot', '--project', self.project,
            instance_name,
            '--snapshot-names', snapshot_name,
            '--zone', zone], system=True)

    def create_all_boot_snapshots(self):
        log("snapshotting storage boot image")
        self.create_boot_snapshot(node=0, prefix='storage', zone='us-central1-c', devel=False)
        log("snapshotting backup boot image")
        self.create_boot_snapshot(node=0, prefix='backup', zone='us-central1-c', devel=False)
        log("snapshotting admin boot image")
        self.create_boot_snapshot(node='',prefix='admin', zone='us-central1-c', devel=False)
        log("snapshotting SMC server boot image")
        self.create_boot_snapshot(node=0, prefix='smc', zone='us-central1-c', devel=False)
        log("snapshotting compute machine boot image")
        self.create_boot_snapshot(node=0, prefix='compute', zone='us-central1-c', devel=False)

    def create_data_snapshot(self, node, prefix, zone='us-central1-c', devel=False):
        """
        Snapshot the data disk on the given machine.  Typically used for
        backing up very important data.
        """
        zone = self.expand_zone(zone)
        instance_name = self.instance_name(node, prefix, zone, devel=devel)
        info = json.loads(cmd(['gcloud', 'compute', 'instances', 'describe',
                               instance_name, '--zone', zone, '--format=json'], verbose=0))
        for disk in info['disks']:
            if disk.get('boot', False):
                continue
            src = disk['deviceName']
            target = 'data-%s-%s'%(src, time.strftime(TIMESTAMP_FORMAT))
            log("%s --> %s", src, target)
            try:
                cmd(['gcloud', 'compute', 'disks', 'snapshot',
                     '--project', self.project,
                    src,
                     '--snapshot-names', target,
                     '--zone', zone], system=True)
            except Exception, mesg:
                log("WARNING: issue making snapshot %s -- %s", target, mesg)

    def create_all_data_snapshots(self):
        log("snapshotting a database node")
        self.create_data_snapshot(node=0, prefix='smc', zone='us-central1-c', devel=False)
        log("snapshotting storage data")
        self.create_data_snapshot(node=0, prefix='storage', zone='us-central1-c', devel=False)
        log("snapshotting live user data")
        for n in ['1-amath', '2-amath', '0', '1', '2', '3', '4']:
            self.create_data_snapshot(node=n, prefix='compute', zone='us-central1-c', devel=False)

    def _create_smc_server(self, node, zone='us-central1-c', machine_type='n1-highmem-2',
                          disk_size=100, network='default', devel=False):
        zone = self.expand_zone(zone)
        name = self.instance_name(node=node, prefix='smc', zone=zone, devel=devel)
        disk_name = "%s-cassandra"%name

        log("creating hard disk root filesystem image")
        try:
            cmd(['gcloud', 'compute', '--project', self.project, 'disks', 'create', name,
                 '--zone', zone, '--source-snapshot', self.newest_snapshot('smc'),
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

        if devel:
            self.set_boot_auto_delete(name=name, zone=zone)

    def set_boot_auto_delete(self, name, zone):
        log("set boot disk of %s to auto-delete"%name)
        cmd(['gcloud', 'compute', '--project', self.project, 'instances',
             'set-disk-auto-delete', name,
             '--zone', zone, '--disk', name, '--auto-delete'])

    def create_smc_server(self, node, zone='us-central1-c', machine_type='n1-highmem-2'):
        self._create_smc_server(node=node, zone=zone, machine_type=machine_type,
                                disk_size=100, network='default', devel=False)

    def create_devel_smc_server(self, node, zone='us-central1-c'):
        self._create_smc_server(node=node, zone=zone, machine_type='g1-small',
                                disk_size=0, network='devel', devel=True)

    def _create_storage_server(self, node, zone, machine_type,
                               disk_size, network, devel):
        zone = self.expand_zone(zone)
        name = self.instance_name(node=node, prefix='storage', zone=zone, devel=devel)
        disk_name = "%s-projects"%name

        log("creating hard disk root filesystem image")
        try:
            cmd(['gcloud', 'compute', '--project', self.project, 'disks', 'create', name,
                 '--zone', zone, '--source-snapshot', self.newest_snapshot('storage'),
                 '--type', 'pd-standard'])
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise

        if disk_size:
            log("creating persistent disk on which to store projects")
            try:
                cmd(['gcloud', 'compute', '--project', self.project, 'disks', 'create', disk_name,
                    '--size', disk_size, '--zone', zone, '--type', 'pd-standard'])
            except Exception, mesg:
                if 'already exists' not in str(mesg):
                    raise

        log("create storage compute instance")
        opts = (['gcloud', 'compute', '--project', self.project, 'instances', 'create', name,
             '--zone', zone, '--machine-type', machine_type, '--network', network,
             '--maintenance-policy', 'MIGRATE', '--scopes'] +
                ([] if devel else ['https://www.googleapis.com/auth/devstorage.full_control']) +
             ['https://www.googleapis.com/auth/logging.write',
              '--disk=name=%s,device-name=%s,mode=rw,boot=yes'%(name, name)] +
                ([] if devel else ['--no-boot-disk-auto-delete'])
               )
        if disk_size:
            opts.extend(['--disk=name=%s,device-name=%s,mode=rw'%(disk_name, disk_name)])
        try:
            cmd(opts)
        except Exception, mesg:
            if 'already exists' not in str(mesg):
                raise

        if devel:
            self.set_boot_auto_delete(name=name, zone=zone)

    def create_storage_server(self, node, zone='us-central1-c', machine_type='n1-standard-1'):
        # not tested!
        self._create_storage_server(node=node, zone=zone, machine_type=machine_type,
                                    disk_size=2000, network='default', devel=False)

    def create_devel_storage_server(self, node, zone='us-central1-c', machine_type='f1-micro'):
        self._create_storage_server(node=node, zone=zone, machine_type=machine_type,
                                    disk_size=10, network='devel', devel=True)

    def stop_devel_instances(self):
        for x in cmd(['gcloud', 'compute', 'instances', 'list']).splitlines()[1:]:
            v = x.split()
            name         = v[0]
            if '-devel-' in name:
                zone         = v[1]
                status       = v[-1]
                if status == "RUNNING":
                    log("stopping %s"%name)
                    cmd(['gcloud', 'compute', 'instances', 'stop', '--zone', zone, name])

    def delete_devel_instances(self):
        for x in cmd(['gcloud', 'compute', 'instances', 'list'], verbose=0).splitlines()[1:]:
            v = x.split()
            name         = v[0]
            if '-devel-' in name:
                zone         = v[1]
                status       = v[-1]
                log("deleting devel instance: %s"%name)
                cmd(['gcloud', 'compute', 'instances', 'delete', '--zone', zone, name], system=True)

    def devel_etc_hosts(self):
        hosts = []
        for x in cmd(['gcloud', 'compute', 'instances', 'list'], verbose=0).splitlines()[1:]:
            v = x.split()
            name         = v[0]
            if '-devel-' in name:
                i = name.find('-devel')
                hosts.append("%s %s %s"%(v[4], v[0], v[0][:i+6]))
        if hosts:
            print "\n".join(hosts)
            x = open("/etc/hosts").readlines()
            y = [a.strip() for a in x if '-devel-' not in a]
            open('/tmp/hosts','w').write('\n'.join(y+hosts))
            cmd("sudo cp -v /etc/hosts /etc/hosts.0 && sudo cp -v /tmp/hosts /etc/hosts", system=True)

    def start_devel_instances(self):
        for x in cmd(['gcloud', 'compute', 'instances', 'list']).splitlines()[1:]:
            v = x.split()
            name         = v[0]
            if '-devel-' in name:
                zone         = v[1]
                status       = v[-1]
                if status == "TERMINATED":
                    log("starting %s"%name)
                    cmd(['gcloud', 'compute', 'instances', 'start', '--zone', zone, name])

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
            if name.startswith(prefix) and 'devel' not in name: #TODO
                names.append(name)
        names = ','.join(names)
        cmd(['gcloud', 'compute', 'project-info', 'add-metadata', '--metadata', "%s-servers=%s"%(prefix, names)])

    def delete_all_old_snapshots(self, max_age_days=7, quiet=False):
        snapshots = [x.split()[0] for x in cmd(['gcloud', 'compute', 'snapshots', 'list']).splitlines()[1:]]
        log("snapshots=%s", snapshots)
        # restrict to snapshots that end with a timestamp
        # and for each restructure by base
        w = {}
        n = len('2015-05-03-081013')
        for s in snapshots:
            try:
                time.strptime(s[-n:], TIMESTAMP_FORMAT)
                base = s[:-n]
                if base in w:
                    w[base].append(s[-n:])
                else:
                    w[base] = [s[-n:]]
            except: pass
        print w

        # now decide what to delete
        to_delete = []
        cutoff = time.strftime(TIMESTAMP_FORMAT, time.gmtime(time.time()-60*60*24*max_age_days))
        for base in w:
            v = w[base]
            v.sort()
            if len(v) <= 1 or v[0] >= cutoff:
                # definitely don't delete last one or if all are new
                continue
            for x in v:
                if x < cutoff:
                    to_delete.append(base + x)

        if len(to_delete) == 0:
            log("no old snapshots to delete")
        else:
            log("deleting these snapshots: %s", to_delete)
            a = ['gcloud', 'compute', 'snapshots', 'delete']
            if quiet:
                a.append("--quiet")
            cmd(a + to_delete, system=True)

    def snapshot_usage(self):  # in gigabytes
        usage = 0
        for s in json.loads(cmd(['gcloud', 'compute', 'snapshots', 'list', '--format', 'json'], verbose=0)):
            usage += float(s["storageBytes"])/1000/1000/1000.
        return int(math.ceil(usage))

    def snapshot_costs(self):
        usage = self.snapshot_usage()
        cost = usage*PRICING['snapshot']
        log("SNAPSHOT     : snapshot storage of %sGB:  %s/month", usage, money(cost))
        return cost

    def disk_costs(self):
        cost = 0
        usage_standard = 0
        usage_ssd = 0
        for x in cmd(['gcloud', 'compute', 'disks', 'list'], verbose=0).splitlines()[1:]:
            v = x.split()
            size = int(v[2])
            typ = v[3]
            if typ == 'pd-ssd':
                usage_ssd += size
            elif typ == 'pd-standard':
                usage_standard += size
            cost += size * PRICING[typ]
        log("DISK         : storage (standard=%sGB, ssd=%sGB): %s/month",
            usage_standard, usage_ssd, money(cost))
        return cost

    def instance_costs(self):
        cost = cost_upper = 0
        n_compute = 0
        n_smc = 0
        n_other = 0
        for x in cmd(['gcloud', 'compute', 'instances', 'list'], verbose=0).splitlines()[1:]:
            v = x.split()
            zone         = v[1]
            machine_type = v[2]
            status       = v[-1]
            if v[0].startswith('compute'):
                n_compute += 1
            elif v[0].startswith('smc'):
                n_smc += 1
            else:
                n_other += 1
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
        log("INSTANCES    : compute=%s, smc=%s, other=%s: %s/month (or %s/month with sustained use)",
            n_compute, n_smc, n_other, money(cost_upper), money(cost))
        return cost_upper

    def network_costs(self):
        # These are estimates based on usage during March and April.  May be lower in future
        # do to moving everything to GCE.  Not sure.
        costs = 1500 * PRICING['egress'] + 15*PRICING['egress-australia'] + 15*PRICING['egress-china']
        log("NETWORK      : approx. %s/month", money(costs))
        return costs

    def gcs_costs(self):
        # usage based on running "time gsutil du -sch" every once in a while, since it takes
        # quite a while to run.
        cassandra = 200
        database_backup	= 200
        gb_archive = 650  # delete in a few weeks...
        projects_backup = 1500

        usage = (database_backup + gb_archive + projects_backup)
        costs = usage * PRICING['gcs-nearline']
        log("CLOUD STORAGE: approx. %sGB nearline: %s/month", usage, money(costs))
        return costs

    def costs(self):
        costs = {}
        total = 0
        for t in ['snapshot', 'disk', 'instance', 'network', 'gcs']:
            costs[t] = getattr(self, '%s_costs'%t)()
            total += costs[t]
        log("TOTAL        : %s/month", money(total))
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
    parser_create_compute_server.add_argument('--projects_size', help="", type=int, default=500)
    parser_create_compute_server.add_argument('--machine_type', help="", type=str, default="n1-highmem-4")
    f(parser_create_compute_server)

    parser_create_devel_compute_server = subparsers.add_parser('create_devel_compute_server', help='')
    parser_create_devel_compute_server.add_argument('node', help="", type=str)
    parser_create_devel_compute_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    f(parser_create_devel_compute_server)

    parser_create_smc_server = subparsers.add_parser('create_smc_server', help='')
    parser_create_smc_server.add_argument('node', help="", type=str)
    parser_create_smc_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_smc_server.add_argument('--machine_type', help="", type=str, default="n1-highmem-2")
    f(parser_create_smc_server)

    parser_create_devel_smc_server = subparsers.add_parser('create_devel_smc_server', help='')
    parser_create_devel_smc_server.add_argument('node', help="", type=str)
    parser_create_devel_smc_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    f(parser_create_devel_smc_server)

    parser_create_storage_server = subparsers.add_parser('create_storage_server', help='')
    parser_create_storage_server.add_argument('node', help="", type=str)
    parser_create_storage_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_storage_server.add_argument('--machine_type', help="", type=str, default="n1-highcpu-2")
    f(parser_create_storage_server)

    parser_create_devel_storage_server = subparsers.add_parser('create_devel_storage_server', help='')
    parser_create_devel_storage_server.add_argument('node', help="", type=str)
    parser_create_devel_storage_server.add_argument('--zone', help="", type=str, default="us-central1-c")
    f(parser_create_devel_storage_server)

    f(subparsers.add_parser("stop_devel_instances", help='stop all the *devel* instances'))
    f(subparsers.add_parser("start_devel_instances", help='start all the *devel* instances running'))
    f(subparsers.add_parser("delete_devel_instances", help='completely delete all the *devel* instances'))
    f(subparsers.add_parser("devel_etc_hosts", help='add external devel instance ips to /etc/hosts'))

    parser_create_boot_snapshot = subparsers.add_parser('create_boot_snapshot', help='')
    parser_create_boot_snapshot.add_argument('node', help="", type=str)
    parser_create_boot_snapshot.add_argument('prefix', help="", type=str)
    parser_create_boot_snapshot.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_boot_snapshot.add_argument("--devel", default=False, action="store_const", const=True)
    f(parser_create_boot_snapshot)

    f(subparsers.add_parser('create_all_boot_snapshots', help='snapshot all boot images of production machines'))

    parser_create_data_snapshot = subparsers.add_parser('create_data_snapshot', help='')
    parser_create_data_snapshot.add_argument('node', help="", type=str)
    parser_create_data_snapshot.add_argument('prefix', help="", type=str)
    parser_create_data_snapshot.add_argument('--zone', help="", type=str, default="us-central1-c")
    parser_create_data_snapshot.add_argument("--devel", default=False, action="store_const", const=True)
    f(parser_create_data_snapshot)

    f(subparsers.add_parser('create_all_data_snapshots', help='snapshot all data images of production machines'))

    parser_delete_all_old_snapshots = subparsers.add_parser('delete_all_old_snapshots',
        help='delete every snapshot foo-[date] such that there is a newer foo-[data_newer] *and* foo-[date] is older than max_age_days')
    parser_delete_all_old_snapshots.add_argument('--max_age_days', help="", type=int, default=7)
    parser_delete_all_old_snapshots.add_argument("--quiet",
          help="Disable all interactive prompts when running gcloud commands. If input is required, defaults will be used.",
          default=False, action="store_const", const=True)
    f(parser_delete_all_old_snapshots)

    for cost in ['snapshot_', 'disk_', 'instance_', 'network_', 'gcs_', '']:
        f(subparsers.add_parser('%scosts'%cost))

    parser_set_metadata = subparsers.add_parser('set_metadata', help='')
    parser_set_metadata.add_argument('--prefix', help="", type=str, default="")
    f(parser_set_metadata)

    args = parser.parse_args()
    args.func(args)
