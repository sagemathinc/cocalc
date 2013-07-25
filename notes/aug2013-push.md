

# Top priority bugs



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
- [ ] (2:00?) trying to download a large file (even 5MB!) can lead to disaster, e.g., rh.pdf from books project.
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
