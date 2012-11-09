###
# Run this by running ./hub ...
#
# Dependencies:
# 
#    npm install commander start-stop-daemon winston sockjs helenus
#
# ** Add any new dependencies to the NODEJS_PACKAGES list in build.py **
#
# For debugging, run this way:
#
#         make_coffee &&echo "require('hub').start_server()" | coffee
#
###

# node.js -- builtin libraries 
http    = require('http')

# salvus libraries
sage    = require("sage")               # sage server
misc    = require("misc")
defaults = misc.defaults; required = defaults.required
message = require("message")     # salvus message protocol
cass    = require("cassandra")
client  = require("client")

to_json = misc.to_json
to_safe_str = misc.to_safe_str
from_json = misc.from_json

# third-party libraries
async   = require("async")
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
winston = require('winston')            # logging -- https://github.com/flatiron/winston
sockjs  = require("sockjs")             # websockets (+legacy support) -- https://github.com/sockjs/sockjs-node
uuid    = require('node-uuid')

# module scope variables:
http_server        = null
sockjs_connections = []
database           = null

###
# HTTP Server
###

init_http_server = () -> 
    http_server = http.createServer((req, res) ->
        return res.end('') if req.url == '/alive'
        winston.info ("#{req.connection.remoteAddress} accessed #{req.url}")
        res.end('hub server')
    )

###
# SockJS Server
###
init_sockjs_server = () ->
    sockjs_server = sockjs.createServer()
    sockjs_server.on("connection", (conn) ->
        # TODO: This sockjs_connections data structure is not currently used; it also just
        # grows without every having anything removed, so it would leak memory.   !!!
        sockjs_connections.push(conn)
        winston.info ("new sockjs connection #{conn} from #{conn.remoteAddress}")
        # install event handlers on this particular connection

        account_id = null
        
        push_to_client = (mesg) ->
            console.log(to_safe_str(mesg)) if mesg.event != 'pong'
            if mesg.event == 'signed_in'
                account_id = mesg.account_id
                
            conn.write(to_json(mesg))

        conn.on("data", (mesg) ->
            try
                mesg = from_json(mesg)
            catch error
                winston.error("error parsing incoming mesg (invalid JSON): #{mesg}")
                return

            if mesg.event != 'ping'
                winston.debug("conn=#{conn} received sockjs mesg: #{to_safe_str(mesg)}")

            ###
            # handle message
            ###
            switch mesg.event
                # session/code execution
                when "execute_code"
                    if mesg.session_uuid?
                        send_to_persistent_sage_session(mesg)
                    else
                        stateless_sage_exec(mesg, push_to_client)
                when "start_session"  # create a new persistent session
                    create_persistent_sage_session(mesg, push_to_client)
                when "send_signal"
                    send_to_persistent_sage_session(mesg)

                # ping/pong
                when "ping"
                    push_to_client(message.pong(id:mesg.id))

                # account management
                when "create_account"
                    create_account(mesg, conn.remoteAddress, push_to_client)
                when "sign_in"
                    sign_in(mesg, conn.remoteAddress, push_to_client)
                when "password_reset"
                    password_reset(mesg, conn.remoteAddress, push_to_client)
                when "change_password"
                    change_password(mesg, conn.remoteAddress, push_to_client)
                when "change_email_address"
                    change_email_address(mesg, conn.remoteAddress, push_to_client)
                when "get_account_settings"
                    # TODO: confirm authentication of user at this point!!!!!
                    get_account_settings(mesg, push_to_client)
                when "account_settings"
                    # TODO: confirm authentication of user at this point!!!!!
                    save_account_settings(mesg, push_to_client)
                    
                # user feedback
                when "report_feedback"
                    report_feedback(mesg, push_to_client, account_id)
                    
                when "get_all_feedback_from_user"
                    get_all_feedback_from_user(mesg, push_to_client, account_id)
                    
        )
        conn.on("close", ->
            winston.info("conn=#{conn} closed")
            # remove from array
        )
        
    )
    sockjs_server.installHandlers(http_server, {prefix:'/hub'})


########################################
# Account Management 
########################################

password_hash_library = require('password-hash')

exports.password_hash = password_hash = (password) ->
    return password_hash_library.generate(password,
        algorithm:'sha512'
        saltLength:32
        iterations:1000
    )

