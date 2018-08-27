###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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

# Maximum number of outstanding concurrent messages (that have responses)
# to send at once to backend.
MAX_CONCURRENT = 75

{EventEmitter} = require('events')

async = require('async')
underscore = require('underscore')

syncstring = require('./syncstring')
synctable  = require('./synctable')
db_doc = require('./db-doc')

smc_version = require('./smc-version')

message = require("./message")
misc    = require("./misc")

client_aggregate = require('./client-aggregate')


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
        super()
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
                allow_post : false
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

    write_data: (data) =>
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

    constructor: (url) ->
        super()
        @url = url
        # Tweaks the maximum number of listeners an EventEmitter can have -- 0 would mean unlimited
        # The issue is https://github.com/sagemathinc/cocalc/issues/1098 and the errors we got are
        # (node) warning: possible EventEmitter memory leak detected. 301 listeners added. Use emitter.setMaxListeners() to increase limit.
        @setMaxListeners(3000)  # every open file/table/sync db listens for connect event, which adds up.

        @_emit_mesg_info = underscore.throttle(@_emit_mesg_info, 750)

        @emit("connecting")
        @_call             =
            queue       : []    # messages in the queue to send
            count       : 0     # number of message currently outstanding
            sent        : 0     # total number of messages sent to backend.
            sent_length : 0     # total amount of data sent
            recv        : 0     # number of messages received from backend
            recv_length : 0     # total amount of data recv'd
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

        # Any outstanding calls made before connecting happened can't possibly succeed,
        # so we clear all outstanding messages.
        @on 'connected', @_clear_call_queue

        # IMPORTANT! Connection is an abstract base class.  Derived classes must
        # implement a method called _connect that takes a URL and a callback, and connects to
        # the Primus websocket server with that url, then creates the following event emitters:
        #      "connected", "error", "close"
        # and returns a function to write raw data to the socket.
        @_connect @url, (data) =>
            if data.length > 0  # all messages must start with a channel; length 0 means nothing.
                #console.log("got #{data.length} of data")
                @_call.recv += 1
                @_call.recv_length += data.length
                @_emit_mesg_info()
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
            allow_post : false
            message    : message.ping()
            timeout    : 15     # CRITICAL that this timeout be less than the @_ping_interval
            cb         : (err, pong) =>
                if not err
                    now = new Date()
                    # Only record something if success, got a pong, and the round trip is short!
                    # If user messes with their clock during a ping and we don't do this, then
                    # bad things will happen.
                    if pong?.event == 'pong' and now - @_last_ping <= 1000*15
                        @_last_pong = {server:pong.now, local:now}
                        # See the function server_time below; subtract @_clock_skew from local time to get a better
                        # estimate for server time.
                        @_clock_skew = @_last_ping - 0 + ((@_last_pong.local - @_last_ping)/2) - @_last_pong.server
                        misc.set_local_storage('clock_skew', @_clock_skew)
                # try again later
                setTimeout(@_ping, @_ping_interval)

    # Returns (approximate) time in ms since epoch on the server.
    # NOTE:
    #     This is guaranteed to be an *increasing* function, with an arbitrary
    #     ms added on in case of multiple calls at once, to guarantee uniqueness.
    #     Also, if the user changes their clock back a little, this will still
    #     increase... very slowly until things catch up.  This avoids any
    #     possibility of weird random re-ordering of patches within a given session.
    server_time: =>
        t = @_server_time()
        last = @_last_server_time
        if last? and last >= t
            # That's annoying -- time is not marching forward... let's fake it until it does.
            t = new Date((last - 0) + 1)
        @_last_server_time = t
        return t

    _server_time: =>
        # Add _clock_skew to our local time to get a better estimate of the actual time on the server.
        # This can help compensate in case the user's clock is wildly wrong, e.g., by several minutes,
        # or even hours due to totally wrong time (e.g. ignoring time zone), which is relevant for
        # some algorithms including sync which uses time.  Getting the clock right up to a small multiple
        # of ping times is fine for our application.
        if not @_clock_skew?
            x = misc.get_local_storage('clock_skew')
            if x?
                @_clock_skew = parseFloat(x)
        if @_clock_skew?
            return new Date(new Date() - @_clock_skew)
        else
            return new Date()

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
            s = require('webapp_client').webapp_client
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
        data = misc.to_json_socket(mesg)
        @_call.sent_length += data.length
        @_emit_mesg_info()
        @write_data(JSON_CHANNEL, data)

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

    remember_me_key: => "remember_me#{window?.app_base_url ? ''}"

    handle_json_data: (data) =>
        @_emit_mesg_info()
        mesg = misc.from_json_socket(data)
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
                #console.log("signed_in", mesg)
                @emit("signed_in", mesg)

            when "remember_me_failed"
                misc.delete_local_storage(@remember_me_key())
                @emit(mesg.event, mesg)

            when 'version'
                @emit('new_version', {version:mesg.version, min_version:mesg.min_version})

            when "error"
                # An error that isn't tagged with an id -- some sort of general problem.
                if not mesg.id?
                    console.log("WARNING: #{misc.to_json(mesg.error)}")
                    return

            when "start_metrics"
                @emit("start_metrics", mesg.interval_s)


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
            prev_channel : undefined
            new_channel  : required
            session      : required
        if opts.prev_channel?
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
            allow_post : false

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
            allow_post : false
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

    _do_post_call: (opts, cb) =>
        opts = defaults opts,
            message     : required
            timeout     : undefined   # TODO: ignored
            error_event : false       # turn error events into just a normal err
            cb          : undefined
        # Use the remember_me-authenticated HTTP POST user_api endpoint instead, since call doesn't
        # require returning multiple messages.
        #console.log '_do_post_call', JSON.stringify(opts.message)

        jqXHR = $.post("#{window?.app_base_url ? ''}/user_api", {message:misc.to_json(opts.message)})
        if not opts.cb?
            cb()
            return

        jqXHR.fail ->
            opts.cb?("failed")
            cb()

        jqXHR.done (resp) ->
            if opts.error_event and resp?.error
                opts.cb?(resp.error)
            else
                opts.cb?(undefined, resp)
            cb()

    _do_call: (opts, cb) =>
        if opts.allow_post and @account_id?  # would never work if account_id not set
            delete opts.allow_post
            @_do_post_call(opts, cb)
            return

        if not opts.cb?
            # console.log("no opts.cb", opts.message)
            # A call to the backend, but where we do not wait for a response.
            # In order to maintain at least roughly our limit on MAX_CONCURRENT,
            # we simply pretend that this message takes about 150ms
            # to complete.  This helps space things out so the server can
            # handle requests properly, instead of just discarding them (be nice
            # to the backend and it will be nice to you).
            @send(opts.message)
            setTimeout(cb, 150)
            return
        id = opts.message.id ?= misc.uuid()

        @call_callbacks[id] =
            cb          : (args...) =>
                if cb? and @call_callbacks[id]?
                    cb()
                    cb = undefined
                opts.cb(args...)
            error_event : opts.error_event
            first       : true

        @send(opts.message)

        if opts.timeout
            setTimeout(
                (() =>
                    if @call_callbacks[id]?.first
                        error = "Timeout after #{opts.timeout} seconds"
                        if cb?
                            cb()
                            cb = undefined
                        opts.cb(error, message.error(id:id, error:error))
                        delete @call_callbacks[id]
                ), opts.timeout*1000
            )
        else
            # IMPORTANT: No matter what call cb within 120s; if we don't do this then
            # in case opts.timeout isn't set but opts.cb is, but user disconnects,
            # then cb would never get called, which throws off our call counter.
            # Note that the input to cb doesn't matter.
            f = =>
                if cb? and @call_callbacks[id]?
                    cb()
                    cb = undefined
            setTimeout(f, 120*1000)

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
            allow_post  : @_enable_post
            cb          : undefined
        if not @is_connected()
            opts.cb?('not connected')
            return
        @_call.queue.push(opts)
        @_call.sent += 1
        @_update_calls()

    _update_calls: =>
        while @_call.queue.length > 0 and @_call.count < MAX_CONCURRENT
            @_process_next_call()
        #console.log("_update_calls: ", @_call)

    _emit_mesg_info: =>
        info = misc.copy_without(@_call, ['queue'])
        info.enqueued = @_call.queue.length
        info.max_concurrent = MAX_CONCURRENT
        @emit('mesg_info', info)

    _process_next_call: =>
        if @_call.queue.length == 0
            return
        @_call.count += 1
        #console.log('count (call):', @_call.count)
        opts = @_call.queue.shift()
        @_emit_mesg_info()
        @_do_call opts, =>
            @_call.count -= 1
            @_emit_mesg_info()
            #console.log('count (done):', @_call.count)
            @_update_calls()

    _clear_call_queue: =>
        for id, obj of @call_callbacks
            obj.cb('disconnect')
            delete @call_callbacks[id]

    call_local_hub: (opts) =>
        opts = defaults opts,
            project_id : required    # determines the destination local hub
            message    : required
            timeout    : undefined
            cb         : undefined
        m = message.local_hub
                multi_response : false
                project_id     : opts.project_id
                message        : opts.message
                timeout        : opts.timeout
        if opts.cb?
            f = (err, resp) =>
                #console.log("call_local_hub:#{misc.to_json(opts.message)} got back #{misc.to_json(err:err,resp:resp)}")
                opts.cb?(err, resp)
        else
            f = undefined

        @call
            allow_post : not m.multi_response
            message    : m
            timeout    : opts.timeout
            cb         : f


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
            get_api_key    : undefined       # if given, will create/get api token in response message
            token          : undefined       # only required if an admin set the account creation token.
            utm            : undefined
            referrer       : undefined
            timeout        : 40
            cb             : required

        if not opts.agreed_to_terms
            opts.cb(undefined, message.account_creation_failed(reason:{"agreed_to_terms":"Agree to the CoCalc Terms of Service."}))
            return

        if @_create_account_lock
            # don't allow more than one create_account message at once -- see https://github.com/sagemathinc/cocalc/issues/1187
            opts.cb(undefined, message.account_creation_failed(reason:{"account_creation_failed":"You are submitting too many requests to create an account; please wait a second."}))
            return

        @_create_account_lock = true
        @call
            allow_post : false
            message : message.create_account
                first_name      : opts.first_name
                last_name       : opts.last_name
                email_address   : opts.email_address
                password        : opts.password
                agreed_to_terms : opts.agreed_to_terms
                token           : opts.token
                utm             : opts.utm
                referrer        : opts.referrer
                get_api_key     : opts.get_api_key
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
            allow_post : false
            message : message.delete_account
                account_id : opts.account_id
            timeout : opts.timeout
            cb      : opts.cb

    sign_in_using_auth_token: (opts) ->
        opts = defaults opts,
            auth_token : required
            cb         : required
        @call
            allow_post : false
            message : message.sign_in_using_auth_token
                auth_token : opts.auth_token
            timeout : opts.timeout
            cb      : opts.cb

    sign_in: (opts) ->
        opts = defaults opts,
            email_address : required
            password      : required
            remember_me   : false
            cb            : required
            timeout       : 40
            utm           : undefined
            referrer      : undefined
            get_api_key   : undefined       # if given, will create/get api token in response message

        @call
            allow_post : false
            message : message.sign_in
                email_address : opts.email_address
                password      : opts.password
                remember_me   : opts.remember_me
                utm           : opts.utm
                referrer      : opts.referrer
                get_api_key   : opts.get_api_key
            timeout : opts.timeout
            cb      : opts.cb

    sign_out: (opts) ->
        opts = defaults opts,
            everywhere   : false
            cb           : undefined
            timeout      : DEFAULT_TIMEOUT # seconds

        @account_id = undefined

        @call
            allow_post : false
            message    : message.sign_out(everywhere:opts.everywhere)
            timeout    : opts.timeout
            cb         : opts.cb

        @emit('signed_out')

    change_password: (opts) ->
        opts = defaults opts,
            old_password  : ""
            new_password  : required
            cb            : undefined
        if not @account_id?
            opts.cb?("must be signed in")
            return
        @call
            message    : message.change_password
                account_id    : @account_id
                old_password  : opts.old_password
                new_password  : opts.new_password
            cb : opts.cb

    change_email: (opts) ->
        opts = defaults opts,
            new_email_address : required
            password          : ""
            cb                : undefined
        if not @account_id?
            opts.cb?("must be logged in")
            return
        @call
            message     : message.change_email_address
                account_id        : @account_id
                new_email_address : opts.new_email_address
                password          : opts.password
            error_event : true
            cb : opts.cb

    send_verification_email: (opts) ->
        opts = defaults opts,
            account_id    : required
            only_verify   : true
            cb            : undefined
        @call
            message    : message.send_verification_email
                only_verify : opts.only_verify
                account_id  : opts.account_id
            cb : opts.cb

    # forgot password -- send forgot password request to server
    forgot_password: (opts) ->
        opts = defaults opts,
            email_address : required
            cb            : required
        @call
            allow_post : false
            message    : message.forgot_password
                email_address : opts.email_address
            cb         : opts.cb

    # forgot password -- send forgot password request to server
    reset_forgot_password: (opts) ->
        opts = defaults opts,
            reset_code    : required
            new_password  : required
            cb            : required
            timeout       : DEFAULT_TIMEOUT # seconds
        @call
            allow_post : false
            message    : message.reset_forgot_password(reset_code:opts.reset_code, new_password:opts.new_password)
            cb         : opts.cb


    # forget about a given passport authentication strategy for this user
    unlink_passport: (opts) ->
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : undefined
        @call
            message    : message.unlink_passport
                strategy : opts.strategy
                id       : opts.id
            error_event : true
            timeout    : 15
            cb : opts.cb

     api_key: (opts) ->
        # getting, setting, deleting, etc., the api key for this account
        opts = defaults opts,
            action   : required   # 'get', 'delete', 'regenerate'
            password : required
            cb       : required
        if not @account_id?
            opts.cb?("must be logged in")
            return
        @call
            message: message.api_key
                action     : opts.action
                password   : opts.password
            error_event : true
            timeout : 10
            cb : (err, resp) ->
                opts.cb(err, resp?.api_key)

    ###
    Project Management
    ###
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

    open_project: (opts) =>
        opts = defaults opts,
            project_id   : required
            cb           : required
        @call
            message :
                message.open_project
                    project_id : opts.project_id
            cb : opts.cb

    write_text_file_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            content    : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined

        @call
            error_event : true
            message :
                message.write_text_file_to_project
                    project_id : opts.project_id
                    path       : opts.path
                    content    : opts.content
            timeout : opts.timeout
            cb      : (err, resp) => opts.cb?(err, resp)

    read_text_file_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
            timeout    : DEFAULT_TIMEOUT

        @call
            error_event : true
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
    read_file_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            timeout    : DEFAULT_TIMEOUT
            archive    : 'tar.bz2'   # NOT SUPPORTED ANYMORE! -- when path is a directory: 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'
            cb         : undefined

        base = window?.app_base_url ? '' # will be defined in web browser
        if opts.path[0] == '/'
            # absolute path to the root
            opts.path = '.smc/root' + opts.path  # use root symlink, which is created by start_smc
        url = misc.encode_path("#{base}/#{opts.project_id}/raw/#{opts.path}")
        opts.cb?(false, {url:url})
        return url

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
            message    : mesg
            allow_post : false     # since it may take too long
            cb         : (err, resp) =>
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
            error_event : true
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

    ###
    Execute code in a given project.

    Aggregate option -- use like this:

        webapp.exec
            aggregate: timestamp (or something else sequential)

    means: if there are multiple attempts to run the given command with the same
    time, they are all aggregated and run only one time by the project.   If requests
    comes in with a newer time, they all run in another group after the first
    one finishes.    The timestamp will usually come from something like the "last save
    time" (which is stored in the db), which they client will know.  This is used, e.g.,
    for operations like "run rst2html on this file whenever it is saved."
    ###
    exec: (opts) =>
        opts = defaults opts,
            project_id      : required
            path            : ''
            command         : required
            args            : []
            timeout         : 30
            network_timeout : undefined
            max_output      : undefined
            bash            : false
            aggregate       : undefined  # see comment above.
            err_on_exit     : true
            allow_post      : true       # set to false if genuinely could take a long time (e.g., more than about 5s?); but this requires websocket be setup, so more likely to fail or be slower.
            cb              : required   # cb(err, {stdout:..., stderr:..., exit_code:..., time:[time from client POV in ms]}).

        start_time = new Date()
        try
            ws = await @project_websocket(opts.project_id)
            exec_opts =
                path        : opts.path
                command     : opts.command
                args        : opts.args
                timeout     : opts.timeout
                max_output  : opts.max_output
                bash        : opts.bash
                err_on_exit : opts.err_on_exit
                aggregate   : opts.aggregate
            opts.cb(undefined, await ws.api.exec(exec_opts))
        catch err
            opts.cb(err)

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
            exclusion_args = underscore.map opts.exclusions, (excluded_path, index) =>
                "-a -not \\( -path '#{opts.path}/#{excluded_path}' -prune \\)"
            args = args.concat(exclusion_args)

        args = args.concat(tail_args)
        command = "find #{args.join(' ')}"

        @exec
            project_id : opts.project_id
            command    : command
            timeout    : 30
            allow_post : false  # walking tree can be slow!
            aggregate  : Math.round((new Date() - 0)/5000)  # aggregate calls into 5s windows, in case multiple clients ask for same find at once...
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
            active   : '6 months'
            admin    : false  # admins can do and admin version of the query, which returns email addresses and does substring searches on email
            cb       : required

        @call
            message : message.user_search(query:opts.query, limit:opts.limit, admin:opts.admin, active:opts.active)
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.results, opts.query_id)

    project_invite_collaborator: (opts) =>
        opts = defaults opts,
            project_id   : required
            account_id   : required
            title        : undefined
            link2proj    : undefined
            replyto      : undefined
            replyto_name : undefined
            email        : undefined
            subject      : undefined
            cb           : (err) =>

        @call
            message : message.invite_collaborator(
                project_id   : opts.project_id
                account_id   : opts.account_id
                title        : opts.title
                link2proj    : opts.link2pr
                replyto      : opts.replyto
                replyto_name : opts.replyto_name
                email        : opts.email
                subject      : opts.subject
            )
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

    ###
    Bulk information about several accounts (may be used by chat, etc.).
    Currently used for admin and public views, mainly.
    ###
    get_username: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required     # cb(err, map from account_id to {first_name:?, last_name:?})
        client_aggregate.get_username
            client     : @
            aggregate  : Math.floor(new Date()/60000)   # so it never actually calls to the backend more than once at a time (per minute).
            account_id : opts.account_id
            cb         : opts.cb

    #################################################
    # File Management
    #################################################
    project_websocket: (project_id) =>
        return await require('smc-webapp/project/websocket/connect').connection_to_project(project_id)

    project_directory_listing: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : '.'
            timeout    : 10  # in seconds
            hidden     : false
            cb         : required
        try
            ws = await @project_websocket(opts.project_id)
            listing = await ws.api.listing(opts.path, opts.hidden, opts.timeout*1000)
            opts.cb(undefined, {files:listing})
        catch err
            opts.cb(err)

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

    # Log given error to a backend table.  Logs the *same* error
    # at most once every 15 minutes.
    log_error: (error) =>
        @_log_error_cache ?= {}
        if not misc.is_string(error)
            error = misc.to_json(error)
        last = @_log_error_cache[error]
        if last? and new Date() - last <= 1000*60*15
            return
        @_log_error_cache[error] = new Date()
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
            plan      : required
            quantity  : 1
            coupon_id : undefined
            cb        : required
        @call
            message : message.stripe_create_subscription
                plan      : opts.plan
                quantity  : opts.quantity
                coupon_id : opts.coupon_id
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
            quantity  : undefined  # if given, must be >= number of projects
            coupon_id : undefined
            projects  : undefined  # ids of projects that subscription applies to
            plan      : undefined
            cb        : required
        @call
            message : message.stripe_update_subscription
                subscription_id : opts.subscription_id
                quantity  : opts.quantity
                coupon_id : opts.coupon_id
                projects  : opts.projects
                plan      : opts.plan
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

    # Gets the coupon for this account. Returns an error if invalid
    # https://stripe.com/docs/api#retrieve_coupon
    stripe_get_coupon: (opts) =>
        opts = defaults opts,
            coupon_id : undefined
            cb        : required

        @call
            message     :
                message.stripe_get_coupon(coupon_id : opts.coupon_id)
            error_event : true
            cb          : (err, mesg) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, mesg.coupon)

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
            amount        : undefined    # in US dollars -- if amount/description *not* given, then merely ensures user has stripe account and updats info about them
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
        if opts.body?
            # Make it so the session is ignored in any URL appearing in the body.
            # Obviously, this is not 100% bullet proof, but should help enormously.
            opts.body = misc.replace_all(opts.body, '?session=', '?session=#')
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

    # This is probably just for testing -- it's used by the HTTP API, but websocket clients
    # can just compute this themselves via results of DB query.
    get_available_upgrades: (cb) =>
        @call
            message     : message.get_available_upgrades()
            error_event : true
            cb          : cb

    # Remove all upgrades from all projects that this user collaborates on.
    remove_all_upgrades: (cb) =>
        @call
            message     : message.remove_all_upgrades()
            error_event : true
            cb          : cb

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

    sync_table: (query, options, debounce_interval=2000, throttle_changes=undefined) =>
        return synctable.sync_table(query, options, @, debounce_interval, throttle_changes)

    # this is async
    symmetric_channel: (name, project_id) =>
        if not misc.is_valid_uuid_string(project_id) or typeof(name) != 'string'
            throw Error("project_id must be a valid uuid")
        return (await @project_websocket(project_id)).api.symmetric_channel(name)

    sync_string: (opts) =>
        opts = defaults opts,
            id                 : undefined
            project_id         : required
            path               : required
            file_use_interval  : 'default'
            cursors            : false
            patch_interval     : 1000
            save_interval      : 2000
            before_change_hook : undefined
            after_change_hook  : undefined
        opts.client = @
        return new syncstring.SyncString(opts)

    sync_db: (opts) =>
        opts = defaults opts,
            project_id      : required
            path            : required
            primary_keys    : required
            string_cols     : undefined
            cursors         : false
            change_throttle : 500     # amount to throttle change events (in ms)
            patch_interval  : 1000
            save_interval   : 2000    # amount to debounce saves (in ms)
        opts.client = @
        return new db_doc.SyncDB(opts)

    open_existing_sync_document: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required  # cb(err, document)
        opts.client = @
        db_doc.open_existing_sync_document(opts)
        return

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

    _post_query: (opts) =>
        opts = defaults opts,
            query   : required
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            cb      : undefined
        data =
            query   : misc.to_json(opts.query)
            options : if opts.options then misc.to_json(opts.options)
        #tt0 = new Date()
        #console.log '_post_query', data
        jqXHR = $.post("#{window?.app_base_url ? ''}/user_query", data)
        if not opts.cb?
            #console.log 'no cb'
            return
        jqXHR.fail ->
            #console.log 'failed'
            opts.cb("failed")
            return
        jqXHR.done (resp) ->
            #console.log 'got back ', JSON.stringify(resp)
            #console.log 'TIME: ', new Date() - tt0
            if resp.error
                opts.cb(resp.error)
            else
                opts.cb(undefined, {query:resp.result})
        return

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            timeout : 30
            cb      : undefined
        if opts.options? and not misc.is_array(opts.options)
            throw Error("options must be an array")

        if not opts.changes and $?.post? and @_enable_post
            # Can do via http POST request, rather than websocket messages
            @_post_query
                query   : opts.query
                options : opts.options
                cb      : opts.cb
            return

        #@__query_id ?= 0; @__query_id += 1; id = @__query_id
        #console.log("#{(new Date()).toISOString()} -- #{id}: query=#{misc.to_json(opts.query)}")
        #tt0 = new Date()
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
            allow_post  : false   # since that would happen via @_post_query
            message     : mesg
            error_event : true
            timeout     : opts.timeout
            cb          : (args...) ->
                #console.log("#{(new Date()).toISOString()} -- #{id}: query_resp=#{misc.to_json(args)}")
                #console.log 'TIME: ', new Date() - tt0
                opts.cb?(args...)

    query_cancel: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined
        @call
            allow_post  : false   # since this is cancelling a changefeed
            message     : message.query_cancel(id:opts.id)
            error_event : true
            timeout     : 30
            cb          : opts.cb

    # Send metrics to the hub this client is connected to.
    # There is no confirmation or response.
    send_metrics: (metrics) =>
        @send(message.metrics(metrics:metrics))

    # Run prettier on a syncstring -- modifies the syncstring from the backend
    prettier: (opts) =>
        opts = defaults opts,
            path       : required
            project_id : required
            options    : undefined
            cb         : undefined
        try
            ws = await @project_websocket(opts.project_id)
            resp = await ws.api.prettier(opts.path, opts.options ? {})
            opts.cb(undefined, resp)
        catch err
            opts.cb(err)


#################################################
# Other account Management functionality shared between client and server
#################################################
exports.is_valid_password = (password) ->
    if typeof(password) != 'string'
        return [false, 'Password must be specified.']
    if password.length >= 6 and password.length <= 64
        return [true, '']
    else
        return [false, 'Password must be between 6 and 64 characters in length.']

exports.issues_with_create_account = (mesg) ->
    issues = {}
    if not mesg.agreed_to_terms
        issues.agreed_to_terms = 'Agree to the Salvus Terms of Service.'
    if mesg.first_name == ''
        issues.first_name = 'Enter your first name.'
    if mesg.last_name == ''
        issues.last_name = 'Enter your last name.'
    if not misc.is_valid_email_address(mesg.email_address)
        issues.email_address = 'Email address does not appear to be valid.'
    [valid, reason] = exports.is_valid_password(mesg.password)
    if not valid
        issues.password = reason
    return issues



