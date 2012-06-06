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
   * SQLite -- http://www.sqlite.org/; public domain
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

 10k simultaneous    

   * Frontend (frontend.py, frontend_model.py) -- 
       - implemented using tornado
       - database tables
           - USERS: 
                - user_id
                - user name
                - default theme
                - keyboard shortcuts:
                     - shift-enter, enter, control-enter, space-enter, etc.
                - oauth access to their github, google code,
                  facebook, dropbox, google drive, etc. accounts
                - last login
                - datetime

           - BACKENDS: 
	        - backend_id
                - URI
                - username@hostname
                - status (up/down) 
                - load
                - num_users_connected (cached)
                - datetime
           
           - WORKSPACES:
                - workspace_id   (globally unique; not tied to user_id!)
                - owner user_id
                - title
                - theme
                - datetime

           - WORKSPACE LOCATIONS:
                - workspace_id
                - backend_id
                - last_sync
                - datetime

           - SHARED:
                - workspace_id
                - guest user_id
                - datetime

           - PUBLISHED:
                - workspace_id
                - date published
                - datetime

           - SLAVES:
                - URI
                - authentication info of some kind? 
                - last update
                - datetime
           
           - ACCOUNT TYPES:
                - account_type_id
                - name
                - description
                - how long a workspace can run before killed (in seconds)
                - max UNIX processes it can start at once 
                - max memory it can use
                - max disk space it can use
                - whether all publication must be 100% public
                - max number of users connected to a shared workspace at same time

       - database is not huge -- should be at most 1GB even with >1 million users; 
         can use query-based replication + SQLite:
           - each row has a timestamp 
           - replication is done by querying for all rows with stamp >= some time,
             then importing/updating them into another db. 
           - However, build to easily switch to say MySQL + standard replication
           - Most of it could also run on AppEngine (start backends via a dedicated
             HTTP head control server on cluster). 
       - frontend is responsible for user logins
       - frontend embeds the user's session in an *iframe* that points to backend -- 
           <div style="position: fixed; width: 100%; height: 100%;">
              <iframe frameborder="0" noresize="noresize" src="http://localhost:8080?token=xxx" 
                      style="position: absolute; width: 100%; height: 100%;"></iframe></div>
         (a 1-time use authenticated token is sent)
       - browsing directory of published workspaces
       - automatic take-over when a master fails, just means that this
         frontend starts initiating replication; triggered by ?
       - /pub: special search-engine-optimized static directory of published
         workspaces, which gets updated periodically; linked to from /. 
       - frontend is responsible for starting backends

   * Desktop Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - Browse through workspaces and select one: 
             - mine + shared
             - published
        - iFrame to embed view of backend
 
   * Mobile Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - Browse through list of workspaces and select one
        - iFrame to embed view of backend 

   * Frontend Management Client (static/sagews/desktop/manage.[js,html,css]) --  
        - Single-page AJAX application (no mobile version, initially)
        - Implemented as part of frontend.py tornado server
        - Users:
            - Browse list of users + info about each
            - Manually change account type of a users (easy to do a lot at once)
            - Manually move backend that users are allocated to
        - Backends:
            - Browse backends + info about each:
                 - which users are stored there
                 - health
                 - utilization
                 - credentials (username@hostname, ssh keys, etc.)                 
            - Add a bunch of backends
        - Frontend replication information:
            - status
            - configuration
            - changing which is master/slave
        - Published workspaces: 
            - Manually delete
        - Configure parameters for the ACCOUNT TYPE TABLE, and add new account types

   * Backend Workspace Server (backend.py; one for each core running on each compute machine) --
        - implement using the tornado web server
        - serves static/templated content for ajax app
        - uses tornadio2 to serve socket.io for the ajax app
          (*everything* except the initial download of static content 
           goes via socket.io for greater efficiency!)
        - database -- SQLite; entire database is probably a few
          megabytes, since workspaces are git repos on disk, and we
          will have only about 1000-10000 users per backend.
        - messages from frontend:
             - POST: create new workspace:
                  - workspace_id
                  - initializer = (tar ball, repo, backend url+token for workspace migration, etc)
                  - title
                  - replication backend_id's 
             - POST: delete workspace:
                  - workspace_id
             - POST: download workspace:
                  - returns one-time URI to download whole workspace to a zip file
             - POST: status 
                  - returns JSON with load, num_workspaces, num_users_connected
        - database tables:
             - WORKSPACES:
                 - workspace_id
                 - datetime of last commit
             - WORKSPACE LOCATIONS:
                 - workspace_id
                 - backend_id
                 - datetime of last update
            - BACKENDS: 
	         - backend_id
                 - URI
                 - necessary authentication info
        - on filesystem directory of workspaces:
             workspaces/
	         workspace_id/
                     .git/
                      workspace/
                          all data for workspace is in here
        - browse list of previous versions of workspace
        - revert to any previous version
             - saved as a new commit
        - save workspace (commits to git)
        - fast read-only browse of current state of workspace files
        - talks using tornado's non-blocking socket to a local Unix Domain
          socket running a worker.
        - the other end of the UD socket is the worker describe below
        - messages from other backend:
             - update workspace (basically handle a "PULL request")
        - message to other backend:
             - PULL from me

   * Desktop Backend Client (static/sagews/desktop/backend.[js,html,css]) --
        - Use socket.io javascript client library
        - Use jQuery + Codemirror2 to implement various interactive document viewers
        - User configuration
        - Managing workspace
        - Interactive command line shell
        - Directory browser

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



