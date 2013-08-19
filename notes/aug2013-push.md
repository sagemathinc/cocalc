-----
--> - [ ] write code for latex editor to support embed viewer as another option.

   x- add a button for embedded PDF view
   x - add html view for embedded PDF view
   x - implement script for it.
   x - update button to pdf embed
   x - pdf display title
    - add spinners to each button
    - icons for each button
    - embed --> object in sage_salvus.py

- [ ] next release:
      - verify get new services file for cassandra
      - test embed viewer is working.


- [ ] a release at some point
      - upgrade haproxy in edge nodes


- [ ] maybe the mouse down versus middle click changes I made make it so clicking on a directory double selects, which looks stupid.

- [ ] edit worksheet, don't save, do rename, do loose everything! --> properly implement file rename

- [ ] file listing pager -- see Johan's request: https://mail.google.com/mail/u/0/?shva=1#inbox/14084ff6be8769cf

- [ ] publicly accessible projects (?)

- [ ] write another help section on something

- [ ] user database


---
Ideas:


- [ ] the Recent display is coming up empty again often.

- [ ] overwriting uploaded files: https://mail.google.com/mail/u/0/?shva=1#starred/14085f02020549a8

- [ ] popup on *new* chat message; indicator of unseen chats.

- [ ] test ipad + chrome + external keyboard: https://mail.google.com/mail/u/0/?shva=1#starred/14080562e3a0b444


- [ ] put an x in top right of search box for projects.

- [ ] database for all users?

- [ ] +1 what other people do or comments in logs...  it just seems to be an instinct to have this :-)

- [ ] add search box to project log (and also to

- [ ] do not allow opening files over 1mb without a stern warning

- [ ] editing rst files is totally broken!

- [ ] teaching / course management system....

- [ ] bug in find in cloud.sagemath code editor (codemirror?):
       search for "incorretly" in the raw file version of http://trac.sagemath.org/attachment/ticket/15013/trac_15013_logic_docstrings.patch

- [ ] change snap/bup usage to not cross filesystem boundaries (?), so won't back up encfs-mounted directories.

- [ ] Add to FAQ how to use encfs and that these aren't snapshoted, and that terminal i/o isn't recorded.

- [ ] (1:00?) doing "salvus.file(filename)" yields a link
      pdf/database.pdf (this temporary link expires in a minute)
      but it's not a minute anymore -- the default is a day, or may depend on size -- use the info in the object itself..

- [ ] (1:00?) fix terminal on "not working"

- [ ] (2:00?) firefox terminal copy / paste

- [ ] (1:00?) file rename gui seems broken...

- [ ] the hub logs are all filled with messages like this:

  local_hub --> hub: (connect) error -- true, _new_session: sage session denied connection: Error: connect ECONNREFUSED


- [ ] sync in the global hub is not optimally implemented, since there is no reason to every force the client to retry their sync if there is 1a connection to the global hub.  Instead of having one single shared locked state for the global hub version of the doc, could have lots.

- [ ] if ssh to remote fails, hub goes into a crazy spin; need to use my retry exponential backoff and stop after n tries!

- [ ] (2:00?) project high availability -- keep thinking about this!


- [ ] (1:00?) move FAQ from github into cloud itself.

- [ ] ((0:30?) add this to FAQ: https://mail.google.com/mail/u/0/?shva=1#inbox/1406489d11dac03e

- [ ] (1:00?) salvus.blob to send info without needing to create a file at all

- [ ] (1:00?) change salvus.javascript to send obj using salvus.blob and $.ajax.

- [ ] (1:30?) see misc project sws2sagews.py -- the DATA directory thing is not done

- [ ] Need to figure out how to use ssh passphrase, at some point.

- [ ] (1:30?) make it so clicking on a zip/tar/etc. file in the file browser extracts it instead of trying to open the underlying file in codemirror.

- [ ] (1:30?) make a screencast illustrating migrating worksheets from sagenb.:  harald says: "+1 same for: author latex documents, run sagetex, etc. ad ipython notebook tranformation:"


---

- [ ] bug in tex -- hangs forever -- get this in output (use  pdflatex table2.tex </dev/null to fixo fix?).

        /usr/share/texmf-texlive/tex/latex/memoir/mempatch.sty))
        (/usr/share/texmf-texlive/tex/xelatex/fontspec/fontspec.sty
        !
         ********************************************
         * XeTeX is required to compile this document.
         * Sorry!
         ********************************************.
        \RequireXeTeX ...********************************}
                                                          \endgroup \fi


- [ ] try to share code between project chat and file chat -- refactor it so it is the same.

- [ ] for published projects, if the URL is not indexed, spammers get nothing.

- [ ] for browsing published projects, do it sort of like g+/facebook, and try to provide a feed of things likely to be interesting to a particular user.  And provide a "mark as spam".