password_verify = (password, password_hash) ->
    console.log("**********************************************")
    console.log("password_verify: #{password}, #{password_hash}")
    return password_hash_library.verify(password, password_hash)
    
sign_in = (mesg, client_ip_address, push_to_client) ->
    database.get_account(
        email_address : mesg.email_address
        cb            : (error, account) ->
            if error
                push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:error))
            else if not password_verify(mesg.password, account.password_hash)
                push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:"invalid email_address/password combination"))
            else
                console.log("*** account = #{to_safe_str(account)}")
                database.log(event:'signed_in', value:{account_id:account.account_id, client_ip_address:client_ip_address})
                push_to_client(message.signed_in(
                    id            : mesg.id
                    account_id    : account.account_id 
                    first_name    : account.first_name
                    last_name     : account.last_name
                    email_address : mesg.email_address
                ))
    )

password_reset = (mesg, client_ip_address, push_to_client) ->

    push_error = (reason) -> push_to_client(
        message.password_reset_response(
            id            : mesg.id
            email_address : mesg.email_address
            success       : false
            reason        : reason)
    )
    
    db_error = push_error("There was an error querying the database.  Please try again later.")

    uuid     = null
    
    async.series([
        (cb) ->
            database.get_account(
                email_address : mesg.email_address
                cb            : (error, account) ->
                    if error # no such account
                        push_error("No account with that e-mail address exists.")
                        cb(true)  # nothing further to do
                        return
                    else
                        cb() # continue on
            )

        # We now know that there is an account with this email address.

        # If there has already been a password_reset request
        # from the same ip address in the last 2 minutes, deny.
        (cb) -> 
            recent_password_reset_requests = database.key_value_store(name:"recent_password_reset_requests")
            recent_password_reset_requests.get(
                key : client_ip_address
                cb  : (error, result) ->
                    if error
                        db_error()
                        cb(true) # done
                        return
                    else if result?  # it is defined -- there was a recent request
                        push_error("Please wait a few minutes before sending another password reset request.")
                        cb(true)
                        return
                    # record that there was a request from this ip
                    recent_password_reset_requests.set(key:client_ip_address, value:mesg.email_address, ttl:60*2)  # fire and forgot -- no big loss if dropped
                    cb()
            )
            
        # put a just-in-case entry in another key:value table called "password_reset_requests" with ttl of 1 month
        (cb) ->
            database.log(
                event : password_reset
                value : {client_ip_address:client_ip_address, email_address:email_address}
                ttl:60*60*24*30
            )

        # put entry in the password_reset uuid:value table with ttl of 15 minutes, and send an email
        (cb) ->
            uuid = database.uuid_value_store(name:"password_reset").set(
                value : mesg.email_address
                ttl   : 60*15,
                cb    : (error, results) ->
                    if error
                        db_error()
                        cb(true)
                        return
                    else
                        cb()
            )

        # send an email to mesg.email_address that has a link to 
        (cb) ->
            body = """
                Somebody just requested to change the password on your Salvus account.
                If you requested this password change, please change your password by
                following the link below:

                     https://salv.us/hub/password_reset?key=#{uuid}

                If you don't want to change your password, ignore this message.
                """
            send_email(subject:'Salvus password reset confirmation', body:body, to:mesg.email_address, cb:(error) ->
                if error
                    push_error("Error sending email message. Please try again later.")
                else
                    push_to_client(message.password_reset_response(
                        id            : mesg.id
                        email_address : mesg.email_address
                        success       : true
                    ))
                cb()
            )
    ])


# We cannot put the zxcvbn password strength checking in
# client.coffee since it is too big (~1MB).  The client
# will async load and use this, of course, but a broken or
# *hacked* client might not properly verify this, so we
# do it in the server too.  NOTE: I tested Dropbox and
# they have a GUI to warn against week passwords, but still
# allow them anyways!
zxcvbn = require('../static/zxcvbn/zxcvbn')  # this require takes about 100ms!

