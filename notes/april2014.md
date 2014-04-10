# major issues


 - [ ] write a post explaining what is new and awesome, and what the architecture is.

 - [x] change status to not bail when value is False; otherwise, broken sage ==> can't access project!

# after rollout

 - [ ] fix gce boot -- right now it boots up but doesn't mount the zfs pool -- or rather it starts getting rsync'd too before finishing the mount (?).  This is very bad.  Maybe don't go on VPN until /projects is mounted to avoid potential data loss.

 - [ ] setup so that cqlsh doesnt' need env variable but uses .cqlshrc

 - [ ] test ui changes on other browsers.

 - [ ] hourly or rolling snapshots of new *compute vm's* filesystems:
         - https://github.com/zfsnap/zfsnap/tree/legacy

 - [ ] test/fix ui changes on other browsers.

 - [ ] disable all swap on hosts (requires shutting down old compute vm's first)

 - [ ] add a bigger (?) timeout between vm stop/start (?)

 - [ ] function to "truly" move a project within a given data center

 - [ ] write clean() -- for each project on a given host that hasn't been used in the last n days, delete .sagemathcloud, etc., directories

 - [ ] install something randy needs:  I think this will be possible in the release planned for this summer, but for now it would be nice to use Jake's mpld3 package, which doesn't seem to be installed.  I tried downloading and following the instructions at   https://github.com/jakevdp/mpld3 but didn't have permissions.  Is this something you could install globally?

  - [ ] make this standard  -- https://github.com/biocore/scikit-bio



 - [ ] MAYBE -- or maybe not -- change bup_storage to never delete account: it's very useful for linking projects and sharing files to have account available at all times.  will make, e.g., persistent sshfs possible; make sure .ssh is not ssh excluded from rsync

- [ ] have stable ipv6 project ip addresses be would be a huge *win*.  LXC would make that possible.

- [ ] deal with the exception around this - codecs.open(self.save_log,'a',"utf-8-sig").write(json.dumps(r)+'\n')

- [ ] go through and chown/sync every project systematically; evidently I didn't in the current migration, so I'll just put a chown in the start script for now -- this slows things down, but is temporary.

- [ ] update quota information using du script and re-enable quotas

- [ ] write code that cleans up /bup/projects fs by removing .sagemathcloud directories, etc., of projects not used for a while

- [ ] make it so move is never automatic but prompted?

- [ ] automated rolloing snapshots of bup/projects

- [ ] add bup quota as a standard part of settings, and refuse to make further snapshots if bup usage exceeds 3 times user disk quota.  This will avoid a horrible edge case.   Critical that this produces an error that the user learns about.  This will happen for some users.  Alternatively, I could periodically rebuild those bup repos with many snapshots deleted - that would be much nicer and is totally do-able.

- [ ] script to cleanup bup repos, e.g., delete tmp files, maybe recompact, etc.

- [ ] manual project move system -- bring it back...


======

 - [x] gce booting configuration:

        fdisk /dev/sdd
        mkfs.ext4 /dev/sdd1 && mkdir /mnt/conf2 && mount /dev/sdd1 /mnt/conf2 && rsync -axvH /mnt/conf/ /mnt/conf2/ && ls /mnt/conf2 && sync


 - [x] all proxy server stuff is broken, so ipython, latex, file download, etc.

    - try again using the testing server

 - [x] gce nodes -- need to fix /bup/projects2 issue,


 - [x] include some more anti-bitcoin mining measures.

      - [x] switch the existing looping script to use RF=1

      - [x] it turns out that i called the google dc=1 instead of dc=2 in my allocation so far.
        so all of dc=0 is fine, but dc1 and and 2 are "completely wrong".

           - [x] determine location of all projects on all machines via a big ls and gather.
           - for each project set bup_last_save based on choosing (at most 1) from each dc and set time to noon today.
             if nothing in a given dc, choose random location and set time to 0.

      - write "prepare" code that goes through and

           - rm -rf's bups that aren't as given in bup_last_save table
           - sync's around bups that have a last save time of 0
           - restores working files on all 3 to /bup/projects
           - records du -sc size of bup repo and working files in database

                alter table projects add bup_repo_size_KB     int;
                alter table projects add bup_working_size_KB  int;



# DONE

BEFORE SWITCH:

- [x] migrate all projects
- [x] write and run code to ensure all replication is up to date

 - [ ] update base vm:
       - ensure that bup/projects mounts as /projects
       - update code

 - [x] setup new conf files for after the switch

 - [ ] stop all current compute vm's

 - [ ] restart all new compute vm's and all hub vm's



 - [ ] fix issues until works

 - [x] delete users again

 - [x] 25gb temporary quota until after we assign quotas based on du.


 - [x] start a testing hub and test live projects
 - [x] (yes it does -- retest non-locally) raw doesn't work; ipython doesn't work -- so probably port forwarding doesn't work at all.



 - [x] changing file ordering doesn't work first time due to caching.


 - [x] restart migration from newest to oldest, sorted by modification time.
 - [x] must update bup-1 on all vms!   https://github.com/williamstein/bup-1
 - [x] update code


- [x] just don't set quotas now; that gets done later.
- [x] replace git-ls by just ls for now.  It is too slow.
- [x] display snaphot times as local time (and timeago if not too slow)



- [x] file move/copy/delete/download


- [x] UI -- display current project state clearly somewhere

- [x] display  project quotas



- [x] optimize file listing display
- [x] when opening a new project just place randomly -- no use of consistent hashing.

- [x] (0:48) change sync/save code to take list of target ip's based on db
- [x] (0:55) set quotas and sync -- instead we could set the quota when starting the project running, then unset when stopping it... and that's it.
- [x] (0:45) I need to have a script that runs through all projects and sets the disk quota in the database somehow.
      how?  just take larger of 2*current_usage and 4GB


- [x] there was a bug in the prep script (it set the quotas before extracting), and it seems useless.  NO!!
I'm seriously tempted to do the following:

1. delete everything:
    - bups/bups; bup/projects; data in database
    -

and also push out the correct consistent hashing file
2. write code that goes through each project, and
   - rsync's the latest version of files to one new compute vm in same dc, chosen at random.
   - takes a bup snapshot of that (via `bup_storage.py save`)
   - sync's out to 2 other replicas
   - stores info bup_last_saved entry in database.

- [x] I need to have a script that runs through all projects and sets the disk quota in the database somehow.
      how?  just take larger of 2*current_usage and 4GB

- [x] implement `get_state` in `bup_storage.py`: it will return two things, according to a "local calculation" purely from within the project
        - state: stopped, starting, running, restarting, stopping, saving, error
        - when: when this state was entered
        - step: init_repo, restore (copying files from bup), syncing template, etc.
        - progress: if there is a way to give how far along with doing something (e.g., rsyncing out to replicas)
    could do this by creating a conf file that is *NOT* rsync'd that stores stuff:   conf/state.json

- [ ] port forward for testing server: "salvus@cloud15:~$ sudo ssh -L cloud1.math.washington.edu:443:10.1.15.7:443 10.1.15.7
"

- [ ] migration -- no way to finish without some painful actions

   - make 1 new gce machine with all disks mounted it
   - mount snapshot of all projects disks to all my .5 machines
   - rewrite migrate script to use .5 instead of .4 and for gce use special machine.
   - run.


salvus@cloud1:~$ more disable_apparmor_vm.py
#!/usr/bin/env python
import os
for x in os.popen("apparmor_status").readlines():
    v = x.split()
    print v
    if len(v) == 1 and v[0].startswith('libvirt-'):
        s="apparmor_parser -R /etc/apparmor.d/libvirt/%s"%v[0]
        print s
        os.system(s)


    virsh snapshot-create-as compute1a snap1 snap1-desc --disk-only --diskspec vdc,snapshot=external,file=/home/salvus/vm/images/persistent/compute1a-projects-sn1.img
    qemu-img create -b compute1a-projects.img -f qcow2 compute1dc1-projects.img

    virsh snapshot-create-as compute7a snap1 snap1-desc --disk-only --diskspec vdc,snapshot=external,file=/home/salvus/vm/images/persistent/compute7a-projects-sn1.img vdd,snapshot=external,file=/home/salvus/vm/images/persistent/compute7a-projects2-sn1.img
    qemu-img create -b compute1a-projects.img -f qcow2 compute1dc1-projects.img
    qemu-img create -b compute7a-projects.img -f qcow2 compute1dc1-projects2.img
    qemu-img create -b compute7a-projects2.img -f qcow2 compute1dc1-projects3.img


    virsh snapshot-create-as compute5a snap1 snap1-desc --disk-only --diskspec vdc,snapshot=external,file=/home/salvus/vm/images/persistent/compute5a-projects-sn1.img vdd,snapshot=external,file=/home/salvus/vm/images/persistent/compute5a-projects2-sn1.img
    qemu-img create -b compute5a-projects.img -f qcow2 compute2dc1-projects.img
    qemu-img create -b compute5a-projects2.img -f qcow2 compute2dc1-projects.img

 - compute1a, compute7a will be /projects1 and /projects7 on compute1dc1

          zpool import -f 1330245248116180286 projects7
          zpool import -f 17637146741023513795 projects1

 - compute2a is on compute2a:/projects  (no choice, due to raw partition)

 - compute5a will be /projects on compute2dc1


 - [x] update base vm:
       - [x] ensure that bup/projects mounts as /projects
       - [x] update code
       - [x] firewall is wrong -- it would ban all internode traffic which isn't what we want due to .5 instead of .4
       - [x] system-wide: open up permissions so that octave, etc., works: chmod a+rwx /usr/local/sage/sage-6.2/local/share/sage/ext/*

