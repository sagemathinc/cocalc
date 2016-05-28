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


### References

This was helpful: https://github.com/rosskukulinski/kubernetes-rethinkdb-cluster

