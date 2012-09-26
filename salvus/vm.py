import daemon

SALVUS = os.path.realpath(__file__)
os.chdir(os.path.split(SALVUS)[0])

def configure_tinc(ip_address):
    tinc_up = "#!/bin/sh\nifconfig $INTERFACE %s netmask 255.255.0.0"%ip_address
    tinc_conf = "Name = %s\nConnectTo = %s"%(ip_address, HOSTNAME)
    
    return {'tinc-up':tinc_up, 'tinc.conf':tinc_conf, 'rsa_key.priv':rsa_key, 'hosts_file':hosts_file}

def run_vm(ip_address, machine_type, pidfile):
    files = configure_tinc(ip_address)
    

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
