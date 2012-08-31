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

   * Tornado -- http://www.tornadoweb.org/; Apache license 2.0
   * SQLite -- http://www.sqlite.org/; public domain (used by Python)
   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually
   * paramiko -- http://www.lag.net/paramiko/; ssh2 implementation in python

Javascript/CSS/HTML
-------------------

   * jQuery, jQuery-ui, jQuery-mobile -- http://jquery.org/; MIT license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * SockJS

Database
--------

   * PostgreSQL -- http://postgresql.org/; MIT license
   * psycopg2 (postgreSQL Python bindings) -- http://pypi.python.org/pypi/psycopg2/
   * Tornado + postgresql -- https://gist.github.com/861193 ?

Used as a separate process (no library linking)
-----------------------------------------------

   * tinc -- VPN software -- http://www.tinc-vpn.org/; GPL v2+; 
   * Git -- http://git-scm.com/; GPL v2
   * Sage -- http://sagemath.org/; GPL v3+;  this is linked by sage_server.py, which thus must be GPL'd
  

ARCHITECTURE
------------

  * VPN -- use tinc to connect all computers at all sites into one
            unified network address space with secure communication,
            no single points of failure, and fast communication
            between nodes on the same subnet.
  * Browers -- Javascript client library that runs in web browser
  * HAProxy load balancer 
  * PostgreSQL database
  * Memcached server -- to cache results, database access, etc.
  * Sage server -- forking SSL socket server + Sage + JSON
  * Tornado server -- HTTPS SockJS server; connect to sage server
  * Nginx static HTTP server
  * Log watchers -- lightweight process; periodically moves contents of logfiles to database


Diagram
-------
<pre>
   Client    Client    Client   Client   Client  Client
     /|\
      |
   https1.1 (websocket)
      |
      |
     \|/ https://sagews.com
 HAProxy Load Balancers                      
 /|\       /|\      /|\      /|\
  |         |        |        |                                                    (Backups)
  |https1.1 |        |        |                                     
 \|/       \|/      \|/      \|/                                      Memcached
Tornado  Tornado  Tornado  Tornado    <--------------------------->   PostgreSQL   (+Slave PostgreSQL)
           /|\      /|\                                                  /|\
            |        |        ------------------------------------------> |
   ---------|        |        |                                          \|/
   |                 |-----------------------------------------------> Log Processes
   |                          |
  \|/                        \|/
 SageServer   SageServer  SageServer   SageServer


     Dropbox     GoogleDrive       (User-published content)
</pre>