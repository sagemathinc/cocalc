# The plan

   DC's:   4545, padelford, gce-central-1, gce-europe-1

Basic design constraints:

    - no single points of failure
    - any single (machine or) data center can go down with "minimal impact" on users -- i.e., project may restart, but shouldn't take long, and must remain accessible.
    - reasonable performance: at most minutes to extract sage; time to do things like "git ls" should be short.
    - never ever run (non-fuse) ZFS on a machine that can't be very easily rebooted with minimal impact.

Structure of project files:

           project-id/0.img   <--  #   dd if=/dev/zero of=a.img seek=4G bs=1 count=1    #  NOT truncate!
                      1.img
                      2.img
      etc.

## How to do it:

- [ ] create one glusterfs file system with replication factor of 2 in each DC over *tinc* (slower but SECURE), with NSF *off*, and allowing only connections specifically from the compute nodes, with three volumes -- projects (later: scratch, datasets):

-->   - [x] cloud1-cloud7

    gluster peer probe 10.1.2.1;gluster peer probe 10.1.3.1;gluster peer probe 10.1.4.1;gluster peer probe 10.1.5.1;gluster peer probe 10.1.6.1;gluster peer probe 10.1.7.1


    gluster volume create projects replica 2 transport tcp  \
    10.1.1.1:/home/salvus/vm/images/gluster/projects 10.1.3.1:/home/salvus/vm/images/gluster/projects\
    10.1.2.1:/home/salvus/vm/images/gluster/projects 10.1.4.1:/home/salvus/vm/images/gluster/projects\
    10.1.5.1:/home/salvus/vm/images/gluster/projects 10.1.6.1:/home/salvus/vm/images/gluster/projects\
    10.1.7.1:/home/salvus/vm/images/gluster/projects 10.1.3.1:/home/salvus/vm/images/gluster/projects2

    sudo gluster volume set projects nfs.disable on
    sudo gluster volume set projects auth.allow '10.*'

    - [x] cloud10-cloud21

    ';'.join(['gluster peer probe 10.1.%s.1'%i for i in [11..21]])

    gluster peer probe 10.1.11.1;gluster peer probe 10.1.12.1;gluster peer probe 10.1.13.1;gluster peer probe 10.1.14.1;gluster peer probe 10.1.15.1;gluster peer probe 10.1.16.1;gluster peer probe 10.1.17.1;gluster peer probe 10.1.18.1;gluster peer probe 10.1.19.1;gluster peer probe 10.1.20.1;gluster peer probe 10.1.21.1'

    ' '.join(['10.1.%i.1:/home/salvus/vm/images/gluster/projects'%i for i in [10..21]])

    gluster volume create projects replica 2 transport tcp  \
    10.1.10.1:/home/salvus/vm/images/gluster/projects 10.1.11.1:/home/salvus/vm/images/gluster/projects 10.1.12.1:/home/salvus/vm/images/gluster/projects 10.1.13.1:/home/salvus/vm/images/gluster/projects 10.1.14.1:/home/salvus/vm/images/gluster/projects 10.1.15.1:/home/salvus/vm/images/gluster/projects 10.1.16.1:/home/salvus/vm/images/gluster/projects 10.1.17.1:/home/salvus/vm/images/gluster/projects 10.1.18.1:/home/salvus/vm/images/gluster/projects 10.1.19.1:/home/salvus/vm/images/gluster/projects 10.1.20.1:/home/salvus/vm/images/gluster/projects 10.1.21.1:/home/salvus/vm/images/gluster/projects


    - [ ] (later) google us central
    - [ ] (later) google europe

- [ ] master version of each project in dc where it is running, and replicated slave is one some other data center (which will be recorded in database, and may as well be determined by some sort of load balancing).

