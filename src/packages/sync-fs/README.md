# Compute Server Filesystem Sync

## LICENSE: MS-RSL

## Discussion

This is for filesystem sync, rather than document sync like in `@cocalc/sync`.

The code here helps with periodically syncing a compute server and the project,
where the compute server uses unionfs\-fuse combined with websocketfs, and the
project uses a non\-FUSE fast local filesystem \(e.g., ext4 or zfs\). This
algorithm will result in the file systems being equal if there is no activity for
a few seconds. It's meant to provide a "last one to change the file wins", BUT
with a tolerance of maybe ~10 seconds, especially for deletes.

This does not use inotify or any other file watching because cocalc runs on
linux, and our most basic requirement in terms of scalability is at least "the
cocalc built source code", which overwhelms inotify. On linux there is no
possible way to watch a directory tree for changes efficiently without
potentially using large amounts of memory and cpu. E.g., one single cocalc dev
tree is way too much. Instead, when doing sync, we will just walk the tree.
Running 'find' as a subcommand seems optimal, taking a few KB memory and about
1s for several hundred thousand files.


- TODO: This sync protocol does NOT deal with file permissions, e.g., changing a file to be executable when it wasn't, since that doesn't update the mtime.  See https://github.com/sagemathinc/cocalc/issues/7342

- Dependencies: this doesn't depend on @cocalc/project, but you do need to import
say @cocalc/project/nats before using this code, so that the client process knows
how to connect to NATS.

## ALGORITHM

The actual sync works as follows. For now, we will do this periodically, possibly triggered
by active usage signals from the user.

**STEP 1:** On the compute server, make a map from all paths in upper \(both directories and files and whiteouts\),
except ones excluded from sync, to the mtime for the path \(or negative mtime for deleted paths\):

```javascript {kernel="javascript"}
computeState = {[path:string]:mtime of last change to file metadata}
```

**IMPORTANT: We use mtimes in integer seconds, rounding down, since that's what tar does.** Also, a 1second resolution is more than enough for our application.

We store this in memory.

**STEP 2:** Call a websocket project api that takes as input:

- computeState or computeStatePatch, sent as an lz4 compressed json string, since highly compressible and
  could easily be over 20MB... but compresses in ms to 2MB.
  If the project gets a patch but doesn't already have the last state in memory, it returns an error,
  and the compute server then calls again with the computeState.

**STEP 3:** The project handles the api call as follows. It applies the patch \(if applicable\).
The project then updates its own projectState record, except that the project can only mark paths as deleted by comparing with the last time it computed state, since there's no special filesystem tracking of deletes \(like unionfs provides us for the compute server\).
The delete timestamp will be "now", or maybe the midpoint between last udate and now \(?\).

Then iterates over each path and decides
if any of the following apply:

- delete on compute
- delete on project
- copy from project to compute
- copy from compute to project

The decision about which is based on knowing the `mtime` of that path on compute, in the project,
and whether or not the file was deleted \(and when\) on both sides. We know all this information
for each path, so we _can_ make this decision. It is tricky for directories and files in them,
but the information is all there, so we can make the decision. If there is a conflict, we resolve it
by "last timestamp wins, with preference to the project in case of a tie". Note also that all
mtimes are defined and this all happens on local filesystems \(not websocketfs\). It's also possible
to just decide not to do anything regarding a given path and wait until later, which is critical
since we do not have point in time snapshots; if a file is actively being changed, we just wait until
next time to deal with it.

The above results in four lists of paths:

- delete_on_compute
- delete_on_project
- copy_from_project_to_compute
- copy_from_compute_to_project

These are handled as follows:

**STEP 4:**

- We process delete_on_project immediately.
- We return delete_on_compute as part of the response from the api call.
- We create a tarball ~/.compute\-servers/\[id\]/copy_from_project_to_compute.tar.xz \(say\)
  containing the files in copy_from_project_to_compute. It's of course critical that
  nothing in here is corrupted; if there is any "file was modified" during making the
  tarball, we remove it. We return that there is at least 1 file in this tarball
  and the path to the tarball from the api call.
- We return copy_from_compute_to_project as well in the
  api call response.

**STEP 5:** The api call returns with the above information in it. The compute server then does the following:

- Deletes all files in upper and whiteout listed in delete_on_compute, but always checking
  if there was more recent activity on a path, in which case skip that path.
- Extract the tarball lower/.compute\-servers/\[id\]/copy_from_project_to_compute.tar.xz
  to upper, with the option set to not overwrite newer files.
- Creates a tarball of the files in copy_from_compute_to_project, with similar care as mentioned
  above to not have any corrupted files. Basically, we can tar, and if there are any messages
  about files modified during tar, remove them from the archive \(e.g., tar \-\-delete \-f nixtree.tar textfile1.txt\).
  lower/.compute\-serers/\[id\]/copy_from_compute_to_project.tar.xz
- Makes API call to the project telling it to extract copy_from_compute_to_project.tar.xz, not
  overwriting newer files.

## Eventually consistent

If we do the above and there is no filesystem activity, then the two filesystems will be in sync.
If there is activity, some files will be missed, but they will get picked up during a subsequent sync,
because there is absolutely no assumption that a previous round of sync did anything in particular!
The underlying networked filesystem (websocketfs) is ONLY used for sending the two tarballs, which
means they can be arbitrarily large, and also means that very high latency of that filesystem is
fine, and all that matters is bandwidth.

Complementary to the above, we also have read file tracking for websocketfs. Using that, we periodically
copy a tarball of files over from the project and extract them to upper, in order to make local reads
much faster.

## Time

This is a sync algorithm that depends on the existence of clocks.  Therefore we do have to consider the possibility that either party \(or both\) have their clocks set improperly.   We only require resolution of "a few seconds accuracy" for this algorithm, so nothing particular clever is needed \(this isn't Google Spanner\).  We only even store times to the level of 1 second precision in this algorithm. 

We amend the above protocol as follows.  The compute server's message to the project also includes $t_c$ which is the number of ms since the epoch as far as the compute server is concerned.   When the project receives the message, it computes its own time $t_p$.  If  $|t_c - t_p|$ is small, e.g., less than maybe 3 seconds, we just assume the clocks are properly sync'd and do nothing different.  Otherwise, we assume the clock on $t_c$ is wrong.  Instead of trying to fix it, we just shift all timestamps _provided by the compute server_  by adding $\delta = t_p - t_c$ to them.  Also, when sending timestamps computed on the project to the compute server, we subtract $\delta$ from them.  In this way everything should work and the compute server should be none the wiser.

Except that all the files in the tarballs have the wrong timestamps, so we would have to adjust the mtimes of all these files.  And of course all the lower layer filesystem timestamps are just going to be wrong no matter what.  This is not something that can reasonably be done.  

OK, so our protocol instead is that if the time is off by at least 10s \(say\), then instead of doing sync, the project responds with an error message.  This can then be surfaced to the user.

## Notes

- mtime versus ctime.  We do not use ctime at all. We do use mtime, but it is used to decide in which direction to sync files when there is a conflict.  It is NOT used as a threshold for whether or not to copy files at all.  E.g., if you have an old file `a.c` and type `cp -a a.c a2.c` on the compute server, then `a2.c` does still get copied back to the project.

- mtime versus ctime, part 2: To quote the internet: "You cannot change the ctime by ordinary means. This is by design: the ctime is always updated to the current when you change any of the file's metadata, and there is no way to impose a different ctime." -- https://unix.stackexchange.com/questions/36021/how-can-i-change-change-date-of-file/36105#36105