- [ ] database -- doing `select *``in cassandra does not scale at all.  I must find all instances of that and replace by a dummy or merge tables to have a fake compound primary key.

- [ ] make document chat use synchronized string.



- [ ] move improvements to abstractsyncdoc to also apply to hub
- [ ] move improvements to abstractsyncdoc to also apply to local hub


- [ ] spinner when loading log (?)
- [ ] "failed to create sockjs connection; try again" -- should do exponential backoff...?
- [ ] Clicking anywhere outside the password reset modal makes it vanish, which is a bad (de)sign


- [ ] (2:00?) password reset broken when using mail with "Apple Mail.app Version 6.5 (1508)." and auto-open in chrome (found by Nathan Carter).

- [ ] (2:00?) ui improvement suggestions from Nathan Carter:

5        If you're thinking about those dialog boxes, I'll add two other less important design observations:
                1. Pressing enter doesn't submit the form.
                2. Clicking the submit button doesn't give any immediate visible feedback that you did so (e.g., grey out the Sign In button), so if it takes a few seconds to get anywhere, you wonder if you really clicked it, and sometimes click again.


- [ ] (1:00?) save fail -- GUI doesn't produce any useful error message or even warning.  in this case restarting local hub fixed problem.
_ack":1}
debug: client --> hub: {"event":"codemirror_write_to_disk","session_uuid":"4c7556bb-3c64-4301-b515-99fde1481e4f","id":"a465228c-3ec2-42c8-ae1f-7edc4e27c8fd"}
debug: hub --> client (992e6b83-17fa-4d43-bcc5-aa78160973e4): {"event":"reconnect","id":"a465228c-3ec2-42c8-ae1f-7edc4e27c8fd","reason":"Error writing to disk -- true"}
debug: codemirror session sync -- pushed edits, thus completing cycle


- [ ] (4:00?) global system-wide chat.  I want it, so I can post about what I'm working on!

- [ ] (3:00?) integrate word cloud functionality (mainly for tish thesis... but maybe more): https://github.com/jasondavies/d3-cloud

- [ ] (1:30?) fix copy paste in terminal in firefox.

- [ ] (1:00?) trigger reload of user site packages -- https://mail.google.com/mail/u/0/?shva=1#inbox/1403fa803090d5b8

- [ ] (1:00?) install these in compute vm's -- https://mail.google.com/mail/ca/u/0/#inbox/1404104d0535fa46esday

- [ ] (1:00?) "When i click the play (▶) button on a cell, the cursor is lost (at least, here in FF)." -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/1404e1b3aa12fd89

- [ ] (1:00?) "Related to that, I propose that ALT+▶ does the same as ALT+RETURN, i.e. keep the cursor where it is – and also to mention that in the balloon help."   https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/1404e1b3aa12fd89

- [ ] (1:00?) polish control-; behavior. https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/14049e4cbf217036

- [ ] (3:00?) log improvements ideas -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/14048048587b483b
      - project server restart
      - sage server restart

- [ ] (0:45?) turn ugly code like "timer = setTimeout( (() -> project_list_spinner.show().spin()), 500 )" into a jquery plugin.

- [ ] ideal -- word cloud of opened files.


---

- [ ] (1:00?) syncdocs sometimes freeze -- maybe need a try/catch I don't know.

- [ ] (6:00?) ?? community tab: a system-wide chatroom that all connected users can use to chat (math enabled)

- [ ] (1:00?) snap: make snap lock more robust; IDEA -- if there is a lock of a certain age (?), check if that user is running any bups; if not, delete lock ?

- [ ] (1:00?) crontabs: https://mail.google.com/mail/u/0/?shva=1#inbox/14010044719e83b3

- [ ] (1:00?) serious synchronization bug/issue: when a worksheet gets updated, sometimes it is made visible, even if that tab is in the background.  CONFUSING!

- [ ] (1:00?) project storage ui polish: add html for all three project states: stored, restoring, active with tooltips explaining them; make html for this clean; make each "lighten" class.; color codes

- [ ] (1:00?) hub: implement `snapshot_project` function (and make sure to change number of copies for delete to 1 on localhost).

- [ ] (1:00?) write code in hub that periodically moves older projects to storage.  Maybe have to modify db schema to make this efficient, e.g., only ever look at projects that are not in storage.  Have two modes: a slower one that iterates over all projects, and one that takes project that were active in the last *month*, but not in the last week, and shelves only those.  Run on all hubs -- at a randomized interval, and iterating over the projects in a random order.

- [ ] (1:00?) hub:  for each Project/LocalHub class in global hub, check every 30 minutes to ensure that it is actively being modified.  If not, collect it.  This is critical, since we absolutely can't have a Project/LocalHub class sitting around in some hub when we move that project to storage.  Also, it avoids memory leaks.

- [ ] (2:00?) snap: UI for seeing nearest snapshot to a chat (just a link for now)

- [ ] (1:30?) write code in hub that ensures local hubs are always pre-started up for projects that have been accessed in the last week (again, a ttl'd new db schema field would do this).

- [ ] (2:00?) ulimit individual projects -- on july 22 one VM became unusable due to running out of memory, etc.

- [ ] (3:00?) (0:43+) "invite a friend" easy way to invite somebody else to get an account when sharing projects
  - page: design&implement the dialog where the user composes the message to friend
  - hub?: need to make it so 'https://cloud.sagemath.com/signup' immediately displays the "create an account" page.
  - hub: need to add a db table of "signup triggers", e.g., actions that happen when a particular email address is signed up, e.g., getting added to a project, banned, etc. -- should work with `email+*@'s`

