12 days left in July.
10 hours work on cloud.sagemath per day.
-----> 120 hours.

July 20 --
July 21 --
July 22 --
July 23 --
July 24 --
July 25 --
July 26 --
July 27 --
July 28 --
July 29 --
July 30 --
July 31 --

# Growth

- [ ] (1:00?) Add the link/banner to the sagenb login screen.
- [ ] (2:00?) Add way to invite a friend when adding collaborators to a project.

# Frontend Bug Fixes

- [ ] (2:00?) *TOP PRIORITY* sync is messed up:  when connection gets reset sometimes it never correctly *saves* again, which will result in MAJOR data loss --- because suddenly "Save" doesn't really work.  This is new and absolutely top priority.  This was entirely a problem with the local hub getting messed up, which is unusual.
- [ ] (2:00?) rename/copy/mo/copy/move a file:  'Something my students have complained about: after clicking an "Rename file", a box appears around the name of the file.  It is then tempting to click inside of that box (or triple click, even), but if you try this, you are taken to the file itself.  I was confused by this behavior at first, too.  It would perhaps at least be nice if after clicking on "Rename file", there was an easy way to delete the long default file name. ' (Dave Perkinson)
- [ ] (2:00?) clarify how search works!  -- https://mail.google.com/mail/u/0/?shva=1#inbox/13ff8a0b89d4684a
- [ ] (0:15?) get rid of border for this: <div class="sagews-input" style="width: 1184px;"><hr class="sagews-input-hr"></div>
- [ ] (1:30?) terminal -- firefox copy/paste (requested by everybody)
- [ ] (0:30?) i see this in the address bar?  why?  "https://cloud.sagemath.com/#add-collaborator"
- [ ] (1:30?) mathjax (?) bug: BROWSER HANG
        var('P a b R T V_m')
        s = solve((((P - (a/V_m^2)) * (V_m-b)) / (R*T)) == 1, V_m)
        show(s)
        # then try to do "print s"
- [ ] right click to copy from a worksheet in Firefox (OS X) doesn't work, often "copy" doesn't show up in the menu, though keyboard shortcut still works.
- [ ] (1:00?) terminal -- fact control-shift-minus works in emacs codemirror mode (in app), so it must be possible to intercept it in javascript app for chrome after all(?)
- [ ] (0:30?) create new project -- the "OK" button, etc., might not be visible, and there is no way to scroll (crystal)
- [ ] (0:30?) this interact doesn't work: interacts.geometry.unit_circle()

- [ ] (1:00?) if connection to hub goes down, then reconnects, the tooltip about which hub we're connected to (in the top right) doesn't get updated properly

- [ ] (1:30?) %prun profiler is now broken; just shows nonsense.
- [ ] (0:30?) Still some mathjax + markdown issues... e.g.,  This doesn't work
    %md
    $$\{ foo \}$$
    even though this does
    %md
    $\{ foo \}$
    \[
       \{ foo \}
    \]

- [ ] (1:00?) move markdown2 (etc.) libraries to be in .sagemathcloud instead, so that "import md2" works with any sage.
- [ ] (2:30?) make the split view of worksheets work; the debugging aspect is no longer needed, really.


# Frontend Features

