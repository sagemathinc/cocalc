import os, shutil, socket, tempfile

from admin import sh
import daemon

HOSTNAME = socket.gethostname()
SALVUS = os.path.realpath(__file__)
os.chdir(os.path.split(SALVUS)[0])

class TincConf(object):
    """
    Generate and store all the tinc configuration files needed by a
    node in a private temp directory, which is deleted when this instance
    goes out of scope.

    Use obj.files() to get a mapping filename:absolute_path_to_file.
    """
    def __init__(self, ip_address):
        path = tempfile.mkdtemp()
        self._path = path

        open(os.path.join(path, 'tinc-up'),'w').write("#!/bin/sh\nifconfig $INTERFACE %s netmask 255.255.0.0"%ip_address)
        open(os.path.join(path, 'tinc.conf'),'w').write("Name = %s\nConnectTo = %s"%(ip_address, HOSTNAME))
        sh['tincd', '--config', path, '-K']
        open(os.path.join(path, ip_address),'w').write(
            "Subnet = %s/32\n%s"%(ip_address,open(os.path.join(path, 'rsa_key.priv')).read().strip()))
        
        self._files = dict([(file, os.path.join(path, file)) for file in ['tinc-up', 'tinc.conf', ip_address, 'rsa_key.pub']])

    def files(self):
        return self._files
        
    def __del__(self):
        shutil.rmtree(self._path)

def run_vm(ip_address, machine_type, pidfile):
    ############################
    # 1. tinc vpn configuration
    ############################
    tinc_conf = TincConf(ip_address)
    files = tinc_conf.files()
    # put the public key in our local db
    shutil.copyfile(files[ip_address], os.path.join('conf', 'tinc_hosts', ip_address))
    
    #################################
    # 2. create and start vm running
    #################################

    # ?  -- need to stay running until vm fails
    

    
    

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
