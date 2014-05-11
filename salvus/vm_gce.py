#!/usr/bin/env python
"""
vm_gce.py -- create and run a virtual machines on Google Compute Engine based
         on the standard salvus_base template with the given memory and
         vcpus, and add the vm to our tinc VPN infrastructure.  There is also
         a destroy option that destroys the vm.

Philosophically this script lets of view instances more like *daemons/services*,
and provides a vastly simpler interface than gcutil.
"""

#######################################################################
# Copyright (c) William Stein, 2014.  Not open source or free.
#######################################################################

import json, logging, os, shutil, signal, socket, tempfile, time
from subprocess import Popen, PIPE

import misc

GCUTIL = '/home/salvus/google-cloud-sdk/bin/gcutil'

def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True):
    if isinstance(s, list):
        s = [str(x) for x in s]
    if verbose >= 1:
        if isinstance(s, list):
            t = [x if len(x.split()) <=1  else "'%s'"%x for x in s]
            log.info(' '.join(t))
        else:
            log.info(s)
    t = time.time()

    mesg = "ERROR"
    if timeout:
        mesg = "TIMEOUT: running '%s' took more than %s seconds, so killed"%(s, timeout)
        def handle(*a):

            if ignore_errors:
                return mesg
            else:
                raise KeyboardInterrupt(mesg)
        signal.signal(signal.SIGALRM, handle)
        signal.alarm(timeout)
    try:
        p = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
        out = p.stdout.read()
        err = p.stderr.read()
        e = p.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
        if e:
            if ignore_errors:
                return (out+err + "ERROR").strip()
            else:
                raise RuntimeError(out+err)
        else:
            x = ((out if stdout else '') + (err if stderr else '')).strip()
        if verbose>=2:
            log.info("(%s seconds): %s"%(time.time()-t, x))
        elif verbose >= 1:
            log.info("(%s seconds)"%(time.time()-t))
        return x
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

def print_json(s):
    print json.dumps(s, separators=(',',':'))

def gcutil(command, args=[], verbose=2, ignore_errors=False, interactive=False):
    # gcutil [--global_flags] <command> [--command_flags] [args]
    v = ([GCUTIL, '--service_version', 'v1', '--project', 'sagemathcloud', '--format', 'json'] +
         [command] +
         args)
    if interactive:
        s = ' '.join([x if len(x.split()) <=1  else "'%s'"%x for x in v])
        log.info(s)
        os.system(s)
    else:
        return cmd(v, verbose=True, timeout=600, ignore_errors=ignore_errors, stderr=False)

def disk_exists(name, zone):
    log.info("disk_exists(%s,%s)", name, zone)
    v = gcutil("getdisk", [name, '--zone', zone], ignore_errors=True)
    if 'ERROR' in v:
        if 'was not found' in v: # disk doesn't exist
            return False
        else:
            raise RuntimeError(v) # some other error -- give up.
    return True

def get_snapshots(zone, prefix=''):
    log.info("get_snapshots(zone=%s)"%zone)
    v = json.loads(gcutil("listsnapshots", ['--filter', 'name eq %s.*'%prefix, '--sort_by', 'name']))['items']
    return [{'name':x['name'], 'size_gb':x["diskSizeGb"]} for x in v]

