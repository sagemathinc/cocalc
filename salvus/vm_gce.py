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
        out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
        x = (out.stdout.read() + out.stderr.read()).strip()
        e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
        if e:
            if ignore_errors:
                return (x + "ERROR").strip()
            else:
                raise RuntimeError(x)
        if verbose>=2:
            log.info("(%s seconds): %s"%(time.time()-t, x))
        elif verbose >= 1:
            log.info("(%s seconds)"%(time.time()-t))
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

def print_json(s):
    print json.dumps(s, separators=(',',':'))

def gcutil(command, args=[], verbose=2, ignore_errors=False, interactive=False):
    # gcutil [--global_flags] <command> [--command_flags] [args]
    v = (['gcutil', '--service_version', 'v1', '--project', 'sagemathcloud', '--format', 'json'] +
         [command] +
         args)
    if interactive:
        s = ' '.join([x if len(x.split()) <=1  else "'%s'"%x for x in v])
        log.info(s)
        os.system(s)
    else:
        return cmd(v, verbose=True, timeout=600, ignore_errors=ignore_errors)

class Instance(object):
    def __init__(self, hostname, zone):
        self.hostname = hostname
        self.zone     = zone

    def log(self, s, *args):
        log.info("Instance(hostname=%s, zone=%s).%s", self.hostname, self.zone, s%args)

    def gcutil(self, command, *args, **kwds):
        return gcutil(command, [self.hostname, '--zone', self.zone] + list(args), **kwds)

    def status(self):
        self.log("status()")
        s = {'hostname':self.hostname}
        v = self.gcutil("getinstance", verbose=False, ignore_errors=True)
        if 'ERROR' in v:
            if 'was not found' in v:
                s['status'] = 'stopped'
                return s
            else:
                raise RuntimeError(v)
        v = json.loads(v)
        s['status'] = v['status'].lower()
        s['zone']   = v['zone'].split('/')[-1]
        s['type']   = v['machineType'].split('/')[-1]
        s['disks']  = [{'name':a['deviceName']} for a in v['disks']]
        return s

    def ssh(self):
        gcutil("ssh", [self.hostname], interactive=True)

    def stop(self):
        self.log("stop()")
        raise NotImplementedError

    def _disk_name(self, name):
        return "%s-%s"%(self.hostname, name)

    def start(self, ip_address, disks, base, instance_type, zone):
        self.log("start(ip_address=%s, disks=%s, base=%s, instance_type=%s, zone=%s)", ip_address, disks, base, instance_type, zone)
        assert ip_address.startswith('10.'), "ip address must belong to the class A network 10."

        # check if machine exists (is running, stopping, etc.), in which case start can't be done.
        status = self.status()['status']
        if  status != 'stopped':
            raise RuntimeError("can't start because instance state is %s"%status)

        # create any disks that don't already exist
        for name, size_gb in disks:  # list of pairs, name:size (in GB as string)
            if not self.disk_exists(name):
                self.create_disk(name, int(size_gb))

        # create the machine

        raise NotImplementedError

    def disk_exists(self, name):
        self.log("disk_exists(%s)",name)
        gce_name = self._disk_name(name)
        v = gcutil("getdisk", [gce_name, '--zone', self.zone], ignore_errors=True)
        if 'ERROR' in v:
            if 'was not found' in v: # disk doesn't exist
                return False
            else:
                raise RuntimeError(v) # some other error -- give up.
        return True

    def create_disk(self, name, size_gb):
        self.log("create_disk(name=%s, size_gb=%s)", name, size_gb)
        gcutil("adddisk", ['--size_gb', size_gb, '--wait_until_complete', '--zone', self.zone, self._disk_name(name)])

    def delete_disk(self, name):
        self.log("delete_disk(name=%s)", name)
        gcutil("deletedisk", ['--force', '--zone', self.zone, self._disk_name(name)])


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="start/stop(=destroy)/status Google Compute Engine virtual machines with given VPN address")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("--zone", dest="zone", type=str, default="us-central1-a",
                        help="the region in which to spin up the machine (default: us-central1-a); base snapshot must be there.  options: us-central1-a, us-central1-b, europe-west-1-a, europe-west1-b, asia-east1-a, asia-east1-b")

    parser.add_argument("--deamon", dest="daemon", default=False, action="store_const", const=True,
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
    parser_ssh.set_defaults(func=lambda args: print_json(instance.ssh()))

    parser_delete_disk = subparsers.add_parser('delete_disk', help='delete a disk from an instance')
    parser_delete_disk.add_argument("name", help="name of the disk", type=str)
    parser_delete_disk.set_defaults(func=lambda args: instance.delete_disk(args.name))

    parser_stop = subparsers.add_parser('stop', help='completely DESTROY the instance, but *not* the persistent disks')
    parser_stop.set_defaults(func=lambda args: instance.stop())

    parser_start = subparsers.add_parser('start', help="create the instance and any persistent disks that don't exist")
    parser_start.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the tinc VPN")

    parser_start.add_argument("--disks", dest="disks", type=str, default="",
                        help="persistent disks, e.g., '--disks=cassandra:64,logger:128' makes two images of size 64GB and 128GB if they don't exist; they will appear as /dev/sdb, /dev/sdc, etc., in order; their names will actually be hostname-cassandra, hostname-logger")

    parser_start.add_argument('--base', dest='base', type=str, default='salvus',
                        help="snapshot to use for the base disk for this machine")
    parser_start.add_argument("--type", dest="type", type=str, default="n1-standard-1",
                        help="instance type from https://cloud.google.com/products/compute-engine/#pricing")

    parser_start.set_defaults(func=lambda args: instance.start(
                               ip_address    = args.ip_address,
                               disks         = [a.split(':') for a in args.disks.split(',')],
                               base          = args.base,
                               instance_type = args.type,
                               zone          = args.zone))


    args = parser.parse_args()

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
            main()
        else:
            main()
    finally:
        if args.pidfile and os.path.exists(args.pidfile):
            os.unlink(args.pidfile)


