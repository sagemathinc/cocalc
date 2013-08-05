

# DONE

- [x] (0:15?) install aldor -- https://mail.google.com/mail/u/0/?shva=1#inbox/13ffceb2441ad76e

- [x] (2:00?) (8:00+) automatically deploy a project using a snapshot, in case it is no longer deployed:

   - when opening project, if location is null, do this:
     part 1:
       - allocate new location (from pool)
       - check database for newest available snapshot
       - if no snapshots, done
       - if snapshot, recover -- user will see files appearing

     part 2:
       - set flag in projects db entry that indicates "in recovery state"
       - add some UI stuff so user can tell that files are being recovered

                testing with fa52035d-4e9c-4e90-a1fa-d85a7fa69401
                {"host":"localhost","username":"TtWVSmiP","port":22,"path":"."}
                cqlsh:test> update projects set location=null where project_id=fa52035d-4e9c-4e90-a1fa-d85a7fa69401;
                cqlsh:test> select * from projects where project_id=fa52035d-4e9c-4e90-a1fa-d85a7fa69401;
- [x] (0:10?) (0:10) rename "1468 accounts (34 signed in)" -->  "1468 accounts (34 connected clients) "
- [x] (0:15?) (0:10) get rid of border for this: <div class="sagews-input" style="width: 1184px;"><hr class="sagews-input-hr"></div>
- [x] (0:15?) (0:17) make worksheet/editor font be user's monospace no matter what for now; otherwise, is really annoying.
- [x] (0:30?) (0:04) i see this in the address bar?  why?  "https://cloud.sagemath.com/#add-collaborator" -- fluke
- [x] (1:00?) (0:16) make it so foo?[enter]  and foo??[enter] both work.
- [x] (0:30?) (1:16) create new project -- the "OK" button, etc., might not be visible, and there is no way to scroll; fixed by switching to using http://jschr.github.io/bootstrap-modal/, which is much more powerful anyways.
- [x] (1:00?) (0:28) `graphics_array(...).show()` and pyplot's don't just display
- [x] (1:30?) (0:18) deprecation broken by something cloud does! `find_minimum_on_interval(x, 0, 3)`
- [x] (1:00?) (0:05) if connection to hub goes down, then reconnects, the tooltip about which hub we're connected to (in the top right) doesn't get updated properly
- [x] (0:30?) (0:05) `GET https://localhost/jquery/jquery-2.0.1.min.map 404 (Not Found)` in log on startup; upgrade to jQuery 2.0.3
- [x] (1:00?) (0:06) make interact functions callable
- [x] (1:00?) (0:42) interact bugs with `input_grid` first time, etc.
- [x] (1:00?) (0:13) move markdown2 (etc.) libraries to be in .sagemathcloud instead, so that "%md" mode works with any sage install, not just system-wide one.

- [x] (2:00?) snap: when database gets slow even once, snap servers just *STOP* querying, and that's that.  They make no more snapshots.
- [x] (1:00?) (0:11) Add link/banner to the sagenb login screen suggesting people try cloud.sagemath. I added some html to `/sagenb/sage_install/sage-5.4-sage.math.washington.edu-x86_64-Linux/devel/sagenb-git/sagenb/data/sage/html/login.html`


- [x] (0:45?) planning and general ops (just looking over everything).
- [x] (0:30?) (0:19) snap: if the recovering file itself is corrupt (e.g., empty), then snap can't unpickle it and fails to startup.  Need to wrap that `misc.from_json` in a try/catch.
- [x] (0:30?) (0:30) upgrade codemirror, which has bugfixes, e.g., python indent; adds five new themes.  Add link to theme previews in settings.
- [x] (0:30?) (1:00) sage-cloud email
- [x] (0:30?) sage days
- [x] (2:00?) write function in hub to move a project to storage:
    - [x] make a snapshot on all running snap servers; 2 must succeed
    - [x] set location to null in db
    - [x] delete files and account (need a "delete account" script to make the create account script).
    - [x] add projects db entry

