#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



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