- [ ] (1:30?) security issue -- should probably remove `/home/salvus/.ssh/id_rsa` from compute salvus on boot... since this grants access to other machines.  On the other hand, be careful since this is needed for making new projects the way I do now.

# Growth features

- [ ] (3:00?) templates -- https://mail.google.com/mail/u/0/?shva=1#inbox/140073638f4efd87

# User Visible Bugs

- [ ] (1:00?) reduce the terminal output rate-limitation thresh-hold -- it is ANNOYING or buggy when using top.

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


- [ ] (1:00?) fulltext search: for output lines, double check each result and make sure search term isn't in uuid
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

- [ ] (2:00?) write a simple ipynb --> sagews convertor, since it is so similar to above and easier.
      See my worksheet in tmp/.
      Make it so clicking does automatic conversion.
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

- [ ] (1:00?) snap: optimize this 'debug: finished recording snap_modified_files for project 5a986d67-833b-4f34-91a4-d084fdbf3159, time = 4.772000074386597' by putting it in a single transaction.

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



---



# User Visible Bugs

- [ ] (3:00?) improve css styles for dark themes, especially for mathjax -- https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/1400483ec22a8992
- [ ] (2:00?) the docstring popup is ugly and painful -- https://mail.google.com/mail/u/0/?shva=1#starred/140127ce418cbfff
- [ ] (1:30?) %prun profiler is now broken; just shows nonsense.
- [ ] (1:30?) sync/worksheets infinite loop printout in worksheet kills everything... NEED rate limiting of burst output, etc., like for terminals.

- [ ] (1:30?) mathjax (?) bug: BROWSER HANG
        var('P a b R T V_m')
        s = solve((((P - (a/V_m^2)) * (V_m-b)) / (R*T)) == 1, V_m)
        show(s)
        # then try to do "print s"
- [ ] (1:30?) right click to copy from a worksheet in Firefox (OS X) doesn't work, often "copy" doesn't show up in the menu, though keyboard shortcut still works.
- [ ] (1:00?) terminal -- fact control-shift-minus works in emacs codemirror mode (in app), so it must be possible to intercept it in javascript app for chrome after all(?)
- [ ] (0:30?) this interact doesn't work: `interacts.geometry.unit_circle()`
- [ ] (2:00?) terminal copy/paste; try to find a way to strip trailing whitespace, and deal with long lines (?)
- [ ] (1:00?) when searching again, keep the last search in the input box
- [ ] (1:00?) %load on a file with a syntax error gives a useless error message
- [ ] (1:00?) mobile worksheets: change how new cell insert acts to be actually usable!

- [ ] (2:00?) trying to download a large file (even 5MB!) can lead to disaster, e.g., rh.pdf from books project.  The google drive download setup looks nice; they make a temporary zip of the files, then email you a link -- maybe I could do that. (Of course, their's is frickin' broken due to a redirect loop on chrome.)


- [ ] (1:30?) converting the large cassandra12.pdf to png's to display in browser silently fails; probably a timeout (?)
- [ ] (1:30?) firefox (linux) -- both copy and paste with terminal are completely broken
- [ ] (1:00?) firefox recent files list -- pills wrong size
- [ ] (1:00?) firefox terminal -- resizes all wrong; bottom lines chopped... sometimes.  But sometimes fine. (maybe fixed)
- [ ] (1:00?) (0:13+) bug -- open a pdf then hit space -- you get back to the file search -- should go to next page.
- [ ] (1:30?) psage -- broken and doesn't build with sage-5.10, because of updates to Cython: "sqrt5_fast.pyx:1057:20: undeclared name not builtin: Py_GE"  (add psage to build.py todo list!)
- [ ] (1:30?) if during a session one had a websocket connection and it switches to something else upon reconnect, try to reconnect again after a minute or two.
- [ ] (1:00?) client.exec is timing out after about 10 seconds no matter what.  This messes up "disk usage", among other things...  I wonder why?   I think this leads to "Disk: (timed out running 'du -sch .')" when looking at larger projects.
- [ ] (1:00?) ui: if ping time hasn't been updated in a certain amount of time, replace by "..." (?)
- [ ] (0:45?) BUG -- latex output log -- isn't properly sized relative to container.
- [ ] (0:45?) sometimes file listing gets updated after we've already changed to another directory!
- [ ] (1:00?) something didn't get properly (monkey) patched:  sage.interacts.algebra.polar_prime_spiral()
- [ ] (0:45?) sagews: eliminate jquery countdown... (?)
- [ ] (0:45?) mathjax special case: `$a< [no space]b$` is misparsed, whereas `$a < b$` is OK.  We should somehow fix such things in the html function, since mathjax can't.
- [ ] (1:30?) this doesn't work:   GraphDatabase().interactive_query(display_cols=['graph6','num_vertices','degree_sequence'],num_vertices=['<=',4],min_degree=2)
- [ ] (1:30?) idea from Dan Grayson: Another feature of the sage math cloud would be compatibility with chrome's excellent scheme for keeping track of your user names and passwords for you. -- https://mail.google.com/mail/u/0/?shva=1#inbox/13ea4bfe65bc36cd
- [ ] (1:00?) BUG: after pasting something big in terminal paste blank, page gets scrolled up all wrong.
- [ ] (1:00?) BUG: file browser destroys long filenames now.
- [ ] (1:00?) in solarized light mode, markdown bold is too light to read.

