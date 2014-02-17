# Daily human things to do related to running SMC.

- NOTE: a goal is to automate and make completely not-necessary as much of this as possible.  But not too much.

Consider

## Tasks


### Updates:

We could most replace this by: <http://askubuntu.com/questions/325998/how-to-enable-auto-security-update-in-ubuntu-12-04-server>

  - Upgrade OS of all hosts.  E.g., "apt-get update; apt-get upgrade; chmod a+r /boot/vmlinuz-*; chmod a+rw /dev/fuse"

  - Upgrade OS of all VM's. "apt-get update; apt-get upgrade":
        salvus@cloud3:~/salvus/salvus$ tmuxlogin-cloud-cassandra
        salvus@cloud3:~/salvus/salvus$ tmuxlogin-compute-root
        salvus@cloud3:~/salvus/salvus$ tmuxlogin-cloud-web

### Monitors

  - Check that monitors are running (right now on cloud3 and cloud10)

### Filesystem

  - Look at issues with replication:

        coffee> s=require('storage'); s.init();
        coffee> x={};s.replication_errors(cb:(e,t)->x.t=t)
        coffee> x.t
        coffee> s.status('43228724-071d-4701-9d80-694dda179d4f')

  - Worry about disk usage -- this shoud be a "spot check" since the monitor *should* alert us of anything.

