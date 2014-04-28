## Upgrading things

- [x] change scripts so google machines are smaller.

- [x] figure out how to do cgroups with 14.04  (cgred stuff, etc.,) -- it seems to just work if we use usernames (not uid!)  There is no cgred daemon to restart.

- [ ] write script to automate installing everything into new clean sage build and run on both
      make to include code to fix permissions.

- [ ] /projects and /home directory permission suggestions.      

- [ ] delete sage-6.2.beta8 thing on both vm's

- [ ] snapshot gce base image

- [ ] fix the gce first-boot not running appropriate scripts issue

- [ ] set one of my projects to use a specific google vm and restart it using the new 14.04 ubuntu, and TEST.

- [ ] upgrade 1 compute vm at UW and test

- [ ] restart rest of UW compute vm's and test

- [ ] send out email that compute vm's are all upgraded

- [ ] restart one of the web machines using new vm image; restart nginx, hub, etc., and test

- [ ] once that works, restart rest of web machines and services

- [ ] upgrade and restart stunnel on one HOST machine, then on the rest

- [ ] upgrade and restart haproxy on one HOST machine, then on the rest

- [ ] make a clone vm and test out what upgrading to cassandra2 requires.


---





- [ ] rewrite sync to remove the differential sync doc from the hub -- just forward everything back and forth between browser client and local hub.  This should speed things up, avoid a lot of state issues, and lay a good foundation for further optimizations and fixes.



----

- [ ] upgrade to codemirror 4.x: https://mail.google.com/mail/u/0/?shva=1#inbox/145896f4d974137d


- [ ] suggested security improvements: https://mail.google.com/mail/u/0/?shva=1#inbox/14585eafa47360e4

- [ ] when user "control-d" a console session (?) this maybe results in node using 100% of cpu -- I saw this once; test


- [ ] publishing with constraints

- [ ] change proxy server to use master and properly setup proxy server: https://github.com/nodejitsu/node-http-proxy

- [ ] bup storage: the `save_log` is possibly a BAD, BAD idea. Look:
  root@compute12dc0:/bup/bups/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b# ls -lht conf
  total 383M
  -rw------- 1 root root 382M Apr 26 19:03 save_log.json

- [ ] bup -- should put my caching code back in, e.g., my main project has 250-ish commits and is already taking .25 - 1 s; I did a quick test with my code and it was much, much faster.


- [ ] report that ie file editing completely broken in FULLSCREEN due to top position location determination issue: https://mail.google.com/mail/u/0/?shva=1#inbox/14570edecf01f3dc

- [ ] increasing quota -- I should make an admin interface for this...

        x={};require('bup_server').global_client(cb:(e,c)->x.c=c)
        p=x.c.get_project('4255de6e-adc9-4a1e-ad9c-78493da07e64')
        p.set_settings(cb:console.log, cores:12, cpu_shares:4*256, memory:12, mintime:24*60*60)   # mintime is in units of seconds.

- [ ] project folder connections (?)

       zfs set sharenfs=on bup/projects
       sudo zfs set sharenfs='rw=@10.1.1.0/16',no_subtree_check,async,no_root_squash bup/projects
       apt-get install  nfs-kernel-server

   Seems very flaky, and only mildly faster or maybe even *SLOWER* than sshfs, at least over our network.

   This seems very nice... and works fantastically!

      sshfs -o cache_timeout=10 -o kernel_cache -o auto_cache -o uid=1959631043 -o gid=1959631043 -o allow_other -o default_permissions 10.1.1.5:/projects/test/sage compute1


      cd /projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b; mkdir -p projects/edf7b34d-8ef9-49ad-b83f-8fa4cde53380; sshfs -o cache_timeout=10 -o kernel_cache -o auto_cache -o uid=1959631043 -o gid=1959631043 -o allow_other -o default_permissions 10.1.3.5:/projects/edf7b34d-8ef9-49ad-b83f-8fa4cde53380 projects/edf7b34d-8ef9-49ad-b83f-8fa4cde53380

      fusermount -u edf7b34d-8ef9-49ad-b83f-8fa4cde53380

    # mounting student projects

    coffee> x={};require('bup_server').global_client(cb:(e,c)->x.c=c)
    coffee> p=x.c.get_project('cc96c0e6-8daf-467d-b8d2-354f9c5144a5')
    coffee> p.get_location_pref(console.log)
    undefined 'b9cd6c52-059d-44e1-ace0-be0a26568713'
    coffee> x.c.servers.by_id['b9cd6c52-059d-44e1-ace0-be0a26568713'].host
    '10.1.15.5'

    # then at the shell

    export project_id=cc96c0e6-8daf-467d-b8d2-354f9c5144a5; export host=10.1.15.5; export uid=447893796

    mkdir -p students/$project_id && sshfs -o cache_timeout=10 -o kernel_cache -o auto_cache -o uid=$uid -o gid=$uid -o allow_other -o default_permissions $host:/projects/$project_id students/$project_id; chown $uid:$uid students/$project_id

    CRITICAL: we must *also* use bindfs with the --create-for-user= option!!

    bindfs --create-for-user=275991804 --create-for-group=275991804 -u 1959631043 -g 1959631043


