#!/bin/bash
# Written by Keith Clawson, with some modifications by William Stein.  March 2014

# flush table
iptables -F

# default policy: accept all connections
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT
iptables -P FORWARD ACCEPT

# accept any related or established connections, needed for ssh to work
# because it uses a random large port to connect to other machines
iptables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT

# loop over the set of hub nodes -- TODO -- what about when I add new hubs!
for N in {1..21}
do
    # accept incoming traffic to ports >= 1024 from each hub node
    iptables -A INPUT -p tcp --dport 1024: --source 10.1.$N.3 -j ACCEPT
done

# accept incoming traffic to ports >= 1024 from localhost -- this is used for port forwarding over ssh
iptables -A INPUT -p tcp --dport 1024: --source localhost -j ACCEPT

# reject incoming tcp connections to ports >= 1024 from any source that
# did not match any of the previous rules
iptables -A INPUT -p tcp --dport 1024: -j DROP