# User Features

- [ ] (2:00?) customizable cursor
- [ ] (2:00?) implement ability to open files in the .snapshot directory (or anywhere) read only -- using a full editor view (but in codemirror read-only mode); does *not* require that the project is deployed.
- [ ] (2:00?) snap: restore target; allow the user to specify a given target path
- [ ] (2:00?) 3d: support for mtl files and colors -- see cloud project.
- [ ] (3:00?) snap: make it possible to optionally restore to a different location, which could be any path in *any project*.  This would make it possible to easily merge/move/etc. data from one project to another, and would not be hard to implement.
- [ ] (3:00?) terminal: implement an "open" command, via some sort of message.
- [ ] (1:15?) editor tabs: icons next to each filename
- [ ] (1:30?) feature: run sagetex automatically if needed

- [ ] (4:00?) make snaps a filesystem: http://sourceforge.net/apps/mediawiki/fuse/index.php?title=SimpleFilesystemHowto
      i.e., fuse mount snapshot path so is accessable read only in term. (?)
- [ ] (1:00?) make it possible to delete an account.
- [ ] (0:40?) when filling in settings for collaborators, show a spinner while waiting for info to download.
- [ ] (3:00?) latex: left/right split view.
- [ ] (4:00?) terminal: implement a scrollbar
- [ ] (2:00?) export sagews to sws
- [ ] (3:00?) idea: in project settings, specify a list of things to do when project is started; scripts to run, worksheets to evaluate, etc.
- [ ] (1:30?) way to configure displayhook output modes; e.g., svg versus png, threejs versus tachyon, etc.
- [ ] doc: how to X (make lots of specific todo's)
- [ ] (1:30?) make page like http://codemirror.net/demo/theme.html, but showing a file and a worksheet.
- [ ] (1:30?) change cursor so it is configurable to be transparent or a vertical bar -- configurable (requested by Rob Beezer) - https://mail.google.com/mail/u/0/?shva=1#search/sage-cloud/13fcf5dc2f951a26
- [ ] (2:30?) create a "snapshot" interact control based on Vivek and Jen's work.
- [ ] (2:30?) custom environment variables in project settings, including `SAGE_PATH` (with explanation) -- https://mail.google.com/mail/u/0/?shva=1#inbox/13fa0462bcaa7768
- [ ] (2:00?) transfer ownership: transfer this project to another user
- [ ] (2:00?) ui: make it possible for user to easily select a sage version for a project (from those available).
- [ ] (1:00?) start installing a bunch of optional R packages into sage -- https://mail.google.com/mail/u/0/?shva=1#sent/13ffd46fe8b33077
- [ ] (1:30?) easily toggle between split view horizontal and split view vertical (side by side); this would actually just be som easy css/html, I think....
- [ ] (3:00?) snap: search through past snapshots: by filename
- [ ] (3:00?) snap: search through past snapshots: by file content (no clue how to do that efficiently... but could just use grep + fuse + timeout + limit by user)
- [ ] (1:00?) feature: save terminal history to file.
- [ ] (1:30?) feature: hit tab anywhere when using a function to get the signature as a tooltip
- [ ] (1:30?) feature: tab completion when using a function could also complete on the keywords -- https://mail.google.com/mail/u/0/#inbox/13ec474c229055d9
- [ ] (1:30?) implement `pretty_print` -- see https://mail.google.com/mail/u/0/?shva=1#inbox/13e454cb56930ef0
- [ ] (1:00?) sagews: implement timer when evaluating code (?), but don't use jquery countdown, since it wastes resources at all times.
- [ ] (1:00?) sagews: modify search command to indicate result in output more sensibly (right now cursor gets big next to output)
- [ ] (1:30?) Modify the editor find command to have the option of doing a "fuzzy search" using the diff-patch-match library?!
- [ ] (1:00?) interact.coffee: refactor the big switch statement in `interact_control` to be extensible, so can easily add something to a map and get a new control.
- [ ] (4:00?) tern and tern coffeescript (?) -- make IDE much more serious! http://ternjs.net/


# Major new features

- [ ] (3:00?) make a table that logs events to a project and who does them (e.g., open file, save file, open project) -- and provide a new tab to view them.
- [ ] (3:00?) community tab: "explore" other projects.
- [ ] (6:00?) wiki view -- I was just browsing again through the the wiki system gollum used for the github wiki. This is basically what I am looking for - an extra folder myproject / wiki containing the wiki in human readable and editable files and folders, with default cloud view being rendered through gollum (using various rendering systems like rst or markdown). Github seems to not support mathjax anymore, but a switch to turn on mathjax on pages (or, if this is too much, mathjax being turned on by default) would be necessary in order to make math collaboration possible. Also, links to files and embedded pics from myproject / otherfolder would be good to have. Finally, making the wiki publicly visible (even if the project is still private) would be nice as well.  See https://mail.google.com/mail/u/0/?shva=1#inbox/13f9e7a22fbe59ec
- [ ] (3:00?) LXC per-project (which will imply quotas)
- [ ] (3:00?) idea -- bake in chunking messages over sockjs so we can send huge messages without reset and without stopping other messages; thus can edit large files.


# Server Bugs

- [ ] (2:00?) in hub (around `mesg_codemirror_get_session`) should we be much more careful adding client to sync'd session -- have the client send back confirmation.
- [ ] (2:00?) snap/hub: code to un-deploy projects that have been inactive for a while.
- [ ] (2:00?) Major bug/issue -- I just noticed that the ip address of clients appears to be on the VPN!  NOt their true external ip addresses.  This means my anti-account-creation, etc., measures are going to apply to everybody at once, rather than just a given external IP.  HMM.  This is tricky.  Of course, the impact is to restrict users much more severly.
- [ ] (1:00?) am I writing cassandra blobs as string constants? -- something about that in docs "Cassandra blobs as string constants"?
- [ ] (1:00?) when sending an email to reset account; if there is no account with that email, send that fact in the email *not* as an error back to the client, since otherwise we give away that the email is attached to an account.


# Server Features

- [ ] (2:00?) make caching of newly created blank projects something that is stored in the database, not the hub.

- [ ] (2:00?) compute: change compute nodes so they have a UUID that is indexed and regularly updated in DB, for project accounts... much like with snap servers; something running as part of hub (or some other new service, e.g., in admin.py?) would have to do this, since the project servers themselves are firewalled.  E.g., monitor connects to each possible compute server, runs a script (JSON output), then enters result in database.  This would include info about load, disk usage, etc., and be made available in the /stats url.  blah

- [ ] (2:00?) snap: write code to automatically sync out active repo every so often (?), and also when making a new active repo (by filling in database stuff)
- [ ] (2:00?) handle long url into a snapshot (or other), i.e.,
             https://cloud.sagemath.com/projects/project_uuid/.snapshot/timestamp/path/into/project
      when user (who must be logged in) visits this URL, they will open that project and the
      given file in the project, assuming they have appropriate permission to do so.
- [ ] (1:30?) change bup ls to use fuse to get full metainfo... or (better) make bup ls get the metainfo directly.
        time mkdir fuse; BUP_DIR=. bup fuse fuse; ls -lh fuse/master/latest/; fusermount -u fuse; rmdir fuse
- [ ] (2:30?) make the split view of worksheets work; the debugging aspect is no longer needed, really.


# Operations

- [ ] (3:00?) support cassandra authentication in addition to use firewall: http://image.slidesharecdn.com/cassandrasummit2013keynote-130613151129-phpapp01/95/slide-18-638.jpg?1371154320
- [ ] (1:00?) plan *32 hours* of work for Monday Aug 5 and Tuesday Aug 6

# Monday, Aug 5 (16 hours)

- [x] (0:30?) (1:00) graphical indication when loading project list

- [x] (0:30?) (2:16) middle click to open file in background -- https://mail.google.com/mail/ca/u/0/#search/harald/140439ae2758e64c
      (also a lot of important design discussions with Harald during this.)

- [x] (1:00?) (1:40) make it so project activity log keeps trying to initialize until it succeeds; fix error reporting if attempting to list project collaborators in settings fails; remove some console log messages when directory listing fails;

- [x] (1:00?) (6:24) project restart: should work even if `stop_smc` fails; e.g., what if user deletes the `stop_smc` script.  We need to have a message devoted to restarting the project server properly, rather than this client side forcing of a side effect.;   I ended up doing a lot of things right, massively improving speed of compiling, restart, and first start.   Worth the extra 5 hours !

- [x] (1:00?) (3:35) when connection drops, log will stop working -- sync not robustified.  lots more work on this.  Finally laying the foundation to really fix this shit right.


New main goal for Aug 6, since we have the momentum: PERFECT SYNC IN ALL CONTEXTS -- day of quality improvements!

- [x] (0:30) diffsync ready message from hub always results in a retry right now, which means many pointless errors.
- [x] (0:30) first "project opened" write doesn't get properly saved.
- [x] (0:48) change connect in ASD so it tries until success (then change sync accordingly)
- [x] (1:10) sync of project log gets doubled up when both clients get disconnected.
- [x] (2:00) refactor abstract sync doc retry code
- [x] (4:30) move improvements to abstractsyncdoc to also apply to codemirror docs in client; PERFECT!
- [x] new release:

        echo "grub-common hold" | dpkg --set-selections

        apt-get install markdown

        git pull; ./update_version ; touch *.coffee; ./make_coffee

Hi,

I've updated https://cloud.sagemath.com.

1. Major document synchronization improvements: I implemented differential synchronization in April, and had added little hacks in my spare time to fix some annoying issues.  I just spent the last two days just re-doing all the code, and it is now *dramatically* more robustness.  In particular, changes you make after your network connection drops (or is just starting) shouldn't just vanish, as was too-often the case before.  The new project log and chat synchronization is now also much more robust.   These improvements should make cloud.sagemath more pleasant to use; since worksheets use synchronization for evaluation, they should also work better now, and system should generally less overloaded.    For fun, you could opening a worksheet in two browser windows, compute some things, then kill your network connection and put some random different input in the same worksheet in both browsers.  Then restart your network connection and see what happens after 30 seconds.

    NOTE:

      - I still need to make document-level chat so that chat messages can never get dropped (using what I've done above), but haven't done this yet.
      - When your connection resets (say due to flakie wifi), the cursor may still jump, but you shouldn't loose text.  I have a plan to fix this.

2. I significantly sped up restarting projects (about 5 seconds now, instead of 15 seconds), and also initially starting a project after the VM is rebooted (should take less than 10 seconds).

 -- william

1

- [x] (1:30?) (0:58) nice pdf of tish database.



---
- [x] (1:30?) address ssh-agent issues on my laptop

- [x] (1:15) fix this massive stability issue: " system.log:java.lang.OutOfMemoryError: unable to create new native thread ":

Probable cause -- number of open files (the limit is low):

 $ ulimit -n
 32768

But that isn't low.  Hmmm.  At start of cassandra, but maybe it goes up a lot.

 lsof | wc -l

They have recommended ulimit settings here <http://www.datastax.com/docs/1.1/troubleshooting/index>, but those exactly match what I have already, since I copied them from there!?  I'll increase nofile by a factor of 10 for next release for next release.

The root cause seems to be leak TCP connections, due to a bad driver (or clients):

This goes up *quickly*:

salvus@cassandra1:~$ lsof |grep TCP|wc -l
784
salvus@cassandra1:~$ lsof |grep TCP|wc -l
802

At this rate, it will leak about 28000/day (!) and die in 2 days due to the current limit.  That's a problem. problem.
Which clients are causing this leaking?

I stopped the snap servers and the number went to 28 and stayed there.
I restart them and things are crazy now.

---
- [x] (3:00) test using round robbin load balancing, because source SUCKS, due to stunnel and vpn and how dns works.

    upgrading coffeescript:

        ssh cloud2 "cd salvus/salvus; . salvus-env; npm install coffee-script"

    ssh cloud2 "cd salvus/salvus; git remote set-url origin git@github.com:williamstein/salvus.git"

Sorted out: haproxy: reconfigure to use proper sticky sessions based on a random session cookie instead of ip hashing.  Also, reduce the server timeout check from 120s to 7s, so that when a hub goes down, the user quickly (e.g., within 20-30 seconds) completely recovers, connecting to another hub.  I've tested killing hubs, and this *fully works* now  :-)


- [x] test HA of database: works if 1 or 2 nodes fail in exactly one datacenter.  Does *not* work if a node fails in *both* data centers.



# Aug 9:

---
- [x] (0:30?) (0:10) middle click to close browser tab.

x- [x] (1:30?) reconnect *must* cause all synchronized doc sessions to immediately sync.  NEED THIS:
    - Make it so `salvus_client` emits an event on reconnect (maybe it does already)
    - Make it so sync session listens to that event and calls connect() when it happens.
    - SIMPLE.
    - was just a few lines of code, but I got confused about the classes and method resolution.

---
August 10, 2013: 5pm - 11pm.

- [x] fix that local hub on my laptop isn't stopping and restarting

- [x] if `local_hub.js` is "kill -STOP" by user, then file editing sessions can't reconnect to hub itself anymore no matter what; only fix is restart the hub.
      if localhub is just killed, e.g., by "killall -u `whoami`" or even just killing the localhub.js processs, then automatic restart works fine.  It's the
      kill -STOP that is tricky.

Steps to replicate:
  - start two clients viewing a file
  - restart project server
  - then clients sort of sync, but not automatically anymore.

 - [x] (0:22) Investigate sync issues
  - re-enable debugging in the client to see if both clients are getting the "please sync now  sync now message"
     Conclusion: the clients stop getting "sync now" messages on updates.
  - reset the hub to how it was before (all locks, destroy all clients on reset) and repeat above.
     This actually *works*... as long as we do something in both clients in order to force them
     to reconnect.  They become whole new sessions and sync back/forth just fine.
     If we don't force both to reconnect, then the one that didn't reconnect never knows to sync.
     That make sense.  This is a solid foundation to build on.  Let's do it.  The goal is to make it
     so we do not drop the client sessions and force them to reconnect when the

-- > - [x] (0:50) hub sync: do not destroy client connections on reconnect.

   - the reason this doesn't work (and also above doesn't, maybe) is because the sessionid changes.
   - I wonder -- should I just make the session id an md5 hash of the file path and projectid?
     This means I could no longer rely on knowledge of the sessionid for temporary authentication, or as an added level of security.
   - Another option would be a message that tells clients that session id changed... but they might miss it and then that leads to trouble.
   - Another possibility would be to make the session id stable in the hub, and have a different id between the hub and local hub.
   - Broadcast message sounds good; if a client doesn't get that, they aren't connected, so it doesn't matter anyways!


   - 1. broadcast message for codemirror sessions (and test)
   - 2. broadcast message for sync strings (and test)

Steps to replicate:
  - start two clients viewing a file
  - restart project server
  - then clients sort of sync, but not automatically anymore.

 - [x] (0:22) Investigate sync issues
  - re-enable debugging in the client to see if both clients are getting the "please sync now  sync now message"
     Conclusion: the clients stop getting "sync now" messages on updates.
  - reset the hub to how it was before (all locks, destroy all clients on reset) and repeat above.
     This actually *works*... as long as we do something in both clients in order to force them
     to reconnect.  They become whole new sessions and sync back/forth just fine.
     If we don't force both to reconnect, then the one that didn't reconnect never knows to sync.
     That make sense.  This is a solid foundation to build on.  Let's do it.  The goal is to make it
     so we do not drop the client sessions and force them to reconnect when the

-- > - [x] (0:50) hub sync: do not destroy client connections on reconnect.

   - the reason this doesn't work (and also above doesn't, maybe) is because the sessionid changes.
   - I wonder -- should I just make the session id an md5 hash of the file path and projectid?
     This means I could no longer rely on knowledge of the sessionid for temporary authentication, or as an added level of security.
   - Another option would be a message that tells clients that session id changed... but they might miss it and then that leads to trouble.
   - Another possibility would be to make the session id stable in the hub, and have a different id between the hub and local hub.
   - Broadcast message sounds good; if a client doesn't get that, they aren't connected, so it doesn't matter anyways!


   - 1. broadcast message for codemirror sessions (and test)
   - 2. broadcast message for sync strings (and test)