create_account = (mesg, client_ip_address, push_to_client) ->
    id = mesg.id
    account_id = null
    async.series([
        # run tests on generic validity of input
        (cb) -> 
            issues = client.issues_with_create_account(mesg)
            console.log("issues = #{issues}")
            password_strength = zxcvbn.zxcvbn(mesg.password)  # note -- this is synchronous (but very fast, I think)
            if (password_strength.crack_time <= 10*24*3600)  # 10 days
                issues['password'] = "Choose a password that is more difficult to guess."

            # TODO -- only uncomment this for easy testing, allow any password choice
            # the client test suite will then fail, which is good, so we are reminded to comment this out before release!
            # delete issues['password'] 
            
            if misc.len(issues) > 0
                push_to_client(message.account_creation_failed(id:id, reason:issues))
                cb(true)
            else
                cb()

        # make sure this ip address hasn't requested more than 100
        # accounts in the last 6 hours (just to avoid really nasty
        # evils, but still allow for demo registration behind a wifi
        # router -- say)
        (cb) ->
            ip_tracker = database.key_value_store(name:'create_account_ip_tracker')
            ip_tracker.get(
                key : client_ip_address
                cb  : (error, value) ->
                    if error
                        push_to_client(message.account_creation_failed(id:id, reason:{'other':"Unable to create account.  Please try later."}))
                        cb(true)
                    if not value?
                        ip_tracker.set(key: client_ip_address, value:1, ttl:6*3600)
                        cb()
                    else if value < 100
                        ip_tracker.set(key: client_ip_address, value:value+1, ttl:6*3600)                    
                        cb()  
                    else # bad situation
                        database.log(
                            event : 'create_account'
                            value : {ip_address:client_ip_address, reason:'too many requests'}
                        )
                        push_to_client(message.account_creation_failed(id:id, reason:{'other':"Too many account requests from the ip address #{client_ip_address} in the last 6 hours.  Please try again later."}))
                        cb(true)
            )

        # query database to determine whether the email address is available
        (cb) ->
            database.is_email_address_available(mesg.email_address, (error, available) ->
                if error
                    push_to_client(message.account_creation_failed(id:id, reason:{'other':"Unable to create account.  Please try later."}))
                    cb(true)
                else if not available
                    push_to_client(message.account_creation_failed(id:id, reason:{email_address:"This e-mail address is already taken."}))
                    cb(true)
                else
                    cb()
            )
            
        # create new account
        (cb) ->
            database.create_account(
                first_name:    mesg.first_name
                last_name:     mesg.last_name
                email_address: mesg.email_address
                password_hash: password_hash(mesg.password)
                cb: (error, result) ->
                    if error
                        push_to_client(message.account_creation_failed(
                                 id:id, reason:{'other':"Unable to create account right now.  Please try later."})
                        )
                        cb(true)
                    account_id = result
                    database.log(
                        event : 'create_account'
                        value : {account_id:account_id, first_name:mesg.first_name, last_name:mesg.last_name, email_address:mesg.email_address}
                    )
                    cb()
            )
            
        # send message back to user that they are logged in as the new user
        (cb) ->
            mesg = message.signed_in(
                id: mesg.id
                account_id: account_id
                first_name: mesg.first_name
                last_name: mesg.last_name
                email_address: mesg.email_address
            )
            push_to_client(mesg)
            cb()
    ])
    

change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
    async.series([
        # make sure there hasn't been a password change attempt for this
        # email address in the last 5 seconds
        (cb) ->
            tracker = database.key_value_store(name:'change_password_tracker')
            tracker.get(
                key : mesg.email_address
                cb : (error, value) ->
                    if error
                        cb()  # DB error, so don't bother with this
                        return
                    if value?  # is defined, so problem -- it's over
                        push_to_client(message.changed_password(id:mesg.id, error:true, message:"Please wait at least 5 seconds before trying to change your password again."))
                        database.log(
                            event : 'change_password'
                            value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:"attack?"}
                        )
                        cb(true)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set(
                            key   : mesg.email_address
                            value : client_ip_address
                            ttl   : 5
                        )
                        cb()
            )
                            
        # get account and validate the password
        (cb) ->
            database.get_account(
              email_address : mesg.email_address
              cb : (error, result) ->
                if error
                    push_to_client(message.changed_password(id:mesg.id, error:true, message:"Internal error.  Please try again later."))
                    cb(true)
                    return
                account = result
                if not password_verify(mesg.old_password, account.password_hash)
                    push_to_client(message.changed_password(id:mesg.id, error:true, message:"Incorrect password"))
                    database.log(
                        event : 'change_password'
                        value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:"Incorrect password"}
                    )
                    cb(true)
                    return
                cb()
            )
            
         # record current password hash (just in case?) and that we are changing password and set new password   
        (cb) ->

            database.log(
                event : "change_password"
                value :
                    account_id : account.account_id
                    client_ip_address : client_ip_address
                    previous_password_hash : account.password_hash
            )
            
            database.change_password(
                account_id:    account.account_id
                password_hash: password_hash(mesg.new_password),
                cb : (error, result) ->
                    if error
                        push_to_client(message.changed_password(id:mesg.id, error:true, message:"Internal error.  Please try again later."))
                    else
                        push_to_client(message.changed_password(id:mesg.id, error:false)) # finally, success!
                    cb()
            )
    ])            
            

