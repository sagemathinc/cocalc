
- (0:45?) [x] sagews: in local hub when code execution done, instead of including a message with done:true, change state of cell from "r" to not.
- (0:30?) [x] (0:19) sagews: visually change state of editor when code exec is requested ("x"), is executing ("r" mode)
- (0:30?) [x] (0:12) sagews: tab on a new line tries to complete on empty instead of inserting a tab
- (0:45?) [x] (1:00) sagews: evaluate and insert new cell at bottom should move cursor to new cell
- (0:30?) [x] (0:51) sagews: handle paste better -- don't ever show codes

---

- (0:30?) [ ] sagews: handle undo/redo better -- dont' show codes
- (1:00?) [ ] sagews: undo doesn't work in worksheets right now, at least after sync/compute (??)
- (0:30?) [ ] sagews: control-o shortcut to open file doesn't work on chromebook, since it is already taken by chrome (control-shift-o works)
- (0:30?) [ ] sagews: implement alt-enter to evaluate without moving the cursor, since I need that for teaching.
- (1:00?) [ ] sagews: make markdown mode optionally leaves content of $'s untouched (wraps them all in spans?); but should *still* allow $a\_1$ for compatbility
- (0:45?) [ ] sagews: play button to submit code to execute
- (0:45?) [ ] sagews: button to interrupt code to execute
- (0:45?) [ ] sagews: button to kill sage process
- (3:00?) [ ] sagews: implement interacts (using exec message)
- (1:00?) [ ] sagews: hide/show output
- (1:00?) [ ] sagews: hide/show input
- (1:00?) [ ] sagews: timer when evaluating code, but don't use jquery countdown, since it wastes resources at all times.
- (0:45?) [ ] sagews: eliminate jquery countdown (while not breaking old worksheets)
- (0:30?) [ ] sagews: proper filename display / truncation
- (1:00?) [ ] sagews: in client cells, set syntax mode for each cell; for starters *reset* it, but also could set based on % modes too.
- (0:30?) ] ] sagews: move the cursor when making new cell at the bottom.
- (0:45?) [ ] sagews: control-enter evaluate and split
- (0:30?) [ ] sagews: ctrl-; = split cell
- (0:30?) [ ] sagews: ctrl-backspace = join cell



@@@@@@@@@@@@