- [x] fix things so at least the global single shared state for sync docs actually 100% works.  Right now, something goes wrong if the local hub gets restarted and there are two clients.  Suddenly the second client stops syncing automatically.  Fix this first.


- [x] file level chat is broken -- hub doesn't update @chat attribute...
      FIX -- completely redo completely in the client to use sync string, as for project-level chat:

xxx (0:19) - eliminate most code that involves chat
!  - make client just open the chat session directly

QUESTION: what if chat isn't used -- it seems ugly creating the file anyways; this clutters things up. hmm.
NO matter what, the way to deal with this would be to do something new on the local hub to allow having
a syncdoc session with no file until there is an actual edit... so I can worry about this later.
Also, I think every time one opens a file that should result in message now (optionally filterable), so the file is never empty.
  - write code so client renders messages on update.



1


- [x] sage worksheets are broken for some reason related to recent changes.  fix.

- [x] (0:24) hub -- make sync in hub totally locked until done.

- [x] make chat look good (nice formatting, etc.)



- [x] (0:30?) (1:30) new release: ?
       - change password of vm to salvus password
       - add to ssh authorized_keys

Dear Sagemath Cloud users,

On Monday around 9am, I've updated https://cloud.sagemath.com with the following changes.

1. I applied the latest security updates to virtual machines and reboot everything.