- [x] (1:00?) (0:27) add a few "email wstein@gmail.com in it isn't working" messages to the HTML.
- [x] (2:00?) (4:10) debug "save project to storage" functionality and fix issues so that UI properly shows project restore status during restore
- [x] (0:30?) (0:36) stats object -- unbreak; change to show number of `recently_modified projects` for each time window; change help.html accordingly, of course.
- [x] (0:30?) (0:30) cassandra: rate limit project "touch"
- [x] (0:15?) (1:30) hub: make it so that the following actions all touch a project: diffsync action, terminal activity,
- [x] (0:10?) (0:10) update codemirror to current master version
- [x] (1:30?) (1:34) new release (Friday evening or Sat morning)
    - check that I have backups
    - x definitely `update_version`
    - x sudo apt-get install sysstat    # and anything for axiom people
    - x test new codemirror
    - x put the following in visudo:

            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/create_unix_user.py ""
            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/delete_unix_user.py *

      and put the appropriate files in /usr/local/bin
      and
           chmod +x delete_unix_user.py create_unix_user.py
           chmod -s delete_unix_user.py create_unix_user.py
1

    - x make symlink like this:
       cd /usr/local/bin; sudo ln -s /home/salvus/salvus/salvus/scripts/skel .

    - redo `recently_modified_projects` db schema table
    - update stats schema:
            alter table stats add last_day_projects int;
            alter table stats add last_week_projects int;
            alter table stats add last_month_projects int;


- [x] (2:00?) (3:20) expand the storage of the compute VM's:
          [x] compute1a, [x] compute2a, [ ] compute3a, [ ] compute4a
    x- Change services file:
     'disk':'home:128'  -> 'disk':'home:128,home2:1024'
    x- Reboot the vm's:
      [cloud.restart('vm',hostname='compute%sa'%i) for i in [1,2,3,4]]
    - cd /mnt; time sudo rsync -axH home/ home2/; sync
      time sudo rsync -axvH home/ home2/; sync
      time sudo shutdown -h now
    - Shutoff vm through ipython
    - Delete (move to TRASH) the home image, and move the home2 image to home.
    x- Edit the services file:   'disk':'home:128,home2:1024' -->  'disk':'home:1024'
    - Restart controlling ipython process.
    - [cloud.start('vm',hostname='compute%sa'%i) for i in [1,2,3,4]]

- [x] (2:30?) (2:23+) expand the storage of the base VM so can have many linux installs, haskell, etc.; and add SWAP
    x - how big?  256GB
         - 12GB = base OS install + packages
         - 60GB = 10 sages at 6GB/each
         - 48GB swap (?)
         - 48GB tmp
         - TOTAL = 152GB
    x - change services file for storm-compute1a to have an external 256GB disk -- and make sure it uses newest base vm.
    x - boot it up
    x - unmount
    x - use dd to copy over the complete root image to this new disk
    x- fdisk, confirm looks plausible (?)
    x- expand /dev/vdc5 to use new space: http://theducks.org/2009/11/expanding-lvm-partitions-in-vmware-on-the-fly/
salvus@storm-compute1a:~$ sudo fdisk -l /dev/vdc

Disk /dev/vdc: 274.9 GB, 274877906944 bytes
16 heads, 63 sectors/track, 532610 cylinders, total 536870912 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk identifier: 0x000d72a0

   Device Boot      Start         End      Blocks   Id  System
/dev/vdc1   *        2048      499711      248832   83  Linux
/dev/vdc2          499712    33554431    16527360    5  Extended
/dev/vdc5          501760    33554431    16526336   8e  Linux LVM

    - change services file back
    - reload storm object and restart vm
    - rename the image we just made
    - start a new vm with this new image as its base, and test that it books.
    - use pvresize to expand the physical volume to use all the new space:     pvresize /dev/vda5
    - create/resize volumes:
        / (160GB)

        swap (48GB)
        tmp  (48GB)

            lvcreate -L48G salvus-base -n /dev/salvus-base/tmp
            lvcreate -L48G salvus-base -n /dev/salvus-base/swap
            lvextend -L+144G /dev/salvus-base/root
            resize2fs /dev/salvus-base/root

    - make swap and format tmp -- we do *NOT* mount/enable these, since don't want sparse image to get huge.

        mkfs.ext4 /dev/salvus-base/tmp
        mkswap /dev/salvus-base/swap
    - format tmp




