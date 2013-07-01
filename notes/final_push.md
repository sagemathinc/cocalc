- [x] new version (see admin.py)
- [x] (1:00?) (0:04) make solarized the default console theme...
- [x] (0:15?) (0:03) icon-refresh for new version message (?)
- [x] (0:30?) "Saving..." spinner seems to be not resetting on reconnect.
- [x] (0:20?) (0:09) clicking on Recent -- critical to focus the search box (except on mobile)
- [x] (0:15?) (0:27) tooltip over file pill should show full path to that file.
- [x] (0:20?) (0:10) search -- show more context
- [x] (0:20?) when clicking on "recent" the tabs scroll around, due to the scrollbar appearing.  Need to account for this in ` resize_open_file_tabs` in editor.coffee
- [x] (0:20?) (0:05) clicking on an open file pill, then the search, makes it so it won't scroll vertically.
- [x] (1:00?) (0:32) project search -- add a clear button "The search box has no "clear" button, e.g. a circled X, right next to it to clear it." -- suggested by Harald Schilly

- [ ] (0:10?) cursor should be pointer over entire file/directory box.

- [ ] (2:00?) make it so foo?[enter] works.

- [ ] (0:45?) If I manually click the close-X on all open tabs in a project, I end up at a white and empty page. That's "logical", but it would be more user-friendly if it opens up the "recent" tab (or maybe "files", but i think recent is slightly better)

- [ ] (0:45?) what's also annoying is this "do you really want to leave" confirmation when I close firefox. I suggest, that you only show it iff there is more than one unsaved worksheet. If all of them are saved, it's not an issue, right?-- Harald Schilly;  I should either make it an option or only enable it if some sync is failing for a file.

- [ ] (1:00?) interact dropdown + firefox = bad -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13f8df6166275c26
        @interact
        def _(a = slider(100), b = srange(-10,10,include_endpoint=True)):
            print a + b
in my Firefox 22 in Linux, I cannot see the text in the drop down list because it's just white on white.  ?-- Harald Schilly

- [ ] (4:00?) (1:07+) ability to open sws files

- [ ] (2:30?) make the split view of worksheets work; the debugging aspect is no longer needed, really.

- [ ] (3:00?) implement a simple "explore" public projects page

- [ ] (1:00?) possible optimization (maybe already implemented) -- if local_hub is about to send a blob that global_hub already knows (via db), then don't bother....

- [ ] (2:00?) (0:43+) "invite a friend" easy way to invite somebody else to get an account when sharing projects

  - page: design&implement the dialog where the user composes the message to friend
  - hub?: need to make it so 'https://cloud.sagemath.com/signup' immediately displays the "create an account" page.
  - hub: need to add a db table of "signup triggers", e.g., actions that happen when a particular email address is signed up, e.g.,
    getting added to a project, banned, etc. -- should work with email+*@'s.

- [ ] (2:00?) file change auto-update (due to frequent requests)

- [ ] (1:00?) implement `default_mode`:
        a function you can call at some point to set a default mode (or modes). For example,
           default_mode(gp)
        would make it so every cell is as if it had "%gp" if no other "% modes" are at the top of the cell.   The input to default_mode would be any callable or object with an eval method, so you can easily make your own.

        Once the above is implemented and working, which shouldn't be hard, then I could add some GUI support, possibly.   The GUI might insert something like the following at the top:

        %hide
        %auto
        default_mode(gap)

        At the top of a worksheet, the above would make it so the worksheet starts in gap mode.

- [ ] (1:00?) new release:
    - add irssi
    - switch to minified js

- [ ] (1:00?) when searching again, keep the last search in the input box

- [ ] (3:00?) keyboard shortcuts

- [ ] (1:00?) change the default permissions when new accounts are created so that home is not world readable

- [ ] (2:00?) transfer ownership: transfer this project to another user

- [ ] (4:00?) feature -- make it easy to join a 100% persistent logged irc chatroom for sage while on cloud (?)

- [ ] (0:45?) on connection reconnect, sync all syncdoc docs with hub (just like we do with fixing terminals).

- [ ] (2:00?) Get per-project quotas working again, set at 8GB (say).

- [ ] (1:00?) 3d: fix the camera issue (that generates the large log)

- [ ] (1:00?) 3d: enable and test canvas rendering

- [ ] (1:00?) 3d: include code in cloud.sagemath library and make show use it by default

- [ ] (1:30?) way to star projects; show the starred ones first no matter what; have a starred selector

- [ ] (1:30?) HIGH PRIORITY BUG -- when trying to reconnect to local hub, due to error, the port doesn't get re-randomized, and sometimes I think this leads to a non-fixable situation.   I got thisa bunch with my cloud-dev project:
     "error Timed out trying to connect to locked socket on port 19056"
In this case, restarting the hub fixed the problem, so it is clearly fully a problem at the
level of the hub, not local hub.  High priority, since this can prevent a user from accessing their project.
TEST: explicitly force restart, and verify that port changes.

- [ ] (3:00?) snap: IDEA -- make it possible to optionally restore to a different location, which could be any path in *any project*.  This would make it possible to easily merge/move/etc. data from one project to another, and would not be hard to implement.


- [ ] (2:00?) Implement new single-branch bup approach, namely have all snapshots for all projects in a single master, and use Cassandra to know what's what. This would loose file tracking, but we could do that via the db directly later....

- [ ] (1:15?) Jason grout doesn't like "0 to disable" for autosave interval.

- [ ] (1:30?) %prun profiler is now broken; just shows nonsense.

- [ ] (1:00?) bug: cd in terminal thing in cloud.sagemath not working.  (huh?)

- [ ] (5:00?) terminal: implement a scrollbar

- [ ] (1:00?) fulltext search: should exclude uuid cell start marker lines

- [ ] (1:00?) fulltext search: for output lines, double check each result and make sure search term isn't in uuid

- [ ] (2:00?) create a "snapshot" interact control based on Vivek and Jen's work.

- [ ] (1:30?) make list of open files, order, font sizes, etc., tied to local storage on a machine

- [ ] (2:00?) in hub (around `mesg_codemirror_get_session`) should we be much more careful adding client to sync'd session -- have the client send back confirmation.

- [ ] (1:30?) my "monitor" thing in admin does not work -- instead it should do the full roundtrip ping and check that time is small enough... if possible.

- [ ] (1:00?) responsive -- worksheets: change how new cell insert acts

- [ ] (0:30?) when filling in settings for collaborators, show a spinner while waiting for info to download.

- [ ] (2:00?) BUG: trying to download a large file (even 5MB!) can lead to disaster, e.g., rh.pdf from books project.

- [ ] (0:20?) when delete a tab, need to resize all tabs

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

