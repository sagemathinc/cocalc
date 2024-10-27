# Sync Server

The project home base @cocalc/project serves synctables to browser clients
and compute servers. Compute servers themselves also server synctables
to browsers, so that browsers can connect directly to compute servers
for reduced latency.

All connections work over WebSockets, and the code here is meant to manage
all of this. It makes sure that there is only one actual synctable with
given defining parameters and so on.

**TODO**