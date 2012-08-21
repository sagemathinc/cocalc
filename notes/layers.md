Layers
-------

0. Physical computer hardware
1. Virtual Machines (e.g., VirtualVbox)
2. Tinc VPN's: 
      * one for the sage servers
      * one for everything else: stunnel, haproxy, nginx, tornado, cassandra
3. Cassandra Database storage
4. Tornado, Nginx, and Sage content and application servers
5. Haproxy proxy servers 
6. stunnel ssl wrappers

