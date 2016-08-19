import os

project_id = os.environ['SMC_PROJECT_ID']
import hashlib
n = int(hashlib.sha512(project_id).hexdigest()[:8], 16) // 2
UID = n if n>65537 else n+65537

def block_all_external_traffic():
    print("block_outgoing_traffic")
    # Block all outgoing connections
    os.system("iptables -I OUTPUT -m state --state NEW -m owner --uid-owner %s -j REJECT"%UID)
    # Except ones on localhost, so e.g., Terminals will work.
    os.system("iptables -I OUTPUT -o lo -j ACCEPT")

def block_local_external_traffic():
    # TODO: not yet done
    pass

if os.environ.get('SMC_NETWORK', 'false') == 'false':
    block_all_external_traffic()
else:
    block_local_external_traffic()

while True:
    import time; time.sleep(3600)
