Salvus
======

Website
-------

   * [salv.us](https://salv.us)

Author
------

   * William Stein, University of Washington

Copyright
---------

   * This code is *not* released under any license; in particular,
     this codebase is not "open source".

   * Copyright, University of Washington.

   * All dependencies are open source.
   * Every dependency of the core of Salvus itself is licensed under
     BSD, Apache, MIT, or a similar non-viral license -- absolutely no
     GPL, LGPL, AGPL, etc.
   * However various things that communicate over the network with the
     core, sit on the edge, may be GPL'd, e.g., Stunnel, Sage, etc.

Dependencies
------------

Python
------

   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually
   * paramiko -- http://www.lag.net/paramiko/; ssh2 implementation in python
   * cql -- interface to Cassandra database

Javascript/CSS/HTML
-------------------

   * jQuery, jQuery-ui -- http://jquery.org/; MIT license
   * twitter bootstrap -- apache license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * SockJS
   * and many, many more!

NodeJS
------
   * Dozens of modules; see build.py

Database
--------
   * Cassandra -- apache licensed

Used as a separate process (no library linking)
-----------------------------------------------
   * tinc -- VPN software -- http://www.tinc-vpn.org/; GPL v2+;
   * Git -- http://git-scm.com/; GPL v2
   * Sage -- http://sagemath.org/; GPL v3+;  this is linked by sage_server.py, which thus must be GPL'd


ARCHITECTURE
------------
  * VPN           :    tinc, connects all computers at all sites into one unified network address space with secure communication
  * SSL           :    stunnel
  * Client        : javascript client library that runs in web browser
  * Load balancer : haproxy
  * Database      : Cassandra -- distributed, NoSQL, fault tolerant; this is the *only* longterm non-stateless part of the system
  * Compute       : VM's running some TCP servers (e.g., sage, console, projects, python3, R, etc.)
  * Hub           : written in Node; Sock.js server; connects with *everything* -- compute servers, Cassandra DB, other hubs, and clients.
  * HTTP server   : nginx
  * Log           :  (?) lightweight process; periodically moves contents of logfiles to database
  * Admin         : python program that uses paramiko to start/stop everything
  * Private Cloud : (mostly) kvm virtual machines in various places


Diagram
-------
<pre>
   Client    Client    Client   Client  ...
     /|\
      |
   https://salv.us (stunnel, sock.js)
      |
      |
     \|/
 HAProxy load balancers ........                      Admin     (monitor and control system)
 /|\       /|\      /|\      /|\
  |         |        |        |
  |http1.1  |        |        |
  |         |        |        |
 \|/       \|/      \|/      \|/
 Hub<----> Hub<---->Hub<---> Hub  <----------->   Cassandra <--> Cassandra  <--> Cassandra ...
           /|\      /|\      /|\
            |        |        |
   ---------|        |        | (tcp)
   |                 |        |
   |                 |        |
  \|/               \|/       \|/
 Compute          Compute  Compute   Compute ...

</pre>