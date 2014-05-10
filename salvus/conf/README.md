There should be lots of docs here about configuring SMC but they aren't written yet.


# GCE Instances:

Spinning up gce instance is just a matter of adding a line like this

  10.3.1.5 compute1dc2

to the file

  ~/salvus/salvus/conf/deploy_cloud/hosts

And lines like this to ~/salvus/salvus/conf/deploy_cloud/services:

 # Google Compute Engine
[vmgce]
localhost    {'hostname':'compute1dc2', 'disk':'bup:500', 'instance_type':'n1-highmem-4', 'zone':'us-central1-a'}
...

Then doing the following makes a gce instance based on the newest snapshot named salvus-[date], and ensures that there is a persistent 500GB disk as /dev/sdb, and adds it to the tinc network with address 10.3.1.5.  It also places the tinc public key in salvus/salvus/conf/tinc_hosts on all of the UW host VM's, via multi-threaded calls to scp done in parallel (so it only takes about 5 seconds).


cd ~/salvus/salvus
ipython
>>> import admin; reload(admin); cloud = admin.Services('conf/deploy_cloud/')
>>> cloud.start('vmgce', hostname='compute1dc2')

The log file goes to

~/salvus/salvus/data/logs/vm_gce-10.3.1.5.log

Similarly, stopping is via

>>> cloud.stop('vmgce',  hostname='compute1dc2')

which attempts a proper shutdown, destroys everything except the persistent disk "bup", and also deletes (in parallel) all of the tinc public keys.

By far the most time in starting a machine is in creating the boot image from the snapshot, which takes 2-3 minutes.

I haven't tried making a machine in a different region -- I don't know if I would need to do something special to move the snapshot to that other region yet.

