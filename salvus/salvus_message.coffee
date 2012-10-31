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
#

defaults = require('misc').defaults
required = defaults.required

# hub --> sage_server and browser --> hub
exports.start_session = (opts={}) ->
    defaults(opts,
        event  : 'start_session'
        id     : required
        limits : undefined
    )

# hub --> browser
exports.new_session = (opts={}) ->
    defaults(opts, 
        event        : 'new_session'
        id           : required
        session_uuid : undefined
        limits       : undefined
    )

# sage_server --> hub
exports.session_description = (opts={}) ->
    defaults(opts,
        event  : 'session_description'
        pid    : required
        limits : undefined
    )

# browser --> hub --> sage_server
exports.send_signal = (opts={}) ->
    defaults(opts,
        event        : 'send_signal'
        session_uuid : undefined   # from browser-->hub this must be set
        pid          : undefined   # from hub-->sage_server this must be set
        signal       : 2           # 2 = SIGINT
    )

# browser <----> hub <--> sage_server
exports.terminate_session = (opts={}) ->
    defaults(opts,
        event        : 'terminate_session'
        session_uuid : undefined
        reason       : undefined
        done         : true
    )

# browser --> hub --> sage_server
exports.execute_code = (opts={}) ->
    defaults(opts,
        event        : 'execute_code'
        id           : undefined
        code         : required
        session_uuid : undefined
        preparse     : true
    )
        
# sage_server --> hub_i --> hub_j --> browser
exports.output = (opts={}) ->
    defaults(opts,
        event        : 'output'
        id           : undefined
        stdout       : undefined
        stderr       : undefined
        done         : false
        session_uuid : undefined
    )

# hub --> browser
exports.logged_in = (opts={}) ->
    defaults(opts, 
        event : 'logged_in'
        name : name
    )

# browser --> hub
exports.ping = (opts={}) ->
    defaults(opts,
        event   : 'ping'  
    )

# hub --> browser;   sent in response to a ping
exports.pong = (opts={}) ->
    defaults(opts,
        event   : 'pong'  
    )
