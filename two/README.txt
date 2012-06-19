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


** Implementation Axioms **
--------------------------

  1. Absolutely no polling: everything must be event driven.
  2. Resources (RAM, time, etc.) should be explicitly (and arbitrarily) limited.
  3. Independent daemons, not a controlled subprocess.


Dependencies
------------

Python:

   * Tornado -- http://www.tornadoweb.org/; Apache license 2.0
   * Tornadio2 -- https://github.com/mrjoes/tornadio2; Apache license 2.0
   * SQLalchemy -- http://www.sqlalchemy.org/; MIT license
   * requests (but I want to remove it, because it kind of sucks)
   * SQLite -- http://www.sqlite.org/; public domain (used by Python)
   * python-memcached -- http://pypi.python.org/pypi/python-memcached/; Python license

Javascript/CSS/HTML:

   * jQuery, jQuery-ui, jQuery-mobile -- http://jquery.org/; MIT license
   * socket.io-client -- https://github.com/LearnBoost/socket.io-client; MIT license
   * codemirror2 -- http://codemirror.net/; basically MIT license
   * jquery activity indicator -- MIT license

Used as a separate process (no library linking):
   * Git -- http://git-scm.com/; GPL v2
   * Sage -- http://sagemath.org/; GPL v3+
  
Library dependency:
   * memcached -- http://memcached.org/; looks like 3-clause BSD

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

 10k simultaneous ?

MINIMAL TEST SYSTEM requires 6 VM's:
   * 2 frontends 
   * 2 backends
   * 2 workers

COMPONENT DETAILS:

   * Frontend (frontend.py) -- 
       - How Virtual Machine is configured (Virtual Box):
            - Install ubuntu 12.04 in Ubuntu VM with a single 4.66B fixed size disk with 4 cores and extra host-only network adapter
            - Manually partition it (to avoid swap) with one / partition.
            - Create admin user named "sagews". 
            - apt-get remove libreoffice* thunderbird
	    - apt-get update
            - apt-get install git emacs iotop python-mode screen ecryptfs-utils python-virtualenv python-dev sqlite3
                 (python-dev -- so Python.h is installed)
            - apt-get upgrade 
            - upgrade kernel: 
                 apt-get install linux-generic linux-headers-generic linux-image-generic
                 apt-get remove linux-headers-3.2.0-23 linux-image-3.2.0-23
            - apt-get clean # clean cache
            - encrypt /home folder (since we will have sensitive database
              and ssh keys, and don't want somebody who gets the vdi file
              to be able to trivially access it all -- same goes for backend):
                  - didn't do this when installing, since it didn't work.
                  - here's what I did, after ensuring that ecryptfs-utils was installed (above)
                       1. Temporarily enable root login
                             sudo -i
                             sudo passwd root
                       2. Stop display manager:
                                 /etc/init.d/lightdm stop
                       3. Encrypt:
                              ecryptfs-migrate-home -u sagews