- [ ] get GCE VM restart to actually robustly work with all proper mounting.


- [ ] Regarding projects moving:

     - when a client *initiates* a move, it will query the db for any mounts and then inform the bup_servers of them. Thus the move logic is event driven, where the event is "move a project".   If the global client doing the moving can't contact the local bup_server, it will keep trying... (?)


- [ ] setup remote environment for dev/testing

 - [ ] rekey ssl cert: http://support.godaddy.com/help/article/4976/rekeying-an-ssl-certificate

- [ ] make it so `bup_server` will refuse to start if some sanity checks regarding the filesystem fail, e.g., that bup/projects is mounted as  /projects

- [ ] make the monitor connect to all bup servers and verify that they are accepting connections; e.g., under duress they port where they are serving may change.

- [ ] implement a gossip protocol to use when deciding viability of compute nodes, rather than just trying for 15 seconds and timing out.   Try longer if gossip is good; try less if bad.

- [ ] redo file copy button to just be a straight cp.  BUT -- need to also fix FUSE mounting of bup to have proper permissions, or this leads to problems.    Pretty broken right now.

- [ ] put this script in base template vm's:

        root@compute18dc0:~# more update_salvus
        su - salvus -c "cd salvus/salvus; . salvus-env; git pull; ./make_coffee"
        cp /home/salvus/salvus/salvus/scripts/bup_storage.py /usr/local/bin/
        chmod og-w /usr/local/bin/bup_storage.py
        chmod a+rx /usr/local/bin/bup_storage.py

      and make it so gce base machines can at least get from the github repo.

- [ ] bug: snapshot browser file search doesn't work... for obvious reason: it is searching on the wrong thing!

- [ ] project undelete doesn't work.

- [ ] rewrite `bup_server` to use a local sqlite database; then state is preserved upon restart/crash/reboot/etc.

- [ ] "pip install --user pymc": https://mail.google.com/mail/u/0/?shva=1#search/Carlos+Rodriguez/14541f56e95e0756

- [ ] code to "rebuild/repair a node" -- hmm; because of this maybe need some way to know when a project was last sync'd based on filesystem

- [ ] --delete and --update together with rsync - what happens? -- we might as well make the replication actually a merge of newest files!

 - [ ] after repairing cassandra data reduce the write consistency level when making new projects... maybe. (?)

 - [ ] I'm also trying to install pymc (python montecarlo) but when I run it, it complains that the ver of numpy is too old... any tips on how to upgrade numpy or how to make pymc work?....; github ticket #2

 - [ ] put project creation date in project


 - [ ] (in progress on cloud3) create a full offsite-able backup of all bup repos of projects in dc1, and also the database nodes in dc1.

 - [ ] run through and do "bup ls master" on every repo in an offline archive, and investigate/fix ones that don't work, if any.

 - [ ] i observe two bup saves happening at once -- that should be *impossible*, and could result in corruption.
 root@compute8dc2:/bup/bups/4cff8798-41d0-4d9b-b516-ba106ba89c57/objects# ps ax |grep 4cff8798-41d0-4d9b-b516-ba106ba89c57|grep bup
 8792 ?        S      0:00 sudo /usr/local/bin/bup_storage.py save --targets=10.1.17.5,10.1.1.5 4cff8798-41d0-4d9b-b516-ba106ba89c57
 8793 ?        S      0:00 python /usr/local/bin/bup_storage.py save --targets=10.1.17.5,10.1.1.5 4cff8798-41d0-4d9b-b516-ba106ba89c57
