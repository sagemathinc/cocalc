# Project Connection

The Node.js "hub" servers are able to establish a TCP connection to any running project.  The code in this directory creates and manages that connection.

## What is this used for?

This connection is used by hubs to implement a couple of things for projects (e.g., reading and writing a text file).

This connection is used much more by the projects to send and share state.  For example, projects can persist data from collaborative editing sessions and directory listings to the central PostgreSQL database via this connection.

## How do is it work?

There is a long random token associated to each project, which is stored in the database (or the filesystem).  When a hub connects to a project via TCP, it must first send this token before any further communication is allowed.   

For security reasons, the TCP connection is _**always**_ initiated from a hub to the project, and there can be several distinct hubs connected to the same project at once.  

The project often wants to send information to the hub.  If no hubs are connected to it, then that project must sit and wait for a connection.  This is for security reasons, since in some contexts we do not allow the project to create any outgoing network connections at all.  Or, even if we do, the outgoing network connections are only to the external Internet, and not to anything within our cluster (except the internal ssh gateway "ssh" and http server "cocalc", which have clear security constraints).  This is just a basic firewall security requirement for "defense in depth".