class Instance(object):
    def __init__(self, hostname, zone):
        self.hostname = hostname
        self.instance_name = 'smc-' + hostname
        self.tinc_name = "smc_gce_" + hostname.replace('-','_')
        self.zone     = zone

    def log(self, s, *args):
        log.info("Instance(hostname=%s, zone=%s).%s", self.hostname, self.zone, s%args)

    def gcutil(self, command, *args, **kwds):
        return gcutil(command, [self.instance_name, '--zone', self.zone] + list(args), **kwds)

    def status(self):
        self.log("status()")
        s = {'hostname':self.hostname, 'instance_name':self.instance_name}
        v = self.gcutil("getinstance", verbose=False, ignore_errors=True)
        if 'ERROR' in v:
            if 'was not found' in v:
                s['state'] = 'stopped'
                return s
            else:
                raise RuntimeError(v)
        v = json.loads(v)
        s['state']  = v['status'].lower()
        s['zone']   = v['zone'].split('/')[-1]
        s['type']   = v['machineType'].split('/')[-1]
        s['disks']  = [{'name':a['deviceName']} for a in v['disks']]
        for k in v['networkInterfaces']:
            for a in k['accessConfigs']:
                if a['name'] == 'External NAT':
                    s['external_ip'] = a['natIP']
        return s

    def external_ip(self):
        return self.status()['external_ip']

    def interactive_ssh(self):
        gcutil("ssh", [self.instance_name], interactive=True)

    def reset(self): # hard reboot
        self.gcutil("resetinstance")

    def stop(self):
        self.log("stop()")
        try:
            # at least make an attempt at a proper shutdown; ZFS and other things might like this.
            self.ssh("shutdown -h now", user='root', timeout=30)
        except Exception, err:
            # normal -- we would typically get an error when kicked out during shutdown; and often run stop because machine is hung.
            self.log("stop(): WARNING: err=%s", err)
        self.delete_instance()

    def _disk_name(self, name):
        return "%s-%s"%(self.instance_name, name)

    def start(self, ip_address, disks, base, instance_type):
        self.log("start(ip_address=%s, disks=%s, base=%s, instance_type=%s)", ip_address, disks, base, instance_type)
        assert ip_address.startswith('10.'), "ip address must belong to the class A network 10."

        self.log("start: check if machine exists (is running, stopping, etc.), in which case start can't be done.")
        state = self.status()['state']
        if state != 'running':

            self.log("start: create any disks that don't already exist")
            disk_names = []
            for name, size_gb in disks:  # list of pairs, (name, size)
                if not self.disk_exists(name):
                    self.create_disk(name, int(size_gb))
                disk_names.append(name)

            self.log("start: create the instance itself")
            self.create_instance(disk_names=disk_names, base=base, instance_type=instance_type)

        self.log("start: initialize the base ZFS pool")
        self.init_base_pool()

        self.log("start: set the hostname of the machine")
        self.init_hostname()

        self.log("start: add the machine to the vpn")
        self.configure_tinc(ip_address)

    def disk_exists(self, name):
        self.log("disk_exists(%s)",name)
        return disk_exists(name=self._disk_name(name), zone=self.zone)

    def create_disk(self, name, size_gb):
        self.log("create_disk(name=%s, size_gb=%s)", name, size_gb)
        gcutil("adddisk", ['--size_gb', size_gb, '--wait_until_complete', '--zone', self.zone, self._disk_name(name)])

    def delete_disk(self, name):
        self.log("delete_disk(name=%s)", name)
        gcutil("deletedisk", ['--force', '--zone', self.zone, self._disk_name(name)])

    def create_instance(self, disk_names, base, instance_type):
        self.log("create_instance(disk_names=%s, base=%s, instance_type=%s)", disk_names, base, instance_type)

        if not base:
            self.log("start: determining optimal base image")
            base = get_snapshots(zone=self.zone, prefix='salvus-')[-1]['name']
            self.log("start: using base='%s'"%base)

        if not disk_exists(name=self.instance_name, zone=self.zone):
            self.log("create_instance -- creating boot disk based on '%s' (this takes about 2 minutes!)"%base)
            gcutil("adddisk", ['--zone', self.zone, '--source_snapshot', base, '--wait_until_complete', self.instance_name])

        self.log("create_instance -- creating instance")

        args = ['--auto_delete_boot_disk',
                '--automatic_restart',
                '--wait_until_running',
                '--machine_type', instance_type,
                '--disk', "%s,mode=rw,boot"%self.instance_name]

        for name in disk_names:
            args.append("--disk")
            args.append("%s,mode=rw"%self._disk_name(name))

        self.gcutil("addinstance", *args)

    def ssh(self, c, max_tries=1, user='salvus', timeout=120):
        if '"' in c:
            raise NotImplementedError
        s = 'ssh -o StrictHostKeyChecking=no  -o ConnectTimeout=%s %s@%s "%s"'%(timeout, user, self.external_ip(), c)
        tries = 0
        while tries < max_tries:
            try:
                return cmd(s, verbose=2, stderr=False)
            except RuntimeError, msg:
                tries += 1
                log.info("FAIL (%s/%s): %s", tries, max_tries, msg)
                log.info("trying again in 3 seconds...")
                time.sleep(3)
        raise RuntimeError("failed too many times: %s"%s)


    def init_base_pool(self):
        self.log("init_base_pool: export and import the pool, and make sure mounted")
        self.ssh("zpool export pool; zpool import -f pool; df -h |grep pool", max_tries=10, user='root')

    def init_hostname(self):
        self.ssh("echo '%s' > /etc/hostname && hostname %s && echo '127.0.1.1  %s' >> /etc/hosts"%(self.hostname, self.hostname, self.hostname), user='root')

    def tinc_servers(self):
        tinc_hosts = "/home/salvus/salvus/salvus/conf/tinc_hosts"
        v = []
        for x in os.listdir(tinc_hosts):
            r = open(os.path.join(tinc_hosts,x)).read().lower()
            if 'not server' in r:
                continue
            i = r.find('address')
            if i != -1:
                r = r[i:]
                j = r.find("\n")
                v.append( (r[:j].split('=')[1].strip(), x) )
        return v

    def configure_tinc(self, ip_address):
        self.log("configure_tinc(ip_address=%s)", ip_address)
        self.delete_tinc_public_keys()
        s = self.ssh("cd salvus/salvus && . salvus-env && configure_tinc.py init %s %s %s"%(self.external_ip(), ip_address, self.tinc_name), user='salvus')
        v = json.loads(s)
        tinc_hosts = "/home/salvus/salvus/salvus/conf/tinc_hosts"
        host_filename = os.path.join(tinc_hosts, self.tinc_name)
        open(host_filename,'w').write(v['host_file'])
        hostname = socket.gethostname()
        connect_to = []
        def f(host):
            try:
                os.popen("scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 %s %s:%s"%(host_filename, host[0], host_filename))
                # success
                connect_to.append(host[1])
            except Exception, msg:
                self.log("configure_tinc -- WARNING: unable to copy tinc key to %s -- %s", host, msg)
        log.info("configure_tinc -- copying out public key")
        misc.thread_map(f, [((host,),{}) for host in self.tinc_servers() if host[1] != hostname])

        log.info("configure_tinc -- appending ConnectTo information")
        self.ssh("cd salvus/salvus && . salvus-env && configure_tinc.py connect_to %s"%(' '.join(connect_to)), user='salvus')

        log.info("Start tinc running...")
        self.ssh("killall -9 tincd; sleep 3; nice --19 /home/salvus/salvus/salvus/data/local/sbin/tincd", user='root')


    def delete_tinc_public_keys(self):
        self.log("delete_tinc_public_keys() -- deleting the tinc public key files on the UW hosts")
        host_filename = os.path.join("/home/salvus/salvus/salvus/conf/tinc_hosts", self.tinc_name)
        print 'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 %s "rm -f %s"'%('host', host_filename)
        def f(host):
            try:
                os.popen('ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 %s "rm -f %s"'%(host[0], host_filename))
            except Exception, msg:
                # There is no real *need* to remove these public keys...
                log.info("WARNING: unable to remove tinc key from %s -- %s", host, msg)
        misc.thread_map(f, [((host,),{}) for host in self.tinc_servers()])

    def delete_instance(self):
        self.log("delete_instance()")

        self.log("deleting the instance from GCE")
        self.gcutil("deleteinstance", '-f', '--delete_boot_pd')



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="start/stop(=destroy)/status Google Compute Engine virtual machines with given VPN address")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("--zone", dest="zone", type=str, default="us-central1-a",
                        help="the region in which to spin up the machine (default: us-central1-a); base snapshot must be there.  options: us-central1-a, us-central1-b, europe-west-1-a, europe-west1-b, asia-east1-a, asia-east1-b")

    parser.add_argument("--daemon", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")

    parser.add_argument("hostname", help="name of the instance", type=str)

    parser_status = subparsers.add_parser('status', help='get status of the given instance')
    parser_status.set_defaults(func=lambda args: print_json(instance.status()))

    parser_ssh = subparsers.add_parser('ssh', help='ssh into this instance')
    parser_ssh.set_defaults(func=lambda args: instance.interactive_ssh())

    parser_reset = subparsers.add_parser('reset', help='hard reboot machine')
    parser_reset.set_defaults(func=lambda args: print_json(instance.reset()))


    parser_delete_disk = subparsers.add_parser('delete_disk', help='delete a disk from an instance')
    parser_delete_disk.add_argument("name", help="name of the disk", type=str)
    parser_delete_disk.set_defaults(func=lambda args: instance.delete_disk(args.name))

    parser_stop = subparsers.add_parser('stop', help='completely DESTROY the instance, but *not* the persistent disks')
    parser_stop.set_defaults(func=lambda args: instance.stop())

    parser_config_tinc = subparsers.add_parser('config_tinc', help="configure tinc")
    parser_config_tinc.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the tinc VPN")
    parser_config_tinc.set_defaults(func=lambda args: instance.configure_tinc(args.ip_address))

    parser_start = subparsers.add_parser('start', help="create the instance and any persistent disks that don't exist")
    parser_start.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the tinc VPN")

    parser_start.add_argument("--disks", dest="disks", type=str, default="",
                        help="persistent disks, e.g., '--disks=cassandra:64,logger:128' makes two images of size 64GB and 128GB if they don't exist; they will appear as /dev/sdb, /dev/sdc, etc., in order; their names will actually be hostname-cassandra, hostname-logger")

    parser_start.add_argument('--base', dest='base', type=str, default='',
                        help="snapshot to use for the base disk for this machine (default: newest with name that starts salvus-)")
    parser_start.add_argument("--type", dest="type", type=str, default="n1-standard-1",
                        help="instance type from https://cloud.google.com/products/compute-engine/#pricing")

    parser_start.set_defaults( func          = lambda args: instance.start(
                               ip_address    = args.ip_address,
                               disks         = [a.split(':') for a in args.disks.split(',')] if args.disks else [],
                               base          = args.base,
                               instance_type = args.type))

    args = parser.parse_args()

    if args.daemon and (not args.logfile or not args.pidfile):
        raise RuntimeError("in deamon mode you must specify the logfile and pidfile")

    def main():
        global log, instance

        logging.basicConfig()
        log = logging.getLogger('vm_gce')
        log.setLevel(logging.INFO)

        if args.loglevel:
            level = getattr(logging, args.loglevel.upper())
            log.setLevel(level)

        if args.logfile:
            log.addHandler(logging.FileHandler(args.logfile))

        import admin   # take over the admin logger
        admin.log = log

        log.info("logger started")

        if args.pidfile:
            open(args.pidfile,'w').write(str(os.getpid()))

        instance = Instance(hostname=args.hostname, zone=args.zone)
        args.func(args)

    try:
        if args.daemon:
            import daemon
            daemon.daemonize(args.pidfile)
            try:
                main()
            except Exception, err:
                import traceback
                log.error("Traceback: %s", traceback.format_exc())
                log.error("Exception running daemon script -- %s", err)
                raise
        else:
            main()
    finally:
        if args.pidfile and os.path.exists(args.pidfile):
            os.unlink(args.pidfile)


