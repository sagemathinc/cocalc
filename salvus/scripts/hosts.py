#!/usr/bin/env python

vm_hosts = ['%02dsalvus.math.washington.edu'%k for k in [1,2,3,4]] + ['%s.math.washington.edu'%h for h in ['geom','combinat']]

persistent_hosts = vm_hosts + ['servedby%s.salv.us'%k for k in [1]] + ['bsd%s.salv.us'%k for k in ['', 1]] 

# they run sage
unsafe_hosts = ['servedby%s.salv.us'%k for k in [2]] + ['bsd%s.salv.us'%k for k in [2]] 

