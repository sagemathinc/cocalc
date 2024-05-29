/*
Configuration of network mounted shared storage associated to projects.

Initially these will get mounted by all compute servers uniformly (mostly),
and later the project will also mount these via a sidecar.  This may replace
or complement the current "Cloud Storage & Remote Filesystems" in project
settings.

Also initially only the posix filesystem type built on keydb and juicefs
will be implemented.
*/
