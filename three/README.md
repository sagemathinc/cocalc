Sage Workspaces
===============

Author
------

   * William Stein

Copyright
---------

   * This code is *not* released under any license; in particular,
     this codebase is not "open source".

   * My intention is to assign the copyright of this source code to
     the University of Washington during Summer 2012.

   * All dependencies are under very permissive licenses.


Dependencies
------------

Python
------

   * Tornado -- http://www.tornadoweb.org/; Apache license 2.0
   * SQLite -- http://www.sqlite.org/; public domain (used by Python)
   * python-memcached -- http://pypi.python.org/pypi/python-memcached/; Python license
   * SQLalchemy -- http://www.sqlalchemy.org/; MIT license
   * psycopg -- to use postgreSQL from sqlalchemy

easy_install tornado sockjs-tornado python-memcached sqlalchemy psycopg2 momoko

   * python-daemon -- http://pypi.python.org/pypi/python-daemon/; Python license, and will go into Python eventually

Javascript/CSS/HTML
-------------------

   * jQuery, jQuery-ui, jQuery-mobile -- http://jquery.org/; MIT license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license
   * SockJS

Library dependency
------------------

   * memcached -- http://memcached.org/; 3-clause BSD


Used as a separate process (no library linking)
-----------------------------------------------

   * Git -- http://git-scm.com/; GPL v2
   * Sage -- http://sagemath.org/; GPL v3+
  
Database
--------

   * PostgreSQL -- http://postgresql.org/; MIT license
   * psycopg2 (postgreSQL Python bindings) -- http://pypi.python.org/pypi/psycopg2/
   * Tornado + postgresql -- https://gist.github.com/861193 ?


ARCHITECTURE
------------

  * Client -- Javascript library that runs in any modern web browser
     - Write very simple ugly version that is fully functional.

  * Load Balancer -- HAProxy
     - Learn how to deploy it and write config script.
     - Example config script on some SockJS site.

  * Database -- PostgreSQL + SQLalchemy + Memcached + SSL
     - Assemble SQLalchemy schema by combining what is current
       frontend and backend schema, plus actually store github bundle.

  * Worker -- forking SSL socket server + Sage + JSON
     - Rewrite pulling code from backend.py in order to make this
       into a single integrated component with a straightforward API.

  * Backend -- HTTPS SockJS server; "create workspace" into DB queries; connect to worker
     - Rewrite what I have to use SockJS (remove socket.io)

  * Static HTTP server -- simple nginx (no ssl)
     - Configuration so my static/ directory served using nginx.
     - Ability to serve static/ content created via statically publishing workspaces

  * Log server -- SSL socket server + database writer + Python logging
     - update to use PostgreSQL database


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
 Load Balancer                        [+Failover Load Balancer(s)]    (HAProxy)  
 /|\       /|\      /|\      /|\
  |         |        |        |                                                   [Offsite Backups]
  |https1.1 |        |        |                                     
 \|/       \|/      \|/      \|/                                    [Memcached] 
Backend  Backend  Backend  Backend    <--------------------------->  [Database]   [+Slave DB Server(s)]
           /|\      /|\                                                  /|\
            |        |        ------------------------------------------> |
   ---------|        |        |                                          \|/
   |                 |----------------------------------------------->  [Log]     [+Failover Log Server(s)]
   |                          |
  \|/                        \|/
Worker   Worker    Worker   Worker
</pre>