- [x] (1:00?) new non-default beta sage; test new bigger vm image.
    - x build sage-5.11.beta?
    - install optional stuff into that sage (?)
    - test as storm-compute1a
    - push at to other nodes
    - deploy on storm:
       fix permissions of sage install:

           find . -type d -print -exec chmod a+rx {} \;
           chmod a+r -R .
           find . -executable -exec chmod a+rx {} \;
    - deploy on cloud.

- [x] (0:30?) (0:15) permissions: it looks like I screwed up the permissions of new project account creation... again. manually fix and fix scripts, again.
No, just a few weren't fixed:
   ls -lt|grep -v "drwx------"

- [x] (0:45?) restart everything with improved swap, etc.:

    - do another push (?)
    - test on storm first
    - do on cloud.  Will be an improvement.

- [x] (1:30?) (1:51) do not make snapshot if no files changed; this is pretty AWESOME.  It makes it so every snapshot has a genuine change in it, and doesn't exist without any changed files.  And each snap servers snapshots are really different, so they have a reason for existence.

- [x] (0:10?) (0:10) push out new snap settings

- [x] (1:00?) (0:56) snap: record in database list of files changed in this snapshot, and also make a new table that allows us to find the times when a file changed.

- [x] (1:00?) (0:40) fulltext search: exclude cell uuid codes; also make all searches a single string search

- [x] (1:30?) (0:35) automatic conversion of docx files to txt -- just take the code from "Clarita Thesis" project.

- [x] (4:00?) (5:00) automatic conversion of sws files:
        - you click on a sws file, and if there is a sagews file with the same name, that is just opened instead (with a message).
        - If there is no such file, then the sagews file is created and opened (with a message).
        - At some point I'll also write exportors from sagews to many different formats, including sws.  But not yet.
        - Probably the most pleasant way to implement the sws --> sagews conversion is via a standalone Python scriptn    :  "sws2sagews"
          An updated copy will also be in ~/.sagemathcloud, which is in the PATH.  This way we can do the conversion without ever
          involving `sage_salvus.py`.  It also makes it easier for the user to customize things if so desired (?).
          It makes batch processing easier too.
        x - (2:58) Create a simpler convert script that works on my first example.
        x - (0:55) Integrate sws2sagews conversion into cloud framework:
             x - ensure is in .sagemathcloud PATH.
             x - gets run when .sws file clicked on, but doesn't overwrite output.


- [x] (2:00?) (0:30) automatic relaunch of db *when* it dies... or maybe upgrade and it won't die anymore (?): it turns out cassandra really dies, so the .status(...) monitor in admin detects this. So, I can add restart functionality to admin.py.  No matter what, this is a good thing to have.  And will be easy.

- [x] (2:00?) (1:36) the file Downloads/own.sws on my laptop when loaded immediately leads to an infinite sync loop due to a checksum mismatch. What's wrong with it?  How does it completely break the entire diffsync setup?  Must find out!

    - NOTE 1: there are ^M's in the file, i.e., DOS line endings (caused by github).  Maybe that is the problem.
    - Removing them does fix the problem.
    - try making a worksheet with trivial use of them.

# immediate goals
            - [ ] 2 hours -- fix Downloads/own.sws  bug.
            - [ ] 2 hours -- more refinement of sws converter
            - [ ] 2 hours -- basic ipynb converter.
            - [ ] 1 hour -- worksheet showing on sync weirdness (?)
            - [ ] 30 min -- upgrade codemirror 3.15
            - [ ] 3 hours -- implement global chat / community tab
            - [x] 1 hour (5 actual hours) -- shop for computers
            - [ ] 1 hour -- more email


