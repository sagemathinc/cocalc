import daemon

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="vm.py starts a virtual machine with a given IP address and type on this computer.")

    parser.add_argument("--ip_address", dest="ip_address", type=str, required=True,
                        help="ip address of the virtual machine on the VPN")
    parser.add_argument("--machine_type", dest="machine_type", type=str, required=True,
                        help="type of virtual machine: one of 'sage', 'web', 'cassandra'")
