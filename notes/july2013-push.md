
July 28 (Sunday): tish+skate: until 2pm; 1:30pm-1am (11.5 hours) -- work super hard on cloud.sagemath
July 29 (Monday): 8am-12am -- 16 hours on cloud.sagemath (no skating)
July 30 (Tuesday): 8am-12am -- 16 hours on cloud.sagemath (no skating)

July 31 (Wed): students meetings; pick up tish; bs day, skating

# next 42 hours.

--> - [ ] (2:00?) expand the storage of the compute VM's:


- [ ] (2:30?) expand the storage of the base VM so can have many linux installs, haskell, etc.; and add SWAP

- [ ] (1:00?) project storage ui polish: add html for all three project states: stored, restoring, active with tooltips explaining them; make html for this clean; make each "lighten" class.; color codes

- [ ] (1:00?) hub: implement `snapshot_project` function (and make sure to change number of copies for delete to 1 on localhost).

- [ ] (1:00?) write code in hub that periodically moves older projects to storage.  Maybe have to modify db schema to make this efficient, e.g., only ever look at projects that are not in storage.  Have two modes: a slower one that iterates over all projects, and one that takes project that were active in the last *month*, but not in the last week, and shelves only those.  Run on all hubs -- at a randomized interval, and iterating over the projects in a random order.

- [ ] (0:30?) hub:  for each Project/LocalHub class in global hub, check every 30 minutes to ensure that it is actively being modified.  If not, collect it.  This is critical, since we absolutely can't have a Project/LocalHub class sitting around in some hub when we move that project to storage.  Also, it avoids memory leaks.

- [ ] (4:00?) (1:07+) ability to open sws files
- [ ] (2:00?) snap: UI for seeing nearest snapshot to a chat (just a link for now)


- [ ] (1:00?) new release

