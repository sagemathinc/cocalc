###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

DEBUG = false

{EventEmitter} = require('events')

async = require('async')
_     = require('underscore')

syncstring = require('./syncstring')
synctable  = require('./synctable')

smc_version = require('./smc-version')

message = require("./message")
misc    = require("./misc")

{validate_client_query} = require('./schema-validate')

defaults = misc.defaults
required = defaults.required

# JSON_CHANNEL is the channel used for JSON.  The hub imports this
# file, so if this constant is ever changed (for some reason?), it
# only has to be changed on this one line.  Moreover, channel
# assignment in the hub is implemented *without* the assumption that
# the JSON channel is '\u0000'.
JSON_CHANNEL = '\u0000'
exports.JSON_CHANNEL = JSON_CHANNEL # export, so can be used by hub

# Default timeout for many operations -- a user will get an error in many cases
# if there is no response to an operation after this amount of time.
DEFAULT_TIMEOUT = 30  # in seconds


class Session extends EventEmitter
    # events:
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    #    - 'execute_javascript' -- code that server wants client to run related to this session
    constructor: (opts) ->
        opts = defaults opts,
            conn         : required     # a Connection instance
            project_id   : required
            session_uuid : required
            params       : undefined
            data_channel : undefined    # optional extra channel that is used for raw data
            init_history : undefined    # used for console

        @start_time   = misc.walltime()
        @conn         = opts.conn
        @params       = opts.params
        if @type() == 'console'
            if not @params?.path? or not @params?.filename?
                throw Error("params must be specified with path and filename")
        @project_id   = opts.project_id
        @session_uuid = opts.session_uuid
        @data_channel = opts.data_channel
        @init_history = opts.init_history
        @emit("open")

        ## This is no longer necessary; or rather, it's better to only
        ## reset terminals, etc., when they are used, since it wastes
        ## less resources.
        # I'm going to leave this in for now -- it's only used for console sessions,
        # and they aren't properly reconnecting in all cases.
        if @reconnect?
            @conn.on("connected", @reconnect)

    close: () =>
        @removeAllListeners()
        if @reconnect?
            @conn.removeListener("connected", @reconnect)

    reconnect: (cb) =>
        # Called when the connection gets dropped, then reconnects
        if not @conn._signed_in
            setTimeout((()=>@reconnect(cb)), 500)
            return

        if @_reconnect_lock
            #console.warn('reconnect: lock')
            cb?("reconnect: hit lock")
            return

        @emit "reconnecting"
        @_reconnect_lock = true
        #console.log("reconnect: #{@type()} session with id #{@session_uuid}...")
        f = (cb) =>
            @conn.call
                message : message.connect_to_session
                    session_uuid : @session_uuid
                    type         : @type()
                    project_id   : @project_id
                    params       : @params
                timeout : 30
                cb      : (err, reply) =>
                    if err
                        cb(err); return
                    switch reply.event
                        when 'error'
                            cb(reply.error)
                        when 'session_connected'
                            #console.log("reconnect: #{@type()} session with id #{@session_uuid} -- SUCCESS", reply)
                            if @data_channel != reply.data_channel
                                @conn.change_data_channel
                                    prev_channel : @data_channel
                                    new_channel  : reply.data_channel
                                    session      : @
                            @data_channel = reply.data_channel
                            @init_history = reply.history
                            cb()
                        else
                            cb("bug in hub")
        misc.retry_until_success
            max_time : 15000
            factor   : 1.3
            f        : f
            cb       : (err) =>
                #console.log("reconnect('#{@session_uuid}'): finished #{err}")
                delete @_reconnect_lock
                if not err
                    @emit("reconnect")
                cb?(err)

    terminate_session: (cb) =>
        @conn.call
            message :
                message.terminate_session
                    project_id   : @project_id
                    session_uuid : @session_uuid
            timeout : 30
            cb      : cb

    walltime: () =>
        return misc.walltime() - @start_time

    handle_data: (data) =>
        @emit("data", data)

    write_data: (data) ->
        @conn.write_data(@data_channel, data)

    restart: (cb) =>
        @conn.call(message:message.restart_session(session_uuid:@session_uuid), timeout:10, cb:cb)


###
#
# A Console session, which connects the client to a pty on a remote machine.
#
#   Client <-- (primus) ---> Hub  <--- (tcp) ---> console_server
#
###

class ConsoleSession extends Session
    type: () => "console"