To copy out to other dc, have to somehow figure out where the file is on disk and do "bsdtar cvf 0.tar 0.img", or possibly just plain use rsync to minimize actual data sent over the wire (I'm simply not sure).

Or the inefficient (time-wise, but not network wise) way to sync:

   time rsync -uaxvH --sparse /mnt/gluster/4545/projects/ /mnt/gluster/padelford/projects/

I did the following on cloud10, which is supposedly supposed to help with hosting vm images.

1. Create /var/lib/glusterd/groups/group-virt.example
quick-read=off
read-ahead=off
io-cache=off
stat-prefetch=off
eager-lock=enable
remote-dio=enable
quorum-type=auto
server-quorum-type=server

2. gluster volume set projects group group-virt.example


### [ ] geo-replication?

    # on cloud10
    ssh-keygen -f /var/lib/glusterd/geo-replication/secret.pem
    ssh-copy-id -i /var/lib/glusterd/geo-replication/secret.pem.pub root@10.1.3.1
    gluster volume geo-replication projects 10.1.3.1:/tmp/geo start
    gluster volume geo-replication projects 10.1.3.1:/tmp/geo status
    gluster volume geo-replication projects 10.1.3.1:/tmp/geo stop

This intelligently runs rsync from the right places automatically in the background
when files on cloud10 change.  It is still slow-ish... but acceptable, and more likely
to benefit from upgrades and kernel improvements.   How about this:

    - [x] use a zpool?  - No!!!!
      in each data center have a single non-compressed *deduplicated* zpool that is the
      target of the geo-replication for all (or at least one) of the other sites.  This
      will make it so we can fail over even if data centers fail, but at a cost of some
      time to copy out the file from zpool.  However, that copy *is* sparse, so pretty fast.
      This is also very good, since there is exactly one backup of the file, and this
      geo-rep target can be easily rebuilt, so having replication for it is dumb.

            truncate -s 1024G geo.img
            zpool create -m /mnt/geo geo /tmp/geo.img
            zfs set dedup=on geo
            zpool get dedupratio geo # In practice, this dedup does basically nothing.

    - [ ] setup periodic rsync -- actually rsync daemon or something in long run due to security and root (??) as follows:

            glusterfs volume:
                projects/4545/                 # master
                projects/padelford/            # slave
                projects/gce-us-central-1/     # slave

          when we move a project from padelford to 4545, we just do the following instant move operation everywhere,
          assuming things are sync'd (check via timestamps):

                mv projects/padelford/project-id projects/4545/

          and we can do this on one machine, since we will globally *mount* all gluster volumes over tinc.

          This will mean that if we have k data centers, we store 2*k copies of each project.
          This also means that even when a single node fails in a data center, there is absolutely
          no loss of functionality within that data center.
          So with this design a whole data center or any single node in a data center can go down.

          Drawback is that we *can't* use geo-replication, since that would backup our copies.

           - [x] move everything to the above layout

           - [x] rsync -- test

                time rsync -uaxvH --sparse /mnt/gluster/padelford/projects/padelford/a0bba8e3-2beb-4b9b-bb64-81e7465ee773/ /mnt/gluster/4545/projects/padelford/a0bba8e3-2beb-4b9b-bb64-81e7465ee773/
                # that took 9 seconds
                # move to 4545 was then *instant*.

             OK, but then why not just have one big unified pool and rsync in all directions with "-u"?
             Reasons:
                 - I was thinking of using geo-rep, which doesn't make sense.
                 - need to know whether image is up to date or not when loading?  could track
                   last place where it is live in the database.

             So.. just have to do this from any node to affect a merge:

                time rsync -uaxvH --sparse --progress /mnt/gluster/padelford/projects/ /mnt/gluster/4545/projects/
                time rsync -uaxvH --sparse --progress /mnt/gluster/4545/projects/ /mnt/gluster/padelford/projects/

             Later, by modifying the above command, we could parallelize this.


---

- [ ] lxc container project that can mount project and run it with a given ip address:  lxc container
     - a base image, which is easy to move forward
     - mounts the zfs /home/project directory
     - datasets volume (sync it somehow to other dc's when adding new data)

- [ ] migrate all projects





# Scratch -- Soul searching regarding HA image migration.


Questions:

  - one single big gluster volume, or one in each data center (with a sync mechanism)?
    NO!

      - if replication involves writing to 2 nodes and one is slow but the other is fast, will writes be very slow?  YES.

        Testing using a node on cloud1 and a node on my *laptop* shows that the write speed is determined by that
        of the slowest connection.  Writes do not ack until completed on all available nodes.  So one slow data center
        link would totally kill all IO performance everywhere.  That is not acceptable.   Unless... I only ever
        use ZFS images and there is a way to make linux not stop while flushing to disk.

            gluster volume create test replica 2 transport tcp 10.1.1.5:/gluster/test 10.1.1.6:/gluster/test

        Even reading back is very, very slow.

        What about zfs's own replication!?  No good, since doesn't replicate the snapshots, which we need to support.

        What about qcow2 images:

            qemu-img create -f qcow2 a.qcow2 1G
            modprobe nbd max_part=63
            qemu-nbd -c /dev/nbd0 a.qcow2
            zpool create -m /mnt/test2 test /dev/nbd0
            zpool export test
            qemu-nbd -d /dev/nbd0

        gluster volume create projects replica 2 transport tcp cloud10:/home/salvus/vm/images/gluster/projects/ cloud11:/home/salvus/vm/images/gluster/projects/ cloud12:/home/salvus/vm/images/gluster/projects/ cloud13:/home/salvus/vm/images/gluster/projects/

        Plan for inter-data-center replication of sparse zfs images:

        Following http://stackoverflow.com/questions/13252682/copying-a-1tb-sparse-file do this so that each step
        of the transfer respects the sparseness.
        This is a completely self-contained optimization.

            # In the actual file store for the volume -- find which one really has the image and do this:
            dd if=/dev/zero of=a.img seek=1G bs=1 count=1
            time bsdtar cvf /tmp/a.tar a.img
            # transfer the tarball using scp
            # extract on other end using tar


     Oh my god!   If I use NSF to mount a non-encrypted glusterfs, then zpool is insanely slow on it.
     So i *must* mount using glusterfs driver.  The problem doing that was

          http://gluster.org/pipermail/gluster-users/2008-July/000100.html

     and doing this DOES NOT work:

          gluster volume set projects server.allow-insecure yes


Doing cross-data center sync:

    - rsync is just too slow to be viable.  It's about 20s per project (for trivial project).
      If 1000 projects change and it takes 6 hours to send them all, NOT VIABLE.
    - *Optimal*, but requires having a way to know where gluster stores files, or ignoring the pointers.

             root@cloud1:/mnt/gluster/4545/projects/49c5e139-f53f-4c18-aa03-7895b52ae5ab# time cp /home/salvus/vm/images/gluster/projects/49c5e139-f53f-4c18-aa03-7895b52ae5ab/0.img .

            real    0m0.642s
            user    0m0.000s
            sys     0m0.020s
            root@cloud1:/mnt/gluster/4545/projects/49c5e139-f53f-4c18-aa03-7895b52ae5ab# ls -lh
            total 16M
            -rw------- 1 root root 1.0G Dec  9  2013 0.img

    - Copy is way better than rsync, even locally, which is weird...

            root@cloud1:/mnt/gluster/4545/projects/49c5e139-f53f-4c18-aa03-7895b52ae5ab# time cp /mnt/gluster/padelford/projects/49c5e139-f53f-4c18-aa03-7895b52ae5ab/0.img .

            real    0m2.730s
            user    0m0.084s
            sys     0m0.752s

- [ ] how to mount on everything:

    mkdir -p /mnt/gluster/padelford/projects /mnt/gluster/4545/projects/
    mount -t glusterfs cloud1:/projects /mnt/gluster/padelford/projects
    mount -t glusterfs cloud10:/projects /mnt/gluster/4545/projects/


- [ ] Write a python script that does the following:

    - Run it in *each* of the bricks in turn, e.g., in /home/salvus/vm/images/gluster/projects/,
      though I could take the output of "gluster volume info" and use that to intelligently
      and with *no redundancy* make the copies.  This can even be done in parallel.
    - It will walk the directory tree and for each file that is there and readable check
      the modification time and compare with the corresponding file in the target glusterfs volume, which is mounted on that machine,
      in this example, it is /mnt/gluster/4545/projects/
    - If the file is newer (or the other file doesn't exist), do a filesystem cp of it, which is optimally fast.

    - Have it cache the target times from last run is probably useful: it takes 7 seconds for 4000 projects, which isn't too bad.

    - Testing it out:

            # run this on cloud1, 3, 5, 7 -- for redundancy, would want to somehow run on all replicas though...
            time /tmp/project_storage.py --verbose sync /home/salvus/vm/images/gluster/projects/ /mnt/gluster/4545/projects

            # OR on any node this, which is significantly slower, but definitely comprehensive -- it takes 4 minutes
            # just to figure out what to copy for 4000 projects.
            time /tmp/project_storage.py --verbose sync /mnt/gluster/padelford/projects /mnt/gluster/4545/projects

            # run this on cloud10, 12, 14, 16, 18, 20
            time /tmp/project_storage.py --verbose sync /home/salvus/vm/images/gluster/projects/ /mnt/gluster/padelford/projects

---


Interesting stat -- with *most* (not all yet!) projects together in one place, and the 1GB usage quota (some projects will need more), the space usage is 240GB.    Not bad.

    root@cloud10:/mnt/gluster/4545/projects# time du -sch .
    240G    .
    240G    total
    real    27m9.725s



# Conclusions:

Disable NFS -- the auth.allow is ignored and NFS is not needed and is a huge gaping hole.

        sudo gluster volume set projects  auth.allow '10.*'
        sudo gluster volume set projects nfs.disable on