- (1:30?) [ ] syncdoc: implement sophisticated cursor relocation code, instead of my funny special character code.  This should be possible now that we apply a patch in chuncks.
- (3:00?) [ ] sagews html editing: try using tinymce to edit %html cells (?)  NEW release! http://www.tinymce.com/
- (0:10?) [ ] syncdoc: remove "click_save_button:" from syncdoc.coffee, in case it is not used (I think it isn't).



---

- (0:30?) [ ] account creation: checking that user clicked on the terms button isn't working.
- (3:00?) [ ]  Write code to dump the cassandra database to the filesystem (?), so I can upgrade current cloud.sagemath.org, etc.  This will be good to have in general for backups.  This shouldn't be *too* hard, now that I've fixed the schema...
It turns out that this is very easy, because of
   http://www.datastax.com/dev/blog/simple-data-importing-and-exporting-with-cassandra



---

Top missing features:

- sync codemirror worksheets: implement everything for them
- "publish": browse other people's projects, and collaborate in realtime
- scalable deployment

The options:

- store highly compressed backup of project (with internal rsnapshot) in cassandra, but there will *always* be a copy of the project extracted on some machine, which is needed for people to browse it.

or

- have numerous copies of all projects with nginx pointed out them.

or both, but with just one static copy, somehow organized... (?) at some point someday.


---

# Deployment Plan -- what do we need in place?

This is pretty neat -- this should be how cloud starts -- just have a worksheet, and have it suck you into more:

This is also a sketch of our architecture:

    http://sketchboard.me/Xydh8wrYRCtR

- each project is stored as a sequence of highly compressed blobs in the database
- we use tar to store only modified files

- storage of each user project somehow, either on FS or in database -- DATABASE.
- modify admin.py config to properly set these (from data/local/cassandra/cassandra.yaml) to be large:
    thrift_framed_transport_size_in_mb: 1500
    thrift_max_message_length_in_mb: 1600

- I tried using "xz" compression on `node_modules`, as a test:

time tar -cf - node_modules | xz -9 -c - > foo.tar.xz

It is only 5MB (20 seconds) versus 8.4MB (6 seconds) using "tar jcf".
The original directory is 52MB.

Try storing as a blob:

- multiple hubs
- cassandra deployed on multiple machines
- backup of cassandra database (?)
- redirect of cloud.sagemath.org (non-secure version)

- easy way to upgrade everything, including forcing restart of localhubs:
   -- push out new static code to 4 locations (for now).
   -- update a ver


---
- (3:00?) [ ] upgrade haproxy and get rid of using stunnel.  This tutorial looks helpful:
        http://blog.exceliance.fr/2012/09/10/how-to-get-ssl-with-haproxy-getting-rid-of-stunnel-stud-nginx-or-pound/
Maybe as easy as this:
              bind :443 ssl crt /etc/haproxy/site.pem

PHASE 3:

- (1:00?) [ ] sagews: modify search command to indicate result in output more sensibly (right now cursor gets big next to output)
- (1:00?) [ ] Modify the editor find command to have the option of doing a "fuzzy search" using the diff-patch-match library?!


- (0:20?) [ ] tooltip over connecting speed looks absurd
- (0:30?) [ ] call .show() on editor after resize, since codemirror formatting gets all messed up.


@@@@@@@@@@@@@@@@@@@@@

* (?) [ ] IDEA: instead of having chat only in that file, could have a meta file with chat... and also editor preferences for that file (?)  NOT SURE.

* (1:00?) [ ] FEATURE: make it so "create a new file" allows you to just paste a URL in the filename blank... to get a file from the web!

* (0:15?) [ ] BUG: need block of empty whitespace at bottom of cell.
* (0:20?) [ ] BIG BUG: worksheets -- the css position of tab completion is wrong; it doesn't move with the worksheet! (not sure I care)
* (0:30?) [x] BUG: worksheet path is still not set correctly
* (0:30?) [ ] BUG: terminal path is not set correctly.
* (1:00?) [ ] BUG: don't allow editing a file if it is above a certain relatively small size...
* (0:45?) [ ] BUG: clearing the "recent files" list makes it so none of the open file tabs at the top of the screen work anymore. (for now, maybe don't clear the ones also at top?)
* (0:30?) [ ] MAJOR BUG: when a worksheet asks for a non-existent session, it should failover and ask for a new session; right now it doesn't.
* (1:00?) [ ] BUG: terminal sessions need to reconnect when they timeout!
* (0:45?) [ ] BUG: when we get this in the `local_hub`, then the `sage_server` needs to be automatically started:
    debug: connect_to_session -- type='sage'
    debug: make a connection to a new sage session.
    debug: Got sage server port = undefined
    debug: can't determine sage server port; probably sage server not running

* (1:30?) [ ] SYNC: rewrite page/sync\_worksheet.coffee to use worksheet diff/patch
* (1:30?) [ ] SYNC: sync worksheet -- exactly copy all client/hub/local hub code for syncing codemirror sessions: CodeMirror |--> SageWorksheet test that it works and provides a parallel and 100% working sync system.
* (1:30?) [ ] SYNC: modify editor to use sync\_worksheet  enhanced version of worksheet
* (0:45?) [ ] SYNC: infinite loop printout in worksheet kills everything... NEED rate limiting of burst output, etc., like for terminals.
* (0:45?) [ ] SYNC BUG: often we start editing a document on first sync the cursor moves back 4 characters.  Maybe take what I currently do and combine it with "fuzzy search"...?

* (1:30?) [ ] BUG: entering/leaving fullscreen mode with worksheets makes page size all wrong sometimes; need to redo all editor display code; latexing totally broken.

* (1:30?) [ ] DEPLOY: define topology file for first deployment (note: edge {'insecure_redirect_port':80, 'sitename':'salv.us'})
* (1:30?) [ ] DEPLOY: deploy and test
* (1:00?) [ ] SAFETY: setup rsnapshot so it is used for every account and noted in database.

* (0:30?) [ ] BUG: file browser destroys long filenames now.


@@@@

* (0:15?) [ ] BUG: after pasting something big in terminal paste blank, page gets scrolled up all wrong.
* (1:00?) [ ] FEATURE: default worksheet percent modes.
* (1:00?) [ ] BUG: rewrite "divide into blocks" to respect code decorators, plus fix ugly recombination of if/while/etc.
* (0:30?) [ ] DESIGN: After doing certain operations with checked cells, uncheck them all: hide/show ops.
* (0:45?) [ ] BUG: when editing a doc with multiple viewers, keep having codemirror view on doc jump to top of screen (i.e., cursor at top)
* (0:45?) [ ] BUG: move recent files (etc.) thing to the database; it's too frustrating/confusing tieing to the computer.
* (0:30?) [ ] BUG: sometimes need more space the bottom of the worksheet
* (0:30?) [ ] BUG: os x "control-o" should also accept command-o
* (0:30?) [ ] BUG: switching between projects to redisplay an editor can result in a corrupt display; need to call "show" for visible editor on both resize and show top navbar events.
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
