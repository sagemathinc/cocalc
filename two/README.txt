Sage Workspaces
---------------

AUTHOR:

   * William Stein

LICENSE/COPYRIGHT: 

   * This code is *not* released under any license; in particular,
     this codebase is not "open source".

   * One file -- backend.py -- may have to be GPL'd because it uses
     code from the Sage library.

   * My intention is to assign the copyright of this source code to
     the University of Washington during Summer 2012.

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

Other:

   * SQLite -- http://www.sqlite.org/; public domain
   * Git -- http://git-scm.com/; GPL v2
   * Sage -- http://sagemath.org/; GPL v3+

Architecture
------------

Component Diagram:

  ...             [Frontend (slave/backup)]
  ...   
[Client]             [Frontend]
[Client] <--HTTP---> [Frontend] <--HTTP--> [Backend]
  /|\                           <--HTTP--> [Backend]
   |                                          ...
   ------------------socket.io-----------> [Backend] <----UD socket----> [Worker]

1 million            n frontends             1000                          100
                 many backups of frontend        
(internet)         (>1 locations)          (~100 computers                 
                                            at >2 locations)

NOTE: In first implementation, n frontend on one machine, which will
use a SQLite file.  However, in second implementation, switch to mySQL
database, so frontends can be distributed on multiple machines, and
database can be more easily replicated.  (And/or it will run on appengine.)

 10k simultaneous    

   * Frontend (frontend.py) -- 
       - responsible for launching backend servers (e.g., via ssh or
         http daemon on backend machines)
       - HTTP SERVER: implement using tornado
           - user login
           - embeds workspace session in an *iframe* that points to backend -- 
               <div style="position: fixed; width: 100%; height: 100%;">
                 <iframe frameborder="0" noresize="noresize" src="http://localhost:8080?token=xxx" 
                      style="position: absolute; width: 100%; height: 100%;"></iframe></div>
               (a 1-time use authenticated token is sent)
           - /pub: special search-engine-optimized static directory listing of published
             workspaces, which gets updated periodically; linked to from /. 
           - /manage -- see "Frontend Management Client" below.
	   - POST: workspace_id got updated (when) -- message from backend workspace server 
           - POST: workspace_id activated (where -- backend_id)
           - POST: workspace_id de-activated 
       - DATABASE: implement using SQLite+SQLalchemy; later drop-in switch to MySQL
           - USERS: 
                - id
                - timestamp
           - ACCOUNTS:
                - id
                - user_id
                - type: github, google code, facebook, dropbox, google drive, etc.
                - auth token, etc. 
                - timestamp
           - USER PREFERENCES:
                - user_id
                - user name
                - email address
                - theme (json string?)
                - keyboard shortcuts (json string; shift-enter, enter, control-enter, space-enter, etc.)
                - timestamp
           - USER TRACKING:
                - user_id
                - resource   # e.g., 'workspace' visited
                - data1      # workspace_id      
                - data2      # more info about visit
                - timestamp
           - BACKEND WORKSPACE SERVERS: 
	        - id
                - URI
                - username@hostname
                - is_running
                - load_number
                - num_users_connected (cached)
                - num_workspaces_stored (cached)
                - disk_usage
                - disk_available
                - timestamp
           - WORKSPACES:
                - id   (globally unique; not tied to user_id!)
                - title
                - last_change
                - active -- backend_id if active on that backend; otherwise 0
                - timestamp
           - WORKSPACE LOCATIONS:
                - workspace_id
                - backend_id
                - last_sync
                - timestamp
           - PERMISSIONS:
                - workspace_id
                - user_id
		- type: 'owner', 'collab', 'readonly', 'quiz', etc.
                - timestamp
           - PUBLISHED:
                - workspace_id
                - date published
                - commit id
                - main filename
                - timestamp
           - ACCOUNT TYPES:
                - user_id
                - name
                - description
                - how long a workspace can run before killed (in seconds)
                - max UNIX processes it can start at once 
                - max memory it can use
                - max disk space it can use
                - whether all publication must be 100% public
                - max number of users connected to a shared workspace at same time
           - SLAVES:
                - URI
                - authentication info of some kind? 
                - last update
                - timestamp
         - Replication:
           - each row has a timestamp = the current time in seconds since the Epoch (Float)
           - replication is done by querying for all rows with stamp >= some time,
             then importing/updating them into another db. 
           - However, build to easily switch to say MySQL + standard replication
           - Most of it could also run on AppEngine (start backends via a dedicated
             HTTP head control server on cluster). 
           - automatic take-over when a master fails;
             - triggered by DNS pointing to this?
             - frontend starts initiating replication
             - handling requests

   * Desktop Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - Browse through workspaces and select one: 
             - mine + shared (sort by name, recent, last changed, etc.)
             - published
             - full text search of workspaces
        - iFrame to embed view of workspace served directly from backend (or could use cross site mashup, but less well supported)
 
   * Mobile Frontend Client (static/sagews/desktop/frontend.[js,html,css]) -- 
        - Initial login
        - Browse through list of workspaces and select one
        - iFrame to embed view of workspace served directly from backend (or could use cross site mashup, but less well supported)

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
        - HTTP SERVER: implement using tornado
             - serves static/internationalized-templated content for AJAX app
             - POST: create new workspace:
                  - workspace_id
                  - initializer = (tar ball, repo, backend url+token for workspace migration, etc)
                  - title
                  - replication backend_id's 
             - POST: delete workspace
                  - workspace_id
             - POST: download workspace
                  - returns one-time URI to download whole workspace to a zip file
             - POST: status 
                  - returns JSON with load, num_workspaces, num_users_connected
             - GET: /pub/static/workspace_id/changeset/file -- shows static version
             - GET: /pub/live/workspace_id/changeset/file -- activates a session, shows live version
             - POST: update workspace (basically a "PULL request")

        - SOCKET.IO SERVER: uses tornadio2 to serve socket.io for the ajax app
                   (*everything* except the initial download of static content 
                    goes via socket.io for greater efficiency!)
             - get new python process session for a given activated workspace:
                  using tornado's non-blocking socket to talk to 
                  a local Unix Domain socket running a worker in a jail
             - execute/evaluate code, streaming (or not) results using given session
             - SIGINT, SIGKILL to session
             - send message to all (or all other) clients connected to this workspace
             - get list of previous revisions of workspace
             - revert to previous version
                  - saved as a new commit
             - save workspace (commits to git)

        - DATABASE: SQLite+SQLalchemy; entire database is on the order of
             *ONE megabyte*, since workspaces are git repos on disk, and we
             will have only about 1000-10000 workspaces per backend.  
          - tables:
             - WORKSPACES:
                 - id
                 - timestamp of last commit
             - LOCATIONS:
                 - workspace_id
                 - backend_id
                 - timestamp of last update
             - BACKENDS: 
	         - backend_id
                 - URI
                 - necessary authentication info
        - FILESYSTEM: on filesystem directory of workspaces --
             workspaces/
	         workspace_id/
                     .git/
                      workspace/
                          all data for workspace is in here

   * Desktop Backend Client (static/sagews/desktop/backend.[js,html,css]) --
        - Use socket.io javascript client library
        - Use jQuery + Codemirror2 to implement various interactive document viewers
        - User configuration
        - Managing workspace
        - Interactive command line shell
        - Graphical file manager

   * Mobile Backend Client (static/sagews/mobile/backend.[js,html,css]) --
        - Uses the socket.io javascript client library
        - Use jQuery + jQuery-mobile + Codemirror2 to implement interactive document viewers

   * Worker (worker.py: run jailed, started when a workspace is activated) -- 
        - Have one worker process for each activated workspace
        - Use Unix domain sockets to provide a forking server
        - Use LXC lightweight operating system-level jailed virtualization
             - http://lxc.sourceforge.net/
             - http://www.nsnam.org/wiki/index.php/HOWTO_Use_Linux_Containers_to_set_up_virtual_networks
             - Communication with backend is via unix domain sockets
               Might require this patch (?):
                  http://www.mail-archive.com/lxc-devel@lists.sourceforge.net/msg00152.html

   * DOCUMENTS:
     * Supported Types:
       - Bash/Sage/Gap/etc. command line -- name.sagews.cmdline.bash
       - Mathchat -- standard chat window, but with support for math
         typesetting, graphics, and inline sage code; document is log
         of the chat
       - Sage Worksheet -- name.sagews.sws; somewhat similar to
         existing Sage worksheets, but with sections/tree heierarchy
       - Slide Presentation -- name.sagews.pres; maybe based on
         deck.js (http://imakewebthings.com/deck.js/)
       - Mathematica-style notebook -- name.sagews.nb
       - Spreadsheet view -- name.sagews.ss; like an excel spreadsheet
       - MathCad like free-form draggable view -- name.sagews.cad
       - LaTeX -- name.tex; a latex document, but with automated
         support for sagetex, pdf generation, etc.
       - .c/.cpp,.py, etc. -- support common programming languages via editors

     * Implementation: Adding a new type:
       - write desktop and mobile html/js/css files and put in
         static/sagews/[mobile|desktop]/doctypes
       - API:
          - read-only display document (in a given div)
          - edit document (in a given div)
          - get document state (for saving to disk)
          - will use message protocol to synchronize members of the session
          

       
       
 
