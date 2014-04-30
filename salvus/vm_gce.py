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

import json, logging, os, shutil, socket, tempfile, time

from admin import run
import admin

sh = admin.SH(maxtime=600)

def print_json(s):
    print json.dumps(s, separators=(',',':'))

def gcutil(command, args=[], verbose=True):
    # gcutil [--global_flags] <command> [--command_flags] [args]
    v = (['gcutil', '--service_version', 'v1', '--project', 'sagemathcloud', '--format', 'json'] +
         [command] +
         args)
    return run(v, verbose=verbose, maxtime=600).strip()

class Instance(object):
    def __init__(self, hostname):
        self.hostname = hostname

    def status(self):
        log.info("status of %s", self.hostname)
        v = gcutil("getinstance", [self.hostname], verbose=False)
        s = {'hostname':self.hostname}
        if not v:
            s['status'] = 'stopped'
            return s
        else:
            v = json.loads(v)
        s['status'] = v['status'].lower()
        s['zone']   = v['zone'].split('/')[-1]
        s['type']   = v['machineType'].split('/')[-1]
        s['disks']  = [{'name':a['deviceName']} for a in v['disks']]
        return s

    def stop(self):
        raise NotImplementedError

    def start(self, ip_address, disks, base, instance_type, zone):
        assert ip_address.startswith('10.'), "ip address must belong to the class A network 10."
        raise NotImplementedError


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="start/stop(=destroy)/status Google Compute Engine virtual machines with given VPN address")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("--deamon", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")

    parser.add_argument("hostname", help="name of the instance", type=str)

    parser_status = subparsers.add_parser('status', help='get status of the given virtual machine')
    parser_status.set_defaults(func=lambda args: print_json(instance.status()))

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
    parser_start.add_argument("--zone", dest="zone", type=str, default="us-central1-a",
                        help="the region in which to spin up the machine (default: us-central1-a); base snapshot must be there.  options: us-central1-a, us-central1-b, europe-west-1-a, europe-west1-b, asia-east1-a, asia-east1-b")

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

        instance = Instance(args.hostname)
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


