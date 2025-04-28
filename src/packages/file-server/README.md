# CoCalcFS -- the Cocalc project file system

We manage the following types of filesystems, which are exported via NFS:

The file server support an unlimited number of namespaces.

There will be a large number of the following filesystems, and they are tracked in a sqlite3 database.  The file server hosts and manages potentially more than one filesystem owned by projects *and* multiple filesystems owned by cocalc accounts , and also by cocalc organizations (not fleshed out).  After rewriting the code, it's basically the same work and just more flexible to support future development.

- **project:** each CoCalc project owns usually exactly one project filesystem, which is its home directory and is named ''. This gets mounted by the Kubernetes pod \(the "home base"\), and ALSO by compute servers. It can either exist in some zpool or be archived as a ZFS replication stream. Projects can also create an unlimited number of other filesystems.

- **user:** a user filesystem is owned by an _account_ \(i.e., a CoCalc user\), not by a project. It may optionally be mounted on any project that the user is a collaborator on. E.g., an instructor could make a user volume, then mount it read\-only on all of their student's projects. Or a user could mount a user volume read\-write on several of their projects. An account can own many user filesystems, each with a name.

- **group:** group of users with one billing contact.  Otherwise same as above.

The name is a unicode string that must be less than 64 characters.

There's also one of these in each pool:

- **archives:** output of zfs replication streams.

In addition, the following are stored in their own separate pool and get mounted read-only via Kubernetes.

- **data:** misc data that is mounted and shared by all projects

- **images:** project images, i.e., sage installs, version of ubuntu, etc.

## ZFS

### Archive

We primarily archive projects in one big directory on the same pool as we
server the projects. The **ONLY** reason for this is because `"zpool import"` is
at least O\(n\) complexity, where n is the number of datasets in the pool,
and the constant in the O isn't great. If we have 4 million projects, we can
only realistically have up to 100K datasets in order to keep "zpool import" times
down to 1-2 minutes. We thus archive the other 3.9 million projects. The time
to dearchive is roughly 3 seconds / GB.

We can of course mirror the contents of the archive to cloud storage for then fall
back to it in order to save space and reduce longterm storage costs, at scale,
if necessary.

archive contents:

- zfs stream with snapshots
- a tarball of the last snapshot of project contents
- dump of the NATS stream and kv for that project.

### NOTE: Units

By default both ZFS and `df -h` use GiB and write it G (e.g., "gibibyte").

```sh
root@prod-42:/cocalcfs/projects/default/00000000-0000-0000-0000-000000000002# zfs set refquota=2147483648 cocalcfs0/default/projects/00000000-0000-0000-0000-000000000002
root@prod-42:/cocalcfs/projects/default/00000000-0000-0000-0000-000000000002# zfs get refquota cocalcfs0/default/projects/00000000-0000-0000-0000-000000000002
NAME                                                             PROPERTY  VALUE     SOURCE
cocalcfs0/default/projects/00000000-0000-0000-0000-000000000002  refquota  2G        local
root@prod-42:/cocalcfs/projects/default/00000000-0000-0000-0000-000000000002# df -h .
Filesystem                                                       Size  Used Avail Use% Mounted on
cocalcfs0/default/projects/00000000-0000-0000-0000-000000000002  2.0G  568M  1.5G  28% /cocalcfs/projects/default/00000000-0000-0000-0000-000000000002
```
