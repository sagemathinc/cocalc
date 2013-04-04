
# implement sync

* (2:00?) [ ] sync worksheet define code to diff two worksheets making a patch, and apply patch

 (0:30?) [x] (0:20) diff for individual cells
 (0:30?) [x] (0:15) patch for cells
 (0:30?) [x] (2:15; more subtle than expected, and distracted) diff for worksheets
 (0:30?) [ ] patch for worksheets

 Regarding worksheet sync, I'm going to assume that I'll implement the following structure in the future.  This means, I'm completely
 ignoring sections from worksheets, and moving them elsewhere.  I'll likely remove them for the release.

IDEA:
------
The basic unit of computation in a notebook is a *cell*, which is a triple consisting of a note (or comment), followed by input code, then output.    Any of these three components may be easily hidden or shown, but all are present.  A computation involves a description of *what* is being done in human terms (the note), how to do it in terms of code (the input code), and the result of the computation (the output).  The output may be interactive, and itself contain cells.   A live cell is aware of an associated Sage session.  Sage sessions know nothing about cells, worksheets, etc. -- they simply execute code and have a state.

A worksheet is a linearly ordered list of cells.  There is no section or page structure to a worksheet -- it is a single infinitely long page.  All cells share the same Sage compute session.

A spreadsheet view is a one way of displaying a worksheet, in which only the *output* is displayed, and the cells are organized in a rectangular array.  Also, clicking on the output, changes the display for that cell to input.

A notebook is a collection of worksheets, with additional structure, e.g., chapters, sections, subsections, pages, etc.  A presentation is a linear list of worksheets, where each page is displayed in a free-form layout without the possibility to scroll.  The worksheets (hence cells) in a notebook or presentation all share a common Sage compute session.
-----


* (2:00?) [ ] sync worksheet -- exactly copy all client/hub/local hub code for syncing codemirror sessions: CodeMirror |--> SageWorksheet test that it works and provides a parallel and 100% working sync system.

* (2:00?) [ ] rewrite page/syncws.coffee to use worksheet diff/patch

* (2:00?) [ ] modify editor to use syncws enhanced version of worksheet

* (1:00?) [ ] cursor position improvements: I should take what I currently do and combine it with "fuzzy search"... the combination should be unbeatable.

* (1:00?) [ ] BUG -- when syncing editor documents, the first sync now doesn't loose anything, but it *DOES* move the cursor, which is confusion and causes errors while typing... every time.  Maybe force a first sync right when document loads. ok, I'm testing this out while developing today to see how it goes.

* (0:45?) [ ] when editing a doc with multiple viewers, keep having codemirror view on doc jump to top of screen (i.e., cursor at top)

# Weekend final push for release
* (1:00?) [ ] merge recent files (etc.) thing into the database; it's too frustrating/confusing tieing to computer.
* (1:00?) [ ] clean up presentation mode -- what I did is a mess; also add support for code and terminal.
* (1:00?) [ ] MUST have a spinner to indicate when docs are loading... some are quite slow right now.
* (0:30?) [ ] the css position of tab completion is wrong; it doesn't move with the worksheet!
* (1:00?) [ ] Hide top bar and zoom mode!!!!
* (0:30?) [ ] worksheet path is still not set correctly
* (0:30?) [ ] terminal path is not set correctly.
* (0:10?) [ ] switch the open/recent back next to each, since they both do the same sort of thing -- open a file.
* (1:00?) [ ] worksheet: modes!
* (0:30?) [ ] need more space the bottom of the worksheet
* (0:20?) [ ] os x "control-o" should also accept command-o
* (0:30?) [ ] BUG: switching between projects to redisplay an editor can result in a corrupt display; need to call "show" for visible editor on both resize and show top navbar events.
* (0:30?) [ ] BUG: clearing the "recent files" list makes it so none of the open file tabs at the top of the screen work anymore. (for now, maybe don't clear the ones also at top?)
* (1:00?) [ ] SAFETY FEATURE: setup rsnapshot to run like crazy in every account, copying to /snapshot for virtual machines, and mention this.  Say "This is a the first release, and since there is every possibility of data loss and corruption due to bugs, snapshots are made frequently."  Need a button (next to trash) that is a quick link to snapshots in .snapshots (?).  The smc service can start this.
IDEA: make the rsnapshot backup of user files for public projects... available via haproxy, so even if the hub goes down, people can get to all their files.  Also, this is index-able.
* (0:30?) [ ] define topology file for first deployment (note: edge {'insecure_redirect_port':80, 'sitename':'salv.us'})
* (3:00?) [ ] deploy and test (and come up with plan to do so)
* (0:30?) [ ] don't allow editing a file if it is above a certain relatively small size...
* (0:45?) [ ] BUG -- editor synchronization and split docs aren't done -- cursor/selection in bottom doc gets messed up -- sync the window with focus?


# DONE

(0:30?)  [x] (0:14) apply security updates and reboot 01salvus (done) and 06salvus (done)
(0:30?) [x] Add a new tab at the top called "Explore" that is to the left of "Your Projects"

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

       # IMPORTANT!
       sudo chown og-rwx -R salvus

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