change_email_address = (mesg, client_ip_address, push_to_client) ->    
    account = null
    async.series([
        # make sure there hasn't been an email change attempt for this
        # email address in the last 10 seconds
        (cb) ->
            tracker = database.key_value_store(name:'change_email_address_tracker')
            tracker.get(
                key : mesg.old_email_address
                cb : (error, value) ->
                    if error
                        cb()  # DB error, so don't bother with this
                        return
                    if value?  # is defined, so problem -- it's over
                        push_to_client(message.changed_email_address(id:mesg.id, error:true, message:"Please wait at least 10 seconds before trying to change your email address again."))
                        database.log(
                            event : 'change_email_address'
                            value : {email_address:mesg.old_email_address, client_ip_address:client_ip_address, message:"attack?"}
                        )
                        cb(true)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set(
                            key   : mesg.email_address
                            value : client_ip_address
                            ttl   : 10    # seconds
                        )
                        cb()
            )
                            
        # get account and validate the password
        (cb) -> database.get_account(
            email_address : mesg.old_email_address
            cb : (error, account) ->
                if error
                    push_to_client(message.changed_email_address(id:mesg.id, error:true, message:"Internal error.  Please try again later."))
                    cb(true)
                    return
                if not password_verify(mesg.password, account.password_hash)
                    push_to_client(message.changed_email_address(id:mesg.id, error:true, message:"Incorrect password"))
                    database.log(
                        event : 'change_email_address'
                        value : {email_address:mesg.old_email_address, client_ip_address:client_ip_address, message:"Incorrect password"}
                    )
                    cb(true)
                    return
                cb()
            )
            
        # Record current email address (just in case?) and that we are
        # changing email address to the new one.  This will make it
        # easy to implement a "change your email address back" feature
        # if I need to at some point.
        (cb) ->
            database.log(
    	        event:'change_email_address',
                value:{email_address:mesg.new_email_address, client_ip_address:client_ip_address, old_email_address:account.email_address}
            )
            database.change_email_address(
                account_id:    account.account_id
                email_address: mesg.new_email_address,
                cb : (error, result) ->
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:true, message:"Internal error.  Please try again later."))
                    else
                        push_to_client(message.changed_email_address(id:mesg.id, error:false, new_email_address:mesg.new_email_address)) # finally, success!
                    cb()
            )
    ])            
            

# Sends a message to the client (via push_to_client) with the account
# settings for the account with given id.  We assume that caller code
# has already determined that the user initiating this request has
# the given account_id.
get_account_settings = (mesg, push_to_client) ->
    account_settings = null
    async.series([
        # 1. Get entry in the database corresponding to this account.
        (cb) -> 
            database.get_account
                account_id : mesg.account_id
                cb : (error, data) ->
                    if error
                        push_to_client(message.error(id:mesg.id, error:error))
                        cb(true) # bail
                    else
                        # 2. Set defaults for unset keys.  We do this so that in the
                        # long run it will always be easy to migrate the database
                        # forward (with new columns).
                        delete data['password_hash']
                        
                        for key, val of message.account_settings_defaults
                            if not data[key]?
                                data[key] = val

                        account_settings = data
                        account_settings.id = mesg.id
                        cb()
                        
        # 3. Get information about user plan
        (cb) ->
            database.get_plan
                plan_id : account_settings['plan_id']
                cb : (error, plan) ->
                    if error
                        push_to_client(message.error(id:mesg.id, error:error))
                        cb(true) # bail out
                    else
                        account_settings.plan_name = plan.name
                        account_settings.storage_limit = plan.storage_limit
                        account_settings.session_limit = plan.session_limit
                        account_settings.max_session_time = plan.max_session_time
                        account_settings.ram_limit = plan.ram_limit
                        
                        # 4. Send result to client
                        push_to_client(message.account_settings(account_settings))
                        cb() # done!
    ])

