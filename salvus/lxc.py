#!/usr/bin/env python
"""
lxc.py -- create and run an ephemeral LXC containers with the given memory, cpus, and other
          limitations.   When this script terminates, the LXC container vanishes.
"""

#######################################################################
# Copyright (c) William Stein, 2013.  Not open source or free.
#######################################################################

import logging, os, shutil, socket, tempfile, time
from admin import run, sh
conf_path = os.path.join(os.path.split(os.path.realpath(__file__))[0], 'conf')

def run_lxc(ip_address, hostname, base='base'):
    # If the container already exists, exit with an error
    if run(['sudo', 'lxc-ls', hostname]).strip():
        raise RuntimeError("there is already a container %s"%hostname)

    # Create the ephemeral container
    run(["sudo", "lxc-clone", "-s", "-B", "overlayfs", "-o", base, "-n", hostname])

    # [ ] Configure the tinc network

    # Start the container
    s = ["sudo", "lxc-start", "-d", "-n", hostname]
    run(s, maxtime=10)

    try:
        # Wait for the container to stop
        run(['sudo', 'lxc-wait', '-n', hostname, '-s', 'STOPPED'], maxtime=0)
    finally:
        # Stop and remove the container.
        run(['sudo', 'lxc-destroy', '-f', '-n', hostname])



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="lxc.py starts LXC container with given configuration")

    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the VPN")
    parser.add_argument("--hostname", dest="hostname", type=str, required=True,
                        help="hostname of the virtual machine on the VPN")
    parser.add_argument("--vcpus", dest="vcpus", type=str, default="2",
                        help="number of virtual cpus")
    parser.add_argument("--ram", dest="ram", type=int, default=4,
                        help="Gigabytes of ram")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--bind", dest="bind", type=str, default="",
                        help="bind directories")
    parser.add_argument('--base', dest='base', type=str, default='base',
                        help="template container on which to base this container.")

    args = parser.parse_args()

    if args.logfile:
        args.logfile = os.path.abspath(args.logfile)
    if args.pidfile:
        args.pidfile = os.path.abspath(args.pidfile)
    if args.ip_address.count('.') != 3 or not args.ip_address.startswith('10.'):
        sys.stderr.write("%s: invalid ip address %s"%(sys.argv[0], args.ip_address))
        sys.exit(1)

    args.hostname = args.hostname if args.hostname else args.ip_address.replace('.','dot')

    def main():
        global log

        logging.basicConfig()
        log = logging.getLogger('lxc')
        log.setLevel(logging.INFO)

        if args.log_level:
            level = getattr(logging, args.log_level.upper())
            log.setLevel(level)

        if args.logfile:
            log.addHandler(logging.FileHandler(args.logfile))

        import admin   # take over the admin logger
        admin.log = log

        log.info("logger started")

        if args.pidfile:
            open(args.pidfile,'w').write(str(os.getpid()))

        run_lxc(ip_address=args.ip_address, hostname=args.hostname, base=args.base)

    try:
        if args.daemon:
            if not args.pidfile:
                raise ValueError("in daemon mode, the pidfile must be specified")
            import daemon
            daemon.daemonize(args.pidfile)
            main()
        else:
            main()
    finally:
        if args.pidfile and os.path.exists(args.pidfile):
            os.unlink(args.pidfile)