10309 ?        S      2:27 bup-save --strip -n master -d 1397161051 /projects/4cff8798-41d0-4d9b-b516-ba106ba89c57
11668 ?        Ss     0:20 bup-fuse -o --uid 632382271 --gid 632382271 /projects/4cff8798-41d0-4d9b-b516-ba106ba89c57/.snapshots
12748 ?        S      0:00 sudo /usr/local/bin/bup_storage.py save --targets=10.1.17.5,10.1.1.5 4cff8798-41d0-4d9b-b516-ba106ba89c57
12749 ?        S      0:00 python /usr/local/bin/bup_storage.py save --targets=10.1.17.5,10.1.1.5 4cff8798-41d0-4d9b-b516-ba106ba89c57
13104 ?        S      2:16 bup-save --strip -n master -d 1397161256 /projects/4cff8798-41d0-4d9b-b516-ba106ba89c57
ALSO, when a file vanishes between index and save, we get an error, but still there is a new commit -- we should always remount the snapshots.

 - [ ] fix gce boot -- right now it boots up but doesn't mount the zfs pool -- or rather it starts getting rsync'd too before finishing the mount (?).  This is very bad.  Maybe don't go on VPN until /projects is mounted to avoid potential data loss.

 - [ ] setup so that cqlsh doesnt' need env variable but uses .cqlshrc

 - [ ] test ui changes on other browsers.

 - [ ] hourly or rolling snapshots of new *compute vm's* filesystems:
         - https://github.com/zfsnap/zfsnap/tree/legacy

 - [ ] test/fix ui changes on other browsers.

 - [ ] add a bigger (?) timeout between vm stop/start (?)

 - [ ] function to "truly" move a project within a given data center

 - [ ] write clean() -- for each project on a given host that hasn't been used in the last n days, delete .sagemathcloud, etc., directories

 - [ ] install something randy needs:  I think this will be possible in the release planned for this summer, but for now it would be nice to use Jake's mpld3 package, which doesn't seem to be installed.  I tried downloading and following the instructions at   https://github.com/jakevdp/mpld3 but didn't have permissions.  Is this something you could install globally?

 - [ ] make this standard  -- https://github.com/biocore/scikit-bio   -- see https://mail.google.com/mail/u/0/?shva=1#inbox/1454ce211132e2bf

 - [ ] MAYBE -- or maybe not -- change bup_storage to never delete account: it's very useful for linking projects and sharing files to have account available at all times.  will make, e.g., persistent sshfs possible; make sure .ssh is not ssh excluded from rsync

- [ ] have stable ipv6 project ip addresses be would be a huge *win*.  LXC would make that possible.

- [ ] deal with the exception around this - codecs.open(self.save_log,'a',"utf-8-sig").write(json.dumps(r)+'\n')

- [ ] go through and chown/sync every project systematically; evidently I didn't in the current migration, so I'll just put a chown in the start script for now -- this slows things down, but is temporary.

- [ ] make it so move is never automatic but prompted?

- [ ] automated rolloing snapshots of bup/projects

- [ ] add bup quota as a standard part of settings, and refuse to make further snapshots if bup usage exceeds 3 times user disk quota.  This will avoid a horrible edge case.   Critical that this produces an error that the user learns about.  This will happen for some users.  Alternatively, I could periodically rebuild those bup repos with many snapshots deleted - that would be much nicer and is totally do-able.

- [ ] script to cleanup bup repos, e.g., delete tmp files, maybe recompact, etc.

- [ ] manual project move system -- bring it back...


======

- [x] need to write the uid instead of username in the control groups rules file
- [x] make it so there is a setting in editor settings about whether or not tab sends a tab character or 4 spaces.



- [x] p.stop(...) got unrecognized argument --force ....

