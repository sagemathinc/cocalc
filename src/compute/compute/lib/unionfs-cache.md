This is a VERY MUCH ONLINE SYNC PROTOCOL, which would happen frequently \(several times per minute\) for every single connected client, and we would have at most a handful of clients at once.

Periodically the project does the following:

last = last time we did a sync with the project

cur = time sync starts

1. Sync Deletes from Computer Server to Project: compute server makes a list of _all_ files we deleted since last, which is exactly the whiteout files, sends it to project, and project deletes those files. Compute server then deletes those whiteouts. **message: delete these files**
2. Sync Deletes from Project to Compute Server: compute server makes a list of _all_ files in our upper layer since last, sends it over, and gets back a list of files in that list that are not in the project. Compute server then deletes them from the upper layer. **message: which of these files need to be deleted?** We have to do this, since the project filsystem CANNOT
3. Sync Writes from Compute Server to Project: compute server makes a tarball containing all files in our upper layer that changed since last, writing it to the websocketfs mount point. Compute server sends message over websocketfs to project saying "extract and delete this tarball". Project does that and deletes tarball. **message: write these files.**

   (3f631e9c7106) /tmp/upper$ mkdir -p /tmp/lower/.compute-server/3 && touch /tmp/upper/.unionfs-fuse/cur && find . -type f \( ! -regex '._/\.._' \) -newer /tmp/upper/.unionfs-fuse/last | tar -cJvf /tmp/lower/.compute-server/3/sync.tar.xz --files-from=- && mv /tmp/upper/.unionfs-fuse/cur /tmp/upper/.unionfs-fuse/last

   (3f631e9c7106) /tmp/upper$ mkdir -p /tmp/lower/.compute-server/3 && time find . -type f \( ! -regex '._/\.._' \) > /tmp/lower/.compute-server/3/files

4. Sync Writes from Project to Compute Server: compute server tells project: please make a tarball of all files that have changed in project since last and tell me the path to this. compute server then extracts that tarball and deletes it. **message: give me the files that you wrote since last.** Question: How can we restrict only to files in a given list.
5. Compute server sets last to cur.

Hope: After 1\-4 happen and assuming files were in sync at timestamp "last", and if NO FILES changed at all on either side during the process, then the unionfs in the compute server will equal the project files system. Is that true?

Yes, since the following fiv sets of files are equal on both sides:

- ones deleted on compute server
- ones deleted in project
- ones written to in compute server
- ones written to in project

Also, if a file is written in both compute server and project, then project takes precedence, because we do 4 after 3.

Also the write tarballs exclude anything deleted on either side since we do the delete sync first. So the delete sets are the same.

The above could be four messages in websocketfs. Or they could just be implemented via the project websocket api and have nothing to do with websocketfs. An advantage of the latter, is maybe we could use this unchanged on top of sshfs of nfs at some point someday.