class exports.Connection extends EventEmitter
    # Connection events:
    #    - 'connecting' -- trying to establish a connection
    #    - 'connected'  -- succesfully established a connection; data is the protocol as a string
    #    - 'error'      -- called when an error occurs
    #    - 'output'     -- received some output for stateless execution (not in any session)
    #    - 'execute_javascript' -- code that server wants client to run (not for a particular session)
    #    - 'message'    -- emitted when a JSON message is received           on('message', (obj) -> ...)
    #    - 'data'       -- emitted when raw data (not JSON) is received --   on('data, (id, data) -> )...
    #    - 'signed_in'  -- server pushes a succesful sign in to the client (e.g., due to
    #                      'remember me' functionality); data is the signed_in message.
    #    - 'project_list_updated' -- sent whenever the list of projects owned by this user
    #                      changed; data is empty -- browser could ignore this unless
    #                      the project list is currently being displayed.
    #    - 'project_data_changed - sent when data about a specific project has changed,
    #                      e.g., title/description/settings/etc.
    #    - 'new_version', number -- sent when there is a new version of the source code so client should refresh

    constructor: (@url) ->
        # Tweaks the maximum number of listeners an EventEmitter can have -- 0 would mean unlimited
        # The issue is https://github.com/sagemathinc/smc/issues/1098 and the errors we got are
        # (node) warning: possible EventEmitter memory leak detected. 301 listeners added. Use emitter.setMaxListeners() to increase limit.
        @setMaxListeners(3000)  # every open file/table/sync db listens for connect event, which adds up.

        @emit("connecting")
        @_id_counter       = 0
        @_sessions         = {}
        @_new_sessions     = {}
        @_data_handlers    = {}
        @execute_callbacks = {}
        @call_callbacks    = {}
        @_project_title_cache = {}
        @_usernames_cache = {}
        @_redux = undefined # set this if you want to be able to use mark_file

        @register_data_handler(JSON_CHANNEL, @handle_json_data)

        @on 'connected', @send_version

        # IMPORTANT! Connection is an abstract base class.  Derived classes must
        # implement a method called _connect that takes a URL and a callback, and connects to
        # the Primus websocket server with that url, then creates the following event emitters:
        #      "connected", "error", "close"
        # and returns a function to write raw data to the socket.
        @_connect @url, (data) =>
            if data.length > 0  # all messages must start with a channel; length 0 means nothing.
                # Incoming messages are tagged with a single UTF-16
                # character c (there are 65536 possibilities).  If
                # that character is JSON_CHANNEL, the message is
                # encoded as JSON and we handle it in the usual way.
                # If the character is anything else, the raw data in
                # the message is sent to an appropriate handler, if
                # one has previously been registered.  The motivation
                # is that we the ability to multiplex multiple
                # sessions over a *single* WebSocket connection, and it
                # is absolutely critical that there is minimal
                # overhead regarding the amount of data transfered --
                # 1 character is minimal!

                channel = data[0]
                data    = data.slice(1)

                @_handle_data(channel, data)

                # give other listeners a chance to do something with this data.
                @emit("data", channel, data)
        @_connected = false

        # start pinging -- not used/needed for primus, but *is* needed for getting information about server_time
        # In particular, this ping time is not reported to the user and is not used as a keep-alive, hence it
        # can be fairly long.
        @_ping_interval = 60000
        @_ping()

    dbg: (f) =>
        return (m...) ->
            switch m.length
                when 0
                    s = ''
                when 1
                    s = m[0]
                else
                    s = JSON.stringify(m)
            console.log("#{(new Date()).toISOString()} - Client.#{f}: #{s}")

    _ping: () =>
        @_ping_interval ?= 60000 # frequency to ping
        @_last_ping = new Date()
        @call
            message : message.ping()
            timeout : 15     # CRITICAL that this timeout be less than the @_ping_interval
            cb      : (err, pong) =>
                #console.log(err, pong)
                now = new Date()
                # Only record something if success, got a pong, and the round trip is short!
                # If user messes with their clock during a ping and we don't do this, then
                # bad things will happen.
                if not err and pong?.event == 'pong' and now - @_last_ping <= 1000*15
                    @_last_pong = {server:pong.now, local:now}
                    # See the function server_time below; subtract @_clock_skew from local time to get a better
                    # estimate for server time.
                    @_clock_skew = @_last_ping - 0 + ((@_last_pong.local - @_last_ping)/2) - @_last_pong.server
                    misc.set_local_storage('clock_skew', @_clock_skew)
                # try again later
                setTimeout(@_ping, @_ping_interval)

    # Returns (approximate) time in ms since epoch on the server.
    server_time: =>
        # Add _clock_skew to our local time to get a better estimate of the actual time on the server.
        # This can help compensate in case the user's clock is wildly wrong, e.g., by several minutes,
        # or even hours due to totally wrong time (e.g. ignoring time zone), which is relevant for
        # some algorithms including sync which uses time.  Getting the clock right up to a small multiple
        # of ping times is fine for our application.
        if not @_clock_skew?
            x = misc.get_local_storage('clock_skew')
            if x?
                @_clock_skew = parseFloat(x)
        return new Date(new Date() - (@_clock_skew ? 0))

    ping_test: (opts) =>
        opts = defaults opts,
            packets  : 20
            timeout  : 5   # any ping that takes this long in seconds is considered a fail
            delay_ms : 200  # wait this long between doing pings
            log      : undefined  # if set, use this to log output
            cb       : undefined   # cb(err, ping_times)

        ###
        Use like this in a Sage Worksheet:

            %coffeescript
            s = require('salvus_client').salvus_client
            s.ping_test(delay_ms:100, packets:40, log:print)
        ###
        ping_times = []
        do_ping = (i, cb) =>
            t = new Date()
            @call
                message : message.ping()
                timeout : opts.timeout
                cb      : (err, pong) =>
                    heading = "#{i}/#{opts.packets}: "
                    if not err and pong?.event == 'pong'
                        ping_time = new Date() - t
                        bar = ('*' for j in [0...Math.floor(ping_time/10)]).join('')
                        mesg = "#{heading}time=#{ping_time}ms"
                    else
                        bar = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
                        mesg = "#{heading}Request error -- #{err}, #{misc.to_json(pong)}"
                        ping_time = Infinity
                    while mesg.length < 40
                        mesg += ' '
                    mesg += bar
                    if opts.log?
                        opts.log(mesg)
                    else
                        console.log(mesg)
                    ping_times.push(ping_time)
                    setTimeout(cb, opts.delay_ms)
        async.mapSeries([1..opts.packets], do_ping, (err) => opts.cb?(err, ping_times))


    close: () =>
        @_conn.close()   # TODO: this looks very dubious -- probably broken or not used anymore

    version: =>
        return smc_version.version

    send_version: =>
        @send(message.version(version:@version()))

    # Send a JSON message to the hub server.
    send: (mesg) =>
        #console.log("send at #{misc.mswalltime()}", mesg)
        @write_data(JSON_CHANNEL, misc.to_json(mesg))

    # Send raw data via certain channel to the hub server.
    write_data: (channel, data) =>
        try
            @_write(channel + data)
        catch err
            # TODO: this happens when trying to send and the client not connected
            # We might save up messages in a local queue and keep retrying, for
            # a sort of offline mode ?  I have not worked out how to handle this yet.
            #console.log(err)

    is_signed_in: =>
        return @is_connected() and !!@_signed_in

    # account_id or project_id of this client
    client_id: () =>
        return @account_id

    # false since this client is not a project
    is_project: () =>
        return false

    # true since this client is a user
    is_user: () =>
        return true

    is_connected: => !!@_connected

    remember_me_key: => "remember_me#{window?.smc_base_url ? ''}"

    handle_json_data: (data) =>
        mesg = misc.from_json(data)
        if DEBUG
            console.log("handle_json_data: #{data}")
        switch mesg.event
            when "execute_javascript"
                if mesg.session_uuid?
                    @_sessions[mesg.session_uuid].emit("execute_javascript", mesg)
                else
                    @emit("execute_javascript", mesg)
            when "output"
                cb = @execute_callbacks[mesg.id]
                if cb?
                    cb(mesg)
                    delete @execute_callbacks[mesg.id] if mesg.done
                if mesg.session_uuid?  # executing in a persistent session
                    @_sessions[mesg.session_uuid].emit("output", mesg)
                else   # stateless exec
                    @emit("output", mesg)
            when "terminate_session"
                session = @_sessions[mesg.session_uuid]
                session?.emit("close")
            when "session_reconnect"
                if mesg.data_channel?
                    @_sessions[mesg.data_channel]?.reconnect()
                else if mesg.session_uuid?
                    @_sessions[mesg.session_uuid]?.reconnect()
            when "cookies"
                @_cookies?(mesg)

            when "signed_in"
                @account_id = mesg.account_id
                @_signed_in = true
                misc.set_local_storage(@remember_me_key(), true)
                @_sign_in_mesg = mesg
                @emit("signed_in", mesg)

            when "remember_me_failed"
                misc.delete_local_storage(@remember_me_key())
                @emit(mesg.event, mesg)

            when "project_list_updated", 'project_data_changed'
                @emit(mesg.event, mesg)
            when 'version'
                @emit('new_version', {version:mesg.version, min_version:mesg.min_version})
            when "error"
                # An error that isn't tagged with an id -- some sort of general problem.
                if not mesg.id?
                    console.log("WARNING: #{misc.to_json(mesg.error)}")
                    return

        id = mesg.id  # the call f(null,mesg) can mutate mesg (!), so we better save the id here.
        v = @call_callbacks[id]
        if v?
            {cb, error_event} = v
            v.first = false
            if error_event and mesg.event == 'error'
                cb(mesg.error)
            else
                cb(undefined, mesg)
            if not mesg.multi_response
                delete @call_callbacks[id]

        # Finally, give other listeners a chance to do something with this message.
        @emit('message', mesg)

    change_data_channel: (opts) =>
        opts = defaults opts,
            prev_channel : required
            new_channel  : required
            session      : required
        @unregister_data_handler(opts.prev_channel)
        delete @_sessions[opts.prev_channel]
        @_sessions[opts.new_channel] = opts.session
        @register_data_handler(opts.new_channel, opts.session.handle_data)

    register_data_handler: (channel, h) ->
        @_data_handlers[channel] = h

    unregister_data_handler: (channel) ->
        delete @_data_handlers[channel]

    _handle_data: (channel, data) =>
        #console.log("_handle_data:(#{channel},'#{data}')")
        f = @_data_handlers[channel]
        if f?
            f(data)
        #else
        #    console.log("Error -- missing channel '#{channel}' for data '#{data}'.  @_data_handlers = #{misc.to_json(@_data_handlers)}")

    connect_to_session: (opts) ->
        opts = defaults opts,
            type         : required
            session_uuid : required
            project_id   : required
            timeout      : DEFAULT_TIMEOUT
            params       : required  # must include {path:?, filename:?}
            cb           : required
        @call
            message : message.connect_to_session
                session_uuid : opts.session_uuid
                type         : opts.type
                project_id   : opts.project_id
                params       : opts.params

            timeout : opts.timeout

            cb      : (error, reply) =>
                if error
                    opts.cb(error); return
                switch reply.event
                    when 'error'
                        opts.cb(reply.error)
                    when 'session_connected'
                        @_create_session_object
                            type         : opts.type
                            project_id   : opts.project_id
                            session_uuid : opts.session_uuid
                            data_channel : reply.data_channel
                            init_history : reply.history
                            params       : opts.params
                            cb           : opts.cb
                    else
                        opts.cb("Unknown event (='#{reply.event}') in response to connect_to_session message.")

    new_session: (opts) ->
        opts = defaults opts,
            timeout    : DEFAULT_TIMEOUT # how long until give up on getting a new session
            type       : "console"   # only "console" supported
            params     : required    # must include {path:?, filename:?}
            project_id : required
            cb         : required    # cb(error, session)  if error is defined it is a string

        @call
            message : message.start_session
                type       : opts.type
                params     : opts.params
                project_id : opts.project_id

            timeout : opts.timeout

            cb      : (error, reply) =>
                if error
                    opts.cb(error)
                else
                    if reply.event == 'error'
                        opts.cb(reply.error)
                    else if reply.event == "session_started" or reply.event == "session_connected"
                        @_create_session_object
                            type         : opts.type
                            project_id   : opts.project_id
                            session_uuid : reply.session_uuid
                            data_channel : reply.data_channel
                            params       : opts.params
                            cb           : opts.cb
                    else
                        opts.cb("Unknown event (='#{reply.event}') in response to start_session message.")

    _create_session_object: (opts) =>
        opts = defaults opts,
            type         : required   # 'console'
            project_id   : required
            session_uuid : required
            data_channel : undefined
            params       : undefined
            init_history : undefined
            cb           : required

        session_opts =
            conn         : @
            project_id   : opts.project_id
            session_uuid : opts.session_uuid
            data_channel : opts.data_channel
            init_history : opts.init_history
            params       : opts.params

        switch opts.type
            when 'console'
                session = new ConsoleSession(session_opts)
            else
                opts.cb("Unknown session type: '#{opts.type}'")
        @_sessions[opts.session_uuid] = session
        if opts.data_channel != JSON_CHANNEL
            @_sessions[opts.data_channel] = session
        @register_data_handler(opts.data_channel, session.handle_data)
        opts.cb(false, session)

    call: (opts={}) =>
        # This function:
        #    * Modifies the message by adding an id attribute with a random uuid value
        #    * Sends the message to the hub
        #    * When message comes back with that id, call the callback and delete it (if cb opts.cb is defined)
        #      The message will not be seen by @handle_message.
        #    * If the timeout is reached before any messages come back, delete the callback and stop listening.
        #      However, if the message later arrives it may still be handled by @handle_message.
        opts = defaults opts,
            message     : required
            timeout     : undefined
            error_event : false  # if true, turn error events into just a normal err
            cb          : undefined
        if not opts.cb?
            @send(opts.message)
            return
        if not opts.message.id?
            id = misc.uuid()
            opts.message.id = id
        else
            id = opts.message.id

        @call_callbacks[id] =
            cb          : opts.cb
            error_event : opts.error_event
            first       : true

        @send(opts.message)
        if opts.timeout
            setTimeout(
                (() =>
                    if @call_callbacks[id]?.first
                        error = "Timeout after #{opts.timeout} seconds"
                        opts.cb(error, message.error(id:id, error:error))
                        delete @call_callbacks[id]
                ), opts.timeout*1000
            )

    call_local_hub: (opts) =>
        opts = defaults opts,
            project_id : required    # determines the destination local hub
            message    : required
            multi_response : false
            timeout    : undefined
            cb         : undefined
        m = message.local_hub
                multi_response : opts.multi_response
                project_id : opts.project_id
                message    : opts.message
                timeout    : opts.timeout
        if opts.cb?
            f = (err, resp) =>
                #console.log("call_local_hub:#{misc.to_json(opts.message)} got back #{misc.to_json(err:err,resp:resp)}")
                opts.cb?(err, resp)
        else
            f = undefined

        if opts.multi_response
            m.id = misc.uuid()
            #console.log("setting up execute callback on id #{m.id}")
            @execute_callbacks[m.id] = (resp) =>
                #console.log("execute_callback: ", resp)
                opts.cb?(undefined, resp)
            @send(m)
        else
            @call
                message : m
                timeout : opts.timeout
                cb      : f


    #################################################
    # Account Management
    #################################################
    create_account: (opts) =>
        opts = defaults opts,
            first_name     : required
            last_name      : required
            email_address  : required
            password       : required
            agreed_to_terms: required
            token          : undefined       # only required if an admin set the account creation token.
            timeout        : 40
            cb             : required

        if not opts.agreed_to_terms
            opts.cb(undefined, message.account_creation_failed(reason:{"agreed_to_terms":"Agree to the SageMathCloud Terms of Service."}))
            return

        if @_create_account_lock
            # don't allow more than one create_account message at once -- see https://github.com/sagemathinc/smc/issues/1187
            opts.cb(undefined, message.account_creation_failed(reason:{"account_creation_failed":"You are submitting too many requests to create an account; please wait a second."}))
            return

        @_create_account_lock = true
        @call
            message : message.create_account
                first_name      : opts.first_name
                last_name       : opts.last_name
                email_address   : opts.email_address
                password        : opts.password
                agreed_to_terms : opts.agreed_to_terms
                token           : opts.token
            timeout : opts.timeout
            cb      : (err, resp) =>
                setTimeout((() => delete @_create_account_lock), 1500)
                opts.cb(err, resp)

    delete_account: (opts) =>
        opts = defaults opts,
            account_id    : required
            timeout       : 40
            cb            : required

        @call
            message : message.delete_account
                account_id : opts.account_id
            timeout : opts.timeout
            cb      : opts.cb


    sign_in: (opts) ->
        opts = defaults opts,
            email_address : required
            password      : required
            remember_me   : false
            cb            : required
            timeout       : 40

        @call
            message : message.sign_in
                email_address : opts.email_address
                password      : opts.password
                remember_me   : opts.remember_me
            timeout : opts.timeout
            cb      : opts.cb

    sign_out: (opts) ->
        opts = defaults opts,
            everywhere   : false
            cb           : undefined
            timeout      : DEFAULT_TIMEOUT # seconds

        @account_id = undefined

        @call
            message : message.sign_out(everywhere:opts.everywhere)
            timeout : opts.timeout
            cb      : opts.cb

        @emit('signed_out')

    change_password: (opts) ->
        opts = defaults opts,
            email_address : required
            old_password  : ""
            new_password  : required
            cb            : undefined
        @call
            message : message.change_password
                email_address : opts.email_address
                old_password  : opts.old_password
                new_password  : opts.new_password
            cb : opts.cb

    change_email: (opts) ->
        opts = defaults opts,
            old_email_address : ""
            new_email_address : required
            password          : ""
            cb                : undefined
        if not @account_id?
            opts.cb?("must be logged in")
            return
        @call
            message: message.change_email_address
                account_id        : @account_id
                old_email_address : opts.old_email_address
                new_email_address : opts.new_email_address
                password          : opts.password
            error_event : true
            cb : opts.cb

    # forgot password -- send forgot password request to server
    forgot_password: (opts) ->
        opts = defaults opts,
            email_address : required
            cb            : required
        @call
            message: message.forgot_password
                email_address : opts.email_address
            cb: opts.cb

    # forgot password -- send forgot password request to server
    reset_forgot_password: (opts) ->
        opts = defaults(opts,
            reset_code    : required
            new_password  : required
            cb            : required
            timeout       : DEFAULT_TIMEOUT # seconds
        )
        @call(
            message : message.reset_forgot_password(reset_code:opts.reset_code, new_password:opts.new_password)
            cb      : opts.cb
        )

    # forget about a given passport authentication strategy for this user
    unlink_passport: (opts) ->
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : undefined
        @call
            message : message.unlink_passport
                strategy : opts.strategy
                id       : opts.id
            error_event : true
            timeout : 15
            cb : opts.cb


    #################################################
    # Project Management
    #################################################
    create_project: (opts) =>
        opts = defaults opts,
            title       : required
            description : required
            cb          : undefined
        @call
            message: message.create_project(title:opts.title, description:opts.description)
            cb     : (err, resp) =>
                if err
                    opts.cb?(err)
                else if resp.event == 'error'
                    opts.cb?(resp.error)
                else
                    opts.cb?(undefined, resp.project_id)

    #################################################
    # Individual Projects
    #################################################

    open_project: (opts) ->
        opts = defaults opts,
            project_id   : required
            cb           : required
        @call
            message :
                message.open_project
                    project_id : opts.project_id
            cb : opts.cb

    write_text_file_to_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            content    : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined

        @call
            message :
                message.write_text_file_to_project
                    project_id : opts.project_id
                    path       : opts.path
                    content    : opts.content
            timeout : opts.timeout
            cb      : (err, resp) => opts.cb?(err, resp)

    read_text_file_from_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
            timeout    : DEFAULT_TIMEOUT

        @call
            message :
                message.read_text_file_from_project
                    project_id : opts.project_id
                    path       : opts.path
            timeout : opts.timeout
            cb : opts.cb

    # Like "read_text_file_from_project" above, except the callback
    # message gives a url from which the file can be
    # downloaded using standard AJAX.
    # Despite the callback, this function is NOT asynchronous (that was for historical reasons).
    # It also just returns the url.
    read_file_from_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            timeout    : DEFAULT_TIMEOUT
            archive    : 'tar.bz2'   # NOT SUPPORTED ANYMORE! -- when path is a directory: 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'
            cb         : undefined

        base = window?.smc_base_url ? '' # will be defined in web browser
        if opts.path[0] == '/'
            # absolute path to the root
            opts.path = '.smc/root' + opts.path  # use root symlink, which is created by start_smc

        url = misc.encode_path("#{base}/#{opts.project_id}/raw/#{opts.path}")

        opts.cb?(false, {url:url})
        return url

    project_branch_op: (opts) ->
        opts = defaults opts,
            project_id : required
            branch     : required
            op         : required
            cb         : required
        @call
            message : message["#{opts.op}_project_branch"]
                project_id : opts.project_id
                branch     : opts.branch
            cb : opts.cb


    stopped_editing_file: (opts) =>
        opts = defaults opts,
            project_id : required
            filename   : required
            cb         : undefined
        @call
            message : message.stopped_editing_file
                project_id : opts.project_id
                filename   : opts.filename
            cb      : opts.cb

    invite_noncloud_collaborators: (opts) =>
        opts = defaults opts,
            project_id   : required
            title        : required
            link2proj    : required
            replyto      : undefined
            replyto_name : undefined
            to           : required
            email        : required   # body in HTML format
            subject      : undefined
            cb           : required

        @call
            message: message.invite_noncloud_collaborators
                project_id    : opts.project_id
                title         : opts.title
                link2proj     : opts.link2proj
                email         : opts.email
                replyto       : opts.replyto
                replyto_name  : opts.replyto_name
                to            : opts.to
                subject       : opts.subject
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    if not resp.error
                        resp.error = "error inviting collaborators"
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp)

    copy_path_between_projects: (opts) =>
        opts = defaults opts,
            public            : false
            src_project_id    : required    # id of source project
            src_path          : required    # relative path of director or file in the source project
            target_project_id : required    # if of target project
            target_path       : undefined   # defaults to src_path
            overwrite_newer   : false       # overwrite newer versions of file at destination (destructive)
            delete_missing    : false       # delete files in dest that are missing from source (destructive)
            backup            : false       # make ~ backup files instead of overwriting changed files
            timeout           : undefined   # how long to wait for the copy to complete before reporting "error" (though it could still succeed)
            exclude_history   : false       # if true, exclude all files of the form *.sage-history
            cb                : undefined   # cb(err)

        is_public = opts.public
        delete opts.public
        cb = opts.cb
        delete opts.cb

        if not opts.target_path?
            opts.target_path = opts.src_path

        if is_public
            mesg = message.copy_public_path_between_projects(opts)
        else
            mesg = message.copy_path_between_projects(opts)

        @call
            message : mesg
            cb      : (err, resp) =>
                if err
                    cb?(err)
                else if resp.event == 'error'
                    cb?(resp.error)
                else
                    cb?(undefined, resp)

    # Set a quota parameter for a given project.
    # As of now, only user in the admin group can make these changes.
    project_set_quotas: (opts) =>
        opts = defaults opts,
            project_id  : required
            memory      : undefined    # see message.coffee for the units, etc., for all these settings
            cpu_shares  : undefined
            cores       : undefined
            disk_quota  : undefined
            mintime     : undefined
            network     : undefined
            member_host : undefined
            cb          : undefined
        cb = opts.cb
        delete opts.cb

        @call
            message : message.project_set_quotas(opts)
            cb      : (err, resp) =>
                if err
                    cb?(err)
                else if resp.event == 'error'
                    cb?(resp.error)
                else
                    cb?(undefined, resp)

    #################################################
    # Blobs
    #################################################
    remove_blob_ttls: (opts) =>
        opts = defaults opts,
            uuids : required   # list of sha1 hashes of blobs stored in the blobstore
            cb    : undefined
        if opts.uuids.length == 0
            opts.cb?()
        else
            @call
                message :
                    message.remove_blob_ttls
                        uuids : opts.uuids
                cb : (err, resp) =>
                    if err
                        opts.cb?(err)
                    else if resp.event == 'error'
                        opts.cb?(resp.error)
                    else
                        opts.cb?()


    #################################################
    # *PUBLIC* Projects
    #################################################

    public_get_text_file: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
            timeout    : DEFAULT_TIMEOUT

        @call
            message :
                message.public_get_text_file
                    project_id : opts.project_id
                    path       : opts.path
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.data)

    public_project_directory_listing: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : '.'
            time       : false
            start      : 0
            limit      : -1
            timeout    : DEFAULT_TIMEOUT
            hidden     : false
            cb         : required
        @call
            message :
                message.public_get_directory_listing
                    project_id : opts.project_id
                    path       : opts.path
                    time       : opts.time
                    start      : opts.tart
                    limit      : opts.limit
                    hidden     : opts.hidden
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.result)

    ######################################################################
    # Execute a program in a given project
    ######################################################################
    exec: (opts) ->
        opts = defaults opts,
            project_id      : required
            path            : ''
            command         : required
            args            : []
            timeout         : 30
            network_timeout : undefined
            max_output      : undefined
            bash            : false
            err_on_exit     : true
            cb              : required   # cb(err, {stdout:..., stderr:..., exit_code:...}).

        if not opts.network_timeout?
            opts.network_timeout = opts.timeout * 1.5

        #console.log("Executing -- #{opts.command}, #{misc.to_json(opts.args)} in '#{opts.path}'")
        @call
            message : message.project_exec
                project_id  : opts.project_id
                path        : opts.path
                command     : opts.command
                args        : opts.args
                timeout     : opts.timeout
                max_output  : opts.max_output
                bash        : opts.bash
                err_on_exit : opts.err_on_exit
            timeout : opts.network_timeout
            cb      : (err, mesg) ->
                #console.log("Executing #{opts.command}, #{misc.to_json(opts.args)} -- got back: #{err}, #{misc.to_json(mesg)}")
                if err
                    opts.cb(err, mesg)
                else if mesg.event == 'error'
                    opts.cb(mesg.error)
                else
                    opts.cb(false, {stdout:mesg.stdout, stderr:mesg.stderr, exit_code:mesg.exit_code})

    makedirs: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : undefined      # (err)
        @exec
            project_id : opts.project_id
            command    : 'mkdir'
            args       : ['-p', opts.path]
            cb         : opts.cb

    # find directories and subdirectories matching a given query
    find_directories: (opts) =>
        opts = defaults opts,
            project_id     : required
            query          : '*'       # see the -iname option to the UNIX find command.
            path           : '.'       # Root path to find directories from
            exclusions     : undefined # Array<String> Paths relative to `opts.path`. Skips whole sub-trees
            include_hidden : false
            cb             : required  # cb(err, object describing result (see code below))

        args = [opts.path, '-xdev', '!', '-readable', '-prune', '-o', '-type', 'd', '-iname', "'#{opts.query}'", '-readable']
        tail_args = ['-print']

        if opts.exclusions?
            exclusion_args = _.map opts.exclusions, (excluded_path, index) =>
                "-a -not \\( -path '#{opts.path}/#{excluded_path}' -prune \\)"
            args = args.concat(exclusion_args)

        args = args.concat(tail_args)
        command = "find #{args.join(' ')}"

        @exec
            project_id : opts.project_id
            command    : command
            timeout    : 15
            cb         : (err, result) =>
                if err
                    opts.cb?(err); return
                if result.event == 'error'
                    opts.cb?(result.error); return
                n = opts.path.length + 1
                v = result.stdout.split('\n')
                if not opts.include_hidden
                    v = (x for x in v when x.indexOf('/.') == -1)
                v = (x.slice(n) for x in v when x.length > n)
                ans =
                    query       : opts.query
                    path        : opts.path
                    project_id  : opts.project_id
                    directories : v
                opts.cb?(undefined, ans)

    #################################################
    # Search / user info
    #################################################

    user_search: (opts) =>
        opts = defaults opts,
            query    : required
            query_id : -1     # So we can check that it matches the most recent query
            limit    : 20
            timeout  : DEFAULT_TIMEOUT
            cb       : required

        @call
            message : message.user_search(query:opts.query, limit:opts.limit)
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.results, opts.query_id)

    project_invite_collaborator: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : (err) =>
        @call
            message : message.invite_collaborator(project_id:opts.project_id, account_id:opts.account_id)
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else if result.event == 'error'
                    opts.cb(result.error)
                else
                    opts.cb(undefined, result)

    project_remove_collaborator: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : (err) =>

        @call
            message : message.remove_collaborator(project_id:opts.project_id, account_id:opts.account_id)
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else if result.event == 'error'
                    opts.cb(result.error)
                else
                    opts.cb(undefined, result)

    ############################################
    # Bulk information about several projects or accounts
    # (may be used by chat, etc.)
    # NOTE:
    #    When get_projects is called (which happens regularly), any info about
    #    project titles or "account_id --> name" mappings gets updated. So
    #    usually get_project_titles and get_usernames doesn't even have
    #    to make a call to the server.   A case where it would is when rendering
    #    the notifications and the project list hasn't been returned.  Also,
    #    at some point, project list will probably just return the most recent
    #    projects or partial info about them.
    #############################################

    get_usernames: (opts) ->
        opts = defaults opts,
            account_ids : required
            use_cache   : true
            cb          : required     # cb(err, map from account_id to {first_name:?, last_name:?})
        usernames = {}
        for account_id in opts.account_ids
            usernames[account_id] = false
        if opts.use_cache
            for account_id, done of usernames
                if not done and @_usernames_cache[account_id]?
                    usernames[account_id] = @_usernames_cache[account_id]
        account_ids = (account_id for account_id, done of usernames when not done)
        if account_ids.length == 0
            opts.cb(undefined, usernames)
        else
            @call
                message : message.get_usernames(account_ids : account_ids)
                cb      : (err, resp) =>
                    if err
                        opts.cb(err)
                    else if resp.event == 'error'
                        opts.cb(resp.error)
                    else
                        for account_id, username of resp.usernames
                            usernames[account_id] = username
                            @_usernames_cache[account_id] = username   # TODO: we could expire this cache...
                        opts.cb(undefined, usernames)

    #################################################
    # File Management
    #################################################
    project_directory_listing: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : '.'
            time       : false
            start      : 0
            limit      : 999999999 # effectively unlimited by default -- get what you can in the time you have...
            timeout    : 60
            hidden     : false
            cb         : required

        args = []
        if opts.time
            args.push("--time")
        if opts.hidden
            args.push("--hidden")
        args.push("--limit")
        args.push(opts.limit)
        args.push("--start")
        args.push(opts.start)
        if opts.path == ""
            opts.path = "."
        args.push('--')
        args.push(opts.path)

        @exec
            project_id : opts.project_id
            command    : 'smc-ls'
            args       : args
            timeout    : opts.timeout
            cb         : (err, output) ->
                if err
                    opts.cb(err)
                else if output.exit_code
                    opts.cb(output.stderr)
                else
                    v = misc.from_json(output.stdout)
                    opts.cb(err, v)

    project_get_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.project_get_state
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.state)

    #################################################
    # Print file to pdf
    # The printed version of the file will be created in the same directory
    # as path, but with extension replaced by ".pdf".
    #################################################
    print_to_pdf: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            timeout     : 90          # client timeout -- some things can take a long time to print!
            options     : undefined   # optional options that get passed to the specific backend for this file type
            cb          : undefined   # cp(err, relative path in project to printed file)
        opts.options.timeout = opts.timeout  # timeout on backend
        @call_local_hub
            project_id : opts.project_id
            message    : message.print_to_pdf
                path    : opts.path
                options : opts.options
            timeout    : opts.timeout
            cb         : (err, resp) =>
                if err
                    opts.cb?(err)
                else if resp.event == 'error'
                    if resp.error?
                        opts.cb?(resp.error)
                    else
                        opts.cb?('error')
                else
                    opts.cb?(undefined, resp.path)


    #################################################
    # Bad situation error loging
    #################################################
    log_error: (error) =>
        @call(message : message.log_client_error(error:error))

    webapp_error: (opts) =>
        @call(message : message.webapp_error(opts))


    ######################################################################
    # stripe payments api
    ######################################################################
    # gets custormer info (if any) and stripe public api key
    # for this user, if they are logged in
    _stripe_call: (mesg, cb) =>
        @call
            message     : mesg
            error_event : true
            timeout     : 15
            cb          : cb

    stripe_get_customer: (opts) =>
        opts = defaults opts,
            cb    : required
        @_stripe_call message.stripe_get_customer(), (err, mesg) =>
            if err
                opts.cb(err)
            else
                resp =
                    stripe_publishable_key : mesg.stripe_publishable_key
                    customer               : mesg.customer
                opts.cb(undefined, resp)

    stripe_create_source: (opts) =>
        opts = defaults opts,
            token : required
            cb    : required
        @_stripe_call(message.stripe_create_source(token: opts.token), opts.cb)

    stripe_delete_source: (opts) =>
        opts = defaults opts,
            card_id : required
            cb    : required
        @_stripe_call(message.stripe_delete_source(card_id: opts.card_id), opts.cb)

    stripe_update_source: (opts) =>
        opts = defaults opts,
            card_id : required
            info    : required
            cb      : required
        @_stripe_call(message.stripe_update_source(card_id: opts.card_id, info:opts.info), opts.cb)

    stripe_set_default_source: (opts) =>
        opts = defaults opts,
            card_id : required
            cb    : required
        @_stripe_call(message.stripe_set_default_source(card_id: opts.card_id), opts.cb)

    # gets list of past stripe charges for this account.
    stripe_get_charges: (opts) =>
        opts = defaults opts,
            limit          : undefined    # between 1 and 100 (default: 10)
            ending_before  : undefined    # see https://stripe.com/docs/api/node#list_charges
            starting_after : undefined
            cb             : required
        @call
            message     :
                message.stripe_get_charges
                    limit          : opts.limit
                    ending_before  : opts.ending_before
                    starting_after : opts.starting_after
            error_event : true
            cb          : (err, mesg) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, mesg.charges)

    # gets stripe plans that could be subscribed to.
    stripe_get_plans: (opts) =>
        opts = defaults opts,
            cb    : required
        @call
            message     : message.stripe_get_plans()
            error_event : true
            cb          : (err, mesg) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, mesg.plans)

    stripe_create_subscription: (opts) =>
        opts = defaults opts,
            plan     : required
            quantity : 1
            coupon   : undefined
            cb       : required
        @call
            message : message.stripe_create_subscription
                plan     : opts.plan
                quantity : opts.quantity
                coupon   : opts.coupon
            error_event : true
            cb          : opts.cb

    stripe_cancel_subscription: (opts) =>
        opts = defaults opts,
            subscription_id : required
            at_period_end   : true
            cb              : required
        @call
            message : message.stripe_cancel_subscription
                subscription_id : opts.subscription_id
                at_period_end   : opts.at_period_end
            error_event : true
            cb          : opts.cb

    stripe_update_subscription: (opts) =>
        opts = defaults opts,
            subscription_id : required
            quantity : undefined  # if given, must be >= number of projects
            coupon   : undefined
            projects : undefined  # ids of projects that subscription applies to
            plan     : undefined
            cb       : required
        @call
            message : message.stripe_update_subscription
                subscription_id : opts.subscription_id
                quantity : opts.quantity
                coupon   : opts.coupon
                projects : opts.projects
                plan     : opts.plan
            error_event : true
            cb          : opts.cb

    # gets list of past stripe charges for this account.
    stripe_get_subscriptions: (opts) =>
        opts = defaults opts,
            limit          : undefined    # between 1 and 100 (default: 10)
            ending_before  : undefined    # see https://stripe.com/docs/api/node#list_subscriptions
            starting_after : undefined
            cb             : required
        @call
            message     :
                message.stripe_get_subscriptions
                    limit          : opts.limit
                    ending_before  : opts.ending_before
                    starting_after : opts.starting_after
            error_event : true
            cb          : (err, mesg) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, mesg.subscriptions)

    # gets list of invoices for this account.
    stripe_get_invoices: (opts) =>
        opts = defaults opts,
            limit          : 10           # between 1 and 100 (default: 10)
            ending_before  : undefined    # see https://stripe.com/docs/api/node#list_charges
            starting_after : undefined
            cb             : required
        @call
            message     :
                message.stripe_get_invoices
                    limit          : opts.limit
                    ending_before  : opts.ending_before
                    starting_after : opts.starting_after
            error_event : true
            cb          : (err, mesg) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, mesg.invoices)

    stripe_admin_create_invoice_item: (opts) =>
        opts = defaults opts,
            account_id    : undefined    # one of account_id or email_address must be given
            email_address : undefined
            amount        : undefined    # in US dollars -- if amount/description not given, then merely ensures user has stripe account
            description   : undefined
            cb            : required
        @call
            message : message.stripe_admin_create_invoice_item
                account_id    : opts.account_id
                email_address : opts.email_address
                amount        : opts.amount
                description   : opts.description
            error_event : true
            cb          : opts.cb

    # Make it so the SMC user with the given email address has a corresponding stripe
    # identity, even if they have never entered a credit card.  May only be used by
    # admin users.
    stripe_admin_create_customer: (opts) =>
        opts = defaults opts,
            account_id    : undefined    # one of account_id or email_address must be given
            email_address : undefined
            cb            : required
        @stripe_admin_create_invoice_item(opts)

    # Support Tickets

    create_support_ticket: ({opts, cb}) =>
        @call
            message      : message.create_support_ticket(opts)
            timeout      : 20
            error_event  : true
            cb           : (err, resp) ->
                if err
                    cb?(err)
                else
                    cb?(undefined, resp.url)

    get_support_tickets: (cb) =>
        @call
            message      : message.get_support_tickets()
            timeout      : 20
            error_event  : true
            cb           : (err, tickets) ->
                if err
                    cb?(err)
                else
                    cb?(undefined, tickets.tickets)

    # Queries directly to the database (sort of like Facebook's GraphQL)

    projects: (opts) =>
        opts = defaults opts,
            cb : required
        @query
            query :
                projects : [{project_id:null, title:null, description:null, last_edited:null, users:null}]
            changes : true
            cb : opts.cb

    changefeed: (opts) =>
        keys = misc.keys(opts)
        if keys.length != 1
            throw Error("must specify exactly one table")
        table = keys[0]
        x = {}
        if not misc.is_array(opts[table])
            x[table] = [opts[table]]
        else
            x[table] = opts[table]
        return @query(query:x, changes: true)

    sync_table: (query, options, debounce_interval=2000) =>
        return synctable.sync_table(query, options, @, debounce_interval)

    sync_string: (opts) =>
        opts = defaults opts,
            id                : undefined
            project_id        : undefined
            path              : undefined
            default           : ''
            file_use_interval : 'default'
            cursors           : false
        opts.client = @
        return new syncstring.SyncString(opts)

    sync_object: (opts) =>
        opts = defaults opts,
            id      : required
            default : {}
        opts.client = @
        return new syncstring.SyncObject(opts)

    # If called on the fronted, will make the given file with the given action.
    # Does nothing on the backend.
    mark_file: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            action     : required
            ttl        : 120
        # Will only do something if @_redux has been set.
        @_redux?.getActions('file_use').mark_file(opts.project_id, opts.path, opts.action, opts.ttl)

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            timeout : 30
            cb      : undefined
        if opts.options? and not misc.is_array(opts.options)
            throw Error("options must be an array")
        #console.log("query=#{misc.to_json(opts.query)}")
        err = validate_client_query(opts.query, @account_id)
        if err
            opts.cb?(err)
            return
        mesg = message.query
            query          : opts.query
            options        : opts.options
            changes        : opts.changes
            multi_response : opts.changes
        @call
            message     : mesg
            error_event : true
            timeout     : opts.timeout
            cb          : opts.cb

    query_cancel: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined
        @call
            message     : message.query_cancel(id:opts.id)
            error_event : true
            timeout     : 30
            cb          : opts.cb

    query_get_changefeed_ids: (opts) =>
        opts = defaults opts,
            cb : required
        @call
            message     : message.query_get_changefeed_ids()
            error_event : true
            timeout     : 30
            cb          : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    @_changefeed_ids = resp.changefeed_ids
                    opts.cb(undefined, resp.changefeed_ids)

#################################################
# Other account Management functionality shared between client and server
#################################################
exports.is_valid_password = (password) ->
    if password.length >= 6 and password.length <= 64
        return [true, '']
    else
        return [false, 'Password must be between 6 and 64 characters in length.']

exports.issues_with_create_account = (mesg) ->
    issues = {}
    if not mesg.agreed_to_terms
        issues.agreed_to_terms = 'Agree to the Salvus Terms of Service.'
    if mesg.first_name == ''
        issues.first_name = 'Enter your name.'
    if not misc.is_valid_email_address(mesg.email_address)
        issues.email_address = 'Email address does not appear to be valid.'
    [valid, reason] = exports.is_valid_password(mesg.password)
    if not valid
        issues.password = reason
    return issues



