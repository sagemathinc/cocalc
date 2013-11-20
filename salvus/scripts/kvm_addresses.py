#!/usr/bin/env python

import os, sys


def ip_addresses(name):
    mac_to_addr = {}
    for x in os.popen('arp -an').readlines():
        v = x.split()
        mac_to_addr[v[3]] = v[1][1:-1]
    v = os.popen('virsh dumpxml "%s"'%name).readlines()
    ans = []
    for x in v:
        if 'mac address' in x:
            mac = x.split("'")[1]
            if mac in mac_to_addr:
                ans.append(mac_to_addr[mac])
    return ans


if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.stderr.write("""
Get ip addresses of a KVM virtual machine (not vpn related), one per line:

    Usage: %s [name of machine]
"""%sys.argv[0])
        sys.exit(1)

    for x in ip_addresses(sys.argv[1]):
        print x