- [x] (2:00?) conversion of sws files, part 2: Deal with as many edge cases as I can think of:
   - title
   x - default mode
   x - typeset mode
   -> - %auto
   -> - %hideall
   -> - %hide
   x- (0:45?) (0:37) DATA variable
    - img src: I can't do this without a URL scheme, etc., which is a big project.
         window.history.pushState("object or string", "Title", "/project/foo/sd22.sagews");
         http://stackoverflow.com/questions/824349/modify-the-url-without-reloading-the-page/3354511#3354511


--> - [ ] (1:00?) next release
    -- apt-get install python-lxml
    -- include fricas/aldor -- see https://mail.google.com/mail/u/0/?shva=1#inbox/13ffceb2441ad76e


Hi,

I've updated https://cloud.sagemath.com.   The changes are:

    * Added FriCAS (thanks to help from Bill Page and Ralf Hemmecke).
      You can now type "fricas" in the terminal to run it.

    * Implemented automatic conversion of Sage Notebook .sws files to .sagews file.
      Just click on a .sws file and if there is no corresponding .sagews file, then
      it is generated then opened.  Look carefully at the result, since there are
      many heuristics in the conversion script.  It handles typeset mode, default
      modes, the DATA directory contents, etc.   It can't handle
      <img src="foo.png"> (with foo.png in the DATA directory) yet.
      In any case, this should be pretty useful in making it possible to use
      older Sage Notebook worksheets in https://cloud.sagemath.com.
      You can run this conversion yourself on a file by typing "sws2sagews.py filename.sws".

    * Automatic conversion of Microsoft Word .docx files to .txt files when you click
      on them.   It's not Google Docs, but it might be somewhat useful.
      You can use this converter on the command line by typing "docx2txt.py filename.docx".

    * Fixed a serious bug in synchronized document editing -- if you tried to edit
      a file with "\r\n" for newlines (e.g., as produced often by Windows),
      the synchronization would go into an infinite checksum error loop
      and it would never work.  The \r's are now stripped on the server side
      automatically before editing starts.

    * CSS -- I changed how output is indicated in worksheets; now it is just a line
      on the left.  Feedback appreciated.

    * Project search -- exclude cell UUID's and make the search look for the complete string
      in cases there are spaces in the input.

    * Snapshots are now not made unless a file has actually changed since the last time there
      was a snapshot.   Also, the changed files are now recorded in the database.  This will
      soon (not right now) provide a way -- given a file -- to see a list of the snapshots
      in which it changed, and also, given a snapshot, see which files changed in it.

    * Wrote script to monitor the database server every few seconds and restart it if it
      crashes.  These crashes were responsible for some downtime recently.
      The crashes should likely go away when I upgrade Cassandra, but having this monitor
      will at least minimize downtime.


    * I also spent quite a while today planning to buy more hardware for the cluster.

 William



---
- [x] (1:00?) (0:07) WAIT on this; see what happens with more swap; make cassandra get auto-restarted when it runs out of memory.

        Cassandra keeps running out of memory and crashes... and doesn't get restarted, which totally kills everything.
        Having swap will help a lot, probably, Auto-restarting cassandra would help anyways (forever).
        ERROR [Thread-5] 2013-07-28 22:46:03,795 CassandraDaemon.java (line 174) Exception in thread Thread[Thread-5,5,main]
        java.lang.OutOfMemoryError: unable to create new native thread
                at java.lang.Thread.start0(Native Method)
                at java.lang.Thread.start(Thread.java:640)
                at java.util.concurrent.ThreadPoolExecutor.addThread(ThreadPoolExecutor.java:681)
                at java.util.concurrent.ThreadPoolExecutor.addIfUnderMaximumPoolSize(ThreadPoolExecutor.java:727)
                at java.util.concurrent.ThreadPoolExecutor.execute(ThreadPoolExecutor.java:655)
                at org.apache.cassandra.thrift.CustomTThreadPoolServer.serve(CustomTThreadPoolServer.java:113)
                at org.apache.cassandra.thrift.ThriftServer$ThriftServerThread.run(ThriftServer.java:111)



July 28 (Sunday): tish+skate: until 2pm; 1:30pm-1am (11.5 hours) -- work super hard on cloud.sagemath
July 29 (Monday): 8am-12am -- 16 hours on cloud.sagemath (no skating)
July 30 (Tuesday): 8am-12am -- 16 hours on cloud.sagemath (no skating)