As sagews user:
                              ecryptfs-unwrap-passphrase  
                              # outputs this: 26d39a6147546fca3af413ebd04ec786
                       4. Disable root:
                              sudo passwd -dl root
            - ssh-keygen -b 2048 (temporarily add this key to github -- remove in production!)
            - install dependencies of sagews into a virtualenv:
                   - setup the virtual environment:
                         virtualenv env
                         chmod og-rwx -R env                         
                   - put that in the front of the PATH by adding this to the end of .bashrc:
                         export PATH=$HOME/env/bin/:$PATH
                         source ~/.bashrc
                   - install sagews dependencies (and ipython for ease of use):
                         easy_install tornado tornadio2 sqlalchemy requests ipython
                   - install sagews:
		         git clone git@github.com:williamstein/sagews.git   
            - lock permissions down better, just in case:
                   chmod -R og-rwx sagews
            - install guest additions
            - static internal IP address:
                   Configure networking (in GUI) --> Wired connection 2 --> IPv4 Settings
                     Address = 192.168.56.150     (say)
                     Netmask = 255.255.255.0
                     Gateway = 0.0.0.0 
                     Leave everything else blank

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
           - USER: 
                - id
                - timestamp
           - ACCOUNT:
                - id
                - user_id
                - type: github, google code, facebook, dropbox, google drive, etc.
                - auth token, etc. 
                - timestamp
           - USER PREFERENCE:
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
           - BACKEND:
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
                - workers -- backref = list of WORKER objects
           - WORKSPACE:
                - id   (globally unique; not tied to user_id!)
                - title
                - last_change
                - active -- backend_id if active on that backend; otherwise 0
                - timestamp
           - WORKSPACE LOCATION:
                - workspace_id
                - backend_id
                - last_sync
                - timestamp
           - WORKER:
                - id (globally unique)
                - username
                - hostname
                - disk_quota (in megabytes)
                - ram
                - cores
                - timestamp
           - PERMISSION:
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
           - ACCOUNT TYPE:
                - user_id
                - name
                - description
                - how long a workspace can run before killed (in seconds)
                - max UNIX processes it can start at once 
                - max memory it can use
                - max disk space it can use
                - whether all publication must be 100% public
                - max number of users connected to a shared workspace at same time
           - SLAVE:
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
        - lifetime:
            1. scp: bundle of sagews source code (so always up to date)
            2. ssh: extract code; launch backend.py
            3. POST: backend.py registers 
            4. ssh: backend.py --stop; backend.py cleans up workers, etc.
            5. POST: backend sends shutdown message to frontend
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
             - WORKERS:
                 - worker_id
                 - hostname
		 - num_users
		 - disk, ram, cores, load_number 

        - FILESYSTEM: on filesystem directory of workspaces --
             data/backend/workspaces/id/.git/
                                        files... <-- enables static browsing (?)

   * Desktop Backend Client (static/sagews/desktop/backend.[js,html,css]) --
        - Use socket.io javascript client library
        - Use jQuery + Codemirror2 to implement various interactive document viewers
        - User configuration
        - Managing workspace
        - Interactive command line shell
        - Graphical file manager
        - jQuery Hotkeys(?) --- https://github.com/tzuryby/jquery.hotkeys ??

   * Mobile Backend Client (static/sagews/mobile/backend.[js,html,css]) --
        - Uses the socket.io javascript client library
        - Use jQuery + jQuery-mobile + Codemirror2 to implement interactive document viewers
 
   * A Worker Machine:
        - a Linux Virtual (or real) Machine that has (something like): 
            - patched regularly updated Ubuntu (to avoid hackers)
            - 8GB fixed size hard drive for / (4GB for OS + Sage; 4GB for user data)
            - 8GB RAM (no swap space)
            - users named sagews_worker_1, sagews_worker_2, ..., sage_worker_32
            - disk quotas -- each user gets 125MB disk (and 250MB ram on average)
            - permissions on directories are locked down
            - firewalled so can only connect to some machines: http://www.cyberciti.biz/tips/block-outgoing-network-access-for-a-single-user-from-my-server-using-iptables.html

        - How configured:
            - Install ubuntu 12.04 in Ubuntu VM with a single 8GB fixed size disk with 4 cores and extra host-only network adapter
            - Manually partition it (to avoid swap) with one / partition.
            - Create admin user named "sagews". 
            - apt-get remove libreoffice* thunderbird
            - had to do "/etc/init.d/lightdm stop" to get quota to install:
            - apt-get install screen git g++ m4 gfortran libssl-dev dpkg-dev libatlas-dev libatlas-base-dev emacs quota iotop python-mode
            - apt-get update; apt-get upgrade  #, and do force install of new kernel
            - apt-get clean # clean cache
            - install guest additions
            - build sage from source in /usr/local/sage directory, but as user sagews
                export MAKE="make -j4"
                export SAGE_ATLAS_LIB=/usr/lib/
            - /home/sagews/scripts/: 
                   - sudo ./add_users.py 40
                   - sudo ./init_sagews_worker_home.py
            - disk quotas: 
                 * root@sagewsworker:/etc# zile fstab
                   UUID=38cf5ce6-a41a-423b-812d-ab953b192e00 /               ext4    usrquota,errors=remount-ro 0       1
                 * reboot 
            - ssh:
                 * Generate public key for sagews account:
                     ssh-keygen -b 2048 
                 * As root, make two changes to /etc/ssh/sshd_config:
                     PermitRootLogin no
                     AuthorizedKeysFile "/home/authorized_keys"
                 * As root, create /home/authorized_keys (owner/group=root,
                   readable by all), which contains the public keys
                   for each backend that is allowed to access this VM.
                   It will automatically be able to ssh into *any*
                   account on the machine, with no further config needed.
             - static internal IP address as above
             - comment out a line in /etc/pam.d/sshd to get rid of banner, .cache file, and speedup login:
                     # Print the message of the day upon successful login.
                     #session    optional     pam_motd.so # [1]

   * Worker (worker.py) -- 
        - a forking socket server using JSON messages
        - workername@hostname:path/: stored on frontend and backend
        - path/config.json is a string containing a JSON object that
          describes configuration of this worker:
                  {'users':['sagews_worker_2:scratch/', 'sagews_worker_3'], 'limits':{'ram':500, 'disk':125, 'processes':10, 'walltime':1800, 'cputime':60}}
        - bound: #{*simultaneous* open workspaces} <= #{available worker users}
        - backend has ssh keys setup so it can ssh to worker account
        - workspace session lifetime:
            1. scp files to workername@hostname:path/ 
                    - worker.py
                    - workspace.bundle: a git bundle containing the workspace repo
                    - conf: {'token:'a secret string', 'backend':'http://backend_address:port'}
            2. ssh workername@hostname /path/worker.py 
            3. Worker process does a POST to backend to tell backend
               it is now alive and ready, and what port it managed to
               grab.  The POST identifies the worker by the md5 hash
               of the token.
            4. Backend initiates SSL-socket connections with worker,
               one for each requested session.  By using ssl, for
               communications, everything is encrypted.
            5. Backend can also do "scp workername@hostname:path/bundle ." to 
               get a new bundle that gets applied to the workspace
               repo (and should be undo-able).

   * DOCUMENTS:
     * Supported Types:
       - Bash/Sage/Gap/etc. command line -- name.sagews.cmdline.bash
       - Mathchat -- standard chat window, but with support for math
         typesetting, graphics, and inline sage code; document is log
         of the chat
       - Sage Worksheet -- name.sagews.sws; somewhat similar to
         existing Sage worksheets, but with sections/tree heierarchy
       - The "Javascript Scratchpad" in Firefox!
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
         
     * Publishing:
       - QR codes ? 

       
       
 
