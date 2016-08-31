import os

project_id = os.environ['SMC_PROJECT_ID']
import hashlib
n = int(hashlib.sha512(project_id).hexdigest()[:8], 16) // 2
UID = n if n>65537 else n+65537

def cmd(s):
    print(s)
    return os.system(s)

def block_all_external_traffic():
    print("block_all_external_traffic:")
    print("Block all newly initiated outgoing connections")
    cmd("iptables -I OUTPUT -m state --state NEW -m owner --uid-owner %s -j REJECT"%UID)
    print("Allow connections on localhost, so e.g., Terminals will work.")
    cmd("iptables -I OUTPUT -o lo -j ACCEPT")

def block_local_external_traffic():
    print("block_local_external_traffic: block newly initiated outoing connections to the 10.x local subnet 10.0.0.0/8")
    cmd("iptables -I OUTPUT -m state --state NEW -d 10.0.0.0/8 -j DROP")
    print("but do not block the nameserver, so we have DNS")
    nameserver = None
    for x in open('/etc/resolv.conf').read().splitlines():
        v = x.split()
        if v[0] == 'nameserver':
            nameserver = v[1]
            break
    if nameserver is None:
        raise RuntimeError("unable to determine nameserver")
    cmd("iptables -I OUTPUT -m state --state NEW -d {nameserver} -j ACCEPT".format(nameserver=nameserver))

if os.environ.get('SMC_NETWORK', 'false') == 'false':
    block_all_external_traffic()
else:
    block_local_external_traffic()

while True:
    import time; time.sleep(3600)