2. I spent days significantly reworking the backend document synchronization code to be more robust.    I had improved the frontend code last week, but hadn't changed the backend code, which still had some significant issues (e.g., two users would see things get totally out of sync in certain cases).

3. I rewrote the file-level chat to use its own synchronized editing session, so that when your connection gets dropped and later resumes, the chat is properly updated.

4. Middle mouse click to open and close tabs in the background now works on Firefox (thanks Harald).

Let me know if you run into any synchronization issues at all.

Best regards,

   William



- [x] (0:30?) (1:30) new release: ?
       - change password of vm to salvus password
       - add to ssh authorized_keys

Dear Sagemath Cloud users,

On Monday around 9am, I've updated https://cloud.sagemath.com with the following changes.

1. I applied the latest security updates to virtual machines and reboot everything.

2. I spent days significantly reworking the backend document synchronization code to be more robust.    I had improved the frontend code last week, but hadn't changed the backend code, which still had some significant issues (e.g., two users would see things get totally out of sync in certain cases).

3. I rewrote the file-level chat to use its own synchronized editing session, so that when your connection gets dropped and later resumes, the chat is properly updated.

4. Middle mouse click to open and close tabs in the background now works on Firefox (thanks Harald).

Let me know if you run into any synchronization issues at all.

Best regards,

   William

