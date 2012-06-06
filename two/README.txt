Sage Workspaces
---------------

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

Component Diagram:

  ...             [Frontend (backup)]
  ...   
[Client]
[Client] <--HTTP---> [Frontend] <--HTTP--> [Backend]
  /|\                           <--HTTP--> [Backend]
   |                                          ...
   ------------------socket.io-----------> [Backend] <----UD socket----> [Worker]

1 million           >1 frontends             1000                          100
 
(internet)         (>1 locations)          (~100 computers                 
                                            at >2 locations)


   * Frontend (frontend.py, frontend_model.py) -- 
       - implemented using tornado
       - one is the master, and points to one replication slave, which
         in turn can (and should) point to additional replication
         slaves.  This way replication to n slaves doesn't slow down 
         the master any more than replication to 1 slave. 
       - tables:
           - users: 
                user_id, oauth stuff (?), account type, usage summary
                backend_id's with datestamps that store everything else (e.g., workspaces) for this user
           - backends: 
	        URI, username@hostname, running?, load info
           - published documents
                user_id, document location
       - frontend is responsible for user login
       - frontend is responsible for starting backends
       - frontend embeds the user's session in an *iframe* that points to backend -- 
           <div style="position: fixed; width: 100%; height: 100%;">
              <iframe frameborder="0" noresize="noresize" src="http://localhost:8080?token=xxx" 
                      style="position: absolute; width: 100%; height: 100%;"></iframe></div>
         (a 1-time use authenticated token is sent)

   * Desktop Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - iFrame to embed view of backend
 
   * Mobile Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - iFrame to embed view of backend

   * Frontend Management Client (static/sagews/desktop/manage.[js,html,css]) -- 
        - Implemented as part of frontend.py tornado server
        - Users:
            - Browse list of users + info about each
            - Change account type of a user
        - Backends:
            - Browse backends + info about each:
                 - which users are stored there
                 - health
                 - utilization
                 - credentials (username@hostname, ssh keys, etc.)                 
            - Add a bunch of backends
        - Frontend replication:
            - status
            - configuration

   * Backend (backend.py; one for each core running on each compute machine) --
        - implement using the tornado web server
        - serves static/templated content for ajax app
        - uses tornadio2 to serve socket.io for the ajax app
          (*everything* except the initial download of static content 
           goes via socket.io for greater efficiency!)
        - database:
             - user_id, extensive metainformation about user
             - workspaces, with metainformation about each
             - list of other backends that replicate data for this user_id
        - directory on filesystem of workspaces:
             workspaces/
                    user_id/
                       workspace_id/
                          .git/
                          workspace   
        - talks using tornado's non-blocking socket to a local Unix Domain
          socket running a worker.
        - the other end of the UD socket is the worker describe below
        - can report usage/load statistics to frontend
        - use rsync to replicate a user_id/ to several other nodes
        - HTTP: receive updates workspace for a given user from another backend (POST git changesets)
        - HTTP: send updated version of workspace to another backend (POST git changesets)

   * Desktop Backend Client (static/sagews/desktop/backend.[js,html,css]) --
        - Use socket.io javascript client library
        - Use jQuery + Codemirror2 to implement various interactive document viewers
        - User configuration
        - Managing workspace
        - Interactive command line shell

   * Mobile Backend Client (static/sagews/mobile/backend.[js,html,css]) --
        - Uses the socket.io javascript client library
        - Use jQuery + jQuery-mobile + Codemirror2 to implement interactive document viewers

   * Worker (worker.py: run jailed in some way, on each computer machine) -- 
        - Use Unix domain sockets to provide a forking server
        - Use some form of Operating system-level virtualization, probably LXC:
             http://en.wikipedia.org/wiki/Operating_system-level_virtualization#Implementations               
        - Communication with backend is via unix domain sockets
             May require this patch:
                  http://www.mail-archive.com/lxc-devel@lists.sourceforge.net/msg00152.html


 
Document Types
--------------

Phase 1
  
   * Command line

   * Worksheet -- somewhat similar to existing Sage worksheets, but with heierarchy.

   * Presentation -- maybe based on deck.js (http://imakewebthings.com/deck.js/)
 
   * Bash shell

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