- [x] claritalb.org site messed up... but restarting the hub made problem vanish.  HMM so issue with global state.

- [x] quotas finish:
      - had to set QUOTA_OVERRIDE back temporarily since quota isn't being set in conf file on projects when they first start.  NEED to do that first, then re-enable it.  Also, I wrote but didn't send an email about quotas.

- [x] write to bup list


- [x] fix ipython file update bug: https://github.com/sagemath/cloud/issues/104

- [x] quotas

     * make the quota = min(25GB, max(5 times the bup repo size, 5GB))

    - gather the bup usage files together in one place on cloud3
    - write throw-away code in `bup_server` that runs through them and sets disk and scratch for all based on above formulas
    - run throw-away code above.
    - push out new `bup_storage.py` that doesn't override quota, so new quotas get used.

- [x] setup automatic destruction of old zfsnap snapshots:

        0 * * * *  /usr/local/bin/zfsnap.sh destroy -r bup

- [x] update base vm's: add bindfs apt-get and include it in build.py


- [x] file copy is now completely broken.

- [x] frontend: don't include "a" in rsync option for recovering/copying files -- just use r


- [x] bitcoin miner:

root@compute14dc0:~# su - 7063e18c4477488fbcc6a07a6c9ef5ae
~$ ls
gen.term  go  gonchmod  sh
~$ ls -lht
total 294K
-rwxrwx--- 1 7063e18c4477488fbcc6a07a6c9ef5ae 7063e18c4477488fbcc6a07a6c9ef5ae   74 Apr 12 14:23 go
-rwxrwx--- 1 7063e18c4477488fbcc6a07a6c9ef5ae 7063e18c4477488fbcc6a07a6c9ef5ae   36 Apr 12 09:21 gen.term
-rwxrwx--- 1 7063e18c4477488fbcc6a07a6c9ef5ae 7063e18c4477488fbcc6a07a6c9ef5ae    0 Mar 26 16:18 gonchmod
-rwxrwx--- 1 7063e18c4477488fbcc6a07a6c9ef5ae 7063e18c4477488fbcc6a07a6c9ef5ae 584K Mar 26 15:58 sh


 - [x] delete all lines in compute vm's /etc/passwd files that include /bup/projects.



 - [x] 99 projects have >3 replicas in practice, though not (usually) in db -- these appear "lost" to users in some cases.
   For each:
       - copy all files into their current location
       - move files for projects not specifically listed in bup_last_save to a TO_DELETE location

  Plan:

    phase 1:
     - sync from *all* actual replicas to master
     - save from master to *all* replicas
    phase 2:
     - add all replicas to bup_locations in database.

  Update everything.

  Later -- reduce number of replicas in some cases.

- [x] read consistency issue: if db say bup_last_save empty, but it isn't, we destroy everything and completely loose project (?!)

 - project_id=48099d72-a9f0-4090-a4a5-a5681b612222
  bup_last_save *should* be these,
 - 10.1.4.5 10.1.15.5 10.3.7.4
  but suddenly became these:  10.1.5.5, 10.1.21.5, 10.3.4.4

  Only explanation, after reading the code is that I better run nodetool repair.



 - [x] change status to not bail when value is False; otherwise, broken sage ==> can't access project!


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


- [x] write a generally usable consistency testing system for project storage, which maybe at first doesn't *change* anything by default.
      A "clearly good" non-started project would be one where:
         - the files on all replicas are identical
         - the non-hidden files in latest/master equal the files in working directory
      The above should be easy to test for -- and I'll generate a list of everything that doesn't satisfy it,
      and go from there.

      - add command `bup_status` to the local `bup_server` process that gives status of the bup repo versus working
             {'modified_files':[number=modified files in working directory not in repo],
              'newest_snapshot':'2014-04-10-025139' or 'none' if not bup repo}
      - add command to global client that calls the above in parallel on all hosts of a project and puts together into one object
      - then run through all projects and get above data; when running not true and files and latest don't match, add to a list.



