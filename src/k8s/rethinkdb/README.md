# RethinkDB on Kubernetes

Build the image and push to gcloud:

    ./control.py -r --tag=my_tag

Create the rethinkdb deployments for each machine (which creates peristent disks automatically):

    ./control.py run 0

Add additional nodes (wait a little before doing this so join works):

    ./control.py run 1
    ./control.py run 2

View the web admin interface:

    ./control.py admin

Get a bash shell on a node

    ./control.py bash -n=1

## Specifying the disk size and type

You can instead make the persistent disk a 15GB SSD instead:

    ./control.py run --size=15 --type=ssd 3

You can increase (but not decrease) the size of an existing disk. This *will* live-resize everything automatically, assuming ssh you can ssh to the minions:

    ./control.py run --size=15

You can't change from standard to ssd.

## Connecting to an external database cluster

Instead of spinning up containers, you can point the k8s cluster at an **external** cluster of rethinkdb nodes:

    ./control.py delete # turn off any containers, etc.
    ./control.py external db0 db1 db2 db3 db4 db5

IMPORTANT: Make sure that the firewall allows the containers to connect to the database.   A rule might look like:

    Source IP ranges
    10.244.0.0/16
    Allowed protocols and ports
    tcp:29015
    Target tags
    db

where the source ip ranges are listed in the Routes section of
Networking-->Networks.  (Yes, creating this firewall rule  could be automated, but we will be moving the database into k8s so what's the point?)

Similar remarks for compute nodes:

    Source IP ranges
    10.244.0.0/16
    Allowed protocols and ports

    tcp:1-65535
    udp:1-65535
    icmp
    Target tags
    compute


### References

This was helpful: https://github.com/rosskukulinski/kubernetes-rethinkdb-cluster

