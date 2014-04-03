
- --> [ ] run prep script

      - [x] switch the existing looping script to use RF=1

      - [ ] it turns out that i called the google dc=1 instead of dc=2 in my allocation so far.
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

      - change sync/save code to take list of target ip's





- [ ] implement `get_state` in `bup_storage.py`: it will return two things, according to a "local calculation" purely from within the project
        - state: stopped, starting, running, restarting, stopping, saving, error
        - when: when this state was entered
        - step: init_repo, restore (copying files from bup), syncing template, etc.
        - progress: if there is a way to give how far along with doing something (e.g., rsyncing out to replicas)
    could do this by creating a conf file that is *NOT* rsync'd that stores stuff:   conf/state.json

- [ ] quotas -- try to preserve them, and set them before doing bup restore!  right now my scripts set many of them to 3GB, but that won't make any sense in the longrun.  I could do something based on the size of the bup repo, or ...?

- [ ] make bup_storage.py set a saving file, and remove it when saving finishes, so that status can report that.  MAYBE.  could be bad.


- [ ] make the serverid's of replicas just be part of project settings exactly like anything else; and get set from the database. Why even bother with the database for the settings? -- well, otherwise how can we even find the project!


AFTER SWITCH:

- [ ] add files to bup/projectid/conf/replicas.json with the replics for that project, which will be used by default in the future to determine replicas; of course database save info and buplocation will be used to *find the project* in the first place, with the default for new projects determined by consistent hashing.  rolling this out is only necessary when I add new nodes.  Wait until after switch.

- [ ] add bup quota as a standard part of settings, and refuse to make further snapshots if bup usage exceeds 3 times user disk quota.  This will avoid a horrible edge case.   Critical that this produces an error that the user learns about.  This will happen for some users.  Alternatively, I could periodically rebuild those bup repos with many snapshots deleted - that would be much nicer and is totally do-able.

