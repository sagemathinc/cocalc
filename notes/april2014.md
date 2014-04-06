- [ ] migrate all projects again; update quota information using du script.

- [ ] display snaphot times as local time (and timeago if not too slow)

- [ ] move/copy/delete/download

- [ ] UI -- display current project state clearly somewhere (and make it so move is never automatic but prompted)


- [x] optimize file listing display
- [x] when opening a new project just place randomly -- no use of consistent hashing.


BEFORE SWITCH:

 - [ ] must update bup-1 on all vms!   https://github.com/williamstein/bup-1


====

AFTER SWITCH:


- [ ] add bup quota as a standard part of settings, and refuse to make further snapshots if bup usage exceeds 3 times user disk quota.  This will avoid a horrible edge case.   Critical that this produces an error that the user learns about.  This will happen for some users.  Alternatively, I could periodically rebuild those bup repos with many snapshots deleted - that would be much nicer and is totally do-able.

- [ ] write snapshot browser.

- [ ] manual project move system -- bring it back




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
