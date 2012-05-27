Sage Workspaces 0.2
-------------------

AUTHOR:

   * William Stein

LICENSE/COPYRIGHT: 

   * This code is *not* released under any license; in particular,
   this codebase is not "open source".

   * One file -- backend.py -- may have to be GPL'd because it uses
   code from the Sage library.



Architecture
------------

   * Frontend (frontend.py) -- user management, and longterm storage
     of all data associated to workspaces.  This is implemented using
     flask and can be run deployed on AppEngine or run as a standard
     flask WSGI application that uses SQLalchemy for the data store.
     This is a full AJAX application that will serve only one page and
     use Javascript for all page changes (to be mobile friendly, etc.).
     This will not use templating. 

   * Backend (backend.py) -- this *is* the Python process the user is
     interacting with, and it is *also* the socket.io server.  This
     design enables tight fast interaction between the client and this
     process.  It's also amazingly flexible and powerful taking this
     approach.  (It's conceivable we may have to change to two
     processes and named pipes, but hopefully not.)

   * ProcessSpawner (process_spawner.py) -- Ensures that a Process is
     running for each contributing user on a contributing VM.  When a
     Process stops for any reason, it starts another.  It can also
     clean up.  This will use setuid in some clever way.
     
   * Process (process.py) -- Spawns, SIGINT's, and SIGKILLS backends,
     all via a web interface (implemented using flask, and served
     using the builtin threaded flask server, since it is doesn't need
     to scale).  There will be exactly one running Process per UNIX
     user on the VM.  The Process will contact the Frontend (via POST)
     and report its existence and availability when it first starts.
     The Frontend may contact this Process later to confirm
     availability, check on load, etc.  (The Process does *not*
     periodically report on its status to Frontend, since that would
     not scale!)

   * Desktop Backend Client (static/sagews/desktop/backend.[js,html,css]) --
     Backend client, which uses socket.io to talk with Backend, and
     uses http to talk a little bit with Process (for SIGINT,
     SIGKILL).   This also uses statics/sagews/backend.js, which 
     provides common low level communications functionality.

   * Mobile Backend Client (static/sagews/mobile/backend.[js,html,css]) --
     Backend client for mobile browsers, which uses jquery-mobile, 
     as is otherwise similar to the Desktop Backend Client.
     This also uses statics/sagews/backend.js.
   
   * Desktop Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
     Frontend client, which uses HTTP/AJAX to talk with Frontend.
     Common low-level functionality is in static/sages/frontend.js.
 
   * Mobile Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
     Frontend client, which uses HTTP/AJAX to talk with Frontend.
     This also uses statics/sagews/frontend.js.
     
 
Document Types
--------------

Phase 1
  
   * Command line

   * Worksheet -- somewhat similar to existing Sage worksheets, but with heierarchy.

   * Presentation -- maybe based on deck.js (http://imakewebthings.com/deck.js/)

Phase 2
  
   * Mathematica-style worksheet
 
   * Matlab-style IDE


   
     


