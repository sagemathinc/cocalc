# Caching on top of a slow network mounted filesystem for CoCalc Compute Servers

## Motivation

This is a local caching filesystem on top of any slow network mounted filesystem, e.g., websocketfs or sshfs, using unionfs\-fuse's copy on write capabilities, tar, etc.  I have some proof of concept via copying and pasting around various shell commands. The idea is that this solves some massive speed and other problems, that just _**have to be solved**_ to make using compute servers seamless. In particular, one naturally does things like:

- install some packages using pip into ~/.local \(which might not be compatible with the project\) \-\- this needs to be fast and also not actually touch the ~/.local of your project
- download several GB of data as a bunch of little files, read it many times when doing training, and this needs to be local disk fast;
- compile cuda code \(with nvcc\), which involves creating \(and immediately deleting\) hundreds of local files, and you want this to take 2 seconds, not 45 seconds \(!\). With websocketfs or sshfs it's ~30s to 1 minute for a trivial program, due to latency.
- have a directory such as ~/scratch that is in your home directory on each compute server, not synced, can be GB in size, and is a fast local SSD.
- do `git clone ...` and copy a git repo with thousands of files, then work with it quickly \(e.g., cocalc source code\).

I think I have a way to do all of this by combining websocketfs and unionfs\-fuse with a syncing protocol, and I think it's really critical. Otherwise, we end up with complicated awkward instructions and lots of things feeling impossibly slow and broken, and we're not providing any real value added over GCP \(or any other cloud\). This is a detour from just finishing what I have, but based on trying out some CUDA, etc., tutorials recently, I think without something like this, compute\-servers won't be a success. There are filesystems like this using NFSv4 and block devices, but there doesn't seem to be anything anybody has ever done using FUSE \(or everything was abandoned many years ago\), since it's hard to generically.

## Sync Protocol

This is _**VERY MUCH AN ONLINE SYNC PROTOCOL**_, which would happen frequently \(several times per minute\) for every single connected client, and we assume we have at most a handful of clients at once.

Periodically the project does the following:

last = last time we did a sync with the project

cur = time sync starts

1. **Sync Deletes from Computer Server to Project:** compute server makes a list of _all_ files we deleted since last, which is exactly the whiteout files, sends it to project, and project deletes those files. Compute server then deletes those whiteouts. **message: delete these files**

2. **Sync Deletes from Project to Compute Server:** compute server makes a list of _all_ files in our upper layer since last, sends it over, and gets back a list of files in that list that are not in the project. Compute server then deletes them from the upper layer. **message: which of these files need to be deleted?** We have to do this, since the project filsystem CANNOT

3. **Sync Writes from Compute Server to Project:** compute server makes a tarball containing all files in our upper layer that changed since last, writing it to the websocketfs mount point. Compute server sends message over websocketfs to project saying "extract and delete this tarball". Project does that and deletes tarball. **message: write these files.**
   ```sh
   cd /tmp/upper$ 

   mkdir -p /tmp/lower/.compute-server/3 && touch /tmp/upper/.unionfs-fuse/cur && find . -type f ( ! -regex './..' ) -newer /tmp/upper/.unionfs-fuse/last | tar -cJvf /tmp/lower/.compute-server/3/sync.tar.xz --files-from=- && mv /tmp/upper/.unionfs-fuse/cur /tmp/upper/.unionfs-fuse/last


   mkdir -p /tmp/lower/.compute-server/3 && time find . -type f ( ! -regex './..' ) > /tmp/lower/.compute-server/3/files
   ```

4. **Sync Writes from Project to Compute Server:** compute server tells project: please make a tarball of all files that have changed in project since last and tell me the path to this. compute server then extracts that tarball and deletes it. **message: give me the files that you wrote since last.** Question: How can we restrict only to files in a given list.

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