- [x] (2:00?) project restart and hub diffsync sessions: this leads to a very BAD situation that will piss off user:
       - open a worksheet or file to edit
       - restart local hub, but do NOT restart global hub
       - re-open the same file
       - look at the log in hub, and see an "infinite loop" of reconnect attempts.
       THIS is very serious.  The user must refresh their browser to fix this.  BAD.  And wastes resources.

- [x] (2:00?) *TOP PRIORITY* sync is messed up:  when connection gets reset sometimes it never correctly *saves* again, which will result in MAJOR data loss --- because suddenly "Save" doesn't really work.  This is new and absolutely top priority.  This was entirely a problem with the local hub getting messed up, which is unusual.  I have no clear way to reproduce this.

- [x] (0:22) client syncdoc: save and sync interfere doubling the last edit... sometimes.

- [x] (0:30?) (0:15) create new worksheet and name it with .sagews extension results in .sagews.sagews; also ban creation of certain file types

- [x] (0:15?) (0:08) don't have chat open by default then suddenly close; looks crappy

- [x] (0:30?) (1:01) middle click to open file in browser opens another browser tab (oops); also file download/rename/trash buttons broken -- see https://mail.google.com/mail/u/0/?shva=1#inbox/140735b83b26ebb1

- [x] (0:30?) worksheet re-opening bug -- https://mail.google.com/mail/u/0/?shva=1#inbox/1405eea856c0d6f6

