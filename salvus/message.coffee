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


new_message = (obj) -> (opts={}) ->
    if opts.event?
        throw "ValueError: must not define 'event' when calling message creation function (opts=#{JSON.stringify(opts)}, obj=#{JSON.stringify(obj)})"
    defaults(opts, obj)

############################################
# Sage session management; executing code 
############################################# 
# generic error emssages
exports.error = new_message(
    event  : 'error'
    id     : undefined
    reason : undefined
)

# hub --> sage_server and browser --> hub
exports.start_session = new_message(
    event  : 'start_session'
    id     : undefined
    limits : undefined
)

# hub --> browser
exports.new_session = new_message( 
    event        : 'new_session'
    id           : required
    session_uuid : undefined
    limits       : undefined
)

# sage_server --> hub
exports.session_description = new_message(
    event  : 'session_description'
    pid    : required
    limits : undefined
)

# browser --> hub --> sage_server
exports.send_signal = new_message(
    event        : 'send_signal'
    session_uuid : undefined   # from browser-->hub this must be set
    pid          : undefined   # from hub-->sage_server this must be set
    signal       : 2           # 2 = SIGINT
)

# browser <----> hub <--> sage_server
exports.terminate_session = new_message(
    event        : 'terminate_session'
    session_uuid : undefined
    reason       : undefined
    done         : true
)

# browser --> hub --> sage_server
exports.execute_code = new_message(
    event        : 'execute_code'
    id           : undefined
    code         : required
    session_uuid : undefined
    preparse     : true
    allow_cache  : true
)
        
# sage_server --> hub_i --> hub_j --> browser
exports.output = new_message(
    event        : 'output'
    id           : undefined
    stdout       : undefined
    stderr       : undefined
    done         : false
    session_uuid : undefined
)

############################################
# Ping/pong
#############################################
# browser --> hub
exports.ping = new_message(
    event   : 'ping'
    id      : undefined
)

# hub --> browser;   sent in response to a ping
exports.pong = new_message(
    event   : 'pong'
    id      : undefined        
)

############################################
# Account Management
#############################################
#

exports.create_account = new_message(
    event          : 'create_account'
    id             : required
    first_name     : required
    last_name      : required
    email_address  : required
    password       : required
    agreed_to_terms: required
)

###
             # client --> hub
             message.create_account(id, first_name, last_name, email_address, password, agreed_to_terms)
             # client <--> hub
             message.email_address_availability(id, email_address, available)
             # client --> hub
             message.sign_in(id, email_address, password, remember_me)
             # hub --> client
             # sent in response to either create_account or log_in
             message.signed_in(id, account_id, first_name, last_name, email_address, plan_name)
             # client --> hub
             message.sign_out(id)
             # hub --> client
             message.signed_out(id)

             # client --> hub
             message.change_email_address(id, old_email_address, new_email_address, password)
             # hub --> client
             message.changed_email_address(id, old_email_address, new_email_address)

             # client --> hub
             message.change_password(id, email_address, old_password, new_password)
             # hub --> client
             message.changed_password(id, error, message)
              # if error is true, that means the password was not changed; would
                happen if password is wrong (message:'invalid password'), 
                or request is too frequent (message:'too many password change requests')

             # client --> hub
             message.password_reset(id, email_address)
             # hub --> client
             message.password_reset_response(id, email_address, success)
                success true if message sent; success false if no such email_address in the database
###