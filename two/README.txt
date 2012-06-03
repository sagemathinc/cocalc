Sage Workspaces 0.2
-------------------

AUTHOR:

   * William Stein

LICENSE/COPYRIGHT: 

   * This code is *not* released under any license; in particular,
     this codebase is not "open source".

   * One file -- backend.py -- may have to be GPL'd because it uses
     code from the Sage library.

Dependencies
------------

Python:

   * Tornado -- http://www.tornadoweb.org/; Apache license 2.0
   * Tornadio2 -- https://github.com/mrjoes/tornadio2; Apache license 2.0
   * SQLalchemy -- http://www.sqlalchemy.org/; MIT license
   * simplejson -- http://pypi.python.org/pypi/simplejson/; MIT license

Javascript/CSS/HTML:

   * jQuery, jQuery-ui, jQuery-mobile -- http://jquery.org/; MIT license
   * socket.io-client -- https://github.com/LearnBoost/socket.io-client; MIT license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license

Architecture
------------

   * Frontend (frontend.py, frontend_model.py) -- user management, and
     longterm storage of data associated to workspaces.  This is
     implemented using Tornado and can be run deployed on AppEngine or
     run as a standard Tornado application that uses SQLalchemy (on
     SQLite for testing and MySQL or something for deployment) for the
     data store.  This app it serves is an AJAX application that will
     serve only one page and use Javascript for all page changes (to
     be mobile friendly, etc.).  

   * Backend (backend.py; one running on each compute machine) -- this
     is a tornado server that:
        - serves static/templated content for ajax app
        - uses tornadio2 to serve socket.io for the ajax app
          (*everything* except the initial download of static content 
           goes via socket.io for greater efficiency!)
        - talks using torando's non-blocking socket to a local UD
          socket running worker.
        - can somehow spawn jailed worker processes 
        - the other end of the UD socket is the worker describe below
        - can report usage/load statistics to frontend

   * Worker (many running on each computer machine) -- a chroot jailed
     (at least for deployment) Python process that talks via a UD
     socket to the backend.

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


Frontend Data Model
-------------------

Table: User
Columns: id, name, passwd_hash

Table: UserSetting
Columns: user_id, prop, value, user

Table: Workspace
Columns: id, name, type, location, content (temporary)

Table: WorkspaceUser
Columns: workspace_id, user_id, type (e.g. 'share', 'owner', 'readonly')

Table: Resource
Columns: id, url, status, status_time, alloc_time, alloc_user_id, alloc_workspace_id



     


Ideas:

  Socket io talk with discussion of pickling sockets (at 26 min): http://www.youtube.com/watch?v=3BYN3ouwkRA


=----------------------------------

I'm considering an alternative architecture:

Architecture
------------

   * Router (router.py) -- frontends register with the router when
     they are turned on. The router redirects incoming users to a
     frontend.

   * Database (database.py) -- responsible for all longterm storage of
     data.   Users, workspaces, etc. 

   * Frontend (frontend.py) -- This is a tornado server that...
      * technically:
        - serves static/templated content for ajax app
        - uses tornadio2 to serve socket.io for the ajax app
          (*everything* except the initial download of static content 
           goes via socket.io for greater efficiency!)
        - talks using torando's non-blocking socket to many chroot
          jailed workers via local unix domain sockets
      * functionally:
        - manages user authentication
        - giving list of worksheets
        - ...

   * Worker (many running on each computer machine) -- a chroot jailed
     (at least for deployment) Python process that talks via a unix
     domain socket to the frontend.

   * Desktop Client (static/sagews/desktop/backend.[js,html,css]) --
     Uses socket.io to talk with Frontend, and uses http to talk a
     little bit with Process (for SIGINT, SIGKILL).  This also uses
     statics/sagews/sagews.js, which provides common low level
     communications functionality.

   * Mobile Client (static/sagews/mobile/backend.[js,html,css]) --
     Client for mobile browsers, which uses jquery-mobile, as is
     otherwise similar to the Desktop Client.  This also uses
     statics/sagews/sagews.js.
   