It's the call to @editor.show().  Closing an open tab needs to completely remove the syncdoc, but clearly it doesn't.

---
- [x] new release:


Hi,

I've updated https://cloud.sagemath.com with the following fixes:

 1. Fix the "worksheets magically reappearing" bug that Harald Schilly reported.

 2. Fix remaining issues with middle click to open file in browser opens another browser tab (oops); also file download/rename/trash buttons were temporarily broken due to the middle click implementation.

 3. When opening a file, don't have chat open by default then suddenly close; looks crappy.

 4. Create new worksheet and name it with .sagews extension results in .sagews.sagew (similar with .term); also ban creation of certain file types

 5. Hub sync: the global hub wasn't reconnecting to local hub in one case, which could make doc unsyncable until timeout or hub restart.

 6. Client sync: fix a potentially *major* annoyance with save causing multiple syncs.


 -- William


- [x] fix bug in reporting error when %load'ing external file.
        %load parse.sage
        Traceback (most recent call last):
        KeyError: '__tmp__0'
1

- [x] open new file and start typing -- when network slow, first 2-3 characters get removed; this is probably because there was typing before *any* sync, so need to somehow take that into account.  This will be in connect -- set the first to initial  doc instead of undefined.

- [x] new release:
       x - update salvus repo and version.
       x - change password of vm
       x- install encfs (and add to build.py)
       x- install lua
       x --> - upgrade to sage-5.11 released.
       - write script to automate install of optional packages


Hello,

I've updated https://cloud.sagemath.com as follows:

  - Upgraded to sage 5.11, which was just released today (and I patched it to use the new prettier unicode banner.)

  - You can still use sage-5.10 on the command line if you want by typing "sage-5.10".
    If you make "~/bin/sage" a symlink to /usr/local/bin/sage-5.10, then sage-5.10
    would get used in worksheets.  I plan to keep all past versions of Sage around.

  - Installed lua and encfs.

  - Fix a few remaining synchronization issues (where the first few characters you type as the document first syncs would vanish).

  - Fix a race condition that made it so latex'ing .tex files often failed.

  - Added a section about latex to the help page.

  - Improve the load command (and %load mode) in Sage worksheets to support .html, .css, .js, and .coffee files.

  - Fix a huge bug where load("foo.sage") would give a nonsense error message when foo.sage had an error in it.

  - Closed worksheets re-appearing and some remaining middle click issues.


 -- William



--> - [x] work on ideas for scaling up the pdf viewer (part 1)

Ideas for how to scale pdf viewer:

   - backend png generation is very fast -- 14 pages per *second*; even for my 140 page book with mazur, it takes 10 seconds, which isn't too bad.

   - pdf.js https://github.com/mozilla/pdf.js massively kicks the ass of anything I've done.  It works on iPad.
     It can easily display rh.pdf.  It has color and hyperlinks!

One plan
   - 0. up the file size limit to 10MB (done).
   - 1. just use the generic viewer plugin viewer by default, with side-by-side an option:
           <embed src="/blobs/rh.pdf?uuid=d03021a5-4cf8-4b09-ac2c-90c415ac9365"  type="application/pdf" width="500" height="375">
   - 2. have an option to fall back to png's
   - 3. later, have an option to use pdf.js directly integrated not as a plugin at some point in the future.

However, the problem with the above is there is no hope to do forward and reverse search, which are killer features.
With pdf.js, at least those are *possible*.  And that is HUGE.   Also, it may be possible to annotate pdf output with
latex errors, which is also huge.

Let's go with full on pdf.js, using that demo the guy posted.

This look very promising as a base for how to embed pdf.js:

    https://github.com/jviereck/pdfListView

newer version of same here:

    https://github.com/jpallen/pdfListView