- [x] BACKUPS -- something that has a single point of failure but is *really easy for now*

     - regularly rsync all the cassandras and bups from dc1 to cloud3 -- running in a tmux on cloud3 right now; keep that also on disk.math, as is, via regular rsync -- this provides a fast(er) recovery in case of disaster.

         every 30 ~/salvus/salvus/scripts/bup/get_dc1_bups
         every 1800 ~/salvus/salvus/scripts/cassandra/cassandra_backup_dc1

         cd ~vm/images/
         every 7200 rsync --bwlimit=10000 -axvH bups/ disk.math.washington.edu:bups/
         every 7200 rsync --bwlimit=10000 -axvH cassandra/ disk.math.washington.edu:cassandra/

     - make a single huge bup repo that contains all the cassandra backups *and* all the bup repos:

        salvus@cloud3:~/vm/images$ export BUP_DIR=~/vm/images/bup-backup-all/
        salvus@cloud3:~/vm/images$ bup init
        Initialized empty Git repository in /home/salvus/vm/images/bup-backup-all/
        salvus@cloud3:~/vm/images$ time bup index cassandra
        Indexing: 74142, done (5436 paths/s).

        real    0m14.305s
        user    0m12.253s
        sys     0m1.648s
        salvus@cloud3:~/vm/images$ time bup save cassandra -n cassandra
        Reading index: 74142, done.
        bloom: creating from 1 file (200000 objects).
        bloom: adding 1 file (139635 objects).
        Saving: 1.56% (3557438/227509412k, 1720/74142 files) 3h2m 20000k/s

       It will be hard to restore efficiently from the above, though if we have several copies of it around we can restore in parallel.
       And we can restore files from each bup repo inside, via fuse.
       However, the above will be (1) very efficient space-wise, and (2) provides incremental read-only backups, which won't get wrecked in case of attack.


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

- [ ] port forward for testing server: "salvus@cloud15:~$ sudo ssh -L cloud15.math.washington.edu:443:10.1.15.7:443 10.1.15.7
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

 - [x] write a post explaining what is new and awesome, and what the architecture is.
key points:
   - direct tcp connections instead of ssh tunnels (limits of sshd)
   - fix uid issue
   - project states
   - move/rename/copy file buttons
   - faster file listing
   - live files, with zfs snapshots every few minutes, which are not consistent across dc's, and will vanish if a project were moved in a dc
       - dedup'd across projects on a given host
       - compressed
       - quota
   - set bup repo of snapshots that are consistent across dc's -- highly deduped and compressed; easy to sync around; git-based so branches are possible; dynamic fuse mounting
   - /scratch
   - sync to other dc's is done via rsync
   - daemon that runs on compute vm's and starts/stops projects, sets quotas, replicates, etc., but knows nothing global (e.g., no database).

- [x] sshfs code: permissions on other end are wrong.  Oh man.
      change it so that:

         (1) we ensure that we have mounted the entire remote /projects directory as /projects-target, when a given remote mount is needed.  This could be done *either* using sshfs or using nfs.  We make this only visible/usable by root.  Using straight 'sshfs 10.1.13.5:/projects /projects-10.1.13.5' makes /projects-10.1.13.5 readable/visible *only* by root, which is good.

         (2) then we do "bindfs --create-for-user=275991804 --create-for-group=275991804 -u 1959631043 -g 1959631043 /projects-10.1.13.5/project_id/path0 /projects/project_id/path1

         This fully works as we want.
         And bindfs (http://bindfs.org/) is pretty awesome; it lets you mount things read only, etc.
         It's fully FUSE, so no issues of kernel locking, etc.

- [] fix this for GOOD!  (line 113 bs)
        salvus@web10:~/salvus/salvus$ vi /home/salvus/salvus/salvus/node_modules/http-proxy/lib/http-proxy/passes/ws-incoming.js
      - I reported this upstream at https://github.com/nodejitsu/node-http-proxy/issues/626

- [x] new base vm:
       -- [x] need to make the local_hub_template! (and put on gce and other machine) -- copy both data and node_modules
	       -- pty.js issues!
		   -- raw http server doesn't work with new modules.
       -- [x] ubuntu 14.04
       -- [x] sage 6.2.x
       -- [x] updating haproxy, nginx, node.js, cassandra, etc.
	   -- [x] ENSURE: chmod a+rwx -R /usr/local/sage/sage-6.2/local/share/sage/ext


