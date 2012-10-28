###
# 
# Library for working with JSON messages for Salvus.
#
# (c) 2012, William Stein
# 
# We use functions to work with messages to ensure some level of
# consistency, defaults, and avoid errors from typos, etc.
# 
### 

SalvusMessage = exports? and exports or @SalvusMessage = {}

# hub --> sage_server and browser --> hub
SalvusMessage.start_session = (id, limits) -> 
    event:'start_session'
    id:id
    limits:limits  # limits is an object {walltime:?, cputime:?, numfiles:?, vmem:?}

# hub --> browser
SalvusMessage.new_session = (id, session_uuid, limits) ->
    event:'new_session'
    id:id
    session_uuid:session_uuid
    limits:limits

# sage_server --> hub
SalvusMessage.session_description = (pid, limits) ->
    event:'session_description'
    pid:pid
    limits:limits

# browser --> hub --> sage_server
SalvusMessage.send_signal = (session_uuid=null, pid=null, signal=2) -> # 2=SIGINT
    event:'send_signal'
    session_uuid:session_uuid   # from browser-->hub this must be set
    pid:pid                     # from hub-->sage_server this must be set
    signal:signal

# client <---- server               
SalvusMessage.terminate_session = (session_uuid=null, reason='') ->
    event:'terminate_session'
    reason:reason
    done:true

# browser --> hub --> sage_server
SalvusMessage.execute_code = (id, code, session_uuid=null, preparse=true) ->
    event:'execute_code'
    id:id
    code:code
    session_uuid:session_uuid
    preparse:preparse
        
# sage_server --> hub_i --> hub_j --> browser
SalvusMessage.output = (id, stdout=null, stderr=null, done=null, session_uuid=null) ->
    event:'output'
    id:id
    stdout:stdout
    stderr:stderr
    done:done
    session_uuid:session_uuid

# hub --> browser
SalvusMessage.logged_in = (name) ->
    event:'logged_in'
    name:name
