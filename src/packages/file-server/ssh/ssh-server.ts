/*
Ssh server - manages how projects and their files are accessed via ssh.

This is a service that runs directly on the btrfs file server.  It:

- listens for incoming ssh connections from:
   - project
   - compute server
   - external users

- uses conat to determine what public keys grant access to a user
  of the above type

- if user is valid, it creates container (if necessary) and connects
  them to it via ssh.

*/