# mesg is an account_settings message.  We save everything in the
# message to the database.  The restricted settings are completely
# ignored if mesg.password is not set and correct.
save_account_settings = (mesg, push_to_client) ->
    if mesg.event != 'account_settings'
        push_to_client(message.error(id:mesg.id, error:"Wrong message type: #{mesg.event}"))
        return
    async.series([
        (cb) ->
            # if given, verify that password is correct or give an error
            if mesg.password?
                verify_account_password(password: mesg.password, account_id: mesg.account_id, cb:
                    (error, result) ->
                        if error
                            push_to_client(message.error(id:mesg.id, error:error))
                            cb(true)
                        else
                            if not result
                                push_to_client(message.error(id:mesg.id, error:"Incorrect password"))
                                cb(true)
                            else
                                cb()
                )
            else
                cb()
        (cb) ->
            settings = {}
            for key of message.unrestricted_account_settings
                settings[key] = mesg[key]
            if mesg.password?
                settings['email'] = mesg['email']
                
            console.log("******* #{to_json(settings)}")
                
            database.update_account_settings
                account_id : mesg.account_id
                settings   : settings
                cb         : (error, results) ->
                    if error
                        push_to_client(message.error(id:mesg.id, error:error))
                        cb(true)
                    else
                        push_to_client(message.account_settings_saved(id:mesg.id))
                        cb()
    ])                        

    
########################################
# User Feedback
########################################
report_feedback = (mesg, push_to_client, account_id) ->
    data = {}  # TODO -- put interesting info here
    database.report_feedback
        account_id  : account_id
        category    : mesg.category
        description : mesg.description
        data        : data
        nps         : mesg.nps
        cb          : (err, results) -> push_to_client(message.feedback_reported(id:mesg.id, error:err))

get_all_feedback_from_user = (mesg, push_to_client, account_id) ->
    if account_id == null
        push_to_client(message.all_feedback_from_user(id:mesg.id, error:true, data:to_json("User not signed in.")))
        return
    database.get_all_feedback_from_user
        account_id  : account_id
        cb          : (err, results) -> push_to_client(message.all_feedback_from_user(id:mesg.id, data:to_json(results), error:err))
    


#########################################
# Sending emails
#########################################

emailjs = require('emailjs')
email_server = null

# here's how I test this function:  require('hub').send_email(subject:'subject', body:'body', to:'wstein@gmail.com', cb:console.log)
exports.send_email = send_email = (opts={}) ->
    opts = defaults(opts,
        subject : required
        body    : required
        from    : 'salvusmath@gmail.com'
        to      : required
        cc      : ''
        cb      : undefined)

    async.series([
        (cb) -> 
            if email_server == null
                filename = 'data/secrets/salvusmath_email_password'
                require('fs').readFile(filename, 'utf8', (error, password) ->
                    if error
                        winston.info("Unable to read the file '#{filename}', which is needed to send emails.")
                        opts.cb(error)
                    email_server  = emailjs.server.connect(
                       user     : "salvusmath"
                       password : password
                       host     : "smtp.gmail.com"
                       ssl      : true
                    )
                    cb()
                )
            else
                cb()
        (cb) -> 
            email_server.send(
               text : opts.body
               from : opts.from
               to   : opts.to
               cc   : opts.cc
               subject : opts.subject,
            opts.cb)
            cb()
    ])


    
            
    

########################################
# Persistent Sage Sessions
########################################
persistent_sage_sessions = {}


SAGE_SESSION_LIMITS = {cputime:60, walltime:15*60, vmem:2000, numfiles:1000, quota:128}

create_persistent_sage_session = (mesg, push_to_client) ->
    winston.log('creating persistent sage session')
    # generate a uuid
    session_uuid = uuid.v4()
    # cap limits
    misc.min_object(mesg.limits, SAGE_SESSION_LIMITS)  # TODO
    database.random_sage_server( cb:(error, sage_server) ->
        # TODO: deal with case when there are no sage servers -- or when error is set !
        sage_conn = new sage.Connection(
            host:sage_server.host
            port:sage_server.port
            recv:(m) ->
                winston.info("(hub) persistent_sage_conn (#{session_uuid})-- recv(#{to_safe_str(m)})")
                switch m.event
                    when "output", "terminate_session"
                        m.session_uuid = session_uuid  # tag with session uuid
                        push_to_client(m)
                    when "session_description"
                        # record this for later use for signals:
                        persistent_sage_sessions[session_uuid].pid = m.pid  
                        push_to_client(message.new_session(id:mesg.id, session_uuid:session_uuid, limits:m.limits))
                    else
                        winston.error("(hub) persistent_sage_conn -- unhandled message event = '#{m.event}'")
            cb: ->
                winston.info("(hub) persistent_sage_conn -- connected.")
                # send message to server requesting parameters for this session
                sage_conn.send(mesg)
        )
        # Save sage_conn object so that when the user requests evaluation of
        # code in the session with this id, we use this.
        persistent_sage_sessions[session_uuid] = {conn:sage_conn}
        
        winston.info("(hub) added #{session_uuid} to persistent sessions")
    )

