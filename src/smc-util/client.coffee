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

## NOTE: this whole file needs to
#   (1) be in typescript (as multiple files)
#   (2) and should be in smc-webapp, since it didn't end up getting used anywhere else...

DEBUG = false

# Maximum number of outstanding concurrent messages (that have responses)
# to send at once to backend.
MAX_CONCURRENT = 75

{EventEmitter} = require('events')
{callback} = require('awaiting')

async = require('async')
underscore = require('underscore')

synctable2 = require('./sync/table')
{synctable_project} = require('smc-webapp/project/websocket/synctable')
SyncString2 = require('smc-util/sync/editor/string/sync').SyncString
SyncDB2 = require('smc-util/sync/editor/db').SyncDB

smc_version = require('./smc-version')

message = require("./message")
misc    = require("./misc")

client_aggregate = require('./client-aggregate')

{once} = require('./async-utils')

{NOT_SIGNED_IN} = require('./consts')

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

{StripeClient} = require('smc-webapp/client/stripe')
{ProjectCollaborators} = require('smc-webapp/client/project-collaborators')
{SupportTickets} = require('smc-webapp/client/support')
{QueryClient} = require('smc-webapp/client/query')
{TimeClient} = require('smc-webapp/client/time')

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

        # Refactored functionality
        @stripe = new StripeClient(@call.bind(@))
        @project_collaborators = new ProjectCollaborators(@async_call.bind(@))
        @support_tickets = new SupportTickets(@async_call.bind(@))
        @query_client = new QueryClient(@)
        @time_client = new TimeClient(@)

        @url = url
        # Tweaks the maximum number of listeners an EventEmitter can have -- 0 would mean unlimited
        # The issue is https://github.com/sagemathinc/cocalc/issues/1098 and the errors we got are
        # (node) warning: possible EventEmitter memory leak detected. 301 listeners added. Use emitter.setMaxListeners() to increase limit.
        @setMaxListeners(3000)  # every open file/table/sync db listens for connect event, which adds up.

        # We heavily throttle this, since it's ONLY used for the connections dialog, which users
        # never look at, and it could waste cpu trying to update things for no reason.  It also
        # impacts the color of the connection indicator, so throttling will make that color
        # change a bit more laggy.  That's probably worth it.
        @_emit_mesg_info = underscore.throttle(@_emit_mesg_info, 10000)

        @emit("connecting")
        @_call             =
            queue       : []    # messages in the queue to send
            count       : 0     # number of message currently outstanding
            sent        : 0     # total number of messages sent to backend.
            sent_length : 0     # total amount of data sent
            recv        : 0     # number of messages received from backend
            recv_length : 0     # total amount of data recv'd
        @_id_counter       = 0
        @_data_handlers    = {}
        @execute_callbacks = {}
        @call_callbacks    = {}
        @_project_title_cache = {}
        @_usernames_cache = {}

        # Browser client should set @_redux, since this
        # is used in a few ways:
        #   - to be able to use mark_file
        #   - raising an error on attempt to get project_websocket for non-collab
        @_redux = undefined

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
                # If the character is anything else, [DEPRECATED and NOT USED ANYMORE].
                channel = data[0]
                data    = data.slice(1)

                @_handle_data(channel, data)

                # give other listeners a chance to do something with this data.
                @emit("data", channel, data)
        @_connected = false

        # start pinging -- not used/needed for primus,
        # but *is* needed for getting information about
        # server_time skew and showing ping time to user.
        # Starting pinging a few seconds after connecting the first time,
        # after things have settled down a little (to not throw off ping time).
        @once("connected", => setTimeout((=> @time_client.ping()), 5000))

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

    # Returns (approximate) time in ms since epoch on the server.
    # NOTE:
    #     This is guaranteed to be an *increasing* function, with an arbitrary
    #     ms added on in case of multiple calls at once, to guarantee uniqueness.
    #     Also, if the user changes their clock back a little, this will still
    #     increase... very slowly until things catch up.  This avoids any
    #     possibility of weird random re-ordering of patches within a given session.
    server_time: => @time_client.server_time()
    ping_test: (opts={}) => @time_client.ping_test(opts)


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
            when "cookies"
                @_cookies?(mesg)

            when "signed_in"
                @account_id = mesg.account_id
                @_signed_in = true
                @_signed_in_time = new Date().valueOf()
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
                if not mesg.error
                    # make sure mesg.error is set to something.
                    mesg.error = 'error'
                cb(mesg.error)
            else
                cb(undefined, mesg)
            if not mesg.multi_response
                delete @call_callbacks[id]

        # Finally, give other listeners a chance to do something with this message.
        @emit('message', mesg)

    _set_signed_out: =>
        @_signed_in = false
        @_redux?.getActions('account')?.set_user_type('public')

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
            if opts.error_event and resp?.event == 'error' and not resp.error
                # just in case the event is sent to error, but no error is set
                resp.error = 'error'
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

    call: (opts) =>
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

    # ASYNC FUNCTION
    # like call above, but async and error_event defaults to TRUE,
    # so an exception is raised on resp messages that have event='error'.
    async_call: (opts) =>
        f = (cb) =>
            opts.cb = cb
            @call(opts)
        if not opts.error_event?
            opts.error_event = true
        return await callback(f)

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
            first_name       : undefined
            last_name        : undefined
            email_address    : undefined
            password         : undefined
            agreed_to_terms  : undefined
            usage_intent     : undefined
            get_api_key      : undefined       # if given, will create/get api token in response message
            token            : undefined       # only required if an admin set the account creation token.
            timeout          : 40
            cb               : required

        #if not opts.agreed_to_terms
        #    opts.cb(undefined, message.account_creation_failed(reason:{"agreed_to_terms":"Agree to the CoCalc Terms of Service."}))
        #    return

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
                usage_intent    : opts.usage_intent
                token           : opts.token
                get_api_key     : opts.get_api_key
            timeout : opts.timeout
            cb      : (err, resp) =>
                setTimeout((() => delete @_create_account_lock), 1500)
                opts.cb(err, resp)

    delete_account: (opts) =>
        opts = defaults opts,
            account_id    : required
            timeout       : 40
            cb            : undefined

        @call
            allow_post : false
            message : message.delete_account
                account_id : opts.account_id
            timeout : opts.timeout
            cb      : opts.cb

    sign_in_using_auth_token: (opts) ->
        opts = defaults opts,
            auth_token : required
            cb         : undefined
        @call
            allow_post : false
            message : message.sign_in_using_auth_token
                auth_token : opts.auth_token
            timeout : opts.timeout
            cb      : opts.cb

    sign_in: (opts) ->
        opts = defaults opts,
            email_address   : required
            password        : required
            remember_me     : false
            cb              : undefined
            timeout         : 40
            get_api_key     : undefined       # if given, will create/get api token in response message

        @call
            allow_post : false
            message : message.sign_in
                email_address    : opts.email_address
                password         : opts.password
                remember_me      : opts.remember_me
                get_api_key      : opts.get_api_key
            timeout : opts.timeout
            cb      : opts.cb

    delete_remember_me_cookie: (cb) =>
        # This actually sets the content of the cookie to empty.
        # (I just didn't implement a delete action on the backend yet.)
        base_url = window.app_base_url ? ''
        mesg =
            url  : base_url + '/cookies'
            set  : base_url + 'remember_me'
        @_cookies(mesg, cb)

    sign_out: (opts) ->
        opts = defaults opts,
            everywhere   : false
            cb           : undefined
            timeout      : DEFAULT_TIMEOUT # seconds

        @delete_remember_me_cookie (err) =>
            if err
                opts.cb?("error deleting remember me cookie")
                return

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
            image       : undefined
            start       : false
            cb          : undefined
        @call
            allow_post : false  # since gets called for anonymous and cookie not yet set.
            message: message.create_project(title:opts.title, description:opts.description, image:opts.image, start:opts.start)
            cb     : (err, resp) =>
                if err
                    opts.cb?(err)
                else if resp.event == 'error'
                    opts.cb?(resp.error)
                else
                    opts.cb?(undefined, resp.project_id)
                    @user_tracking({event:'create_project', value:{project_id:resp.project_id, title:opts.title}})

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
            project_id : required  # string or array of strings
            path       : required  # string or array of strings
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
            exclude_history   : false       # if true, exclude all files of the form *.sage-history (these files are deprecated so this is pointless...)
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
            memory_request : undefined
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
            allow_post      : true       # **DEPRECATED** set to false if genuinely could take a long time (e.g., more than about 5s?); but this requires websocket be setup, so more likely to fail or be slower.
            env             : undefined  # extra environment variables
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
                env         : opts.env
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
            active   : ''   # if given, would restrict to users active this recently
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
        group = @_redux?.getStore('projects')?.get_my_group(project_id)
        if not group? or group == 'public'
            throw Error("no access to project websocket")
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

    # This is probably just for testing -- it's used by the HTTP API, but websocket clients
    # can just compute this themselves via results of DB query.
    get_available_upgrades: (cb) =>
        @call
            message     : message.get_available_upgrades()
            error_event : true
            cb          : cb

    # Remove all upgrades from all projects that this user collaborates on.
    remove_all_upgrades: (projects, cb) =>
        @call
            message     : message.remove_all_upgrades(projects:projects)
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

    sync_table2: (query, options, throttle_changes=undefined) =>
        return synctable2.synctable(query, options, @, throttle_changes)

    # This is async! The returned synctable is fully initialized.
    synctable_database: (query, options, throttle_changes=undefined) =>
        s = this.sync_table2(query, options, throttle_changes)
        await once(s, 'connected')
        return s

    synctable_no_changefeed: (query, options, throttle_changes=undefined) =>
        return synctable2.synctable_no_changefeed(query, options, @, throttle_changes)

    synctable_no_database: (query, options, throttle_changes=undefined) =>
        return synctable2.synctable_no_database(query, options, @, throttle_changes)

    # This is async! The returned synctable is fully initialized.
    synctable_project: (project_id, query, options, throttle_changes=undefined, id='') =>
        return await synctable_project(project_id:project_id, query:query, options:options, client:@, throttle_changes:throttle_changes, id:id)

    # this is async
    symmetric_channel: (name, project_id) =>
        if not misc.is_valid_uuid_string(project_id) or typeof(name) != 'string'
            throw Error("project_id must be a valid uuid")
        return (await @project_websocket(project_id)).api.symmetric_channel(name)

    sync_string2: (opts) =>
        opts = defaults opts,
            id                : undefined
            project_id        : required
            path              : required
            file_use_interval : 'default'
            cursors           : false
            patch_interval    : 1000
            save_interval     : 2000
            persistent        : false
            data_server       : undefined
        opts.client = @
        return new SyncString2(opts)

    sync_db2: (opts) =>
        opts = defaults opts,
            id                : undefined
            project_id        : required
            path              : required
            file_use_interval : 'default'
            cursors           : false
            patch_interval    : 1000
            save_interval     : 2000
            change_throttle   : undefined
            primary_keys      : required
            string_cols       : []
            persistent        : false
            data_server       : undefined
        opts.client = @
        return new SyncDB2(opts)

    # This now returns the new sync_db2 and sync_string2 objects.
    # ASYNC function
    open_existing_sync_document: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            data_server : undefined
            persistent : false
        opts.client = @
        {open_existing_sync_document} = require('smc-webapp/client/sync')
        return await open_existing_sync_document(opts)

    # Returns true if the given file in the given project is currently marked as deleted.
    is_deleted: (filename, project_id) =>
        return !!@_redux?.getProjectStore(project_id)?.get_listings()?.is_deleted(filename)

    set_deleted: (filename, project_id) =>
        throw Error("set_deleted doesn't make sense for the frontend")

    # If called on the fronted, will make the given file with the given action.
    # Does nothing on the backend.
    mark_file: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            action     : required
            ttl        : 120
        # Will only do something if @_redux has been set.
        @_redux?.getActions('file_use')?.mark_file(opts.project_id, opts.path, opts.action, opts.ttl)

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            standby : false        # if true and use HTTP post, then will use standby server (so must be read only)
            timeout : 30
            no_post : false        # if true, will not use a post query
            cb      : undefined
        if opts.changes
            # changefeed does a normal call with a opts.cb
            @query_client.query(opts)
            return
        # Use the async api
        cb = opts.cb
        if not cb?
            opts.ignore_response = true
        delete opts.cb
        try
            cb?(undefined, await @query_client.query(opts))
        catch err
            cb?(err.message)

    async_query: (opts) =>
        return await @query_client.query(opts)

    query_cancel: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined
        try
            opts.cb?(undefined, await @query_client.cancel(opts.id))
        catch err
            opts.cb?(err)

    async_query_cancel: (id) =>
        return await @query_client.cancel(id)

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

    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        if not @account_id?
            # silently ignore if not signed in
            opts.cb?()
            return
        # Throttle -- so if this function is called with the same project_id
        # twice in 20s, it's ignored (to avoid unnecessary network traffic).
        @_touch_project_throttle ?= {}
        last = @_touch_project_throttle[opts.project_id]
        if last? and new Date().valueOf() - last <= 20000
            opts.cb?()
            return
        @_touch_project_throttle[opts.project_id] = new Date().valueOf()
        @call
            allow_post  : true
            message     : message.touch_project(project_id: opts.project_id)
            error_event : true
            cb          : opts.cb

    disconnect_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        @call
            allow_post  : true
            message     : message.disconnect_from_project(project_id: opts.project_id)
            error_event : true
            cb          : opts.cb


    get_user_auth_token: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required

        @call
            allow_post  : false
            message     : message.user_auth(account_id:opts.account_id, password:'')
            error_event : true
            cb          : opts.cb

    mention: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            target     : required # account_id (for now)
            source     : required # account_id
            priority   : undefined # optional integer; larger number is higher; 0 is default.
            description: undefined # optional string context eg. part of the message
            cb         : undefined
        if not @is_signed_in()
            # wait until signed in, otherwise query below just fails
            # with an error and mention is lost
            await once(@, "signed_in")
        @query
            query :
                mentions : misc.copy_without(opts, 'cb')
            cb : opts.cb

    # This is async, so do "await smc_webapp.configuration(...project_id...)".
    configuration: (project_id, aspect, no_cache) =>
        if not misc.is_valid_uuid_string(project_id)
            throw Error("project_id must be a valid uuid")
        if typeof aspect != 'string'
            throw Error("aspect (=#{aspect}) must be a string")
        return (await @project_websocket(project_id)).api.configuration(aspect, no_cache)

    syncdoc_history: (opts) =>
        opts = defaults opts,
            string_id : required
            patches : false
            cb      : required
        @call
            message : message.get_syncdoc_history(string_id:opts.string_id, patches:opts.patches)
            error_event: true
            allow_post : false
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.history)

    user_tracking: (opts) =>
        opts = defaults opts,
            event : required
            value : {}
            cb    : undefined
        @call
            message    : message.user_tracking(evt:opts.event, value:opts.value)
            allow_post : true
            cb         : opts.cb

    admin_reset_password: (opts) =>
        opts = defaults opts,
            email_address : required
            cb         : required
        @call
            message    : message.admin_reset_password(email_address:opts.email_address)
            allow_post : true
            error_event : true
            cb         : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.link)

    admin_ban_user: (opts) =>
        opts = defaults opts,
            account_id : required
            ban        : true     # if true, ban user  -- if false, unban them.
            cb         : required
        @call
            message    : message.admin_ban_user(account_id:opts.account_id, ban:opts.ban)
            allow_post : true
            error_event : true
            cb         : (err, resp) =>
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
    if mesg.email_address and not misc.is_valid_email_address(mesg.email_address)
        issues.email_address = 'Email address does not appear to be valid.'
    if mesg.password
        [valid, reason] = exports.is_valid_password(mesg.password)
        if not valid
            issues.password = reason
    return issues