- [ ] (2:00?) (won't fix for now) opera; cursor goes haywire if you zoom in codemirror.

- [ ] (2:00?) export sagews to sws

- [ ] (1:00?) (0:13+) bug -- open a pdf then hit space -- you get back to the file search -- should go to next page.

- [ ] (1:00?) pdf view -- should have link to download pdf.

- [ ] (8:00?) create a help system, answering questions in help.html

- [ ] (1:00?) (0:45+) enable word-wrap toggle;

- [ ] (3:00?) snap -- massive optimization idea: could store directory tree of each snapshot *with metadata and previews (first 1K) of modified files* as a JSON object in the database; this would make browsing snapshots and previews instant, but of course recovery would take the full amount of time...

- [ ] (1:00?) get psage to build: psage doesn't build with sage-5.10, because of updates to Cython: "sqrt5_fast.pyx:1057:20: undeclared name not builtin: Py_GE"

- [ ] (0:15?) add psage to build.py todo list!

- [ ] (1:00?) start installing a bunch of optional R packages into sage.

- [ ] (2:00?) bug in block parser -- https://mail.google.com/mail/u/0/?shva=1#inbox/13f21ec599d17921

- [ ] (2:00?) idea -- change compute nodes so they have a UUID that is indexed and regularly updated in DB, for project accounts... much like with snap servers.

- [ ] (0:45?) confirmation before closing a project

- [ ] (2:00?) first sync -- cursor jumps back 6 characters; worksheets show secret codes

- [ ] (3:00?) support multiple hubs properly -- they didn't work right with cloud.sagemath, so I reduced the deployment to only one hub on cloud1 -- no high availability!! -- until I carefully debug through this.

- [ ] (2:00?) octave interface (like GAP) also doesn't work in .sagews !

- [ ] (0:30?) Still some mathjax + markdown issues... e.g.,  This doesn't work
    %md
    $$\{ foo \}$$
    even though this does
    %md
    $\{ foo \}$
    \[
       \{ foo \}
    \]

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

- [ ] (1:00?) make a 64x64 hidpi favicon -- see http://nashape.com/blog/2012/09/12/big-favicons/

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

- [ ] (3:00?) read-only viewers of projects (like collab, but read only)

- [ ] (4:00?) way to browse public projects

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



--------------------------------------------------------------------------------------------------
--------------------------------------------------------------------------------------------------

# DONE

* (0:45?) [x] BUG -- editor synchronization and split docs aren't done -- cursor/selection in bottom doc gets messed up -- sync the window with focus?
* (0:30?) [x] BUG: worksheet path is still not set correctly
*(0:30?)  [x] (0:14) apply security updates and reboot 01salvus (done) and 06salvus (done)
* (0:30?) [x] Add a new tab at the top called "Explore" that is to the left of "Your Projects"

= UX =
(0:20?)  [x] (0:06) do not delete whitespace on line that contains the cursor (codemirror plugin)
(0:20?)  [x] (0:22) in project file listing search, make it so that the *other* hidden files are not clickable!
(0:45?)  [x] (0:14) cursor replication when sync starts -- might have fixed it -- NOT SURE!
(0:30?)  [x] (0:30) after entering a command in project command line, focus should *stay* on command line.
(1:00?)  [x] (1:55)  create a new file/directory;default filename for terminal and worksheet date/time iso format
(0:30?)  [x] (0:16) the alert message tab thing covers the connection settings.

(0:20?)  [x] (0:40) bug: sometimes clicking the x to close an open file (in file editor pills) just leaves it -- even though counter goes down; then it can't be closed; this is also why sometimes searching the list of open files doesn't work.;   ALSO did more work on new file page (which took most of the time)

(0:30?)  [x] (0:06) project: When changing project title, should auto change the entry in the tab at the top.
(0:30?)  [x] (0:08) editor - the undo buffer should *NOT* start with buffer empty, but with result of loading content!!!

(1:30?)  [x] (0:50) make it so project nav tabs hide when showing editor; make codemirror edit window "FULL SCREEN" always
         [x] (0:36) greatly improve style of top bar due to fullscreening
(0:45?)  [x] (1:30) make worksheet edit window "FULL SCREEN" always; still not so clean!

(0:45?)  [x] (1:43) make terminal edit window "FULL SCREEN" always -- and cleaned up some related things all over, especially proper resizing math.
(0:20?)  [x] (0:17) file selector -- putting slash at end in search should restrict to directories.
(0:20?)  [x] (0:08) create new file by typing a name that results in no hits in file search creates it... with a button to choose type (or cancel)
(1:00?)  [x] (0:59) editors need to have "show" called when window is resized; also, get rid of responsive top bar bullshit and do it right.
(0:30?)  [x] (0:59) idea -- what if we allow opening the same project in multiple tabs -- then get multiple views on same project.  Not good. Instead, usable implementation of files as tabs optionally to try out...
(1:00?)  [x] way to make a new folder
(1:00?)  [x] (1:00) way to rename file
(0:30?)  [x] (0:42) delete/download file icons should only appear on hover; also, added a link for importing files from the web (will use wget)
         [x] (1:10) refactoring and cleanup of file listing code.
(0:45?)  [x] (0:42) way to delete files; just moves to project_path/.trash, making that directory if necessary and printing a message
(0:30?)  [x] (0:30) close all recently opened files.
(1:00?)  [x] (1:13) import files form web using wget --- make it live; add a slider for how long it will try to download until giving up.
(0:30?)  [x] (0:15) way to browse trash can
(0:30?)  [x] (0:36) way to empty trash can
(1:30?)  [x] (0:59) way to move files into a folder by dragging them.
(0:30?)  [x] fix auto-resizing of input cells of worksheet
(0:30?)  [x] (0:40) show hidden files toggle (icon?) -- also fixed misc trash-can related bugs
         [x] (0:09) slight improvements to css of open files
(0:30?)  [x] (0:14) error message when file doesn't load should not be *in* codemirror
(0:30?)  [x] (0:18) need a "save all open files" button somewhere (in editor's list of open files page)
(0:45?)  [x] (0:16) bug -- worksheet tab completion is now broken (actually underneath) worksheets...; also fix vertical resizing as options for worksheet cells
(0:15?)  [x] (0:10) need to save worksheet on creation, so next load has a chance to work.

(0:45?)  [x] (1:06) make it so the little project tab bar is *always* visible, just below the main nav bar.  Will require care about fullscreen size for each.
(0:30?)  [x] (0:27) get rid of code that always switches to recent and vanishes editor on selecting tab -- just leave as is; add "open file/folder" button
(0:20?)  [x] (0:42) list of files in file browser for project needs to be scrollable and have fixed height.
(0:15?)  [x] (0:11) file rename -- should have to click twice to activate?

(0:10?)  [x] (0:15) bug: control-o in editor to get to recent is broken

With the following done, we will have 100% fixed the UI for now:

(0:30?)  [x] (0:45) do not actually open a tab in editor unless the user explicitly selects it.  Make this lazy.  this was we can leave recent as is.

(1:00?)  [x] (0:50) PLAN THIS: each open file *must* corr to a tab in the second line bar. Sorry.  Get rid of the path up there and put a big pull-ed right
             tabbar up.  Shrink to accom. arbitrary many.
(0:30?)  [x] (make project nav area full with

(0:10?)  [x] (0:15) move little upper right path

(0:30?)  [x] (0:30) stacked cursors issue -- local hub should only allow global hub once as a client for given file.
              doubled cursors issue is now fixed.

(1:30?) [x] (0:30)  when visiting a synchronized editing session after a long time (and sync broken), the first few
        characters typed get jumbled.   I'm not going to worry more about this, since it *only* happens if
        the local_hub goes down... and maybe then some loss is inevitable.  This is not something (like user's connection or global hub change)
        that will happen much.
(0:45?) [x] cursor doubling -- this is because the same hub connects twice to the same local_hub and broadcasts to itself.
                Solution: when connecting to local_hub, local_hub should discard all connections from that same hub.
                Could be determined by a self-reported uuid on startup of global hub.
(1:00?)  [x] (0:15) clean up the bar at the top of worksheets; make consistent with files...
         [x] Make background color of worksheets consistent... and easy to change later.
 (0:30?) [x] (0:30) when showing worksheet, need to call refresh on all cells in the worksheet


(0:30?)  [x] (1:05) range selection -- need to also preserve that on sync.  (harder than I thought!)

        [x] (0:22) make the trash can vastly more usable using move's amazing "backup" option; add file list refresh option.

(0:30?)  [x] (1:20) make it so the chat window appears again.
(0:45?) [x] re-enable (and test) automatic timeout of sync sessions in local_hub

 (0:45?)  [x] (0:37) bug in directory download -- need to name things sensibly; may require changes in hubs.


(0:30?) [x] (1:10) download a project, etc.

(0:45?)  [x] (0:13) bug: worksheet -- default path is relative to home directory not project.
(0:15?)  [x] bug -- "Results of searching" needs to be scrollable.

 [x] just did a very quick proof-of-concept of editor pages being tabs... It really just needs polish,  but will work.  need to move... can move.  THIS IS AWESOME!

(0:10?)  [x] make other standard tabs only icons; move search box to search page only
(0:30?)  [x] move editor tab placement to project code and tabs -- each open file is in a project tab; code will need to be refactored.


(0:20?) [x] (0:23) PDF preview is probably not correct height... I'm good at this now.

        [x] (0:12) PDF preview -- easy to make it 2-up? -- at least play for a moment

(0:45?) [x] (0:19) pdf preview doesn't work on ipad -- this is because no security cert yet, so this will go away!.  I figured this out using
            the awesome remote ipad dev console.
(0:30?) [x] (1:00) evaluate button for cells in worksheet.

[x] (1:30) worksheet timers, etc.

 (0:45?) [x] (0:49) project UI: did something like this, but general cleanup instead --  combine the two search pages, with the file search in the right side of page.  (?)


(0:45?)  [x] (1:07) editor buttons: search/replace/undo/redo/autoindent/shift left/shift right; plus tooltips.
(0:30?)  [x] (1:00) buttons in terminal: increase font, decrease font, paste spot, refresh, then title
(0:10?)  [x] (0:14) bug -- save all should only save things that are already open; plus some style cleanup
(0:45?)  [x] (0:43) codemirror split screen editing.  I NEED IT.  Now I gots it.
(0:30?)  [x] (1:22) tabs -- make them shrink as more are added; also fix some serious bug/issues with split editing.
(0:30?)  [x] (0:05) feature -- open new documents on creation.


(1:00?)  [x] (0:28) change filename extensions: ".sage-worksheet", ".sage-terminal", ".sage-cell", ".sage-quiz", ".sage-backup", ".sage-chat", etc.

(0:30?)  [x] (0:05) bug -- can have the same filename twice in recent files if you make new file; e.g., make "a" worksheet twice.
[x] (0:21) make it so one can sort files by time or alphabetical
-
(0:15?)  [x] (0:04) ui bug: when selecting any of the top five things on left, they should get active and nothing else.

(0:30)   [x] (0:23) font size in editor; go to line in editor
(0:30?)  [x] bug: if you start clicking around directories quickly, you can easily get to a nonexistent path due to time of gitls round trip.  So... when that happens display the last valid path; save last working path, and don't change path to a directory that doesn't exist (as determined by an error from git-ls)

[x] (0:08) CSS and styling of terminal.
[x] disabled draggable of recent... since I didn't use it once today!
[x] (0:20) goto line keyboard shortcut; toggle split view shortcut.


(0:08?)  [x] (0:20) pdf preview -- make resolution function of width?
(1:00?)  [x] (3:30) bug -- when reconnecting to a TERMINAL session, it display a bunch of garbage codes.

(0:10?) [x] bug -- add or delete open file pill should result in a resize all (not just on add)

(1:00?)  [x] (0:46) get ssl cert setup for cloud.sagemath.org:

openssl req -new -newkey rsa:2048 -nodes -keyout cloud.sagemath.key -out cloud.sagemath.csr
IO2wMWk7
01salvus: 128.95.224.230
06salvus: 128.95.242.135


(1:00?) [x] (0:16) change any hard coded "salv.us" to cloud.sagemath.org


(0:30?) [x] (1:14) create  script to make new unix_account
2614 in hub.coffee:
create_unix_user_on_random_compute_server = (cb) ->
    cb(false, {host:'localhost', username:'sage0',port:22})


(0:30?) [x] make it so each new project get mapped to unix accounts by default, created using above script.
        [x] new accounts get one new unix_user
(0:30?) [x] ui: make it so account in new project uses the user's default account "by default"


(0:10?) [x] ui: make the "directory listing" spinner moved down and bigger -- half hidden looks silly.


(0:05?) [x] (0:03) error viewing files at message should say for what project.


(0:10?) [x] (0:11) figure out port forward trick for hopping a local_hub? -- thought about it, not so happy; found buggy in process

(0:07?) [x] (0:15) ui -- same keyboard shortcuts for zoom in/out of fonts in codemirror as in terminal; plus some other ui cleanup.

features;
(1:00?)  [x] feature -- (4:00 so far) file upload using thttp://www.dropzonejs.com/; need to accept POST


(0:30?) [x] (0:30) protection from the trivial-to-cause "Terminal with infinite output" control-c ignored problem.

--> (0:45?) [x] (3:00) HUGE BUG -- download project kills everything (confirmed in multiple settings) -- obviously trying to tar /home and running out of RAM.
  Surprisingly, this is caused by a major bug in node.js, which is here and is fixed in a new version:
         https://github.com/joyent/node/issues/4700
  So, I guess i have to upgrade node.... which is a good idea anyways. This was a frickin' rabit whole!
(0:15?) [x] bug -- tab/untab of selected text -- I assumed direction of selection is one way, but if it is backwards, then bOOM.
(0:45?) [x] HUGE BUG -- (0:16) restarting sage session bug

(0:15?) [x] tiny bug -- when first opening a session the save button should say that there are no unsaved changes...; very confusing otherwise.; this isn't optimal, but at least it tells us if *we* made any changes... for what it is worth.  Optimal would be to know if anybody has.

(1:00?) [x] worksheet filename save

(0:10?) [x]worksheet; no save button; make save every 15 seconds no matter what.


--> (0:45?) [x] editor bug -- weird bug when starting to edit a file and loose something
            -- idea: instead of reseting sync session, just start it from scratch;
               should work, since this problem doesn't happen when freshly connecting!

(0:15?) [x] (0:10) BUG: checkboxes in worksheets have wrong position attribute -- they don't scroll.


(0:05?) [x] center the worksheet title/description

(0:30?) [x] (0:08) BUG: split mode is totally broken on my office Chrome machine!?

(0:30?) [x] (0:06) BUG: don't send new cursor broadcast message in response to sync events -- this is ANNOYING as hell.

 * (0:05?) [x] (0:04) force browserify version


 VM's
     # check that no base vm is running
     virsh --connect qemu:///session list --all
     export PREV=salvus5; export NAME=salvus-20130402; qemu-img create -b ~/vm/images/base/$PREV.img -f qcow2 ~/vm/images/base/$NAME.img
     virt-install --cpu host --network user,model=virtio --name $NAME --vcpus=16 --ram 32768 --import --disk ~/vm/images/base/$NAME.img,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole  --graphics vnc,port=8121
     virsh -c qemu:///session qemu-monitor-command --hmp $NAME 'hostfwd_add ::2222-:22'; ssh localhost -p 2222


       sudo chown og-rwx -R salvus      # IMPORTANT!
       sudo apt-get update; sudo apt-get upgrade;
       sudo reboot -h now
       cd salvus/salvus; git pull https://github.com/williamstein/salvus.git
       . salvus-env


# for example:
       ./build.py --build_stunnel --build_nodejs --build_nodejs_packages --build_haproxy --build_nginx --build_cassandra --build_python_packages

     virsh --connect qemu:///session undefine $NAME
     virsh --connect qemu:///session destroy $NAME
     virsh --connect qemu:///session list --all

     cd ~/salvus/salvus; . salvus-env;  push_vm_images_base.py




(0:30?) [x] make virtual machine that is up2date and has all necessary packages (including gv, rsnapshot, etc.);

* (0:10) [x] convert final_push.txt to final_push.md

* (0:15?) [x] (1:05) terminal/editor full-screen modes, too.


* (0:45?) [x]  add a %md mode -- one like in lecture3:

 (0:30?) [x] (0:20) diff for individual cells
 (0:30?) [x] (0:15) patch for cells
 (0:30?) [x] (2:15; more subtle than expected, and distracted) diff for worksheets
 (0:30?) [x] (0:55) patch for worksheets

 Regarding worksheet sync, I'm going to assume that I'll implement the following structure in the future.  This means, I'm completely
 ignoring sections from worksheets, and moving them elsewhere.  I'll likely remove them for the release.


--> * (0:45?) [x] (0:34) HELP: create a tab for help (linked to from the about page and various places).

* (0:10?) [x] (0:12) change the "full screen" icon to be the same as in Chrome OS X (and grey, not orange)
* (0:25?) [x] (0:25) fix path bugginess that I guess I introduced yesterday, which made sage not start.
* (0:30?) [x] (1:14), FEATURE: in worksheet cell, double click on output to show input...

* (0:30?) [x] (0:37) REMOVE: Get rid of TITLE and Description too (it all just serves to complicate things; instead make cells really powerful).; clean up button bar some


* (0:30?) [x] (0:17) REMOVE the note part of a cell, and instead just making it much easier to create notes using cells.


* (0:15?) [x] "max-height:20em;" setting initial output in syncdoc; instead should be in terms of height of codemirror wrapper.

==

--> * (0:30?) [ ] BUG: loading some worksheets is DOUBLE DOG slow.  WHY??
This issue is CRITICAL.   It seems like every codemirror editor is taking like a half second to do something in response to a window resize event. This isn't good.   WHY?  Ideas of things to do:
   x - make a simple standalone page to try to emulate this; maybe I am misconfiguring something: -- NOPE, it is very slow (!)
   x - what if they are all set to read-only mode: total fail; still very slow.
   x - ipython isn't nearly so slow... but is also using an old version of codemirror.
   x - try making a bunch of editors and *one* shared doc -- they each edit a separate range of lines.  Will this help?
     Didn't try, since I REALLY doubt it, given what is taking time.
   x - I did upgrade codemirror to 3.11, which breaks the ReST mode (I don't use it), but is otherwise not really
       any different.

   I must address this issue.  I really want to try again my idea to have the entire worksheet be inside of a single
   codemirror editor, with the output as html widgets.  That would have the potential to *scale up hugely*.
   When I add back sectioning/pages/slides, each section/page/slide, etc. will be such a codemirror editor.

   cm.addLineWidget(line: integer|LineHandle, node: Element, ?options: object)

This will be some work, so let's plan it out. I've tried this 2-3 times before, and always FAILED, so let's hope this time is different.

--> * (0:45?) [ ] make a detailed plan for an worksheet-in-an-editor

# The look
- A worksheet will *look* exactly like a single codemirror document, except:
1. We will utilize line widgets to influence how much code is evaluated when you press "shift-enter", and to "insert a new cell".
2. The output of code evaluation will be entirely in a CodeMIrror "Line Widget", and will use all the same code I already wrote, e.g., for interact.

Question: in codemirror, is it possible to use markText to put a border around a block of text?  ANSWER: *NO.*

However, it is possible to use markText to do everything we need for output, to do code folding, etc.

* (0:10?) [x] (0:06) make a class called "WorksheetDocument" that derives from "class SynchronizedDocument" in syncdoc.coffee.


* (0:10?) [x] (0:07) make it so editor opens sagews using the new class.
* (0:15?) [x] (0:04) add handling a keyboard event to the codemirror for "shift-enter".  -- just print something to log

* (0:20?) [x] (0:11) cm-sync-worksheets: add code to detect the block that needs to be evaluated when a shift-enter happens. This is the max in both directions until edge of editor or hit an output line.  An output line is defined to be
[MARKER]uuid

* (0:15?) [x] (0:21) cm-sync-worksheets: bring over code for having a Sage session attached to the worksheet

* (0:15?) [x] (1:00) cm-sync-worksheets: when user shift-enters above, send the code to be evaluated and create a corresponding div for output, along with a callback.

* (0:15?) [x] cm-sync-worksheets: write something to handle output messages: when get a message tagged with a uuid, will search editor for [MARKER]uuid, find linemarker corresponding to that line (or make one if there is none), then insert output in that line.  Try again later if such a line doesn't exist.

* [x] (0:15) Try out the above and see if it "feels" good, especially with the syncing that will automatically just work.

* (0:10?) [x] (0:20) cm-sync-worksheets: correctly embed the uuid of each computation

* (0:15?) [ ] cm-sync-worksheets: right after doing sync, need to search for any new [MARKER]uuid's and mark them (so user doesn't see them)

PLAN:

Can I store data in the output line that is synchronized across worksheets and invisible to user?  YES!

    - EXECUTE: message to local hub to execute cell with this id

    - ALL output is via local hub modifying the master document's output line (via 1-line json),
      clients seeing that modification and interpreting it.

0: meta information about this; json object; e.g., modes for cells.
1: [start-cell-marker][uuid of cell]metadata[marker]contents of cells...
       metadata = set of letters
         - e = need to execute
         - h = hide input
         - o = hide output
         -
       use the metadata to specify that the cell is ready to run.
.. more contents ..
n: [output-marker][uuid of output] {}[output-sep]{}...[output-marker] <-- output goes here as json messages all on one line, separated by a marker; rendered by client.  This is ONE CodeMirror marked text area.
?: [start-marker][uuid of cell]contents of cells...
.. more contents ..
?: [output-marker]{} <-- output goes here as json messages all on one line
...

[x] (0:18) Make a fairly complete plan to implement core of the above idea

(0:20?) [x]  (0:48)local hub: when starting a codemirror session and file extension is sagews, *ensure* that a corresponding sage session is available.  No need to reconnect or store an existing session, etc., since local hub *is* the lifetime of the session!

--> (0:45?) [x] (2:45) local hub: support a new "execute" message, which takes uuid of cell as only input.  This should probably be just combined with the sync message as an optional additional action, to avoid latency issues.  Also, make client send this message on doing "shift-enter" (say).   This will determine what code to execute, submit it to the sage process, delete existing output, create a new cell if necessary, etc.; all this will get pushed out via the sync system.
Another optimization will be to wait up to 100ms (?) say for output messages and only complete the sync after applying them, so they are all sent back together immediately.
NOTE: output messages do *not* need to have an id tag on them -- that would be wasteful.

WAIT -- instead, we'll mark the document

- (0:15?) [x] test/debug the above, which should work and allow for synchronized sessions with output appearing in all of them.  Then plan further.

PHASE 2: get something that works that is in `local_hub` (hence everywhere and synchronized)

- (0:20?) [x] (0:40) do processing on client side of new input from server after sync (i.e., use mark text).
- (0:20?) [x] (1:00) make it so that when localhub runs code, it deletes old output line and creates new output line
--> - (0:20?) [ ] make it so that when localhub evaluates code, it sends it to sage process and also listens for results and puts them in the appropriate output cells (if they exist).
- (0:25?) [ ] make it so client parses and renders any results appearing in output location, tracking what it has done so far.





- (0:10?) [x] sagews: get rid of trailing whitespace on eval
- (0:30?) [x] (0:49) sagews: reset CSS inside div output
- (0:20?) [x] (0:38) sagews: nice horizontal line between cells
- (0:10?) [x] (1:02) sagews: when evaluating a cell, put the end of the cell as *high* as possible (not low) -- no whitespace lines. -- took a long time due to confusion regarding a bug caused by my cursor location code and merging.
- (0:30?) [x] sagews/editor: try to fix cursor merge bug found above.  -- I think the only valid approach it to fully implement the right algorithm. Bandaide now, which will be to insert newline before any output cells introduced by a merge.  Want this anyways...
- (0:15?) [x] (0:09) sagews: what's up with infinite loop exec'ing nothing in localhub?

- (0:20?) [x] (0:33) sagews: click on separator to make a new cell; make hovering over it change color (?)

- (0:20?) [x] (0:18) sagews: when client executes code with shift-enter, move the cursor to next input cell

- (0:10?) [x] (0:08) sagews: make split screen mode work so I can play with it; if it is not useful or slow, kill it (?) -- let's make it a different view; seems useful for it to be "hide all output".

[marker.input][uuid of cell][metadata][marker.start]
...
input content of the cell
...
[marker.output][output uuid of cell][marker.output]{json output mesg}[marker.output]{json output mesg}[marker.output]...[marker.output]

 - (1:00?) [x] sagews: switch to directly applying the patches to the codemirror buffer, since right now, the *entire* output is being re-rendered every single time... since all the marks go away on sync.; this will be a few lines of code in syncdoc.coffee

- (1:30?) [x] (0:20) sagews: design/implement a way to make evaluation of code blocks optimally fast for the client requesting a specific eval.  This is absolutely critical, and could impact other design choices, so let's get it done.   [I just tweaked a standard sync parameter... but it feels much more usable now.  Maybe just optimizing sync is the way to go.]

- (1:00?) [x] sagews: misc robustness cleanups related to processing control codes



- [x] (this took a day!) setup new chromebook running salvus
- (0:15?) [x] (0:13) codemirror execute code -- define message
- (0:20?) [x] (1:00) codemirror exec message: route through hub properly
- (0:20?) [x] (0:35) codemirror exec message: handle in local hub, and test in client
- (0:30?) [x] (0:40?) codemirror sync session: add introspection messages
- (0:20?) [x] (0:20) sagews: implement tab completion without UI using the codemirror introspection messages
- (0:45?) [x] (1:12) sagews: ui for introspection -- completions
- (0:45?) [x] (1:05) sagews: ui for introspection -- docstring and source code
- (0:15?) [x] sagews: hub/ local hub: support sending signals to sage process; also make "esc" and "control-c" interrupt the process

- (0:15?) [x] (0:30) sagews: set path of session on startup to same as file.

- (0:15?) [x] (0:13+) sagews: make it so "sagews" are the worksheets (basically change what the new button makes)

- (0:10?) [x] (0:22) hide line 0 and make line numbering start at 0 to avoid a lot of confusion for users.

- (0:20?) [x] (0:25) sending blobs from local hub codemirror/sage sessions, so that we can look at autogenerated c code during class more easily!


 (1:00?) [x] (3:00) upgrade cassandra, to see if I can store projects in db then.  Maybe old cassandra was just broken?!


- (0:15?) [x] (0:08) creating new file puts [object Object] at the end of the name.
- (1:00?) [x] (0:45) why is it (mainly worksheets) so damned slow while typing -- rendering everything every time.


* figure out what the deal is with timeouts when storing large data:
   - changing helenus timeout definitely doesn't help
   - what about using python driver? *SAME* fail.  So it is on the server side.

     import cassandra
     cassandra.KEYSPACE = 'test'
     cassandra.NODES=['localhost']
     a = cassandra.UUIDValueStore('x')
     a[u] = 'x'*(int(2*1e7))  # BOOM!
    [Errno 104] Connection reset by peer
    Connected to localhost

I added 00 to the end of two constants in data/local/cassandra/cassandra.yaml and the problem vanished, so this
is a server-side configuration issue, which is easy to resolve.  Thus storing user projects in the database is an
option, at least.

    # Frame size for thrift (maximum field length).
    thrift_framed_transport_size_in_mb: 1500

    # The max length of a thrift message, including all fields and
    # internal thrift overhead.
    thrift_max_message_length_in_mb: 1600




- (0:45?) [x] sagews: in local hub when code execution done, instead of including a message with done:true, change state of cell from "r" to not.
- (0:30?) [x] (0:19) sagews: visually change state of editor when code exec is requested ("x"), is executing ("r" mode)
- (0:30?) [x] (0:12) sagews: tab on a new line tries to complete on empty instead of inserting a tab
- (0:45?) [x] (1:00) sagews: evaluate and insert new cell at bottom should move cursor to new cell
- (0:30?) [x] (0:51) sagews: handle paste better -- don't ever show codes
- (0:30?) [x] (1:30) sagews: handle undo/redo better -- dont' show codes; it just has too much in the undo buffer...; removed custom cursor handling.  Current plan: mark some undo steps as "skip", and on undo, do another undo when hit a skip.  This took longer than expected, but seems OK.

- (0:30?) [x] (0:10) sagews: implement alt-enter to evaluate without moving the cursor, since I need that for teaching.

- (0:45?) [x] (0:35) sagews: control-enter evaluate and split; ctrl-; = split cell

- (0:45?) [x] (0:43) sagews: make it so cursor is never invisible... or better, if it enters a marked line, it is moved out automatically.  For example, put cursor at end of a cell input and type r or x then move cursor out, and we get a spinner!

- (0:20?) [x] (0:20) editor: refresh after font resize

- (0:45?) [x] (0:20+) sagews: play button to submit code to execute
- (0:45?) [x] sagews: button to interrupt code to execute
- (0:45?) [x] sagews: button to kill sage process
- (0:15?) [x] sagews: button to split cell




## April 21, 2013:

- (0:15?) [x] (0:05) define new cell flags for hidden input
- (0:30?) [x] (1:55) make client renderer support them (test them using raw mode) -- this took a LONG time (?).

- (0:30?) [x] (0:38) sagews: toggling input/output hide: via keyboard shortcut
- (0:20?) [x] (0:18) sagews: double click output to toggle input
- (0:30?) [x] (0:06) sagews: fix sync bugs with toggling input/output.
- (0:15?) [x] sagews: modify input/output toggle functions so they apply to entire selected range, which is far more powerful.
- (0:30?) [x] sagews: implement gui for toggling input hide: icon at top or gutter

- (0:30?) [x] (0:37) sagews: re-implementing the javascript and coffeescript commands

- (1:00?) [x] (1:00) sagews: make salvus.hide/show work via new output message by directly modifying doc on local hub; safer, more secure, and far more efficient; rewrite %hide mode / command -- support it (so %md works with it)

- (0:45?) [x] (1:42) sagews: dynamic syntax highlight modes in each cell

- (0:30?) [x]  (1:18) %auto decorator; super useful, so make it work! -- finally, this time I think it is right; no bullshit parsing or hacks.

- (0:30?) [x] (0:30) sagews: make markdown mode optionally leaves content of $'s untouched (wraps them all in spans?); but should *still* allow $a\_1$ for compatibility -- I just enabled "code\_friendly", for the worksheet, which does what we want...

- (1:00?) [x] (0:07) sage server: fix parsing of blocks to not string whitespace, since that tricks certain % modes.
- (0:45?) [x] (0:22) tooltip over connecting speed looks absurd

- (0:30?) [x] (0:15) bug: yesterday I made it so two new cell dividers are created when evaluating. Wow/how/what?


- (0:45?) [x] (0:31) fix latex editor so usable; need it to write an exam!
- (0:15?) [x] remove google protobuf; I'm not using it all

- (1:00?) [x] (0:51) backups:  include bup in salvus itself (instead of system wide), for install stability.

I am going to use bup for backups -- https://github.com/bup/bup/

---



 [x] (3:00?) Ability to make a *complete* efficient dump of system state to an archive:
     [x] (0:05?) create new file "backup.coffee"
     [x] (0:15?) backup: create a class with methods for each of the following, and one that does all; stubs.
     [x] (0:10?) backup: ensure init of a bup archive for target
     [x] (0:15?) (0:25) backup: connect to database and obtain list of all projects (by uuid) and their current location
     [x] (0:30?) (1:01) backup: bup each project to target (branch=uuid), excluding .sagemathcloud and .sage paths.

    bup on d9b8d530@localhost index --exclude .bup --exclude .sage --exclude .sagemathcloud --exclude .forever --exclude .cache --exclude .fontconfig --exclude .texmf-var .

After updating the index, can do this to see exactly what changed (if anything) to know if there is a need to make a backup; this is not so useful if anything else is backing up same projects.

    bup on d9b8d530@localhost index -m -s

Now make backup:

    export BUP_DIR=data/backup/bup/
    bup on d9b8d530@localhost save --strip -9 -n a835a7a5-508c-44a9-90d2-158b9f07db87 .

And restore:

    bup restore a835a7a5-508c-44a9-90d2-158b9f07db87/latest/. --outdir=xyz

Browse live backup:

    mkdir data/backup/live
    bup fuse data/backup/live
    fusermount -u data/backup/live  # must do this before any new additions will appear!


    fusermount -u data/backup/live >/dev/null; mkdir -p data/backup/live; bup fuse data/backup/live
    ls  data/backup/live

     [x] (0:49) backup: ran project backup on cloud.sagemath.org and fixed a number of issues.

     [x] (0:30?) backup: copy each database table to branch in target

    require('backup').backup(cb:(err,b) -> b.dump_keyspace_to_filesystem(console.log))

# Show all tables in schema

    DESCRIBE TABLES

    select columnfamily_name from system.schema_columnfamilies

# Dump table to disk

    copy projects to '/home/wstein/tmp/foo' with HEADER=true
    copy projects2 from '/home/wstein/tmp/foo' with HEADER=true


     [x] (0:45?) backup: run/debug this on cloud.sagemath.org (excluding my home directory project!)

  require('backup').backup(cb:(err,b) -> b.backup_all_projects(console.log))

---

[ ] (3:00) Prepare kvm base image on 06salvus with everything configured and installed for all components of system (except stunnel).

     [x] (0:45?) vmhosts: ensure substantial lvm space available for persistent images (512GB on all machines for now)
     [x] (0:15?) image: apt-get update; apt-get upgrade
     [x] (0:15?) image: apt-get install everything listed in build.py
     [x] (0:30?) image: build sage-5.8 just released
     [x] (0:30?) image: build pull of latest salvus source
     [x] (0:15?) image: rsync it out to other machines (01,03,07)
     [x] (1:00?) image: make /home/salvus/vm/images the max possible size.

cloud4:

umount
lvremove

mv vm/images vm/images.0
1

pvcreate /dev/sdb1
vgextend 07salvus /dev/sdb1
pvcreate /dev/sdc1
vgextend 07salvus /dev/sdc1

`   export GROUP=03salvus; lvcreate --name /dev/mapper/$GROUP-salvus_images -l 100%FREE  $GROUP; mkfs.ext4 /dev/mapper/$GROUP-salvus_images; echo "/dev/mapper/$GROUP-salvus_images  /home/salvus/vm/images ext4 defaults 1 1" >> /etc/fstab; mount -a; chown salvus. /home/salvus/vm/images/; rm -rf /home/salvus/vm/images/lost+found/

time rsync --sparse -uaxvH images.0/ images/

(x) cloud1
(x) cloud2
(x) cloud3
(x) cloud4

---

 [ ] (2:150?) Restore information from archive; TEST.
     [x] (0:30?) (0:14) add database table to track snapshots of projects (project_id/when/where):
          queries:
            -- host that has latest snapshot

select * from project_snapshots  where project_id=29ab00c4-09a4-4f2f-a468-19088243d66b order by time desc limit 1;

            -- list of all snapshots (date/location) in a given range of dates.

cqlsh:test> select * from project_snapshots  where project_id=29ab00c4-09a4-4f2f-a468-19088243d66b and time>1267021261000 and time<13670212610000;

-->     [x] (0:30?) (3:16) make regular local bup snapshots of recently modified projects, and store this fact in database  [took 6 times as long as expected!]

Put this in backup.coffee as thing that gets going; maybe hub will start it, maybe hub won't.  We can test it outside hub.

1. find all projects touched in the last k minutes
2. query for snapshots with this hub as host of those projects having a backup in the last k minutes
3. for any that don't have a  snapshot, make a snapshot

cqlsh:test> select * from project_snapshots  where project_id in (29ab00c4-09a4-4f2f-a468-19088243d66b) and host='wstein@localhost';

    require('backup').backup(cb:(err,b) -> b.snapshot_active_projects(max_snapshot_age:1))

    require('backup').backup(cb:(err,b) -> b.start_project_snapshotter())

    require('backup').backup(cb:(err,b) -> b._restore_project_from_host(project_id:'29ab00c4-09a4-4f2f-a468-19088243d66b', location:{"username":"cb33df53","host":"localhost",'path':'.',port:22}, host:'localhost'))


    require('backup').backup(cb:(err,b) -> b.restore_project(project_id:'29ab00c4-09a4-4f2f-a468-19088243d66b', location:{"username":"cb33df53","host":"localhost",'path':'.',port:22}))



- (0:30?) [x] deploy: make sure 4 machines have kernel opts that Keith reported are needed now for reboot to work: https://mail.google.com/mail/u/0/?shva=1#inbox/13e2db89829eed81







     [x] (1:00?) (4:30-- way, way longer than expected. Wow.) add a function "restore_project" to backup, which takes as input a project_id, location, timeout, and optional time, and restores project to that location.  If the time is given, find snapshot with closest time and uses it; otherwise use globally newest snapshot.   If timeout elapses and can't contact snapshot location, try again with next best one. If location doesn't exist, give error.

    [x] (0:45?) (1:05) when opening project, if no location doesn't exist, resume from *latest* working global bup snapshot, if there is one.

    [x] (0:30?) (0:04) in backup.coffee, address this: "HOST = 'localhost' # TODO"


 [x] (2:00) Define deployment file/conf.
     [x] (0:30?) (0:30) write the file based on existing one.  4 hosts; 1 web machine per; 1 db machine per; n compute per.
     [x] (0:45?) (0:45) Learn how latest easier-to-expand Cassandra cluster now works; update conf accordingly.
     [x] (0:45?) Reduce some firewalling, at least for outgoing connections from user compute machines (so they can use the net); this is not needed, due to not having a "compute" server anymore.


 [ ] Deploy -- this could take WAY longer, depending on bugs/issues we find!
     [x] (0:15?) update salvus on vm

    virsh_list
    export PREV=salvus-20130425; export NAME=salvus-20130427;
    qemu-img create -b ~/vm/images/base/$PREV.img -f qcow2 ~/vm/images/base/$NAME.img
    virt-install --cpu host --network user,model=virtio --name $NAME --vcpus=16 --ram 32768 --import --disk ~/vm/images/base/$NAME.img,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole
    virsh -c qemu:///session qemu-monitor-command --hmp $NAME 'hostfwd_add ::2222-:22'; ssh localhost -p 2222

    [x] (0:30?) )(0:04) install bup system-wide on base vm.

sudo apt-get install python2.7-dev python-fuse python-pyxattr python-pylibacl linux-libc-dev
git clone git://github.com/bup/bup
cd bup; sudo make install
cd ..; sudo rm -rf bup

    [x] (1:00?) (2:00) create account creation script so salvus@vm != root@vm, and accounts created in /mnt/home/

This requires putting -- via visudo -- this line:

      salvus ALL=(ALL)   NOPASSWD:  /home/salvus/salvus/salvus/scripts/create_unix_user.py ""

   [x] (0:15?) (0:06) setup skel/ on base vm to have .sagemathcloud path.

rsync -axvHL local_hub_template/ ~/.sagemathcloud/
cd ~/.sagemathcloud
time ./build # takes 40 seconds
tar jcvf sagemathcloud.tar .sagemathcloud
cd salvus/salvus/scripts/skel/
tar xvf ~/sagemathcloud.tar

   [x] (0:20?) (0:04) make sure account creation script is actually run on the right computer.

-->   [ ] (0:45?) (+0:17) ensure quotas are setup and work on base vm.

sudo apt-get install quota quotatool

I added this to /etc/rc.local:

if [ -d /mnt/home ]; then
    touch /mnt/home/aquota.user /mnt/home/aquota.group
    quotaon -a
fi

####

Now debug this:

    ./vm.py --ip_address=10.1.1.2 --hostname=compute1 --disk=home:1 --base=salvus-20130427


It turns out quota support was removed from ubuntu (?!): http://www.virtualmin.com/node/23522

   apt-get install linux-image-extra-virtual

# if this works, do this to the base image ... and put a note in build.py


     [x] (1:00?) (0:15) setup tinc vpn between cloud1,2,3,4, since I can't get anywhere further without that.

     [x] (0:05) config tinc on base vm then remove any git stuff:
       git reset --soft HEAD^
       git reset HEAD conf/tinc_hosts/salvus-base


     [x] (0:20?) in base vm, get rid of touching files in /mnt/home/ on startup to enable quota -- this is wrong.


 ---

     [x] (1:30?) serious problem -- user machines: accounts vanish since /etc/passwd etc are gone on reboot.
                 need a solution, e.g., maybe copy those files over to persistent when making a new account,
                 and restore on boot.  since no actual passwords, should be safe.  Or recreate on reboot.
                 Making /etc/stuff a symlink does *NOT* work; must copy over.

     [x] (0:45?) make it so /tmp is "mount -o bind" to /mnt/home/tmp" so it gets that quota and has lots of space.

---



## Deployment!

01/03/06/07 salvus

128.95.242.135 cloud1   # 06salvus
128.95.242.137 cloud2   # 07salvus
128.95.224.237 cloud3   # 03salvus
128.95.224.230 cloud4   # 01salvus

[ ] (3:00?) VM installs/deploys

     [x] (0:30?) create automated bup backups cloud1->cloud2, etc.; backup everything except vm images.
     [x] (1:00?) (1:00) bup of everything to disk, for an extra level of backup, since I have 4TB just sitting there unused (leave 1TB to expand /home); this is meant only for the next few months, not long term.

     lvcreate --name salvus --size 3000G data
     mkfs.ext4 /dev/data/salvus
     # edit /etc/fstab to add mount of /home/salvus to be /dev/data/salvus:
        # Salvus backup
        UUID=d84d5f43-8cf9-404b-9edb-3b4401127cf4 /home/salvus ext4 defaults,noauto 0 0
     # change permissions:
     chown salvus /home/salvus

     # install bup systemwide
      apt-get install python2.6-dev python-fuse  python-pyxattr python-pylibacl linux-libc-dev; git clone git://github.com/bup/bup; cd bup; make install

      # and on cloud*
      apt-get install python2.7-dev python-fuse  python-pyxattr python-pylibacl linux-libc-dev; git clone git://github.com/bup/bup; cd bup; make install

     # setup ssh key access to cloud1-4
      ssh-keygen -b 2048
      ssh-copy-id cloud4   # etc.

     # setup a script to backup everything from cloud1-4 except vm/images/backup:

        salvus@disk:~$ more bin/backup-cloud
        #!/usr/bin/env python

        import os

        BUP_DIR="/home/salvus/vm/images/backup/bup"
        for host in ['cloud1', 'cloud2', 'cloud3', 'cloud4']:
            cmd = "BUP_DIR=%s  time bup on %s index --exclude %s  /home/salvus/"%(BUP_DIR, host, BUP_DIR)
            print cmd
            os.system(cmd)
            cmd = "time bup on %s save -9 -n %s ."%(host, host)
            os.system(cmd)

     # setup cron to make such a backup every 6 hours (revisit frequency later)
            0 */6 * * * /home/salvus/bin/backup-cloudt



     --> [x] (1:00?) get cert for cloud.sagemath.com

    # paste this into go-daddy form:
     openssl req -new -newkey rsa:2048 -nodes -keyout cloud.sagemath.key -out cloud.sagemath.csr
     # get file from them, extract, and:
     cat cloud.sagemath.key cloud.sagemath.com.crt gd_bundle.crt > nopassphrase.pem

     [x] (0:30?) when cloud3,4 come back:
        xx - ssh cloud3 chmod og-rwx -R /home/salvus
        xx - install bup systemwide

     [x] (0:30?) (0:06) setup DNS for cloud.sagemath.com


---

     [x] (0:30?) (0:16) use /mnt/backup instead of data/backup when possible (again, so persistent) -- just needs to be tested.

     [x] (1:00?) (0:38) make sure cassandra can have initialization of schema on first use if no schema; actually this must be done manually on adding a new node by doing this in python:

         import cassandra; cassandra.set_nodes(['localhost'])
         cassandra.init_salvus_schema('salvus')

     [x] (0:15?) (0:06) update salvus in a new base vm, and hosts

on cloud1:

     cd salvus; git pull  # type login/password
     ssh cloud2 "cd salvus && git pull cloud1:salvus/"
     ssh cloud3 "cd salvus && git pull cloud1:salvus/"
     ssh cloud4 "cd salvus && git pull cloud1:salvus/"

Start new base vm:

    export PREV=salvus-20130427; export NAME=salvus-20130428;
    qemu-img create -b ~/vm/images/base/$PREV.img -f qcow2 ~/vm/images/base/$NAME.img
    virt-install --cpu host --network user,model=virtio --name $NAME --vcpus=16 --ram 32768 --import --disk ~/vm/images/base/$NAME.img,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole
    virsh -c qemu:///session qemu-monitor-command --hmp $NAME 'hostfwd_add ::2222-:22'; ssh localhost -p 2222

     [x] (0:15?) (0:01) push out vm's
     [x] (0:10?) update services conf file base image; make cloud1/cloud3 the admins also, and re-update cloud1

     [x] (0:30?) (0:27) deploy: start stunnels and confirm working, fix issues
     [x] (0:30?) (1:02) deploy: start all vm's and confirm working, fix issues

     [x] (0:30?) (0:06)deploy: start haproxy's and confirm working, fix issues

     [x] (0:30?) deploy: start nginx and confirm working, fix issues

-->     [x] (1:00?) (0:59) deploy: start cassandra,  confirm working, fix issues

Won't start -- segfaults.
I do this:

    apt-get remove openjdk-6-*

so it will use the installed jdk-7.
Note that scilab gets removed too.
It starts!  But I see this in the log:
 INFO 15:43:24,786 JNA not found. Native methods will be disabled.

I try re-install scilab, which puts the java back to be old.
So I try:

    apt-get autoremove
    sudo update-alternatives --config java

now everything works.  Regarding JNA:

salvus@cassandra1:~/salvus/salvus/data/local/cassandra/lib$ ln -s /usr/share/java/jna.jar .

This works, but it still says:

  "OpenJDK is not recommended. Please upgrade to the newest Oracle Java release"

Stop all VM's
On base VM: Switch to Java JDK and should re-install cassandra

   apt-get install python-software-properties
   add-apt-repository ppa:webupd8team/java
   apt-get update
   apt-get install oracle-java7-installer
   update-alternatives --config java

---

NOw initialize databases on *one* node (it auto-propogates):

         cd salvus/salvus/; . salvus-env; ipython

         import cassandra; cassandra.set_nodes(['10.1.1.2'])   # etc. DO NOT USE 'localhost'
         cassandra.init_salvus_schema('salvus')

I then did this (see below):

        salvus@web3:~/salvus/salvus$ cqlsh -k salvus 10.1.1.2
        Connected to salvus at 10.1.1.2:9160.
        [cqlsh 2.3.0 | Cassandra 1.2.3 | CQL spec 3.0.0 | Thrift protocol 19.35.0]
        Use HELP for help.
        cqlsh:salvus> UPDATE plans SET current=true, name='Free', session_limit=3, storage_limit=250, max_session_time=30, ram_limit=2000, support_level='None' WHERE plan_id=13814000-1dd2-11b2-0000-fe8ebeead9df;


    [x] (1:00?) deploy: start hubs, confirm working, fix issues

    [x] (0:45?) test: account creation.
"Received an invalid message back from the server when requesting account settings. mesg={"event":"error","id":"4538d700-3e83-4f43-9edb-3d8dcbc67002","error":"No plan with id 13814000-1dd2-11b2-0000-fe8ebeead9df"}"

-->      [x] (0:45?) test: project creation and quotas

Failed to create new project 'test' -- "command 'ssh' (args=10.1.1.4 sudo salvus/salvus/scripts/create_unix_user.py) exited with nonzero code 255 -- stderr='Host key verification failed.\r\n'"

     [x] (0:45?) test: doc editing
     [x] (0:45?) test: console
     [x] (0:45?) test: worksheets

  [x] (0:20?) fix the crappy bash prompt:


  [x] (0:30) remove "WARNING: This is a highly experimental unstable website. All data will definitely be randomly deleted without notice. USE AT YOUR OWN RISK." and restart web vm's.


 [x] (0:45?) test: password reset -- "Error sending password reset message to 'wstein@gmail.com'. Internal error sending password reset email to wstein@gmail.com."  LOG SAYS:
info: Unable to read the file 'data/secrets/salvusmath_email_password', which is needed to send emails.

Shutdown all VM's and do the following to base machine:
   - create 'data/secrets/salvusmath_email_password'
   - update salvus repo.

Then restart everything and test again, including password reset.

---

  [x] TODO: 'Failed to create new project 'test4' -- "command 'ssh' (args=10.1.2.4 sudo salvus/salvus/scripts/create_unix_user.py) exited with nonzero code 255 -- stderr='Host key verification failed.\r\n'"'

  [x] test password reset again.

  [x] (1:00) add big link at front/top of cloud.sagemath.org VERY strongly suggesting users switch to cloud.sagemath.com.


  [x] make worksheet/file/etc creation easier by having a default name.
  [x] get rid of word "ping" in status (too much space)

  [x] debug and get project snapshotting working; this is very, very important!

  require('backup').backup(keyspace:'salvus', hosts:['10.1.1.2'], cb:(err,b) -> b.snapshot_active_projects(max_snapshot_age:1))

Solution: It was more of the strict host key business. I'm going to edit

/etc/ssh/ssh_config

in the base machine and put this line:

StrictHostKeyChecking no

then snapshots should work.  They already were working on machines where the
account was made.


  --> [x] update base vm and restart everything.


    cd salvus/salvus
    . salvus-env
    ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    s.stop_system()
    s.status('all')
    # possibly manually look to ensure that vm's are gone
    salvus@cloud1:~$ ssh cloud2 ls vm/images/temporary/
    salvus@cloud1:~$ ssh cloud3 ls vm/images/temporary/
    salvus@cloud1:~$ ssh cloud4 ls vm/images/temporary/

    export PREV=salvus-20130428; export NAME=salvus-20130430;
    qemu-img create -b ~/vm/images/base/$PREV.img -f qcow2 ~/vm/images/base/$NAME.img
    virt-install --cpu host --network user,model=virtio --name $NAME --vcpus=16 --ram 32768 --import --disk ~/vm/images/base/$NAME.img,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole
    virsh -c qemu:///session qemu-monitor-command --hmp $NAME 'hostfwd_add ::2222-:22'; ssh localhost -p 2222

    cd salvus/salvus
    . salvus-env
    git pull
    ./make_coffee
    # fix /etc/ssh/ssh_config
    sudo su
    apt-get update; apt-get upgrade
    reboot -h now
    sudo shutdown -h now


 Then

    cd vm/images/base/
    ./push

And

    cd salvus
    git pull
    push_salvus

Finally,

    cd salvus/salvus

Finally,

    cd salvus/salvus

Finally,

    cd salvus/salvus
    . salvus-env
    ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    s.start_system()
salvus-env
    ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    s.start_system()

    . salvus-env
    ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    s.start_system()


This worked well, I think....


---

Next session:

 [ ] (1:00) nothing automatically sets which are the compute machines in the database; this should be done by admin when it starts them.  Do manually for now (?).

 cqlsh:salvus>

     update compute_servers set running=true, score=1 where host='10.1.1.4';
     update compute_servers set running=true, score=1 where host='10.1.2.4';
     update compute_servers set running=true, score=1 where host='10.1.3.4';
     update compute_servers set running=true, score=1 where host='10.1.4.4';

- (1:00?) [x] deploy: implement database dump and restore (to text) -- http://www.datastax.com/dev/blog/simple-data-importing-and-exporting-with-cassandra
- (1:00?) [ ] deploy: upgrade db on cloud.sagemath.org
- (1:00?) [ ] deploy: run code that backs up all projects to DB
- (1:00?) [ ] deploy: copy database over to new machines

---

 [x] (0:30?) (0:05) the connection type takes up too much space still -- truncate at 9 chars.


 [x] link in help to https://groups.google.com/forum/?fromgroups#!forum/sage-cloud
 [x] add link to https://github.com/sagemath/cloud for "bug reports".
 [x] add a donation link
 [x] add link to sagemath.org
 [x] add link to sagemath facebook page
 [x] add link to sagemath g+ page.
 [x] (0:15?) make sure to install markdown2 into the Sage install on the base VM... and make sure that it doesn't get forgotten again!



3:25pm - 6:00pm on Wednesday, May 1, 2013
 [x] (0:30?) (0:12) add file page : make it visible by fixing CSS
 [x] (0:30?) (0:24) fix terms of usage being required
 [x] (0:30?) (0:15) force SVG to be the default math renderer; also enable equation wrapping
 [x] (0:35?) (0:37) upgrade to newest codemirror (v3.12): http://codemirror.net/
 [x] (0:30?) (0:12) on first load of project, second level menu/tab bar is placed too low! introduced by changing "add file page" CSS (?)

 [x] (0:05?) reduce number of cached projects to 1 until project cache is moved to database from hub.

--> [x] (0:30?) (0:43) upgrade cloud server, announce on list, and mention in this email thread that wrapping equations now supported (include a screenshot using
show(expand((x+1)^50))) <https://mail.google.com/mail/u/0/?shva=1#search/mathjax+wrapping/13e454cb56930ef0>

 - update services file
 - make new vm with new name, upgraded salvus, apt-get, etc.
 - sync out to other machines
 - restart just the web vm's (?)
 - start all services (which will only start web vm services).

---


[x] (1:00?) (0:44+) configure new 4TB disks on cloud3, cloud4

    use fdisk to format (1 4TB partition):
       fdisk /dev/sdb
       1 partition; type "8e" = "linux lvm"

    vgextend 03salvus /dev/sdb1

    Crap, fail. Obviously, we just got only 2TB more, not 4TB.  Mistake of using fdisk.
    Also, I forgot to do "pvcreate /dev/sdb1", which could be the problem.

    vgreduce 03salvus /dev/sdb1

    Start parted, then

    (parted) mklabel gpt
    (parted) unit TB
    FAIL

    apt-get install gdisk
    gdisk /dev/sdb
    # delete existing partition and make new 4TB 1; then set type to 8e00, then exit
    #

    pvcreate /dev/sdb1
    vgextend 03salvus /dev/sdb1

    # Now enlarge the logical volumn and partition!

      root@cloud4:/home/salvus# lvextend -l 100%FREE /dev/mapper/01salvus-salvus_images
      Extending logical volume salvus_images to 3.64 TiB
      Logical volume salvus_images successfully resized

      resize2fs /dev/mapper/01salvus-salvus_images  # start about 12:15pm

When above resize2fs finishes and works, do this on cloud3:


      resize2fs /dev/mapper/03salvus-salvus_images


 [x] (1:00?) (0:50+ so far -- in progress in screen on cloud1) write script to automate, then upgrade deployed vm to sage-5.9: http://sage.math.washington.edu/home/release/sage-5.9/sage-5.9.tar
             - delete current sage version: 20130502
             - download and install/test from source in a next vm image
             - install markdown2
             - install list of good optional packages.

 ---


 [x] @interact
    [x] (0:20) planning
    [x] (0:10?) (0:04) interact: copy css to interact.css and rename to salvus-interact from salvus-cell-interact
    [x] (0:10?) (0:18) interact: copy html to interact.html and rename to salvus-interact from salvus-cell-interact
    [x] (0:30?) (0:70) interact: copy script from cell.coffee to interact.coffee and restructure code layout
    [x] (0:30?) (1:07) interact: enable interacts, using the above, with stub for exec

    [x] (0:45?) (0:18) interact: get sage_execute to work

    [x] (0:45?) (0:25) interact: refactor code in syncdoc so rendering output message can be done to marked text widget div *or* to output dom object (a div) in the output div.

    [x] (0:30?) (0:50+) interact: make it so setting variables works from the python side.





 [x] (0:15?) (0:19) change default rendering back to svg=False for plots.
     Put something in docstring about this with
     dashed line example (https://mail.google.com/mail/u/0/?shva=1#starred/13e6a16d768d26a3)

 [x] (0:15) (0:03) disable draggable of tabs for now; just causes confusion.
 [x] (0:10?) (0:03) do this to salvus-editor-chat-title as a quick fix: "position: fixed;z-index: 10; right: 0;"

[x] (1:00?) put everything in "local hub template" in cloud sagemath repo


 [x] (0:30) (0:07) set a handle for dragging pop-up docstring; right now can't copy/paste out from it!

 [x] (1:00) (0:17) fix some style (the top pill bar is now scrollable horizontally, which is confusing).

 [x] (0:30) (0:05) make buttons smaller

 [x] (0:30) more interact issues exposed by %exercise

 [x] (0:30) move file buttons to left (not way off to right).

 [x] (3:00?) - copy/paste in terminal sucks; look into hterm... -- HTERM is chrome-only according to <https://groups.google.com/a/chromium.org/forum/?fromgroups=#!topic/chromium-hterm/K_I62Z6Gwuo>, hence not an option.

 ---

 # May 6 -- storm testing deploy:

     import cassandra; cassandra.set_nodes(['10.2.1.2'])
     cassandra.init_salvus_schema('salvus')

    UPDATE plans SET current=true, name='Free', session_limit=3, storage_limit=250, max_session_time=30, ram_limit=2000, support_level='None' WHERE plan_id=13814000-1dd2-11b2-0000-fe8ebeead9df;


    update compute_servers set running=true, score=1 where host='10.2.1.4';
    update compute_servers set running=true, score=1 where host='10.2.2.4';
    update compute_servers set running=true, score=1 where host='10.2.3.4';
    update compute_servers set running=true, score=1 where host='10.2.4.4';



# May 5, 2013

 [x] (0:45) (0:31) clicking on filename should open file; make a rename button

 [x] (1:00) (0:10) upgrade to latest twitter bootstrap

 [x] (1:00) (0:30) upgrade to latest jquery & jquery-ui

 [x] (1:00) (0:10) upgrade to latest sockjs (0.3.2-->0.3.4 on client; 0.3.5-->0.3.7 on server)

 [x] (0:45) (0:15) re-enable output buffering, since with sync it is too slow sending every print out when doing a big loop. (we will still need to implement output message optimization, but buffering already helps a lot).

 [x] (1:00) (1:05) terminal paste; still JACKED.  Remove the "paste area" (since it screws up css) and fix paste.

 [x] (1:00) (0:15) terminal copy -- highlight and then it *unhighlights*; is it possible to keep the selection?  Is it possible to just copy instantly without requiring control-c

 [x] (0:30) (1:15) see whether it is possible to set copy buffer from javascript or not... (yet again); if so, don't require control-c in terminal; ANSWER: no, not for now; can partly do using flash and a click (not so useful), or as a Chrome Extension (for later!).

 [x] (0:30) (0:42) I found more cases where paste again doesn't work. fix.  UGH.  It's basically impossible to solve both the copy and paste problems at the same time in a general way... since to copy nicely, you have to be in a mode where paste doesn't work.  I've implemented a copromise, which is that paste when there is a copy selection.  This is not ideal, but is much better than it was.  I'll try something better in the future.

 [x] (0:30) (0:10) make resize use actual top of editor, not computed, in case of title wrap-around.

 [x] (0:30) (1:30) push out new version and post message to list



 [x] (0:30?) (0:12) rename link broken now due to jquery upgrade

 [x] (0:10?) (0:17) remove any uses of "live" from jquery code (jquery upgrade deprecated this).

 [x] (0:30?) (0:08) "RuntimeError: Error: No interact with id 36d22d1a-1af9-45f9-ac6c-3b28834edebd" --> html message "evaluate to create interact"

 [x] install polymake-2.12

 [x] start taking steps to make it easy for users to install own packages locally by installing these
      - pip, virtualenv systemwide.

[x] (0:45) make it so in admin, this is possible... wow, I just spent 30 minutes to discover that I already fully implemented this!
             s.restart('vm', hostname='web1')

 --> [x] (0:30) (0:32) release new version; only need to update web hosts, given the minimal changes so far:
       - updated services file to use new 2013-05-07 image and push to repo
       - create 2013-05-07 image with updates and updated salvus
       - sync base image out
       On storm:
       - stop hub and nginx
       - stop web vm's
       - start web vm's
       - start hub and nginx

import admin; s = admin.Services('conf/deploy_storm/')
s.stop('hub'); s.stop('nginx'); [s.restart("vm", hostname="storm-web%s"%i) for i in range(1,5)]
s._hosts.ping()

       - verify all works
      Then do the same on cloud.

import admin; s = admin.Services('conf/deploy_cloud/')
s.stop('hub'); s.stop('nginx'); [s.restart("vm", hostname="web%s"%i) for i in range(1,5)]
s._hosts.ping()
s.start("hub", wait=False); s.start("nginx", wait=False)
1

[x] deploy new base vm for users: [s.restart('vm', ip_address='10.1.%s.4'%i) for i in range(1,5)]



 [x] (0:30) (0:10) add google analytics for https://cloud.sagemath.com

 [x] (0:45) (0:11) very bad reproducible CSS/html bug: open two projects in salvus in one browser tab, resize browser, switch back to other project -- screen doesn't resize properly; instead totally1
 corrupted.

 [x] (0:30) the bup snapshots (except on web1) are broken. GREAT :-(; try to do something to fix them.

 [x] (0:15) update web[i] with latest bugfix regarding resize, and with google analytics


    import admin; s = admin.Services('conf/deploy_cloud/')
    s.stop('hub'); s.stop('nginx'); [s.restart("vm", hostname="web%s"%i) for i in range(1,5)]
    s._hosts.ping()
    s.start("hub", wait=False); s.start("nginx", wait=False)


[x] (0:30?) (0:20) change pill thing to have fixed position when editing a file (and non-fixed otherwise); this will get rid of pointless scrollbars, which waste space and throw off calculations.

[x] (0:20?) (0:10) changing pill position got rid of vertical pointless scrollbar, but not horizontal one, when editing. figure out what is causing that.

[x] (0:20?) (0:11) "Recent" files list is position:fixed, but shouldn't be.


[x] (0:30?) (0:10) push out the few ui tweaks without changing the base image (just pull salvus on the web machines and do "make coffee")


[x] (3:00?) Investiage project snapshots ideas: my bup backup approach to snapshoting projects is efficient but is *not* working; the repo gets corrupted, and then nothing works afterwards.  I need to try a few things more carefully (e.g., maybe one repo per project -- less dedup, but much simpler and more robust; ensure saving isn't interrrupted, and if it is delete pack files; ensure only one save at a time -- maybe there is a race/locking issue I'm ignoring?)

New idea for how to make snapshots of projects:

- Have a separate bup rep for each project; all stored in /mnt/backup.  Thus much less dedup, but easier to use and more reliable.
- When a hub is going to create a project snapshot it does the following:
   1. Creates a temporary lock on doing this (using ttl)
   2. Queries database and ensures that it has all the relevant .bup/* files, which are stored in a table in the database.  Any it doesn't have, it grabs from the database to the local /mnt/backup filesystem.
   3. It creates the snapshot and runs fsck -g.
   4. Assuming all is fine, it then copies the *newly* created or modified index files back to Cassandra, which then propogates them to the whole cluster.

Whether or not the above works might depend on how many files are modified.
Also, we would need to somehow reduce the number of files every once in a while
since extract 10000 files from the database would take a long time.

Actually, a simple way to reduce the *number* of files in the database would be to simply use tar to combine
a bunch of the pack files into a single big file.  This avoids having to repack.

So the database entry would contain:

 - about 10 files that store index, etc., are small, and change on every commit.
 - a list (cassandra has a list type now!) of tarballs, each containing a bunch of pack files.

And we have one of the above for each project.  It gets distributed, etc., but all extracted, used, updated on the filesystem by hubs.
Obvious question is how it scales.  How fast?  How much space, etc.

I need a way to make incremental snapshots storing everything about potentially tens of thousands of projects.  They *must* be stored in the database.   I would like to minimize wasted space.

Options:

   - one bup per project --> tarballs, stored in db
   - zfs + dedup + snapshots + fuse (?)
   - incremental tarballs (but that's not even dedup'd)

Two benchmark filesets:
  - the 45MB "my teaching" directory (with two github projects and other misc files); then add salvus github
      - the sage-5.9 binary, then add sage-5.10 binary (measure scalability and dedup).

Benchmark 1:
  - time to create initial archive, starting with 45MB teaching, including "fsck -g"
  - size of initial archive
  - time to update archive after trivially changing one file
  - add salvus github checkout
  - time to create next snapshot
  - size of archive
  - make another copy of the salvus github checkout
  - time to create next snapshot
  - size of archive

If the above is acceptable, then *maybe* Cassandra's own compression will de-dup across projects, somewhat, and we'll be golden.

Benchmark 2:
  - time to create initial archive, starting with sage-5.9
  - size of initial archive
  - time to update archive after trivially changing one file
  - add sage-5.10
  - time to create next snapshot
  - size of archive
  - time to create next snapshot, after trivially changing one file

OK, do it, first with bup using default compression options:

Benchmark 1: 44MB data, using bup with default compression
  - time to create initial archive, starting with 45MB teaching, including "fsck -g": 1.2s (create index), 4.563 (save), 2.511 (fsck)
  - size of initial archive: 16M
  - time to update archive after trivially changing one file: 1.2 (index), 0.340 (save), 0.274 (fsck)
  - add salvus github checkout: new data size 239M;
  - time to create next snapshot:  2.754 (index), 9.92 (save), 44.7 (fsck);
  - size of archive:  archive size is now 196MB.
  - make another copy of the salvus github checkout: data size 435M
  - time to create next snapshot: 2.5 (index), 5.648 (save), 0.398 (fsck)
  - size of archive: 198MB

  Benchmark 1 with "-9":
  - time to create initial archive, starting with 45MB teaching, including "fsck -g": 6.3 (save), 3.5 (fsck)
  - size of initial archive: 15MB
  - time to update archive after trivially changing one file: 1.6 (index), 0.4 (save), .37 (fsck)
  - add salvus github checkout: new data size 239M;
  - time to create next snapshot: 3.3 (index), 24.5s (save), 36s (fsck)
  - size of archive:  archive size is now 195M

  Benchmark 1 with "-0" (no compression):
  - time to create: 6.7 (save), 6.6 (fsck)
  - size: 32MB
  - clone salvus then save: 4.6 (index), 13.9 (save), 39 (fsck)
  - size of archive: 224MB
  - make another copy of salvus, and save again: 4.58s (index), 10s (save), 0.7 fsck
  - time to restore resulting big archive to "foo": 41s

Benchmark 2 (default compression).

time bup index bench1data
time bup save --strip -n bench1 bench1data
time bup fsck -g

  - initial work path size: 3.7GB
  - time to create initial bup archive: 14.7s (index), 4m43s (save), 4m23s (fsck)
  - archive size: 969M (before fsck), 1.1G (after fsck)
  - add second sage-5.10: total data size 7.4G
  - time to save: 44s (index), 3m26s (save), 2m20s (fsck)
  - archive size before second fsck: 1.6G, after: 1.6G
  - time to restore everything:





[x] (0:30?) (1:30)[slow due to distractions] learn about cassandra list type and about git files, etc.; not going to use cassandra lists for the actual blobs, etc., since they are for a different problem, and get read completely.

[x] (1:00?) (1:30)[distractions] determine exactly what files need to be stored in the database

   - all the actual pack/idx files
   - the value in "refs/heads/project"      (this is a file with a hash in it)

   Optimizations (bup automatically recreates all these files, so storing them in the db is probably a waste of space).
       - store all objects/pack/*midx* files
       - objects/pack/bup.bloom
       - various index cache files

   I just tried this branch:
     git clone https://github.com/zoranzaric/bup.git -b locked-repack locked-repack-2

   and it provides a "bup repack" command.  When run it replaces *all* the idx/pack files, no matter how many,
   by exactly two files.  I *might* need to use this when the number of snapshots for a given project gets very
   large, hence extracting it to the local filesystem would involving pulling thousands of tiny files from
   cassandra, etc., which would be very inefficient.  With bup repack, I would run it, create two new idx/pack
   pairs, save them to the DB, then change the project meta-info, and delete all the other idx/pack files
   associated to that project.

[x] (1:00?) add functionality to cassaandra.coffee to support what is needed (if necessary) -- nothing needed

Schema:


    CREATE TABLE project_bups (
         project_id  uuid,
         time        timestamp,     /* when inserted */
         sha1        varchar,       /* sha1 hash of pack file */
         pack        blob,          /* contents of pack file */
         idx         blob,          /* index into this pack file */
         head        varchar,       /* head, when this pack file was the newest */
         PRIMARY KEY(project_id, time)
    ) WITH CLUSTERING ORDER BY (time ASC);


    UPDATE project_bups set sha1='7c814e1daea739e910693ff65d5046bf724ff807', head='7c814e1daea739e910693ff65d5046bf724ff807' where project_id=6a63fd69-c1c7-4960-9299-54cb96523966 and time=9390823493;
    UPDATE project_bups set sha1='7c814e1daea739e910693ff65d5046bf724ff817', head='7c814e1daea739e910693ff65d5046bf724ff817' where project_id=6a63fd69-c1c7-4960-9299-54cb96523966 and time=9390823500;
    UPDATE project_bups set sha1='7c814e1daea739e910693ff65d5046bf724ff810', head='7c814e1daea739e910693ff65d5046bf724ff810' where project_id=6a63fd69-c1c7-4960-9299-54cb96523966 and time=9390823400;

It Works:

    cqlsh:test> select * from project_bups where project_id=6a63fd69-c1c7-4960-9299-54cb96523966;
    cqlsh:test> select * from project_bups where project_id=6a63fd69-c1c7-4960-9299-54cb96523966 and time >= 9390823493;

[x] (0:30?) create a table (in db_schema) with one row for each project backup, or add to the existing project schema (not sure which is best).

### the code below will just go in a new section of backup.coffee.

[x] (1:00?) get_from_database
     INPUT: project_id, path
     EFFECT:
         - fuse unmount if needed
         - pulls what is needed to update bup archive in path to current version in database
         - fuse mount


## On storm:

    t={};require('backup').snapshot(keyspace:'salvus', hosts:['10.2.1.2'], cb:(err,s)->t.s=s)
    t.s.project("0cac77f9-ee2f-4342-bbfa-8389f8231a4b", (err, p) -> t.p=p)



[x] (1:00?) snapshot
     INPUT: project_id, path
     EFFECT:
        - does above update to path
        - makes a new snapshot of remote project (wherever it is) -- save everything except .sagemathcloud and .sage/gap and .forever
        - if there were actual changes (!), writes them to db (worry about timeouts/size); make sure last
          change time is stored in db.

[x] (1:00?) push
     calls the get function above, then bup restore, then rsync's the result to username@host

Write speed is slow.  I'm trying this fork:
   npm install git://github.com/pooyasencha/helenus.git

   NOPE.

   Try Python's driver... NOPE.

Look, write speed doesn't matter much for this, since it won't hold up anything the user is doing, and only ever
happens once (and usually is fast).
`

[x] (0:30?) implement and test chunked *read* from database.


[x] (0:30?) set the latest date when creating project object, based on what is in filesystem; important for restarting daemon and not throwing away state.

[x] (0:10?) quick speed test with no compression. (no noticeable difference)

[x] lots of little bug fixes and robusteness improvements in db project snapshots

---



[x] (1:00?) (0:20) I can't create new project on my local install; something wrong with PATH not having .sagemathcloud in it... (?) -- this is a result of env bug introduced in `misc_node.coffee`, which I fortunately never deployed.

[x] (1:00?) (0:34) MAJOR UX bug -- if you copy and paste the cell start uuid line (the cell separate line), then the worksheet will have two cells with the same uuid, which causes all hell to break loose (and breaks everything).  Put code in to randomly regenerate pasted uuid's.

[x] (0:45?) (0:04) "var('x','y')" doesn't work


[x] (0:15?) (0:02) get sagetex to work on all compute machines, and repeat this procedure on a new base vm, so it will be permanent.  Also, make it part of the install process when updating sage.

    sudo cp /usr/local/sage/sage-5.9/local/share/texmf/tex/generic/sagetex/sagetex.sty /usr/share/texmf-texlive/tex/latex/sagetex/

1
[x] (0:20?) (0:25) install into base machine all the packages harald mentioned:  pandas, statsmodels, pytables, etc.https://mail.google.com/mail/u/0/?shva=1#starred/13e690cc3464efb4

[x] (0:15?) (0:02) increase cookie timeout to 1 month; changed this line in hub.coffee:         ttl              = 30*24*3600     # 30 days

[x] new deploy, including that paste of cells bugfix.

[x] VM issue with "fsck next boot" not working:
   sudo rm /var/lib/update-notifier/fsck-at-reboot
   sudo tune2fs -c 600 /dev/vda1


[x] (0:15?) (0:05) UI: change "+ New" date format to be just like in bup, which seems logical.


[x] make the nofile, etc., changes suggested in the cassandra docs.
[x] configure and use ntp on vm's -- I wasn't and times are all skewed!   http://rbgeek.wordpress.com/2012/04/30/time-synchronization-on-ubuntu-12-04lts-using-ntp/

[x] here is how to use sstable2json:
    salvus@cassandra1:/mnt/cassandra/conf$
    export CASSANDRA_CONF=`pwd`
    sstable2json /mnt/cassandra/lib/data/salvus/successful_sign_ins/salvus-successful_sign_ins-ib-23-Data.db > a

[x] install sage-5.10.beta3, all optional packages, etc., into base machine, and get stats stuff working :-)

[x] install sage-5.10.beta3, all optional packages, etc., into base machine, and get stats stuff working :-)

[x] (0:15?) (0:07) UI: terms of usage error message covers the checkmark making it impossible to click and agree?! fix account.css

[x] (1:00?) (0:49) fix math %md mode to *genuinely* escape 100% of stuff in $'s and $$'s.  DO THIS ASAP, since not backward compatible.

[x] (0:10?) (0:13) feature: syntax highlighting for patch files

[x] (1:00?) (0:14) Create "%md" markdown that has inline backtick code, then zoom by increasing font size and that code doesn't get bigger.

[x] (0:10?) (0:01) notes/admin.md: need to make a file with stuff about admin procedures.

[x] (0:45?) markdown -- better mathjax escaping; anything in \begin{}/ \end{}, etc. blocks. ?
[x] (0:05?) (0:05) some sort of highlighting for fortran editing (not good; better than nothing)
[x] (0:45?) (0:21) tweak "syncing" message to be less annoying.: https://mail.google.com/mail/u/0/?shva=1#inbox/13eb2eb7f9ec4680
[x] (1:00?)  (1:15) Cassandra: upgrade from 1.2.3 to 1.2.4 (?)
[x] (0:15?) (0:18) fix recent projects scroll issue (not selected)
[x] (0:30?) (0:10) upgrade font-awesome
[x] (0:10?) editor top bar margin wrong.

---

[x] (1:00?) (0:10) html/md and non-ascii doesn't work, but it should, e.g, this goes boom. md("# Very Bad Thing™.")

[x] (0:30?) (1:28) Copy/paste of cells should remove "running/execute,etc" marker from newly pasted cells.

[x] (0:30?) (0:48) start an infinite computation running in worksheet and see green spinner.  Then click "Stop" red button to kill process; spinner doesn't stop until one types more text to cause a sync, which in turn causes some sort of update.

[x] (0:30?) (0:15) `local_hub` -- if we start the sage process for a sage worksheet for any reason, then `local_hub` should mark all "running" cells as stopped, since they can't be running, and this just confuses the client. Better might be to simply ensure that everything is *correct* according to a map in `local_hub` on update.  Reproduce:  Start infinite calc running in a worksheet, copy the file, then open it -- it appears to be running, but isn't.

[x] (1:00?) (0:02) something else involving syncing I just did seems to have fixed this -- sage bug -- forgot the flush at the end of eval when adding back buffering, so, e.g., some output doesn't appear.
for x in "\na\nb\n".split():
    if x:
        print x
Doing
   sys.stdout.flush()
works at the end, but doing
   sys.stdout.flush(done=True)
or
   sys.stdout.flush(done=False)
doesn't... so I suspect the bug is in `local_hub`'s handling of messages.


[x] (1:00?) codemirror is broken on chrome now when lines wrap.  Argh.  Cursor gets off by one, even on the codemirror website!  Not sure what to do about this, but it is seriously annoying.
    Try (1) chrome not on chromeos --> it works fine!, (2) latest devel codemirror, (3) mailing list search

    It turns out I'm still on dev channel version of chrome in chromeos, despite changing the dropdown.  Evidently a complete wipe, etc., is needed to downgrade!? yuck!!!!
    I'll try for a few minutes to maybe fix the bug.  If that fails, I guess I have to downgrade.
    [x] try latest version of codemirror on github -- FAIL
    [x] mailing list searches... I'm screwed without doing a total re-install :-(

I will test sometime do a re-install from scratch to get to the stable or beta channel, but not until I have time free.



[x] (0:15?) (0:26) upgrade to mathjax 2.2

[x] (0:50?) (0:35) Update base VM:
     [x] git pull on host; then push_salvus
     [x] create new machine: salvus@cloud1:~/salvus/salvus/scripts$ ./new_vm_image.py
     [x] apt-get update; apt-get upgrade; reboot
     [x] pull new salvus; . salvus-env; ./make_coffee
     [x] make sure to build 4ti2 into sage, as explained in build.py
     [x] upgrade to Macaulay 1.6 (just released today) -- see http://www.math.illinois.edu/Macaulay2/
     [x] in Sage, do "pip install markdown2Mathjax"
     [x] cassandra upgrade (switch to java6, which they recommend):
             apt-get install oracle-java6-installer
             update-alternatives --config java
             ./build.py --build_cassandra

[x] (0:15?) (0:25) UPDATE RAM and base image on cassandra and hub nodes to 8GB and restart storm

[x] (1:00?) (2:30) on storm: test saving/retrieving various size projects to cassandra

    t={};require('backup').snapshot(keyspace:'salvus', hosts:['10.2.1.2'], cb:(err,s)->t.s=s)
    t.s.project("0cac77f9-ee2f-4342-bbfa-8389f8231a4b", (err, p) -> t.p=p)

    tm=require('misc').walltime(); t.p.pull_from_database((err)->console.log(require('misc').walltime(tm)))

    tm=require('misc').walltime(); t.p.snapshot_compute_node((err)->console.log(require('misc').walltime(tm)))

    t.p.snapshots(console.log)
    t.p.ls(path:'.', hidden:true, cb:console.log)

    tm=require('misc').walltime(); t.p.push_to_database((err)->console.log(err, require('misc').walltime(tm)))

Results:

    # 157MB bup archive, MAX_BLOB_SIZE = 4000000
    # time to make bup snapshot in the first place: 24s
    # send to DB: 110s
    # get from DB: 24s
    # scp from one machine to another: 12s

---

    # 157MB bup archive, MAX_BLOB_SIZE = 1000000
    # send to DB: 105s
    # get from DB: 22s

---
I had to greatly increase params in cassandra.yaml to even test this:

    # 157MB bup archive, MAX_BLOB_SIZE = 8000000
    # send to DB: 117s
    # get from DB: 23.5s

    # 157MB bup archive, MAX_BLOB_SIZE = 64000000
    # send to DB: 98s
    # get from DB: 23.5s



---

Sage takes 78s to extract from tarball, takes 3.8GB on disk; over 70,000 files.

    t.s.project("0d2416e5-ee0a-41ce-a882-7a0547a02654", (err, p) -> t.p=p)

    Size of bup archive: 1014MB

    # bup archive of a Sage extract, MAX_BLOB_SIZE = 8000000
    # time to make bup snapshot in the first place: 233s, updates in 15s
    # send to DB: 676.7s
    # get from DB: ??  # causes the Cassandra to crash (with 8GB RAM)
    # scp from one machine to another: ??

Even with 16GB RAM, it crashes trying to get....

Try the binary driver:

Client = require('cql3').Client; client = new Client('10.2.1.2', 9042)

FAIL -- it is totally broken with latest node.js, etc.  Oh well.  Not maintained.


*THIS* works:

    t.s.db.select(table:'project_bups', columns:['pack', 'idx', 'head', 'number', 'num_chunks', 'time'], where:{sha1:'aa822ca353524cb3d1618650621e280c801da721'}, cb:((err,result) -> console.log('done'); t.r=result;0))

Thus the solution is that I have to query a single sha1 at a time, which keeps the size down...


[x] (1:00?) increase quotas on compute nodes... since that is needed to do sage dev work online.

[x] (0:30?) switch bup included in salvus to just be the latest standard one; the repack thing is not *needed*, due to the midx files... and that I could just make a brand new bup archive every so often (waste a little space, but way simpler).


[x] (0:30?) (0:54) snap: create database schema
[x] (1:00?) snap: create snap.coffee and "snap" with command line interface to start/stop simple snap daemon. On startup, update the (hostname, port, key) entry in the database.
[x] (0:15?) (0:30) snap daemon -- needs to background!
[x] (1:00?) (0:31) snap: add new class and code to admin.py to start/stop them; modify local deploy services file.
[x] (0:15?) (1:30) snap: make daemon register itself with database on startup.

[x] (0:20?) (0:19) snap: define backup rules and how they are configured (command line options) -- for now, all snaps make a snapshot of all projects at most every `snap_interval` seconds. I can add support for more distribution later, when needed.


** Goal is the following: **
       - every project is backed up to every snap server at least once.
       - any active project (as defined by the recently_modified_projects table) that
         has had a file changed, has a snapshot within snap_interval seconds, if possible...
         though it may be less frequent since we can only do one snapshot at a time.
         Nonetheless, no one project can dominate snapshots more than others.

[x] (0:30?) (2:22) snap: on startup, ensure that for every project there is at least one snapshot of that project stored here.

[x] (0:30?) (0:40) snap: write code to queue up and make backups


[x] (1:00?) make a list of options for backup system, now that I've tried a bunch, and make more benchmarks.

1. per project bup + cassandra: problem -- slow; not deduplicated across projects (a killer).

2. global bup + cassandra: problem; kind of pointless, since can't use it unless you check out the entire thing.

3. global bup synchronized across all nodes: impossible, single point of failure.

4. have local bup archives "all over"; store in the database triples
     (project id, snapshot time, user@host:path-to-bup)
  and do work to lock local archives and ensure integrity.

  Finding all backups in a location isn't too hard (using fuse this takes a few seconds even on a thousand
  snapshots and many gigabytes, and could be cached in a file...).  I can write a "repair" function
  that for each user@host:path-to-bup, determines if all backups are really there.

5. Write a cassandra backend for q3sl and use it: It didn't deal with copying the Sage source code in over 30
   minutes on my local fast hard drive, so that worries me a *lot*.


REQUIREMENTS:

    - x complete restore of 4 GB to user should take less than 10 minutes (?). (since they will have to wait when their machine dies)

    - x directory listing of files in any given past snapshots should typically take less than 3 seconds

    - x de-duplication across backed up projects, so that we can encourage sage development, big data, etc.

    - x does not have to save every snapshot forever; some can just vanish.

    - x provide useful time/status info during restore (make a model using data)

    - must scale out easily, i.e., be very easy to add new snapshot storage by putting a
      machine on the VPN with appropriate ssh access and disk space.

    - system must work fine even if backup machines vanish/come back/etc. (database
      should correctly reflect *available* backups):
        - send update to cassandra every n minutes with list of backups with ttl:
              (project id, snapshot time, user@host:path-to-bup)

    - need a lock and only save one at a time, but can restore many at once (?).

    - it sits there running, querying the database, making snapshots safely, and
      in order, of projects when they change.

    - to see snapshots/files, use fuse -- can mount multiple at once.


Straight bup over network test on storm, with extracted 4GB binary:
term 811

    salvus@storm-web3:/mnt/backup$ time bup on CxL4SM0n@10.2.2.4 index .
    real    0m17.953s

    salvus@storm-web3:/mnt/backup$ time bup on CxL4SM0n@10.2.2.4 save --strip -n test .
    real    5m0.161s

    salvus@storm-web3:/mnt/backup$ time bup restore --outdir=test test/latest
    real    3m3.458s

    salvus@storm-web3:/mnt/backup$ time rsync -axH test/ CxL4SM0n@10.2.2.4:test/
    remote rsync crashed and I had to restart it. (ran out of space)
    # anyway, was about 5 minutes.


PLAN:  create something as above as a TCP *service* called "snap".

 - Store the (hostname, port, key) for each snap service in the cassandra database; the key is just redundant security.

 - Access only over VPN, so don't have to worry about ssl

 - The api provides the following, where what it does doesn't depend on which snap it's called on.

      - snapshots(project_id): returns list of all available snapshots of that project
        on *all* snap servers.  This could query the database, parse results, etc.  All snap
        nodes will return the same answer.  The database will have a table "project_snapshots"
        with ttl rows:

              (project_id, hostname, port, [list of snapshots])

      - ls(project_id, snapshot_name, path): list of files/directories there; does it locally
        if we own the snapshot, otherwise punts to the owner of the snapshot

      - restore(project_id, snapshot_name, path, user, hostname): extracts, then rsync's relevant
        files to user@hostname:path.snapshot_name, unless snapshot_name=latest and path='.', in
        which case `snapshot_name` is omited, since we're *deploying* to a new account.
        This will work by first checking if this snap has the snapshot and if so, doing the
        extract/rsync, and if not, then connecting to a snap that has the snapshot
        and calling this command on it.




    wstein@localhost:~$ time buptower
    Tue May 21 10:56:29 PDT 2013
    read Linux attr: [Errno 13] Permission denied: '/home/wstein/salvus/salvus/data/logs/stunnel-0.log'
    Indexing: 295690, done.
    bup: merging indexes (295782/295782), done.
    WARNING: 1 errors encountered.

    real    1m52.897s
    user    1m17.873s
    sys     0m8.795s
    Traceback (most recent call last):
      File "/usr/lib/bup/cmd/bup-midx", line 259, in <module>
        do_midx_dir(path)
      File "/usr/lib/bup/cmd/bup-midx", line 183, in do_midx_dir
        i = git.open_idx(iname)
      File "/usr/lib/bup/bup/git.py", line 471, in open_idx
        raise GitError('%s: unrecognized idx file header' % filename)
    bup.git.GitError: /home/wstein/.bup/index-cache/pixel@05salvus_/pack-b2a48b3f9b35c41443e8e0d4ab6fe5e6896e8b3b.idx: unrecognized idx file header



[x] (0:20?) (1:15) snap: write code to query database and figure out which projects need to get backed up in order to satisfy rule...: EASY -- for this, just find all active projects, and for each check to see if the interval is long enough since we last made a backup.


[x] (1:00?) install the pari optional packages into the cloud vm, and figure out how to automate this: http://pari.math.u-bordeaux.fr/packages.html



#### (4:00?) deploy

- [x] (3:00?) monday -- deploy with snaps UI
        x - update salvus and system-wide and internal *bup*
          - (1:00?) install sage-5.10.beta5
          - (1:00?) make quota work again, but make it 20GB for now.
          - (1:00?) test minimal project sharing

- [x] (0:10?) (0:04) delete backup persistent disks for cloud
- [x] (1:00?) sat deploy with new sage and packages, and new snapshots running, so at least I'll have all project bups by sunday morning to play with.
      x - add these to build.py and install new apt-get packages
      x - npm install moment
      x - new version of sage: http://sage.math.washington.edu/home/release/sage-5.10.beta4/
      x - install database_pari-20130516 spkg
      x - upgrade to newest bup from the website; fixes corruption issues.
      x - instead have /mnt/snap
      x - update salvus; remember to do ./make_coffee
      x - test it on storm, including new snapshots being *made*.
      x - deploy on cloud

#### (7:00?) finish snapshotting implementation, including UI

- [x] (1:00?) (1:05) snap: define messages and write code in hub to handle messages related to client browsing snapshots

- [x] (1:00?) (1:00) snap: implement UI to actually browse files.

- [x] (0:30?) (0:12) snap: UI -- icon to bring up list of all snapshots

- [x] (1:00?) snap: UI -- replace file actions/buttons with one button to restore the file -- brings up confirmation dialog, then issues the command.



- [x] (1:00?) (0:26) re-deploy:
    x - apt-get install sloccount
    x - undo my addition to /etc/profile of SAGE_ATLAS_LIB

cd salvus/salvus; . salvus-env; git pull git@github.com:williamstein/salvus.git && ./make_coffee
- [x] (0:05) fix SAGE_ATLAS_LIB setting problem -- good test is '~/.sagemathcloud$ ssh salvus@localhost "export"'

- [x] (0:30?) (0:15) snap: BUG -- if path contains a broken symlink, then directory listing doesn't work in snap server.

- [x] (0:30?) (1:01) snap: must first verify that the target path exists (mkdir -p or some option to rsync) before doing the rsync.

- [x] (2:00?) snap: get this to actually work on cloud; deploy, test., etc. -- on cloud it seems that maybe the snap servers hang during startup, due to project issues, etc., but log doesn't tell us anything, since it isn't showing debug messages; definitely not everything got backed up, e.g., "0d2416e5-ee0a-41ce-a882-7a0547a02654" on web2.;  another issue could be corrupt $HOME/.bup.  According to database about 10 projects don't get backed up.

- [x] (2:00?) (1:48) snap: write tcp client/server code
- [x] (0:30?) (1:06) snap: make it so the new deployed snapshots are in a new 1TB /mnt/snap/ (editing conf file); fixed several bugs, especially with running snap as a daemon.
- [x] (0:45?) (3:49) snap: get listing of files in project snapshot -- this took way longer than expected!
- [x] (1:00?) (3:00) snap: restore a file or path using "bup restore":
- [x] (1:00?) (1:25) snap: function to show history of file, i.e., list of timestamps where it changed
          <https://groups.google.com/forum/?fromgroups#!topic/bup-list/vwoSJ1j9JEg>
          Do this both with and without .bup
               git log --pretty="%b" --follow f0c51934-9d09-4586-b8db-fd2e6f11e57e -- ./buffering2.sagews.bup
          then take output of this form
               '-d', '1369677923',
          Get our timestamp from that number using
                "timestamp = moment(new Date(d*1000)).format('YYYY-MM-DD-HHmmss')"


- [x] (1:00?) set cloud atlas variable, so building sage from source is fast: https://mail.google.com/mail/u/0/?shva=1#search/cloud+atlas/13ed940a4d56a4f
- [x] (0:30?) (0:33) upgrade codemirror
- [x] (0:15?) (0:04) upgrade jQuery


- [x] (1:00?) (0:10+) (1:30) UI: fix terminal resize; bottom line is often cut off.

- [x] (0:30) (0:32) UI: make it so the buttons at the top of a project aren't href links, so tooltex doesn't appear

- [x] (0:20?) (1:00) Fix `worksheet.worksheet.execute_code` thing, plus document in `javascript?

- [x] (0:30?) snap: make it so fact that each snapshot is made is stored in the database

- [x] (0:30?) (0:43) snap: make it so size change is stored as part of the snapshot entry in db, after every snapshot; this will make it at least possible at some point to defend against malacious or stupid attacks.

- [x] (1:00?) (1:28) snap: in hub, return list of commits via a database query using information about working snap_servers, instead of consulting the snapshot servers; this makes it trivial/fast to aggregate dozens of snap servers.

- [x] (1:00?) snap: rewrite snap ls in hub to query database, and try (in turn until success) for servers with the requested snapshot (so nothing random)

- [x] (0:45?) snap: in hub, cache directory listings for project snapshots, since they are invariant,  use a ttl so don't waste space.

- [x] (0:30?) (0:30) snap: get rid of use of fuse for directory listings

- [x] (0:45?) (0:15) snap: for restore -- in hub, when user requests a snapshot, use database to figure out which server has it, then use that server (or servers)

- [x] (0:15?) (0:06) snap: for log -- in hub, when user requests a snapshot, use database to figure out which server has it, then use that server (or servers)

- [x] (0:15?) (0:02+) local_hub output bursts: can one build sage with output going to terminal, or will it burst too quickly?   test started in "Sage GIT"... IT TURNS OUT, it "just works".


# snap thoughts:
- Could include a max size column in `snap_servers` table
- Could include info about location (dc:rack) in `snap_servers` table
- Could have command where hub asks snapshot server to make a snapshot instead of snapshot servers doing it themselves
- Hubs would then ensure an even distribution of data, sharding, etc.
- [x] (0:45?) (0:50) snap: get rid of the local_snapshots cache object -- I think we just don't need it.  Thus don't need fuse on startup either. (also fix --  BUG -- when getting snapshot in a directory in a directory, e.g., .snapshot/date/salvus/salvus.)
- [x] (0:30?) (0:38) snap: command line option so that snap server will enter *all* of its commits into the database under its current server_id.
- [x] (0:30?) snap: delete unused/no longer used code


- [x] (0:45?) (0:42) snap UI: show directory listing first by day, then time

- [x] (0:30?) (0:19) snap: change the message "Create or Import a File, Worksheet, Terminal or Directory..." when there are no snapshots of a project.; also fix some bugs introduced earlier in getting rid of # href's.

- [x] (0:15?) (0:10) snap ui: clicking on filename at least do *something*.

- [x] (0:30?) (0:05) UI/client: make file-type identification case insensitive, e.g., foo.JPG = BOOM/pain

- [x] (0:21) `local_hub` -- make it so the PATH has $HOME/bin near the front always before starting sage server.  Then to run whatever version of sage you want with worksheets, all you have to do is put a link in $HOME/bin and restart the local hub (e.g., by typing `stop_smc` in Terminal.)

- [x] (0:45?) ui: button to restart local hub -- cleaner than typing `stop_smc` and will provide status

- [x] (0:45?) ui: button to restart local hub sage server with message (relayed via hub) to local hub that does the restart (handled by local hub)

- [x] (0:45) usability: import more things in sage server before forking; in particular, draw a plot and compute an integral;  this massively speeds up drawing the first plot in a worksheet.

- [x] (1:00?) (0:15+) THU cloud update:
       x - terminal improvements (etc.)
       x - install haskell (just ghc for now) and racket and add to build.py
       x - updated snap
       x - sage-5.10.rc1: http://boxen.math.washington.edu/home/release/sage-5.10.rc0/sage-5.10.rc0/
       - UPDATE database schema!!
            - various tables for snapshots
            - project sage_path
       - use the resend_all_commits in services for first startup, so that we don't loose all commits
       - schema, services, restart


- [x] (1:00?) optimize bup ls further!  This is getting slow:

    salvus@web4:/mnt/snap/snap0/bup$ time BUP_DIR=. bup ls fc9f1a7f-46ad-429e-a9ad-be31ce2a27f0/latest
    2013-06-01-PacificNorthwestNT/
    real    0m10.866s
    (then again using disk cache)
    real    0m5.867s

I pushed a new change to git.py, and now:

    salvus@web4:/mnt/snap/snap0/bup$ time BUP_DIR=. bup ls fc9f1a7f-46ad-429e-a9ad-be31ce2a27f0/latest
    2013-06-01-PacificNorthwestNT/
    real    0m1.392s  {to 2.x seconds, depending on the trial}

- [x] (1:00?) snap: I *HAD* to hack admin.py due to mistake in False versus false (and it sending everything to database again... then not going to next step).

- [x] (1:00?) (0:06) update coffeescript to newest version

- [x] (0:30?) (0:21) ui: create new account/login screen still says "Salvus"

- [x] This bup ls fails, but all the ones around it are fine:
    salvus@web4:/mnt/snap/snap0/bup$ BUP_DIR=/mnt/snap/snap0/bup bup ls -a fc9f1a7f-46ad-429e-a9ad-be31ce2a27f0/2013-06-01-090149
    KeyError: "blob '29bd97b4f604f137b0e3dd721f5763fc330b79a1:' is missing"
SOLN: For now, I could make snapshot, then check if it is valid.  If not, don't report it to DB at all.  This must be a BUP bug though...
Another:
   salvus@web1:/mnt/snap/snap0/bup$ BUP_DIR=. bup ls 3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/2013-06-01-181254
Why is there a colon in the string above -- that colon suggests a parsing error, since a commit can't end in colon.


- [x] (0:30?) (0:39) make it easier to "sign out" -- clear button with label.

- [x] (2:45?) undelete/delete project; box in projects page to show list of deleted projects and undelete; improve listing of projects

- [x] (0:30?) (0:05) confirm to navigate away from page

- [x] (1:00?) (0:45) deploy:
       x - update bup install with speed fix (did it manually)
       x - do "npm install -u coffee-script" to upgrade coffeescript
       x - make sure to pip install that package harald suggested

- [x] (1:00?) (0:52) ui features: make it so %md and %html hide by default and have a hide=False option.
- [x] (0:15?) (0:27) snap/ui: search should be disabled when browsing snapshots



- [x] (0:10?) (0:12)1 add link to http://www.sagemath.org/help.html

- [x] (0:30?) (0:31) BUG: terminal path is not set correctly based on file path

- [x] (0:20?) make tabs at the top shrink instead of disappear.

- [x] (1:00?) (0:40) snap2 and snap3 are BROKEN: I modified git.py (systemwide) /usr/lib/bup/bup/git.py  to work
            even if an object is missing.  I think this is reasonable for
            now, due to the highly distributed and redundant nature of my backups.


- [x] (1:00?) the above idea was STUPID, since quickly of course my backups stopped working!  I need to revert these changes (in the bup repo).      - come up with a plan for what to do if size-pack ever appear!
   x (0:05) - delete last two commits
   x (0:35) - rewrite snap.coffee to stop making new snapshots if fsck fails; I need a repo in that state to study.
   - start new snap servers, snapshotting all projects on startup:
        x - install clean current bup on 10.1.2.3, 10.1.3.3
        cd salvus/salvus; . salvus-env; git clone https://github.com/williamstein/bup; cd bup; ./configure; make; make install PREFIX=data/local/
        x - install new snap.coffee on 10.1.2.3, 10.1.3.3 and ./make_coffee: scp teaAuZ9M@10.1.2.4:snap.coffee . ; ./make_coffee
        x - mv /mnt/snap/snap0 /mnt/snap/snap0.corrupt
        x - start all snap
        - watch
        - get newest snap.coffee file


- [x] (0:30?) (0:17) tighten up the icons in the upper left a bit
- [x] (0:30?) (0:38) %load a.sage ---> goes BOOM (see support).
- [x] (0:30?) (0:07) change bup to build using the network instead of a package in repo (depend on github)

- [x] (0:10?) (0:04) project creation; get rid of the "for william" thing.

- [x] implement `user_search`, which will be needed for adding collaborators.

- [x] (1:30?) share: add another user as collaborator on a project
    - start typing name, and it will autocomplete showing names of other users, just like to: field in gmail
      (For now, this will be all other users of cloud.sagemath, but eventually restrict/order in some sensible way.)

- [x] (0:30?) do another release:
      x- update salvus library
      x- `./make_coffee`
      x- alter table project_users add state  varchar;
      x - update bup (!)
      x- sage-5.10.rc1 (started normal build on next vm):
             export MAKE="make -j20"; export SAGE_ATLAS_LIB="/usr/lib"; make ptestlong
      x- pip's
      x- optional packages


- [x] (1:00?) cassandra: use less memory on localhost (how to -- see admin.md)


- [x] (2:00?) (1:46) validation:  ensure valid html and don't include html/css/coffeescript we're not using (see -- http://validator.w3.org/check?uri=https%3A%2F%2Fcloud.sagemath.com%2F)  Thanks to Dan Grayson for suggesting I do this.

- [x] (0:10?) (0:02) stabilize docs so not blatantly useless.
- [x] (0:30?) (0:05) update: fontawesome 3.2


- [x] (0:30?) (0:18) bug -- online LaTeX doesn't work when document has a space in the filename.

- [x] (0:30?) (0:10) fix fallout from fixing html errors: image src error on startup, can't create new documents

- [x] (0:45?) (0:17) bug -- if you accidentally add yourself as collab on a project, you go from owner to collaborator.  BUG; removing yourself results in removing yourself forever, which is stupid.

- [x] (1:00?) (1:40) collab -- make it possible to remove collaborators.




- [x] (1:00?) (0:10) serious bug: "%time plot(sin)" doesn't print out timing ... (?); this is the sys.stdout.flush() issue!?

- [x] firefox -- found missing "event" object, which causes javascript errors when browsing project listing.

- [x] (0:30?) typeset mode (howto) -- add typeset_mode(bool) with something based on this code
def f(x):
    salvus.tex(x)
sys.displayhook = f



- [x] (0:30?) (0:19) upgrade to codemirror-3.14 and fix css issue with codemirror-3.14

- [x] (0:30?) (0:11) worksheets -- get rid of max height = screen height; not needed with newest codemirror.

- [x] (0:20?) disable control-c part of terminal burst stuff.

- [x] (0:30?) turn on responsive mode and make a list of issues



- [x] (2:00?) (1:03) write a monitor that verifies that all hubs are up and responding to requests; if a hub goes down, automatically restart it:

Add code to admin.py that does this periodically

In [11]: urllib2.urlopen('http://10.1.1.3:5000', timeout=5).read()
Out[11]: 'hub server'

If it fails, it will then:
  (1) restart hub,
  (2) make entry in the database,
  (3) send emails

- [x] (0:20?) (0:37) record in DB table when hub service is started by monitor, if possible

- [x] (0:30?) (0:04) nodetool repair on each node... (started on 10.1.1.2; will do others when this is done)
      s._hosts.nodetool('repair', wait=True, timeout=7200)   # this took about 25 minutes to run...


- [x] (1:00?) (0:28) enable logging so I can see why hub keeps hitting an infinite loop (prob related to doc sync) -- watch out regarding disk space though


- [x] (2:00?) codemirror -- upgrade to 3.14; started testing in local, but it failed due cursor issues around output widgets. probably requires CSS changes to output div...


- [x] (1:00?) (0:33) bug -- online LaTeX doesn't work when document has a space in the filename. -- still broken.; wontfix, but at least put in a useful error message


- [x] (1:30?) (2:00) notification of new client version
x  - add line to `make_coffee` to output a version file, based on the current time
x  - also make it so `make_coffee` includes that version stamp in static javascript somehow.
x  - if out of date, display a warning message indicator and suggest browser refresh/cache clear/etc.
x  - run this check periodically, since users can have a browser open after I update!



- [x] (0:10?) (0:39) responsive: sign in on *PHONE*;  create account
     - get rid of tag line and cloud
	 - shrink header
     - terms of usage; no way to scroll to bottom; maybe get rid of header bar entirely (?)

- [x] (0:20?) (0:34) responsive: create account; make error messages less useless.
     - The error messages that appear to the left are not visible
       at all in 320x480; try another layout or modal.
     - "Create an account (or sign in)" -- shrink it to stay on one line.

- [x] (0:10?) responsive: get rid of fullscreen icon in upper right; makes no sense

- [x] (0:15?) (0:13) responsive: help
    x - "Join the mailing list..." missing period at end.
    x - loose the cloud image when phone
    x - move help link to very top
    x - then new help link (to lower on page) just below.

- [x] (0:30?) (0:28) responsive: projects screen fixes
   x  - don't show "a project is a complete self-contained..."
   x - [all/public/.etc] starts off to the left of well
   x - Find a project... to left of well
   x  - too much space between "find a project..." and project list

- [x] (1:00?) responsive: project screen
     - if we conditionally disable this CSS rule
             .salvus-project {
                 top: 40px;
             }
       then the project menu bar correctly moves when
       expanding the menu.

- [x] (1:00?) show number of users/projects on help screen.

- [x] (0:45?) responsive project screen -- files
     x - big "Files" label is not necessary and wastes space
     x - Choose file... search is too big
     x - home icon awkwardly located
     x - Terminal command... is too big
     x - **top** all the project-file-link width:xxx px stuff must be redone to use responsive grid

- [x] (0:45?) (0:28) responsive: recent files in project
     x - get rid of title at top
     ?? - <div class="salvus-editor"...> has a margin-left, that is useless; this is
       right below "the actual recent file UI"
     x - just have one row of filenames rather than three, or be responsive to make it one...
       in any case, the width of the filenames isn't long enough on mobile.
     x - the "save all" and "clear" buttons touch the "choose file..." box above. (and I NEVER use "save all")

- [x] (0:45?) (0:40) responsive: project--> new
     (sort of) - get rid of a margin-left:3em;
     (no, because need to know path) - get rid of h1 title at top
     x - don't auto-focus on name (since we don't want a keyboard by default)
     x - "Drop file to upload (or click)" --> "Tap to select files to upload"
       (since drag and drop makes no sense on mobile.)

- [x] (0:45?) responsive: project settings
    x - get rid of h1
    x - collaborators "+Add" button should be on the left.
    x - Adding and removing collabs works, but list looks ugly due to CSS flow.  Maybe button-ify?



 - [X] (1:30?) (2:55) responsive -- file editor
     x - always use fullscreen mode for file editing, by default.
     x - big close button at top right (?) that goes
       back to file listing, but otherwise leave
       it having "taken over" screen.
     x - big "go" button for worksheets
     x - more useful "go to line" in mobile/responsive editor.

- [x] (1:00?) (0:35) responsive -- terminal -- make it viewable and closeable

- [x] (1:00?) responsive -- terminal: investigate onscreen keyboard for mobile (?)
https://github.com/Mottie/Keyboard

I tried it -- it could work, but is best avoided due to internationalization (at least), I think.

    <!-- https://github.com/Mottie/Keyboard -- keyboard widget css & script -->
    <link href="/jquery/plugins/Keyboard/css/keyboard.css" rel="stylesheet">
    <script src="/jquery/plugins/Keyboard/js/jquery.keyboard.js"></script>

- [x] (1:00?) (2:03) responsive/mobile -- try implementing a "stating input box" for mobile terminal -- something barely usable is more usable than nothing.

- [x] (0:45?) (0:19) responsive -- file editor chat; fix to not be totally useless; really needs to be rewritten
     - chat doesn't appear (or only partly does) -- needs to be a separate screen (?)

- [x] (0:30?) (0:28) responsive: improve project search
     - make keyboard hide on doing a search (?) -- if possible....

- [x] (0:30?) (0:11) responsive -- worksheet tab button (for mobile)

- [x] (0:30?) (0:25)  responsive -- file actions: accidental delete with ease!


- [x] (1:00?) new release -- very carefully test all the css/html changes... then release.

- [x] (0:30?) rate limit the `codemirror_get_session` stuff from users, since it can bring down server.
- [x] (1:00?) rate limit all incoming client messages to avoid DOS (intentional or not)


- [x] (0:10?) (0:13) version upgrade message -- suggest user explicitly refresh browser page, in case message re-appears.

- [x] terminal -- burst control-c is stupid; instead, just delete output (?), but don't send control-c.
-  [x] (2:00?) (1:25) make it so terminal never disconnects/hangs:

   - x find way to simulate -- Do this in javascript console to simulate the problem easily:
         require('salvus_client').salvus_client._fix_connection()
or

        s = require('salvus_client').salvus_client; s._last_pong=0; s._ping_check()

   - define message that tells client to reset a channel
   - change code in hub.coffee to send message whenever this would appear:
         "error: unable to handle data on an unknown channel:"
   - define listener in client.coffee for such messages
   - make client re-create channel on message
   - test

   - wait, instead let's try just making the CLIENT re-allocate terminal channels on reconnect.

- [x] (0:30?) does version upgrade message work on mobile (?)


- [x] (0:30?) (0:06) instead of "incorrect password", be more vague (thanks to P Purkayastha): https://mail.google.com/mail/u/0/?shva=1#inbox/13f7c40c2939a629

- [x] (0:30?) (0:12) add x button to "Upgrade" -- maybe they don't want to; and write "Upgrade by Refreshing your browser".

- [x] (0:30?) (0:26) hub: when mesg queue exceeds certain size, discard oldest messages!!

- [x] (0:10?) (0:05) SMC --> Sagemath in title

- [x] (0:30?) new release, but where I have a single command to restart only the web-related machine (hub + nginx + snap).
---

services = ['hub', 'nginx', 'snap']
for service in services:
    self.stop(service)


s.stop('hub'); s.stop('nginx'); s.stop( [s.restart('vm',hostname='web%s'%i) for i in range(1,5)]; s.start('nginx');
s.start('hub')


- [x] (1:30?) (0:41) make a page of screenshots.

- [x] (0:20?) (0:03) remove the "donate" link from cloud.sagemath help -- it resulted in at most 1 donation over 2 months, so waste of space!


- [x] (1:00?) (0:58) make it so there is a way to see which hub user is connected to (say in settings or hover text over connection)
  - x sign in message should include info about hub signed into
  - x display as a tooltip over connection (?)

- [x] help: FAQ -- some vim plugin is incompatible with codemirror; https://addons.mozilla.org/en-us/firefox/addon/pentadactyl/; control-z to disable.


- [X] (0:30?) find a way to test SMC via tablet/phone running from chromeOS
See http://www.overdigital.com/2013/06/02/how-to-use-your-chromebook-pixel-as-a-webserver/
   sudo /sbin/iptables -A INPUT -p tcp --dport 443 -j ACCEPT

- [X] (1:00?) next release
  - note the silly hack running on web1 to keep disk cache for snap fresh
#!/usr/bin/env python
import os
while True:
    for i in range(1,5):
        c = 'ssh 10.1.%s.3 "time BUP_DIR=/mnt/snap/snap0/bup bup ls 69a229be-5a5a-42be-a98b-fc6c40aa10f9"'%i
        print c
        os.system(c)

- [x] ui: investigate supporting 2d plotting using bokeh(?): https://github.com/ContinuumIO/Bokeh


- [x] (1:00?) (0:20) document display must hide recent file list.
 - when click on Recent, show salvus-editor-recent-files (and Recent Files header?)
 - when click on file name, hide salvus-editor-recent-files (and Recent Files header?)


 - [x] (0:10?) fix snap servers, again.

- [x] (0:30?) (0:47+) respond to any emails on cloud mailing list that I missed.

- [x] (0:15?) (0:02) pill tabs for open files aren't all cursor:default yet.  Oops.

- [x] (3:00?) (1:40) terminal fonts: make them configurable (at least 2-3 options) -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13f89fa53f923c23
   - x add droid
   - x make a selector to choose droid/courier/etc.

- [x] jquery ui sliders for mobile -- suggested by jason grout -- [sage-cloud] touch sliders

- [x] (0:20?) (0:05) bug -- change font size in terminal and click "make default"; the email in upper right changes to first name

- [x] customize evaluate shortcut (just a tiny bit for now).

- [x] (0:30?) (0:04) make it clear to users that their name is publicly visible even if they don't share projects -- https://mail.google.com/mail/u/0/?shva=1#inbox/13f6293ef1a19861

How about on the "create an account" page, where it says:

"First name"
"Last name"
"Email"

I change it to:

"First name (everyone can see this)"
"Last name (everyone can see this)"
"Email (this is private)"

- [x] (0:10?) (0:16) ui: Also, Harald says: "in a private project, the settings panel show a "public eye" (and not the lock symbol like in the project overview list)."

- [x] (0:15?) (0:08) keyboard shortcuts -- fix an issue with settings.

- [x] (0:45?) (0:28) new release

- [x] (0:20?) (0:12) enter = `action_key` thing should only do something for code evaluation; not save file for other docs
- [x] (0:45?) (2:30) ui: project settings -- easy way to toggle "public versus private".

- [x] (0:20?) (0:09) add number of active projects to help display about usage...


- [x] (0:20?) (0:24) cursor:default --> cursor:"hand".  -- idea of Harald Schilly

- [x] (0:15?) (0:08) new file/worksheet/etc. -- put filename first, then buttons -- suggested by Harald Schilly

- [x] (1:00?) home icon: remove it when in the home directory and make it larger otherwise (right now it is the same size as the path) -- idea of Harald Schilly

- [x] (1:00?) (0:06) files page: the tooltip for "choose file..." shows up always, but shouldn't; I prefer having the autofocus (except on mobile, where it is very annoying), so I'll get rid of the tooltips and make the autofocus happen on both Recent and Files (except on mobile). --  idea of Harald Schilly

- [x] (2:00?) (4:48) make it so worksheet save results in making all image links permanent.