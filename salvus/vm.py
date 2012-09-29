#!/usr/bin/env python
"""
vm.py -- create and run a virtual machine based on the standard
         salvus_base template with the given memory and vcpus, and add
         the vm to our tinc VPN.  When this script terminates, the vm
         is destroyed, undefined, and the image file associated with
         it is deleted.
"""

#######################################################################
# Copyright (c) William Stein, 2012.  Not open source or free. Will be
# assigned to University of Washington.
#######################################################################

import logging, os, shutil, socket, tempfile, time

import daemon

from admin import run, sh

conf_path = os.path.join(os.path.split(os.path.realpath(__file__))[0], 'conf')

###########################################
# kvm -- via libvirt
###########################################

def virsh(command, name):
    return run(['virsh', '--connect', 'qemu:///session', command, name], verbose=False).strip()

def run_kvm(ip_address, hostname, vcpus, ram):
    #################################
    # create the copy-on-write image
    #################################
    t = time.time()
    vm_path = os.path.join(os.environ['HOME'], 'vm', 'images')
    new_img = os.path.join(vm_path, ip_address + '.img')
    base_img = os.path.join(vm_path, 'salvus_base.img')
    try:
        sh['qemu-img', 'create', '-b', base_img, '-f', 'qcow2', new_img]
        log.info("created %s in %s seconds", new_img, time.time()-t); t = time.time()

        #################################
        # configure the vm's image
        #################################
        # - mount the image in a temp directory
        try:
            tmp_path = tempfile.mkdtemp()
            try:
                run(['guestmount', '-i', '-a', new_img, '--rw', tmp_path], maxtime=60)

                #### hostname ####
                hostname_file = os.path.join(tmp_path,'etc/hostname')
                os.unlink(hostname_file)
                open(hostname_file,'w').write(hostname)
                hosts_file = os.path.join(tmp_path, 'etc/hosts')
                hosts = open(hosts_file).read()
                os.unlink(hosts_file)
                open(hosts_file,'w').write("%s\n127.0.1.1  %s\n"%(hosts, hostname))

                #### tinc vpn ####

                tinc_path = os.path.join(tmp_path, 'home/salvus/salvus/salvus/data/local/etc/tinc/')
                open(os.path.join(tinc_path, 'tinc-up'),'w').write(
                    "#!/bin/sh\nifconfig $INTERFACE %s netmask 255.255.0.0"%ip_address)
                open(os.path.join(tinc_path, 'tinc.conf'),'w').write(
                    "Name = %s\nConnectTo = %s"%(hostname, socket.gethostname()))
                rsa_key_priv = os.path.join(tinc_path, 'rsa_key.priv')
                rsa_key_pub = os.path.join(tinc_path, 'hosts', hostname)
                if os.path.exists(rsa_key_priv): os.unlink(rsa_key_priv)
                if os.path.exists(rsa_key_pub): os.unlink(rsa_key_pub)
                sh['tincd', '--config', tinc_path, '-K']
                host_file = os.path.join(tinc_path, 'hosts', hostname)
                public_key = open(rsa_key_pub).read().strip()
                open(host_file,'w').write("Subnet = %s/32\n%s"%(ip_address, public_key))
                # put the tinc public key in our local db, so that the vm can connect to host.
                shutil.copyfile(host_file, os.path.join(conf_path, 'tinc_hosts', hostname))
            finally:
                # - unmount image and remove tmp_path
                sh['fusermount', '-u', tmp_path]
        finally:
            shutil.rmtree(tmp_path)

        log.info("configured image in %s seconds", time.time()-t); t = time.time()

        #################################
        # create and start the vm itself
        #################################
        try:
            run(['virt-install', '--cpu', 'host', '--network', 'user,model=virtio', '--name',
               ip_address, '--vcpus', vcpus, '--ram', 1024*ram, '--import', '--disk',
               new_img + ',device=disk,bus=virtio,format=qcow2', '--noautoconsole'], maxtime=60)

            log.info("created new virtual machine in %s seconds -- now running", time.time()-t); t = time.time()

            ##########################################################################
            # - run until vm terminates or we receive term signal, undefined, destroy
            ##########################################################################
            while virsh('domstate', ip_address) == 'running':
                time.sleep(1)
        finally:
            # clean up
            virsh('undefine', ip_address)
            virsh('destroy', ip_address)
            
    finally:
        try: os.unlink(os.path.join(conf_path, 'tinc_hosts', hostname))
        except: pass
        os.unlink(new_img)

def run_virtualbox(ip_address, hostname, vcpus, ram):
    raise NotImplementedError

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="vm.py starts virtual machine with given IP address and type on this computer")

    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--vm_type", dest="vm_type", type=str, default="kvm",
                        help="type of virtual machine to create ('kvm', 'virtualbox')")
    parser.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the VPN")
    parser.add_argument("--hostname", dest="hostname", type=str, default='',
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

    args = parser.parse_args()
    
    if args.logfile:
        args.logfile = os.path.abspath(args.logfile)
    if args.pidfile:
        args.pidfile = os.path.abspath(args.pidfile)
    if args.ip_address.count('.') == 0:
        args.ip_address = '10.38.1.' + args.ip_address
    elif args.ip_address.count('.') == 1:
        args.ip_address = '10.38.' + args.ip_address

    assert args.ip_address.startswith('10.38.'), "ip address must belong to the class B network 10.38."

    args.hostname = args.hostname if args.hostname else args.ip_address.replace('.','dot')

    def main():
        global log

        logging.basicConfig()
        log = logging.getLogger('vm')
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

        if args.vm_type == 'kvm':
            run_kvm(args.ip_address, args.hostname, args.vcpus, args.ram)
        elif args.vm_type == 'virtualbox':
            run_virtualbox(args.ip_address, args.hostname, args.vcpus, args.ram)
        else:
            print "Unknown vm_type '%s'"%args.vm_type
            sys.exit(1)

    try:
        if args.daemon:
            with daemon.DaemonContext():
                main()
        else:
            main()
    finally:
        if args.pidfile:
            os.unlink(args.pidfile)
