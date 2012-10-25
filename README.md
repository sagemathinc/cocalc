Salvus
======

Website
-------

   * [salvusmath.com](http://salvusmath.com)

Author
------

   * William Stein

Copyright
---------

   * This code is *not* released under any license; in particular,
     this codebase is not "open source".

   * My intention is to assign the copyright of this source code to
     the University of Washington during Summer 2012.

   * Dependencies are open source.

Dependencies
------------

Python
------

   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually
   * paramiko -- http://www.lag.net/paramiko/; ssh2 implementation in python

Javascript/CSS/HTML
-------------------

   * jQuery, jQuery-ui -- http://jquery.org/; MIT license
   * twitter bootstrap -- apache license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * SockJS

NodeJS
------
   * ?

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

  * VPN -- use tinc to connect all computers at all sites into one
           unified network address space with secure communication, no
           single points of failure, and fast communication between
           nodes on the same subnet.
  * SSL -- stunnel
  * Browers -- Javascript client library that runs in web browser
  * HAProxy load balancer 
  * Cassandra database
  * Sage server -- forking socket server running as part of SAGE
  * Hub -- written in NodeJS; SockJS server; connects with Sage server, Cassandra DB, other hubs, and user clients
  * Static HTTP server -- Nginx 
  * Log watchers -- lightweight process; periodically moves contents of logfiles to database


Diagram
-------
<pre>
   Client    Client    Client   Client   Client  Client
     /|\
      |
   https://salv.us (stunnel)    sockjs
      | 
      |    
     \|/ 
 HAProxy Load Balancers ........                                Control       Control     (monitor and control system)
 /|\       /|\      /|\      /|\
  |         |        |        |                                                
  |http1.1  |        |        |                                     
  |         |        |        |
 \|/       \|/      \|/      \|/                                      
 Hub<----> Hub<---->Hub<---> Hub  <--------------------------->   Cassandra <--> Cassandra  <--> Cassandra ...
           /|\      /|\      /|\                                         
            |        |        |
   ---------|        |        | tcp
   |                 |        |
   |                 |        |
  \|/               \|/       \|/
 SageServer   SageServer  SageServer   SageServer ...

</pre>