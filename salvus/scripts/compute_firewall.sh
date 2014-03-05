#!/bin/bash
# Written by Keith Clawson


# flush table
iptables -F

# default policy: accept all connections
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT
iptables -P FORWARD ACCEPT

# accept any related or established connections, needed for ssh to work
# because it uses a random large port to connect to other machines
iptables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT

# loop over the set of hub nodes
for N in {1..21}
do
    # accept incoming traffic to ports >= 1024 from each hub node
    iptables -A INPUT -p tcp --dport 1024: --source 10.1.$N.3 -j ACCEPT
done

# reject incoming tcp connections to ports >= 1024 from any source that
# did not match any of the previous rules

iptables -A INPUT -p tcp --dport 1024: -j DROP