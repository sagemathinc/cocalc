import os, shutil, socket, tempfile, time

import daemon

from admin import sh

def virsh(command, name):
    return sh['virsh', '--connect', 'qemu:///session', command, name].strip()

def run_vm(ip_address, machine_type, pidfile, vcpus=2, ram=4096):
    #################################
    # create the copy-on-write image
    #################################
    vm_path = os.path.join(os.environ['HOME'], 'vm')
    new_img = os.path.join(vm_path, ip_address + '.img')
    base_img = os.path.join(vm_path, 'salvus_base.img')
    sh['qemu-img', 'create', '-b', base_img, '-f', 'qcow2', new_img]
    
    #################################
    # configure the vm's image
    #################################
    # - mount the image in a temp directory
    tmp_path = tempfile.mkdtemp()
    sh['guestmount', '-i', '-a', new_img, '--rw', tmp_path]
    tinc_path = os.path.join(mnt, 'home/salvus/salvus/salvus/data/local/etc/tinc/')
    open(os.path.join(tinc_path, 'tinc-up'),'w').write(
        "#!/bin/sh\nifconfig $INTERFACE %s netmask 255.255.0.0"%ip_address)
    open(os.path.join(tinc_path, 'tinc.conf'),'w').write(
        "Name = %s\nConnectTo = %s"%(ip_address, socket.gethostname()))
    sh['tincd', '--config', tinc_path, '-K']
    host_file = os.path.join(tinc_path, ip_address)
    open(host_file,'w').write("Subnet = %s/32\n%s"%(
        ip_address, open(os.path.join(tinc_path, 'rsa_key.priv')).read().strip()))
    # put the tinc public key in our local db, so that the vm can connect to host.
    shutil.copyfile(host_file, os.path.join(os.path.realpath(__file__),
                                            'conf', 'tinc_hosts', ip_address))
    # - unmount image and remove tmp_path
    sh['fusermount', '-u', tmp_path]
    os.unlink(tmp_path)

    #################################
    # create and start the vm itself
    #################################
    sh['virt-install', '--cpu', 'host', '--network', 'user,model=virtio', '--name',
       ip_address, '--vcpus',vcpus, '--ram', ram, '--import', '--disk',
       new_img + ',device=disk,bus=virtio,format=qcow2', '--noautoconsole']

    ##########################################################################
    # - run until vm terminates or we receive term signal, undefined, destroy
    ##########################################################################
    try:
        while virsh('domstate', ip_address) == 'running':
            time.sleep(1)
    except:
        # clean up
        virsh('destroy', ip_address)
        virsh('undefine', ip_address)
        os.unlink(new_img)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="vm.py starts a virtual machine with a given IP address and type on this computer.")

    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the VPN")
    parser.add_argument("--machine_type", dest="machine_type", type=str, required=True,
                        help="type of virtual machine: one of 'sage', 'web', 'cassandra'")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")

    args = parser.parse_args()

    if args.daemon and not args.pidfile:
        print "%s: must specify pidfile in daemon mode"%sys.argv[0]
        sys.exit(1)

    main = lambda: run_vm(ip_address=args.ip_address, machine_type=args.machine_type, pidfile=args.pidfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
