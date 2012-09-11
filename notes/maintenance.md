Maintenance Tasks
-----------------

Critical
========

  * regular apt updates: "apt-get update && apt-get upgrade" to make sure that all nodes
    have latest security patches applied.

        h.apt_upgrade('all')

  * cassandra nodetool repair, since one has to do that for some reason. 

        h.nodetool('cassandra', 'repair', timeout=120)