- [ ] (4:00?) (1:07+) ability to open sws files
- [ ] (2:00?) snap: restore target; allow the user to specify a given target path
- [ ] (2:00?) export sagews to sws
- [ ] (2:00?) account settings: keyboard shortcuts
- [ ] (2:00?) display usage for each project in project page, along with global total usage
- [ ] (0:45?) create a cell decorator "%typeset" that typesets output.
- [ ] idea: in project settings, specify a list of things to do when project is started; scripts to run, worksheets to evaluate, etc.
- [ ] idea: in project settings, specify a list of things to do when project is started; scripts to run, worksheets to evaluate, etc.
- [ ] (3:00?) copying/move files between projects -- see https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13ff5f8838de4834
- [ ] (1:30?) terminal -- a "history" button; click it and get a modal that contains the current terminal history; can be select-all'd.
- [ ] (1:30?) way to configure displayhook output modes; e.g., svg versus png, threejs versus tachyon, etc.
- [ ] (1:00?) global default for file order mode.
- [ ] (1:30?) select block of code and comment / uncomment
- [ ] (1:30?) shortcut to switch between open files in projects: Control+Alt+Arrow or Shift+Command+Arrow (on OS X)
- [ ] (1:30?) search filenames only -- https://mail.google.com/mail/u/0/?shva=1#inbox/13fe8775dac2a83b
- [ ] (1:00?) make interact functions callable
- [ ] (0:30?) update the salvus.file docstring with current TTL parameters.
- [ ] doc: how to X (make lots of specific todo's)
- [ ] (1:30?) make page like http://codemirror.net/demo/theme.html, but showing a file and a worksheet.
- [ ] (1:30?) change cursor so it is configurable to be transparent or a vertical bar -- configurable (requested by Rob Beezer) - https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13fcf5dc2f951a26

# Server Bugs

- [ ] (2:00?) quotas (10GB/project)
- [ ] (2:00?) local hub reconnect issue -- see the log for web1 and this email -- https://mail.google.com/mail/u/0/?shva=1#sent/13fea00fb602fa13
- [ ] (2:00?) image/pdf file change auto-update (due to frequent requests from users)
- [ ] (0:45?) worksheet: highlighting many cells and pressing shift-enter results in many new cells
- [ ] (1:00?) bug in block parser -- https://mail.google.com/mail/u/0/?shva=1#inbox/13f21ec599d17921
- [ ] (2:00?) snap/hub: code to un-deploy projects that have been inactive for a while.
- [ ] (1:30?) upgrade to cassandra 1.2.6: <http://www.datastax.com/documentation/cassandra/1.2/index.html#cassandra/install/installDeb_t.html>
- [ ] (2:00?) hub -- ensure connection to diffsync sessions is secure in that even if the sessionid is known by attacker, they can't use it.
- [ ] ping appeared slow and I saw this on the client... -- I wonder if the slow ping I was seeing the other day was only for *ME*?:
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



# Server Features

- [ ] (1:00?) when database gets slow/unavailable, the snap servers stop registering... due to not catching an exception!
- [ ] (1:30?) on restart, copy log files for service to a central location (i'm constantly loosing super-useful logs)
- [ ] (2:00?) snap/hub: "deploy" a project using a snapshot, in case it is no longer deployed or the vm is down.
- [ ] (2:00?) snap: write code to rsync out a specic bup repo to another specific snap server, then update the `snap_commits` table with the latest updates.  This update will be done by the snap server that is pushing out the repo; will have to add an index on a column to the db.
- [ ] (2:00?) snap: write code to automatically sync out active repo every so often (?), and also when making a new active repo (by filling in database stuff)
- [ ] (1:30?) snap--  write code to switch to automatically new bup repo in a snap when something happens:
           - but WHAT?  I will wait and watch to see how to set this up:
                - time to create bup ls cache.
                - number of commits
                - total size of repo.
           - switching is as simple as removing the file "active".
- [ ] (2:00?) implement ability to open files in the .snapshot directory (or anywhere) read only -- using
      a full editor view (but in codemirror read-only mode); does *not* require
      that the project is deployed.
- [ ] (2:00?) handle long url into a snapshot (or other), i.e.,
             https://cloud.sagemath.com/projects/project_uuid/.snapshot/timestamp/path/into/project
      when user (who must be logged in) visits this URL, they will open that project and the
      given file in the project, assuming they have appropriate permission to do so.
- [ ] (1:00?) change bup ls to use fuse to get full metainfo... or (better) make bup ls get the metainfo directly.
        time mkdir fuse; BUP_DIR=. bup fuse fuse; ls -lh fuse/master/latest/; fusermount -u fuse; rmdir fuse

---


- [ ] (3:00?) read-only viewers of projects (like collab, but read only)

- [ ] (2:00?) create a "snapshot" interact control based on Vivek and Jen's work.

- [ ] (1:00?) pdf view -- should have link to download pdf.

- [ ] (3:00?) community tab: "explore" other projects...

- [ ] (3:00?) community tab: a system-wide chatroom that all connected users can use to chat (math enabled)

- [ ] (3:00?) (0:43+) "invite a friend" easy way to invite somebody else to get an account when sharing projects
  - page: design&implement the dialog where the user composes the message to friend
  - hub?: need to make it so 'https://cloud.sagemath.com/signup' immediately displays the "create an account" page.
  - hub: need to add a db table of "signup triggers", e.g., actions that happen when a particular email address is signed up, e.g.,
    getting added to a project, banned, etc. -- should work with email+*@'s.


- [ ] (3:00?) latex: left/right split view.

- [ ] (3:00?) support cassandra authentication in addition to use firewall: http://image.slidesharecdn.com/cassandrasummit2013keynote-130613151129-phpapp01/95/slide-18-638.jpg?1371154320

- [ ] (1:30?) terminal reconnect -- works fine on browser reconnect, but fails on dropped connection, since I didn't implement that yet.

- [ ] (0:45?) make all open documents do one initial sync on first connect or open... I'm sick of cursor jumps!

- [ ] (1:00?) make it so foo?[enter]  and foo??[enter] both work.


- [ ] (1:00?) admin -- make it so the services file can have variables so I don't have to change the same base in a million places.

- [ ] (1:30?) (0:12+) use backup.coffee to make a regular text dump of complete db, except for the blobs.

# This just gives tons of errors :-(

  process.env['SALVUS_BACKUP'] = '/mnt/snap/backup/'
  b = require('backup').backup(keyspace:'salvus', hosts:['10.1.1.2'], cb:console.log)
  b.dump_keyspace_to_filesystem(console.log)

- [ ] (1:00?) %load on a file with a syntax error gives a useless error message

- [ ] make modified project table also record the user and record it forever.

- [ ] (2:00?) separate targeted backup system -- minimum data needed to fully recover system:
       - backup db tables on all cassandra nodes (for now) to a single bup archive on /mnt/snap on web1
       - backup that de-duped bup to bsd.math
       - backup the projects bup to bsd.math
       - make offsite copy every so often?

- [ ] (2:30?) custom environment variables in project settings, including `SAGE_PATH` (with explanation) -- https://mail.google.com/mail/u/0/?shva=1#inbox/13fa0462bcaa7768

- [ ] (1:00?) 3d: enable and test canvas rendering

- [ ] (1:30?) expand the size of the base vm, so I can start keeping all past builds of sage.

- [ ] (2:00?) snap/bup caching: right now rev-list cache keeps getting bigger, with probably each cache file storing the data for all of them so far, hence wasting much space.  I can maybe somehow do better.. since at some point, this will start to waste massive space!

- [ ] (2:00?) terminal copy/paste; try to find a way to strip trailing whitespace, and deal with long lines (?)

- [ ] (5:00?) wiki view -- I was just browsing again through the the wiki system gollum used for the github wiki. This is basically what I am looking for - an extra folder myproject / wiki containing the wiki in human readable and editable files and folders, with default cloud view being rendered through gollum (using various rendering systems like rst or markdown). Github seems to not support mathjax anymore, but a switch to turn on mathjax on pages (or, if this is too much, mathjax being turned on by default) would be necessary in order to make math collaboration possible. Also, links to files and embedded pics from myproject / otherfolder would be good to have. Finally, making the wiki publicly visible (even if the project is still private) would be nice as well.  See https://mail.google.com/mail/u/0/?shva=1#inbox/13f9e7a22fbe59ec

- [ ] (1:00?) possible optimization (maybe already implemented) -- if `local_hub` is about to send a blob that global_hub already knows (via db), then don't bother....

- [ ] (1:00?) when searching again, keep the last search in the input box

- [ ] (3:00?) keyboard shortcuts

- [ ] (2:00?) transfer ownership: transfer this project to another user

- [ ] (0:45?) on connection reconnect, sync all syncdoc docs with hub (just like we do with fixing terminals).

- [ ] (3:00?) LXC per-project (which will imply quotas)

- [ ] (1:30?) way to star projects; show the starred ones first no matter what; have a starred selector

- [ ] (3:00?) snap: IDEA -- make it possible to optionally restore to a different location, which could be any path in *any project*.  This would make it possible to easily merge/move/etc. data from one project to another, and would not be hard to implement.

- [ ] (1:15?) Jason grout doesn't like "0 to disable" for autosave interval.

- [ ] (5:00?) terminal: implement a scrollbar

- [ ] (1:00?) fulltext search: should exclude uuid cell start marker lines

- [ ] (1:00?) fulltext search: for output lines, double check each result and make sure search term isn't in uuid

- [ ] (1:30?) make list of open files, order, font sizes, etc., tied to local storage on a machine

- [ ] (2:00?) in hub (around `mesg_codemirror_get_session`) should we be much more careful adding client to sync'd session -- have the client send back confirmation.

- [ ] (1:00?) responsive -- worksheets: change how new cell insert acts

- [ ] (0:30?) when filling in settings for collaborators, show a spinner while waiting for info to download.

- [ ] (2:00?) BUG: trying to download a large file (even 5MB!) can lead to disaster, e.g., rh.pdf from books project.

- [ ] (3:00?) fix doc sync with multiple hubs

- [ ] (1:00?) reconfigure cloud with (way?) more hubs

- [ ] (3:00?) worksheet scalability idea -- only render the outputs when they are about to appear!  how to hook into codemirror. Andrej cares.

- [ ] (2:00?) increase disk space in the base vm, then make it so we archive previous versions of sage

- [ ] (2:00?) ui: make it possible for user to easily select a sage version for a project (from those available).

- [ ] (2:00?) terminal -- when copying/pasting, long lines become multiple lines, which is one of my pet peeves!

- [ ] karl dieter feature request: download a .sagews file to external html... should make it just include some javascript at top and fully work... with login or terms of usage; could in some cases export to "external html using sage cell" instead.

- [ ] (1:30?) converting the large cassandra12.pdf to png's to display in browser silently fails; probably a timeout (?)

- [ ] (1:30?) firefox (linux) -- both copy and paste with terminal are completely broken

- [ ] (1:00?) firefox recent files list -- pills wrong size

- [ ] (1:00?) firefox terminal -- resizes all wrong; bottom lines chopped... sometimes.  But sometimes fine.

- [ ] (1:00?) (0:13+) bug -- open a pdf then hit space -- you get back to the file search -- should go to next page.

- [ ] (3:00?) snap -- massive optimization idea: could store directory tree of each snapshot *with metadata and previews (first 1K) of modified files* as a JSON object in the database; this would make browsing snapshots and previews instant, but of course recovery would take the full amount of time...

- [ ] (1:00?) get psage to build: psage doesn't build with sage-5.10, because of updates to Cython: "sqrt5_fast.pyx:1057:20: undeclared name not builtin: Py_GE"

- [ ] (0:15?) add psage to build.py todo list!

- [ ] (1:00?) start installing a bunch of optional R packages into sage.

- [ ] (2:00?) idea -- change compute nodes so they have a UUID that is indexed and regularly updated in DB, for project accounts... much like with snap servers.

- [ ] (1:00?) client.exec is timing out after about 10 seconds no matter what.  This messes up "disk usage", among other things...  I wonder why?

- [ ] (2:00?) project restart and hub diffsync sessions: this leads to a very BAD situation that will piss off any sane user:
       - open a worksheet or file to edit
       - restart local hub, but do NOT restart global hub
       - re-open the same file
       - look at the log in hub, and see an "infinite loop" of reconnect attempts.
       THIS is very serious.

- [ ] (0:30?) make it so settings autosave; get rid of confusing "save"/cancel buttons, since they only do certain things...

- [ ] (1:00?) snap: optimization idea -- can index projects in parallel

- [ ] (1:00?) ui: if ping time hasn't been updated in a certain amount of time, replace by "..." (?)

- [ ] (1:00?) UI: renaming a long filename doesn't work.

- [ ] (1:00?) interact bug -- this doesn't output matrix first time:
        @interact
        def f(a = input_grid(2,2,[[1,2],[3,4]])):
            print a

- [ ] (1:00?) snap: when a compute server fails to work for n seconds, re-deploy project elsewhere, automatically: see the comment/code in hub that says  "Copy project's files from the most recent snapshot" in hub, which is relevant.

- [ ] (1:00?) snap: ability to download files directly from snapshots

- [ ] (1:00?) snap: preview file when clicked on

- [ ] (2:00?) snap: UI for seeing nearest snapshot to a chat

- [ ] (2:00?) snap: UI for previewing a file, including the history of change times for that file

- [ ] (2:00?) implement caching of files attached to worksheets longterm

- [ ] (0:30?) UI/client: refuse to open huge files... (recommend vim/emacs... or implement something that streams?)

- [ ] (1:30?) share: address the major issue I found in class where other people get access to `local_hub`!?

- [ ] (0:45?) BUG: clearing the "recent files" list makes it so none of the open file tabs at the top of the screen work anymore.

- [ ] (0:30?) `graphics_array(...).show()` doesn't work: https://mail.google.com/mail/u/0/?shva=1#inbox/13e6a16d768d26a3

- [ ] (1:00?) make it possible to enable VIM keybindings in codemirror editor.

- [ ] (1:00?) codemirror find is annoying -- make it better (so thing found is visible!)

- [ ] (1:00?) markdown -- there is no way to just insert a $.  Make \$ just $ without math....? somehow.

- [ ] (1:00?) search should not include hidden files by default....

- [ ] (1:30?) build: automated tests to confirm that salvus environment doesn't suck: https://mail.google.com/mail/u/0/?shva=1#starred/13e690cc3464efb4

- [ ] (3:00?) snap: search through past snapshots: by filename

- [ ] (3:00?) snap: search through past snapshots: by file content (no clue how to do that!)

- [ ] (2:00?) snap: redsign/rewrite to eliminate workarounds to bup being slow... (for later!)

- [ ] (1:00?) snap: function to read in contents of a single file with bound on size (will be used for preview)

- [ ] (1:30?) svg.js ? http://www.svgjs.com/

- [ ] (1:30?) deprecation broken by something cloud does! `find_minimum_on_interval(x, 0, 3)`

- [ ] (1:00?) show(animate) -- make it work

- [ ] (1:00?) when user exits terminal, restart terminal automatically... when they hit a key?

- [ ] (2:00?) gap broken -- gap('2+3') fails on cloud (but works on my laptop!)

- [ ] (1:00?) update codemirror display more, e.g., after making output.  see https://groups.google.com/forum/#!topic/codemirror/aYpevIzBUYk

- [ ] (0:45?) mathjax special case: `$a<b$` is misparsed, whereas `$a < b$` is OK.  We should somehow fix such things in the html function, since mathjax can't.

- [ ] (1:00?)BUG -- downloading a file that starts with "." removes the ".".

- [ ] (1:00?) %md -- make link open in a new window

- [ ] (0:15?) "Latex Log" --> "Latex"; also the icons are wrong: icon-refresh should be "eye", and refresh should be next to latex.

- [ ] (0:45?) BUG -- latex output log -- isn't properly sized relative to container.

- [ ] (0:45?) fix my class notes to work with correct math markup... ($$ bug makes this something to *not* do until above fixed)

- [ ] (1:00?) show(matplotlib graphic) -- might as well work

- [ ] (0:10?) https://mathsaas.com/ points at cloud.sagemath.org (really bsd), but should point at the .com.

- [ ] (1:00?) highlight some blank space at bottom and do "shift-enter" -- get lots of new empty cells.

- [ ] (0:45?) BUG: move recent files (etc.) thing to the database; it's too frustrating/confusing tieing to the computer.

- [ ] (1:00?) snap: potential for .bup corruption -- I got this when my chromebook crashed while doing a backup; I deleted the relevant file, re-ran bup, and it worked fine.  This suggests that killing bup on the client side can lead to a corrupt .bup directory, and break snapshotting of their work.  Since a user could cause .bup corruption in many ways, we will *have* to do: (1) try to make a backup, (2) if it fails, delete their .bup, then try again; if that fails, email admin.

- [ ] (0:30?) snap: on startup, we need to also make snapshots of projects that were active when we weren't watching, due to being offline for some reason.  This can be done later... since it is only a factor when there was a failure.

- [ ] (0:45?) sometimes file listing gets updated after we've already changed to another directory!

- [ ] (0:20?) editor: when closing current open document, *select* recent automatically (not nothing)

- [ ] (1:30?) refactor "download from web" code; add custom logic so this does the right thing, etc.: https://github.com/williamstein/2013-480/blob/master/lectures/lecture21-walk_through_dev_process-2013-05-17.sagews

- [ ] (2:00?) idea -- bake in chunking messages over sockjs so we can send huge messages without reset and without stopping other messages; thus can edit large files.

- [ ] (1:00?) code execution needs another state: "w" for waiting.  E.g., 2 cells, one with sleep(5) and the next with sleep(5) make this clear.

- [ ] (2:00?) Potentially massive bug/issue -- I just noticed that the ip address of clients appears to be on the VPN!  NOt their true external ip addresses.  This means my anti-account-creation, etc., measures are going to apply to everybody at once, rather than just a given external IP.  HMM.  This is tricky.

- [ ] (1:00?) am I writing cassandra blobs as string constants? -- something about that in docs "Cassandra blobs as string constants"?

- [ ] (1:00?) something didn't get properly (monkey) patched:  sage.interacts.algebra.polar_prime_spiral()

- [ ] (1:00?) feature request: user way to customize the cursor in text editor (vertical line instead of block)

- [ ] (1:00?) BUG: click on a 15MB tarball by accident via the file manager, and local hub breaks, and file never comes up; no way to recover.  Impossible for a normal user!

- [ ] (0:30?) path at top doesn't have to be fixed (note how it looks when scrolling)

- [ ] (0:30?) search output doesn't have to have fixed height + own scroll

- [ ] (1:00?) feature: save terminal history to file.

- [ ] (1:00?) feature: keyboard shortcut to move between files.

- [ ] (1:00?) feature: bring back custom eval keys in settings

- [ ] (1:00?) feature: run sagetex automatically (?)  maybe have checkbox to enable/disable in page that lists log.

- [ ] (1:30?) feature: hit tab anywhere when using a function to get the signature as a tooltip

- [ ] (1:30?) feature: tab completion when using a function could also complete on the keywords -- https://mail.google.com/mail/u/0/#inbox/13ec474c229055d9

- [ ] (1:00?) upgrade bup everywhere -- looks like fsck and race condition work is recent: https://github.com/bup/bup

- [ ] (1:00?) when using an interact on cloud.sagemath.com that produces graphics (lecture 17 of 308), I'm seeing the image in output not appearing with some probability.  I'm guessing this has to do with how files get sent from local hub to hub, and there being multiple global hubs... and them not using the database always.

- [ ] (1:00?) interact dropdown selector doesn't work in Firefox -- shows blank input.

- [ ] (1:00?) suggest sync broadcast message often doesn't work (maybe on first sync?), i.e., user has to modify buffer to see latest changes upstream

- [ ] (1:00?) idea: make a stats tab -- for all to see -- under "?" page with:

- [ ] (1:00?) idea: when displaying lots of output, scroll output area to BOTTOM (not top like it is now).

- [ ] (1:30?) make worksheet save persist linked objects

- [ ] (1:30?) new project default git creds based on project owner cred. (?);

- [ ] (1:00?) button in settings to reset the smc server

- [ ] (1:30?) ability to delete projects.

- [ ] (1:30?) ability to change project to be private.

- [ ] (1:30?) implement `pretty_print` -- see https://mail.google.com/mail/u/0/?shva=1#inbox/13e454cb56930ef0

- [ ] (1:00) write script that does "ping()" from cloud1 and cloud3 (say), and sends me an email if anything doesn't respond to ping in 10 seconds (or something like that).

- [ ] (0:30?) %hideall doesn't hide output, but should.

- [ ] (2:00?)  `local_hub`: pushes out output *too* often/quickly; make a for loop and can easily kill the browser with sync requests...

- [ ] (3:00?) sagews html editing: try using tinymce to edit %html cells -- editing the output would modify the input (but keep hidden ?)  NEW release! http://www.tinymce.com;  codemirror intro -- https://mail.google.com/mail/u/0/?shva=1#starred/13f5b853999289dc

- [ ] (0:45?) sagews: javascript(once=True) isn't respected; needs to use a different channel... (broadcast?)

- [ ] (2:00?) make caching of newly created blank projects something that is stored in the database, not the hub.

- [ ] (2:00?) logrotate? -- some logs get HUGE (only an issue on localhost in debug mode):
wstein@u:~/salvus/salvus/data/logs$ du -sch *
    873M    haproxy-0.log
    296M    nginx-0.log
    1.6G    stunnel-0.log

- [ ] (1:00?) sagews bug -- html.iframe gets updated/refreshed on all executes. why?

- [ ] (1:00?) sagews: implement timer when evaluating code (?), but don't use jquery countdown, since it wastes resources at all times.

- [ ] (0:45?) sagews: eliminate jquery countdown...

- [ ] (1:00?) syncdoc: last edit sometimes doesn't cause other clients to sync -- broadcast doesn't happen or clients ignore reques

- [ ] (0:10?) syncdoc: remove "click_save_button:" from syncdoc.coffee, in case it is not used (I think it isn't).

- [ ] (2:00?) syncdoc: browse through past versions -- "some sort of timeline view".

- [ ] (1:00?) sagews: modify search command to indicate result in output more sensibly (right now cursor gets big next to output)

- [ ] (1:00?) Modify the editor find command to have the option of doing a "fuzzy search" using the diff-patch-match library?!

- [ ] (1:00?) FEATURE: make it so "create a new file" allows you to just paste a URL in the filename blank... to get a file from the web!

- [ ] (1:00?) BUG: don't allow editing a file if it is above a certain relatively small size...

- [ ] (0:45?) SYNC: infinite loop printout in worksheet kills everything... NEED rate limiting of burst output, etc., like for terminals.

- [ ] (0:30?) BUG: file browser destroys long filenames now.

- [ ] (0:15?) BUG: after pasting something big in terminal paste blank, page gets scrolled up all wrong.

- [ ] (1:30?) sagews: default worksheet percent modes.

- [ ] (1:00?) BUG in sage execute: "divide into blocks" to respect code decorators, plus fix ugly recombination of if/while/etc.

- [ ] (0:30?) BUG: os x "control-o" should also accept command-o

- [ ] (1:00?) interact.coffee: refactor the big switch statement in interact_control to be extensible, so can easily add something to a map and get a new control.

- [ ] (1:30?) idea from Dan Grayson: Another feature of the sage math cloud would be compatibility with chrome's excellent scheme for keeping track of your user names and passwords for you. -- https://mail.google.com/mail/u/0/?shva=1#inbox/13ea4bfe65bc36cd

- [ ] (1:30?) this doesn't work:   GraphDatabase().interactive_query(display_cols=['graph6','num_vertices','degree_sequence'],num_vertices=['<=',4],min_degree=2)



