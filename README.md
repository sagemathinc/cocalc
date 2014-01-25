SageMathCloud (SMC)
===================

Website
-------

   * [cloud.sagemath.com](https://cloud.sagemath.com)

Author
------

   * William Stein, University of Washington -- Coding and Design
   * Harald Schilly, Vienna, Austria -- Marketing and QA
   * Keith Clawson -- Infrastructure

Copyright
---------

   * This code is *not* released under any license; in particular,
     the entire codebase is not "open source".  Some selected
     parts of it have been released under open source licenses though.

   * Copyright, William Stein, University of Washington.

   * All dependencies are open source.

   * Every library dependency of the *core* of SMC is licensed under
     BSD, Apache, MIT, or a similar non-viral license -- absolutely no
     GPL, LGPL, AGPL, etc.

   * However various things that communicate over the network with the
     core may be GPL'd, e.g., Stunnel, Sage, etc.

Dependencies
------------

Python
------

   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually
   * paramiko -- http://www.lag.net/paramiko/; ssh2 implementation in python
   * cql -- interface to Cassandra database

Javascript/CSS/HTML
-------------------

   * CoffeeScript -- all our Javascript is written using CoffeeScript
   * jQuery, jQuery-ui -- http://jquery.org/; MIT license
   * twitter bootstrap -- apache license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * SockJS
   * and many, many more!

NodeJS
------
   * Many, many npm modules; see build.py

Database
--------
   * Cassandra -- Apache licensed

There are some GPL'd componenents of the overall system, but
each runs as a separate process, not linking as a library into
the new SMC codebase.
--------------------------------------------------------------

   * Linux -- SMC is only designed to be run on Linux (GPL v2)
   * tinc  -- VPN software; http://www.tinc-vpn.org/; GPL v2+
   * Git   -- http://git-scm.com/; GPL v2
   * Sage  -- http://sagemath.org/; GPL v3+; this is linked by sage_server.py, which thus must be GPL'd
   * ZFS   -- filesystem; CDL license

ARCHITECTURE
------------
  * VPN          -- tinc; P2P vpn; connects all computers at all sites into one
                    unified network address space with secure communication
  * SSL          -- stunnel
  * Client       -- javascript client library that runs in web browser
  * Load balancer-- HAproxy
  * Database     -- Cassandra; distributed, NoSQL, fault tolerant, P2P
  * Compute      -- VM's running TCP servers (e.g., sage, console, projects,
                    python3, R, etc.); stores all project data using ZFS.
  * Hub          -- written in Node.js; Sock.js server; connects with *everything* --
                    compute servers, Cassandra DB, other hubs, and clients.
  * HTTP server  -- Nginx static http server
  * admin        -- Python program that uses paramiko to start/stop everything
  * Private Cloud-- (mostly) kvm virtual machines in various places
  * Public Cloud -- Google Compute Engine

Architectural Diagram
---------------------
<pre>

   Client    Client    Client   Client  ...
     /|\
      |
   https://cloud.sagemath.com (stunnel, sock.js)
      |
      |
     \|/
 HAproxy (load balancing...)HAproxy                  Admin     (monitor and control system)
 /|\       /|\      /|\      /|\
  |         |        |        |
  |http1.1  |        |        |
  |         |        |        |
 \|/       \|/      \|/      \|/
 Hub<----> Hub<---->Hub<---> Hub  <-----------> Cassandra <--> Cassandra  <--> Cassandra ...
           /|\      /|\      /|\
            |        |        |
   ---------|        |        | (tcp)
   |                 |        |
   |                 |        |
  \|/               \|/      \|/
 Compute<-------->Compute<-->Compute <--- ZFS replication (over ssh) --->  Compute ...
  ZFS snapshots

</pre>