send_to_persistent_sage_session = (mesg) ->
    winston.debug("send_to_persistent_sage_session(#{to_safe_str(mesg)})")

    session_uuid = mesg.session_uuid
    session = persistent_sage_sessions[session_uuid]
    
    if not session?
        winston.error("TODO -- session #{mesg.session_uuid} does not exist")
        return

    # modify the message so that it can be interpretted by sage server
    switch mesg.event
        when "send_signal"
            mesg.pid = session.pid

    if mesg.event == 'send_signal'   # other control messages would go here too
        # TODO: this function is a DOS vector, so we need to secure/limit it
        # Also, need to ensure that user is really allowed to do this action, whatever it is.
        console.log(session.conn.host)
        sage.send_signal
            host   : session.conn.host
            port   : session.conn.port
            pid    : mesg.pid
            signal : mesg.signal
    else
        session.conn.send(mesg)


###
# Stateless Sage Sessions
###
stateless_exec_cache = null

init_stateless_exec = () ->
    stateless_exec_cache = database.key_value_store(name:'stateless_exec')

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec #{to_safe_str(input_mesg)}")
    exec_nocache = () -> 
        output_messages = []
        stateless_sage_exec_nocache(input_mesg,
            (mesg) ->
                if mesg.event == "output"
                    output_messages.push(mesg)
                output_message_callback(mesg)
                if mesg.done and input_mesg.allow_cache
                    winston.info("caching result")
                    stateless_exec_cache.set(key:input_mesg.code, value:output_messages)
        )
    if not input_mesg.allow_cache
        exec_nocache()
        return
    stateless_exec_cache.get(key:input_mesg.code, cb:(err, output) ->
        if output?
            winston.info("(hub) -- using cache")        
            for mesg in output
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            exec_nocache()
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the calls to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_exec_using_server = (input_mesg, output_message_callback, host, port) -> 
    sage_conn = new sage.Connection(
        host:host
        port:port
        recv:(mesg) ->
            winston.info("(hub) sage_conn -- received message #{to_safe_str(mesg)}")
            output_message_callback(mesg)
        cb: ->
            winston.info("(hub) sage_conn -- sage: connected.")
            sage_conn.send(message.start_session(limits:{walltime:5, cputime:5, numfiles:1000, vmem:2048}))
            winston.info("(hub) sage_conn -- send: #{to_safe_str(input_mesg)}")
            sage_conn.send(input_mesg)
            sage_conn.send(message.terminate_session())
    )

stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec_nocache #{to_safe_str(input_mesg)}")
    database.random_sage_server( cb:(err, sage_server) ->
        if sage_server?
            stateless_exec_using_server(input_mesg, output_message_callback, sage_server.host, sage_server.port)
        else
            winston.error("(hub) no sage servers!")
            output_message_callback(message.terminate_session(reason:'no Sage servers'))
    )
    
    
###
# Start everything running
###    
exports.start_server = start_server = () ->
    # the order of init below is important
    init_http_server()
    winston.info("Using Cassandra keyspace #{program.keyspace}")
    database = new cass.Salvus(hosts:program.database_nodes.split(','), keyspace:program.keyspace)
    init_sockjs_server()
    init_stateless_exec()
    http_server.listen(program.port)
    winston.info("Started hub. HTTP port #{program.port}; TCP port #{program.tcp_port}")

###
# Process command line arguments
###
program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers (default: 5001)', parseInt, 5001)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('--address [string]', 'address of interface to bind to (default: "")', String, "")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "salvus")', String, 'test')    
    .parse(process.argv)

if program._name == 'hub.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        console.log("BUG ****************************************************************************")
        console.log("Uncaught exception: " + err)
        console.trace()
        console.log("BUG ****************************************************************************")

    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

    
    