- [ ] (1:30?) write code in hub that ensures local hubs are always pre-started up for projects that have been accessed in the last week (again, a ttl'd new db schema field would do this).

- [ ] (3:00?) community tab: a system-wide chatroom that all connected users can use to chat (math enabled)

- [ ] (2:00?) project restart and hub diffsync sessions: this leads to a very BAD situation that will piss off user:
       - open a worksheet or file to edit
       - restart local hub, but do NOT restart global hub
       - re-open the same file
       - look at the log in hub, and see an "infinite loop" of reconnect attempts.
       THIS is very serious.  The user must refresh their browser to fix this.  BAD.  And wastes resources.

- [ ] (2:00?) *TOP PRIORITY* sync is messed up:  when connection gets reset sometimes it never correctly *saves* again, which will result in MAJOR data loss --- because suddenly "Save" doesn't really work.  This is new and absolutely top priority.  This was entirely a problem with the local hub getting messed up, which is unusual.  I have no clear way to reproduce this.

- [ ] (1:30?) snap: make it only take a snapshot if a file does change.

- [ ] (2:00?) ulimit individual projects -- on july 22 one VM became unusable due to running out of memory, etc.

- [ ] (3:00?) (0:43+) "invite a friend" easy way to invite somebody else to get an account when sharing projects
  - page: design&implement the dialog where the user composes the message to friend
  - hub?: need to make it so 'https://cloud.sagemath.com/signup' immediately displays the "create an account" page.
  - hub: need to add a db table of "signup triggers", e.g., actions that happen when a particular email address is signed up, e.g., getting added to a project, banned, etc. -- should work with `email+*@'s`




---

- [ ] (1:30?) security issue -- should probably remove `/home/salvus/.ssh/id_rsa` from compute salvus on boot... since this grants access to other machines.  On the other hand, be careful since this is needed for making new projects the way I do now.

# Growth features

- [ ] (3:00?) templates -- https://mail.google.com/mail/u/0/?shva=1#inbox/140073638f4efd87

# User Visible Bugs

- [ ] (1:00?) reduce the terminal output rate-limiation thresh-hold -- it is ANNOYING or buggy.

- [ ] (1:00?) (0:40+) strip "sage:" prompts from input blocks like in sagenb.org and command line; this makes copying code from docstrings much easier, etc.

- [ ] (1:00?) tab completion bug: edge case -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/14004a6da697a304

- [ ] (0:30?) creating a new cell should always scroll that cell into view, but often doesn't.
- [ ] (1:00?) highlight some blank space at bottom and do "shift-enter" -- get lots of new empty cells.
- [ ] (2:00?) optimize computation of diffs for synchronized document editing when there is a long line; right now, every time it diffs the entire doc.  If there is a single huge line of output -- e.g., take july2013-push.md and render it using md in a worksheet, so we get a huge single line of output -- then suddenly things feel very slow.
- [ ] (1:00?) if "Recent" tab is open and you switch project tabs, then switch back, sometimes Recent looks empty (seen many times, not sure how to replicate)
- [ ] (0:45?) on reconnect, sync all synchronized docs with hub (just like we do with fixing terminals).
- [ ] (2:00?) rename/copy/move a file:  'Something my students have complained about: after clicking an "Rename file", a box appears around the name of the file.  It is then tempting to click inside of that box (or triple click, even), but if you try this, you are taken to the file itself.  I was confused by this behavior at first, too.  It would perhaps at least be nice if after clicking on "Rename file", there was an easy way to delete the long default file name. ' (Dave Perkinson)
- [ ] (2:00?) improve how search in a doc works!  -- https://mail.google.com/mail/u/0/?shva=1#inbox/13ff8a0b89d4684a
- [ ] (1:30?) terminal -- firefox copy/paste (requested by everybody)
- [ ] (1:00?) first sync still confusing -- deletes stuff on first save (?); throw in a first save?
- [ ] (0:30?) Still some mathjax + markdown issues... e.g.,  This doesn't work
    %md
    $$\{ foo \}$$
    even though this does
    %md
    $\{ foo \}$
    \[
       \{ foo \}
    \]
- [ ] (1:30?) terminal reconnect -- works fine on browser reconnect, but fails on dropped connection, since I didn't implement that yet.
- [ ] (1:00?) fulltext search: should exclude uuid cell start marker lines
- [ ] (1:00?) fulltext search: for output lines, double check each result and make sure search term isn't in uuid
- [ ] (0:30?) make all open document sync every n seconds no matter what.
- [ ] (1:00?) on connection reset, force all open documents to sync.
- [ ] (1:00?) UI: renaming a long filename doesn't work.
- [ ] (1:00?) UI/client: warn before opening huge files... (recommend vim/emacs... or implement something that streams?)
- [ ] (0:45?) BUG: clearing the "recent files" list makes it so none of the open file tabs at the top of the screen work anymore.
- [ ] (1:00?) markdown -- there is no way to just insert a $.  Make \$ just $ without math....? somehow.
- [ ] (1:00?) search should not include hidden files by default....
- [ ] (1:00?) client.exec is timing out after about 10 seconds no matter what.  This messes up "disk usage", among other things...  I wonder why?
- [ ] (1:00?) show(animate) doesn't work
- [ ] (1:00?) when user exits terminal, restart terminal automatically... when they hit a key?
- [ ] (1:00?) update codemirror display more, e.g., after making output.  see https://groups.google.com/forum/#!topic/codemirror/aYpevIzBUYk
- [ ] (1:00?) BUG -- downloading a file that starts with "." removes the ".".
- [ ] (1:00?) %md -- make all links open in a new window
- [ ] (0:45?) "Latex Log" --> "Latex"; also the icons are wrong: icon-refresh should be "eye", and refresh should be next to latex.
- [ ] (1:00?) move recent files (etc.) thing to the database; it's too frustrating/confusing tieing this to the client computer.
- [ ] (1:00?) code execution needs another state: "w" for waiting.  E.g., 2 cells, one with sleep(5) and the next with sleep(5) make this clear.
- [ ] (1:00?) BUG: click on a 15MB tarball by accident via the file manager, and local hub breaks, and file never comes up; no way to recover (except restart hub?)
- [ ] (1:00?) when using an interact on cloud.sagemath.com that produces graphics (lecture 17 of 308), I'm seeing the image in output not appearing with some probability.  I'm guessing this has to do with how files get sent from local hub to hub, and there being multiple global hubs... and them not using the database always.
- [ ] (1:00?) see graph.sagews in "clarita thesis" project; sometimes the d3 graph doesn't display with a syntax error
- [ ] (0:30?) %hideall doesn't hide output, but should.
- [ ] (0:45?) sagews: javascript(once=True) isn't respected; needs to use a different channel... (broadcast?)
- [ ] (1:00?) sagews bug -- html.iframe gets updated/refreshed on all executes. why?
- [ ] (0:10?) syncdoc: remove "click_save_button:" from syncdoc.coffee, in case it is not used (I think it isn't).
- [ ] (1:00?) don't allow editing a file if it is above a certain relatively small size (at least, give a warning)
- [ ] (1:00?) BUG in sage execute: "divide into blocks" to respect code decorators, plus fix ugly recombination of if/while/etc.
- [ ] (0:45?) BUG: os x "control-o" should also accept command-o
- [ ] (0:30?) update the salvus.file docstring with current TTL parameters.
- [ ] (0:45?) worksheet: highlighting many cells and pressing shift-enter results in many new cells
- [ ] (1:00?) bug in block parser -- https://mail.google.com/mail/u/0/?shva=1#inbox/13f21ec599d17921
- [ ] (0:20?) tooltips on delete project and public/private look wrong (not bootstraped)
- [ ] (1:15?) get rid of 0=disable autosave; very dangerous.
- [ ] (0:45?) MAYBE -- when adding blank lines at bottom, if cursor is at *very* bottom and backspace, it can be confusing.




# User Features

- [ ] (2:00?) account settings: keyboard shortcuts
- [ ] (1:00?) display last computed usage for each project in project page, along with global total usage
- [ ] (0:45?) create a cell decorator "%typeset" that typesets output for only that cell using `typeset_mode(1)`
- [ ] (1:30?) terminal -- a "history" button; click it and get a popup (?) that contains the current terminal history; can be select-all'd.
- [ ] (1:00?) global default for file order mode.
- [ ] (1:30?) select block of code and comment / uncomment
- [ ] (1:30?) shortcut to switch between open files in projects: Control+Alt+Arrow or Shift+Command+Arrow (on OS X)
- [ ] (1:30?) search filenames only -- https://mail.google.com/mail/u/0/?shva=1#inbox/13fe8775dac2a83b
- [ ] (1:00?) pdf viewer -- should have link to download pdf.
- [ ] (1:00?) 3d: enable and test three.js's canvas fallback rendering
- [ ] (1:30?) way to star projects; show the starred ones first
- [ ] (1:30?) way to star files; show the starred ones first
- [ ] (1:00?) make it so settings autosave; get rid of confusing "save"/cancel buttons, since they only do certain things...
- [ ] (1:00?) snap: ability to *download* files directly from snapshots
- [ ] (1:00?) snap: preview file when clicked on
- [ ] (1:30?) new project default git and default config based on project creator (?)
- [ ] (1:00?) make it so "create a new file" allows you to just paste a URL in the filename blank... to get a file from the web; much simpler!
- [ ] (2:00?) image/pdf file change auto-update (due to frequent requests from users)
- [ ] (3:00?) copying/move file/directory *between* projects -- see https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13ff5f8838de4834
- [ ] (1:00?) display docstrings formatted using sphinx (look at how we did this in sagenb)
- [ ] (0:30?) make it so the Restart... buttons are formatted like the delete/private buttons just to the right.

# Major new features

- [ ] (3:00?) read-only viewers of projects (like collab, but read only)
- [ ] (3:00?) sagews html editing: try using tinymce to edit %html cells -- editing the output would modify the input (but keep hidden ?)  NEW release! http://www.tinymce.com;  codemirror intro -- https://mail.google.com/mail/u/0/?shva=1#starred/13f5b853999289dc


# Server Bugs and issues

- [ ] (1:00?) admin: the `compute_server` database table is only done purely manually, but should be automatic based on something in services file.

- [ ] (1:00?) hub: need to clear `_local_hub_cache` if it isn't active for a while; this is important for when projects get de-allocate from disk.

- [ ] (2:00?) salvus.file python function should not return until all object is written to the database, etc.; also, give an error if file too big, etc.
- [ ] (2:00?) need to auto-kill `_project_cache` entries after some inactivity; same for `local_hub` objects.
- [ ] (2:00?) local hub reconnect issue -- see the log for web1 and this email -- https://mail.google.com/mail/u/0/?shva=1#sent/13fea00fb602fa13
- [ ] (2:00?) enable quotas (10GB/project)
- [ ] (2:00?) hub -- ensure connection to diffsync sessions is secure in that even if the sessionid is known by attacker, they can't use it.
- [ ] (1:30?) ping appeared slow and I saw this on the client... -- I wonder if the slow ping I was seeing the other day was only for *ME*?:
        Error in event handler for 'undefined': Cannot read property 'settings' of undefined TypeError: Cannot read property 'settings' of undefined
            at chrome-extension://gighmmpiobklfepjocnamgkkbiglidom/adblock_start_common.js:176:13
            at <error: illegal access>
            at Event.dispatchToListener (event_bindings:356:21)
            at Event.dispatch_ (event_bindings:342:27)
            at Event.dispatch (event_bindings:362:17)
            at Object.chromeHidden.Port.dispatchOnDisconnect (miscellaneous_bindings:258:27) [VM] event_bindings (27):346
        Event.dispatch_ [VM] event_bindings (27):346
        connection is not working... attempting to fix. salvus.min.js:6
        SockJS connection just closed, so trying to make a new one... salvus.min.js:6
        connection is not working... attempting to fix. salvus.min.js:6
        SockJS connection just closed, so trying to make a new one... salvus.min.js:6
        error Timeout after 90 seconds index.min.js:7
        console.trace() salvus.min.js:5
        exports.defaults salvus.min.js:5
        Uncaught misc.defaults -- TypeError: property 'account_id' must be specified: (obj1={"project_id":"de12e703-05c9-4c8c-9ae0-75a9c0063a8a"}, obj2={"project_id":"__!!!!!!this is a required property!!!!!!__","account_id":"__!!!!!!this is a required property!!!!!!__"}) salvus.min.js:5
- [ ] (1:30?) this was happening:
        Trace
            at exports.defaults (/home/salvus/salvus/salvus/node_modules/misc.js:66:19)
            at save_blob (/home/salvus/salvus/salvus/node_modules/hub.js:5237:12)
            at project.read_file.cb (/home/salvus/salvus/salvus/node_modules/hub.js:1560:22)
            at /home/salvus/salvus/salvus/node_modules/hub.js:3563:18
            at /home/salvus/salvus/salvus/node_modules/async/lib/async.js:226:13
            at /home/salvus/salvus/salvus/node_modules/async/lib/async.js:136:25
            at /home/salvus/salvus/salvus/node_modules/async/lib/async.js:223:17
            at /home/salvus/salvus/salvus/node_modules/async/lib/async.js:550:34
            at Object.socket.recv_mesg.cb (/home/salvus/salvus/salvus/node_modules/hub.js:3555:22)
            at timeout [as _onTimeout] (/home/salvus/salvus/salvus/node_modules/misc_node.js:122:25)
        debug: BUG ****************************************************************************
        debug: Uncaught exception: misc.defaults -- TypeError: property 'value' must be specified: (obj1={"uuid":"ff784074-2b1b-4e93-8c23-7148dd5a322a","ttl":86400}, obj2={"value":"__!!!!!!this is a required property!!!!!!__","cb":"__!!!!!!this is a required property!!!!!!__"})
        debug: Error
        (I changed the code to turn it into a log message error, instead of total death.)
- [ ] (2:00?)  `local_hub`: pushes out output *too* often/quickly; make a for loop and can easily kill the browser with sync requests.
- [ ] (1:00?) when database gets slow/unavailable, the snap servers stop registering... due to not catching an exception!

- [ ] (4:00?) the function `snap_command_ls` in the hub doesn't scale past 10,000 commits -- it'll just start ignoring snapshots when they exceed a certain number.  This is obviously sort of good, since we don't want to return too massive of a list.  I will have to come up with a more scalable plan for obtaining and displaying this info.  This returns about 1400 right now (for my main project):

        select count(*) from snap_commits where project_id=3702601d-9fbc-4e4e-b7ab-c10a79e34d3b and server_id in (c8f7e17d-c4d9-4fb8-9df4-b147981d4364,041bb4e5-7423-442b-b28c-46d5c5212b77, 61a7d705-8c7d-47a5-ab10-2f62de36bc6b, 1ce2577a-b065-4f70-870a-ae8395a15ffe);


# Server Features

- [ ] (1:30?) snap:  write code to switch automatically to new bup repo in a snap when things "get slow".  But when is that?  *WHEN number of commits hits about 4000* (switching is as simple as removing the file "active")

# Operations

- [ ] (1:00?) admin -- make it so the services file can have variables so I don't have to change the same base in a million places.
- [ ] (1:30?) upgrade to cassandra 1.2.6: <http://www.datastax.com/documentation/cassandra/1.2/index.html#cassandra/install/installDeb_t.html>
- [ ] (1:30?) build: automated tests to confirm that salvus environment doesn't suck: https://mail.google.com/mail/u/0/?shva=1#starred/13e690cc3464efb4
- [ ] (1:30?) (0:12+) use backup.coffee to make a regular text dump of complete db (except maybe blobs?)
- [ ] (1:30?) expand the size of the base vm, so I can start keeping all past builds of sage.
- [ ] (1:30?) monitor: function that monitors available disk space, memory, cpu load, etc. on all nodes, and includes that in a db table, which gets queried by the "stats/" URL.  This will be a database entry with ttl.   The "stats/" data will at some point get "visualized" using d3.   http://www.linuxexplorers.com/2012/08/linux-commands-to-check-cpu-and-memory-usage/
- [ ] (2:00?) swap: implement - swap space for VM's
- [ ] (2:00?) log aggregation: automatically and regularly copy log files to a central location (i'm constantly loosing super-useful logs!)




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

    - x make symlink like this:
       cd /usr/local/bin; sudo ln -s /home/salvus/salvus/salvus/scripts/skel .

    - redo `recently_modified_projects` db schema table
    - update stats schema:
            alter table stats add last_day_projects int;
            alter table stats add last_week_projects int;
            alter table stats add last_month_projects int;