July 31 (Wed): students meetings; pick up tish; bs day, skating



- [x] (1:30?) (4:45) fix the salvus.file timing issues -- make sure to lock until hub confirms file saved to db:
            ( ) - in local hub, TODO: add something to "handle_save_blob_message"
            ( ) - in global hub, upon saving a blob, send a message in the usual back to the local hub about what happened.
            ( ) - improve python code to fully use this functionality
            ( ) - improve file download code to use this functionality

- [x] (0:30?) (0:04) ui - cleanup -- make the icon-refresh's in project settings spin themselves, instead of another icon.

- [x] (0:30?) ui cleanup -- improve html before refresh buttons in project settings.

- [x] (0:30?) upgrade to codemirror 3.15: https://mail.google.com/mail/u/0/?shva=1#inbox/14029b596102b364

# August 2, 2013

- [x] (0:30) new release
- [x] (0:30) (0:16) spinner when loading the list of collaborators -- it's confusing to see it empty during the db query.

- [x] (1:00?) (0400) delete all output button -- see https://mail.google.com/mail/ca/u/0/#inbox/140371ee97f8e5e5

- [x] (3:00?) project-level activity -- round 1

    - [x] (0:10?) (0:15) plan.
    - [x] (0:15?) (0:16) add new icon after "New" with user symbol
    - [x] (0:45?) (0:23) create corresponding page, and code to switch to it; have the input text area and the messages area, but very minimal
    - [x] (0:30?) when project is opened, always open a diffsync document called something like `$HOME/.activity_log`
    - [x] (0:30?) make the minimal (from above) text input area and message output area live so at least there is chat; also actions displayed in some simple way
    - [x] (0:45?) project log -- prepend JSON line to that file when activities occur:
          x- user opens a project
          x- user opens a file
          x- user chat message
    - [x] (0:20?) make it an *append* log, not prepend -- just display it in reverse order by default; this will make it much safer for users to append to.

    - [x] (1:30?) can't display/render the whole log at once, since too slow: need a zoom-able timeline/calendar or something.
Ideas:
   - show 30 (say) events, then show one link for each *day* with >0 events, and in parens the number
     of events on that day.  Clicking expands that day and only that day.
   - Newer/Older pager buttons, and show n per page.  Very simple.  Can enhance with
     a color-coded calender later.

   - [x] directly openeing the log file at same time leads to issues.

    - [ ] (1:00?) more events
          - snapshot completed (directly edit the log file; include abbrev. list of modified files (?)) --
             ... but I would have to check that they are available, which is a can of worms.
          - upload file
    - [ ] (0:30?) refactor ensure file exists functionality (to salvusclient)

- [ ] new release:

Hello,

I've made a client-only update to https://cloud.sagemath.com.
You'll likely only see this if you "shift-refresh" your browser at
https://cloud.sagemath.com, since I haven't updated things
so the red upgrade warning appears yet.  New features:

   1. There is a new "delete output of selected cells" button in worksheets (requested by Steve "singlets").

   2. There is now a running log of events (so far: open file, project-wide chat), as requested by Harald Schilly.

      In each project, right after "+New" you'll see "Log".  Click and you'll
      see (with a link) each file anybody using the project opens,
      and when they open it, so you can see who is opening what.   It's also handy, since it's a place
      to find links to files you've used recently.    You can also type messages at the top, so this is the
      start of a project chat facility (it still lacks notifications).

      The actual log is stored in a file ~/.sagemathcloud.log, with one entry per line.  If you modify this
      file (e.g., append to it), then that modification should get noticed within 5 seconds, and properly
      appear in the log.  If you just delete this file then the log is cleaned.

      What events do *you* want to see in this log?  I could make it so all chats (on any file) appear here.
      When snapshots are made, they could appear here, along with the first few modified files
      in the snapshot (?).  Easy editing of past chats (only possible now via the terminal)?

   3. In the settings page, you'll see a spinner when the list of collaborators is being loaded, which helps
      avoid confusion.


 -- William



