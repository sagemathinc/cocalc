TODO

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

