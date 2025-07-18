#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details
#########################################################################

###
NOTE/ATTENTION!

A "local hub" is exactly the same thing as a "project".  I just used to call
them "local hubs" a very long time ago.

###


{PROJECT_HUB_HEARTBEAT_INTERVAL_S} = require('@cocalc/util/heartbeat')

# Connection to a Project (="local hub", for historical reasons only.)

async   = require('async')
{callback2} = require('@cocalc/util/async-utils')

uuid    = require('uuid')
winston = require('./logger').getLogger('local-hub-connection')
underscore = require('underscore')

message = require('@cocalc/util/message')
misc_node = require('@cocalc/backend/misc_node')
{connectToLockedSocket} = require("@cocalc/backend/tcp/locked-socket")
misc    = require('@cocalc/util/misc')
{defaults, required} = misc

blobs = require('./blobs')

# Blobs (e.g., files dynamically appearing as output in worksheets) are kept for this
# many seconds before being discarded.  If the worksheet is saved (e.g., by a user's autosave),
# then the BLOB is saved indefinitely.
BLOB_TTL_S = 60*60*24     # 1 day

if not process.env.SMC_TEST
    DEBUG = true

connect_to_a_local_hub = (opts) ->    # opts.cb(err, socket)
    opts = defaults opts,
        port         : required
        host         : required
        secret_token : required
        timeout      : 10
        cb           : required

    try
        socket = await connectToLockedSocket({port:opts.port, host:opts.host, token:opts.secret_token, timeout:opts.timeout})
        misc_node.enable_mesg(socket, 'connection_to_a_local_hub')
        opts.cb(undefined, socket)
    catch err
        opts.cb(err)

_local_hub_cache = {}
exports.new_local_hub = (project_id, database, projectControl) ->
    if not project_id?
        throw "project_id must be specified (it is undefined)"
    H  = _local_hub_cache[project_id]
    if H?
        winston.debug("new_local_hub('#{project_id}') -- using cached version")
    else
        winston.debug("new_local_hub('#{project_id}') -- creating new one")
        H = new LocalHub(project_id, database, projectControl)
        _local_hub_cache[project_id] = H
    return H

exports.connect_to_project = (project_id, database, projectControl, cb) ->
    hub = exports.new_local_hub(project_id, database, projectControl)
    hub.local_hub_socket (err) ->
        if err
            winston.debug("connect_to_project: error ensuring connection to #{project_id} -- #{err}")
        else
            winston.debug("connect_to_project: successfully ensured connection to #{project_id}")
        cb?(err)

exports.disconnect_from_project = (project_id) ->
    H = _local_hub_cache[project_id]
    delete _local_hub_cache[project_id]
    H?.free_resources()
    return

exports.all_local_hubs = () ->
    v = []
    for k, h of _local_hub_cache
        if h?
            v.push(h)
    return v

server_settings = undefined
init_server_settings = () ->
    server_settings = await require('./servers/server-settings').default()
    update = () ->
        winston.debug("local_hub_connection (version might have changed) -- checking on clients")
        for x in exports.all_local_hubs()
            x.restart_if_version_too_old()
    update()
    server_settings.table.on('change', update)

class LocalHub # use the function "new_local_hub" above; do not construct this directly!
    constructor: (@project_id, @database, @projectControl) ->
        if not server_settings?  # module being used -- make sure server_settings is initialized
            init_server_settings()
        @_local_hub_socket_connecting = false
        @_sockets = {}  # key = session_uuid:client_id
        @_sockets_by_client_id = {}   #key = client_id, value = list of sockets for that client
        @call_callbacks = {}
        @path = '.'    # should deprecate - *is* used by some random code elsewhere in this file
        @dbg("getting deployed running project")

    init_heartbeat: =>
        @dbg("init_heartbeat")
        if @_heartbeat_interval?  # already running
            @dbg("init_heartbeat -- already running")
            return
        send_heartbeat = =>
            @dbg("init_heartbeat -- send")
            @_socket?.write_mesg('json', message.heartbeat())
        @_heartbeat_interval = setInterval(send_heartbeat, PROJECT_HUB_HEARTBEAT_INTERVAL_S*1000)

    delete_heartbeat: =>
        if @_heartbeat_interval?
            @dbg("delete_heartbeat")
            clearInterval(@_heartbeat_interval)
            delete @_heartbeat_interval

    project: (cb) =>
        try
            cb(undefined, await @projectControl(@project_id))
        catch err
            cb(err)

    dbg: (m) =>
        ## only enable when debugging
        if DEBUG
            winston.debug("local_hub('#{@project_id}'): #{misc.to_json(m)}")

    restart: (cb) =>
        @dbg("restart")
        @free_resources()
        try
            await (await @projectControl(@project_id)).restart()
            cb()
        catch err
            cb(err)

    status: (cb) =>
        @dbg("status: get status of a project")
        try
            cb(undefined, await (await @projectControl(@project_id)).status())
        catch err
            cb(err)

    state: (cb) =>
        @dbg("state: get state of a project")
        try
            cb(undefined, await (await @projectControl(@project_id)).state())
        catch err
            cb(err)

    free_resources: () =>
        @dbg("free_resources")
        @query_cancel_all_changefeeds()
        @delete_heartbeat()
        delete @_ephemeral
        if @_ephemeral_timeout
            clearTimeout(@_ephemeral_timeout)
            delete @_ephemeral_timeout
        delete @address  # so we don't continue trying to use old address
        delete @_status
        delete @smc_version  # so when client next connects we ignore version checks until they tell us their version
        try
            @_socket?.end()
            winston.debug("free_resources: closed main local_hub socket")
        catch e
            winston.debug("free_resources: exception closing main _socket: #{e}")
        delete @_socket
        for k, s of @_sockets
            try
                s.end()
                winston.debug("free_resources: closed #{k}")
            catch e
                winston.debug("free_resources: exception closing a socket: #{e}")
        @_sockets = {}
        @_sockets_by_client_id = {}

    free_resources_for_client_id: (client_id) =>
        v = @_sockets_by_client_id[client_id]
        if v?
            @dbg("free_resources_for_client_id(#{client_id}) -- #{v.length} sockets")
            for socket in v
                try
                    socket.end()
                    socket.destroy()
                catch e
                    # do nothing
            delete @_sockets_by_client_id[client_id]

    # async
    init_ephemeral: () =>
        settings = await callback2(@database.get_project_settings, {project_id:@project_id})
        @_ephemeral = misc.copy_with(settings, ['ephemeral_disk', 'ephemeral_state'])
        @dbg("init_ephemeral -- #{JSON.stringify(@_ephemeral)}")
        # cache for 60s
        @_ephemeral_timeout = setTimeout((() => delete @_ephemeral), 60000)

    ephemeral_disk: () =>
        if not @_ephemeral?
            await @init_ephemeral()
        return @_ephemeral.ephemeral_disk

    ephemeral_state: () =>
        if not @_ephemeral?
            await @init_ephemeral()
        return @_ephemeral.ephemeral_state

    #
    # Project query support code
    #
    mesg_query: (mesg, write_mesg) =>
        dbg = (m) => winston.debug("mesg_query(project_id='#{@project_id}'): #{misc.trunc(m,200)}")
        dbg(misc.to_json(mesg))
        query = mesg.query
        if not query?
            write_mesg(message.error(error:"query must be defined"))
            return
        if await @ephemeral_state()
            @dbg("project has ephemeral state")
            write_mesg(message.error(error:"FATAL -- project has ephemeral state so no database queries are allowed"))
            return
        @dbg("project does NOT have ephemeral state")
        first = true
        if mesg.changes
            @_query_changefeeds ?= {}
            @_query_changefeeds[mesg.id] = true
        mesg_id = mesg.id
        @database.user_query
            project_id : @project_id
            query      : query
            options    : mesg.options
            changes    : if mesg.changes then mesg_id
            cb         : (err, result) =>
                if result?.action == 'close'
                    err = 'close'
                if err
                    dbg("project_query error: #{misc.to_json(err)}")
                    if @_query_changefeeds?[mesg_id]
                        delete @_query_changefeeds[mesg_id]
                    write_mesg(message.error(error:err))
                    if mesg.changes and not first
                        # also, assume changefeed got messed up, so cancel it.
                        @database.user_query_cancel_changefeed(id : mesg_id)
                else
                    #if Math.random() <= .3  # for testing -- force forgetting about changefeed with probability 10%.
                    #    delete @_query_changefeeds[mesg_id]
                    if mesg.changes and not first
                        resp = result
                        resp.id = mesg_id
                        resp.multi_response = true
                    else
                        first = false
                        resp = mesg
                        resp.query = result
                    write_mesg(resp)

    mesg_query_cancel: (mesg, write_mesg) =>
        if not @_query_changefeeds?
            # no changefeeds
            write_mesg(mesg)
        else
            @database.user_query_cancel_changefeed
                id : mesg.id
                cb : (err, resp) =>
                    if err
                        write_mesg(message.error(error:err))
                    else
                        mesg.resp = resp
                        write_mesg(mesg)
                        delete @_query_changefeeds?[mesg.id]

    query_cancel_all_changefeeds: (cb) =>
        if not @_query_changefeeds? or @_query_changefeeds.length == 0
            cb?(); return
        dbg = (m) => winston.debug("query_cancel_all_changefeeds(project_id='#{@project_id}'): #{m}")
        v = @_query_changefeeds
        dbg("canceling #{v.length} changefeeds")
        delete @_query_changefeeds
        f = (id, cb) =>
            dbg("canceling id=#{id}")
            @database.user_query_cancel_changefeed
                id : id
                cb : (err) =>
                    if err
                        dbg("FEED: warning #{id} -- error canceling a changefeed #{misc.to_json(err)}")
                    else
                        dbg("FEED: canceled changefeed -- #{id}")
                    cb()
        async.map(misc.keys(v), f, (err) => cb?(err))

    # async -- throws error if project doesn't have access to string with this id.
    check_syncdoc_access: (string_id) =>
        if not typeof string_id == 'string' and string_id.length == 40
            throw Error('string_id must be specified and valid')
            return
        opts =
            query : "SELECT project_id FROM syncstrings"
            where : {"string_id = $::CHAR(40)" : string_id}
        results = await callback2(@database._query, opts)
        if results.rows.length != 1
            throw Error("no such syncdoc")
        if results.rows[0].project_id != @project_id
            throw Error("project does NOT have access to this syncdoc")
        return  # everything is fine.

    #
    # end project query support code
    #

    # local hub just told us its version.  Record it.  Restart project if hub version too old.
    local_hub_version: (version) =>
        winston.debug("local_hub_version: version=#{version}")
        @smc_version = version
        @restart_if_version_too_old()

    # If our known version of the project is too old compared to the
    # current version_min_project in smcu-util/smc-version, then
    # we restart the project, which updates the code to the latest
    # version.  Only restarts the project if we have an open control
    # socket to it.
    # Please make damn sure to update the project code on the compute
    # server before updating the version, or the project will be
    # forced to restart and it won't help!
    restart_if_version_too_old: () =>
        if not @_socket?
            # not connected at all -- just return
            return
        if not @smc_version?
            # client hasn't told us their version yet
            return
        if server_settings.version.version_min_project <= @smc_version
            # the project is up to date
            return
        if @_restart_goal_version == server_settings.version.version_min_project
            # We already restarted the project in an attempt to update it to this version
            # and it didn't get updated.  Don't try again until @_restart_version is cleared, since
            # we don't want to lock a user out of their project due to somebody forgetting
            # to update code on the compute server!  It could also be that the project just
            # didn't finish restarting.
            return

        winston.debug("restart_if_version_too_old(#{@project_id}): #{@smc_version}, #{server_settings.version.version_min_project}")
        # record some stuff so that we don't keep trying to restart the project constantly
        ver = @_restart_goal_version = server_settings.version.version_min_project # version which we tried to get to
        f = () =>
            if @_restart_goal_version == ver
                delete @_restart_goal_version
        setTimeout(f, 15*60*1000)  # don't try again for at least 15 minutes.

        @dbg("restart_if_version_too_old -- restarting since #{server_settings.version.version_min_project} > #{@smc_version}")
        @restart (err) =>
            @dbg("restart_if_version_too_old -- done #{err}")

    # handle incoming JSON messages from the local_hub
    handle_mesg: (mesg, socket) =>
        @dbg("local_hub --> hub: received mesg: #{misc.trunc(misc.to_json(mesg), 250)}")
        if mesg.client_id?
            # Should we worry about ensuring that message from this local hub are allowed to
            # send messages to this client?  NO.  For them to send a message, they would have to
            # know the client's id, which is a random uuid, assigned each time the user connects.
            # It obviously is known to the local hub -- but if the user has connected to the local
            # hub then they should be allowed to receive messages.
            # *DEPRECATED*
            return
        if mesg.event == 'version'
            @local_hub_version(mesg.version)
            return
        if mesg.id?
            f = @call_callbacks[mesg.id]
            if f?
                f(mesg)
            else
                winston.debug("handling call from local_hub")
                write_mesg = (resp) =>
                    resp.id = mesg.id
                    @local_hub_socket (err, sock) =>
                        if not err
                            sock.write_mesg('json', resp)
                switch mesg.event
                    when 'ping'
                        write_mesg(message.pong())
                    when 'query'
                        @mesg_query(mesg, write_mesg)
                    when 'query_cancel'
                        @mesg_query_cancel(mesg, write_mesg)
                    when 'file_written_to_project'
                        # ignore -- don't care; this is going away
                        return
                    when 'file_read_from_project'
                        # handle elsewhere by the code that requests the file
                        return
                    when 'error'
                        # ignore -- don't care since handler already gone.
                        return
                    else
                        write_mesg(message.error(error:"unknown event '#{mesg.event}'"))
            return

    handle_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            blob : required

        @dbg("local_hub --> global_hub: received a blob with uuid #{opts.uuid}")
        # Store blob in DB.
        blobs.save_blob
            uuid       : opts.uuid
            blob       : opts.blob
            project_id : @project_id
            ttl        : BLOB_TTL_S
            check      : true         # if malicious user tries to overwrite a blob with given sha1 hash, they get an error.
            database   : @database
            cb    : (err, ttl) =>
                if err
                    resp = message.save_blob(sha1:opts.uuid, error:err)
                    @dbg("handle_blob: error! -- #{err}")
                else
                    resp = message.save_blob(sha1:opts.uuid, ttl:ttl)

                @local_hub_socket  (err, socket) =>
                    if not err
                        socket.write_mesg('json', resp)

    # Connection to the remote local_hub daemon that we use for control.
    local_hub_socket: (cb) =>
        if @_socket?
            #@dbg("local_hub_socket: re-using existing socket")
            cb(undefined, @_socket)
            return

        if @_local_hub_socket_connecting
            @_local_hub_socket_queue.push(cb)
            @dbg("local_hub_socket: added socket request to existing queue, which now has length #{@_local_hub_socket_queue.length}")
            return
        @_local_hub_socket_connecting = true
        @_local_hub_socket_queue = [cb]
        connecting_timer = undefined

        cancel_connecting = () =>
            @_local_hub_socket_connecting = false
            if @_local_hub_socket_queue?
                @dbg("local_hub_socket: canceled due to timeout")
                for c in @_local_hub_socket_queue
                    c?('timeout')
                delete @_local_hub_socket_queue
            clearTimeout(connecting_timer)

        # If below fails for 20s for some reason, cancel everything to allow for future attempt.
        connecting_timer = setTimeout(cancel_connecting, 20000)

        @dbg("local_hub_socket: getting new socket")
        @new_socket (err, socket) =>
            if not @_local_hub_socket_queue?
                # already gave up.
                return
            @_local_hub_socket_connecting = false
            @dbg("local_hub_socket: new_socket returned #{err}")
            if err
                for c in @_local_hub_socket_queue
                    c?(err)
                delete @_local_hub_socket_queue
            else
                socket.on 'mesg', (type, mesg) =>
                    switch type
                        when 'blob'
                            @handle_blob(mesg)
                        when 'json'
                            @handle_mesg(mesg, socket)

                socket.on('end',   @free_resources)
                socket.on('close', @free_resources)
                socket.on('error', @free_resources)

                # Send a hello message to the local hub, so it knows this is the control connection,
                # and not something else (e.g., a console).
                socket.write_mesg('json', {event:'hello'})

                for c in @_local_hub_socket_queue
                    c?(undefined, socket)
                delete @_local_hub_socket_queue

                @_socket = socket
                @init_heartbeat()  # start sending heartbeat over this socket

                # Finally, we wait a bit to see if the version gets sent from
                # the client.  If not, we set it to 0, which will cause a restart,
                # which will upgrade to a new version that sends versions.
                # TODO: This code can be deleted after all projects get restarted.
                check_version_received = () =>
                    if @_socket? and not @smc_version?
                        @smc_version = 0
                        @restart_if_version_too_old()
                setTimeout(check_version_received, 60*1000)

            cancel_connecting()

    # Get a new connection to the local_hub,
    # authenticated via the secret_token, and enhanced
    # to be able to send/receive json and blob messages.
    new_socket: (cb) =>     # cb(err, socket)
        @dbg("new_socket")
        f = (cb) =>
            if not @address?
                cb("no address")
                return
            if not @address.port?
                cb("no port")
                return
            if not @address.host?
                cb("no host")
                return
            if not @address.secret_token?
                cb("no secret_token")
                return
            connect_to_a_local_hub
                port         : @address.port
                host         : @address.ip ? @address.host   # prefer @address.ip if it exists (e.g., for cocalc-kubernetes); otherwise use host (which is where compute server is).
                secret_token : @address.secret_token
                cb           : cb
        socket = undefined
        async.series([
            (cb) =>
                if not @address?
                    @dbg("get address of a working local hub")
                    try
                        @address = await (await @projectControl(@project_id)).address()
                        cb()
                    catch err
                        cb(err)
                else
                    cb()
            (cb) =>
                @dbg("try to connect to local hub socket using last known address")
                f (err, _socket) =>
                    if not err
                        socket = _socket
                        cb()
                    else
                        @dbg("failed to get address of a working local hub -- #{err}")
                        try
                            @address = await (await @projectControl(@project_id)).address()
                            cb()
                        catch err
                            cb(err)
            (cb) =>
                if not socket?
                    @dbg("still don't have our connection -- try again")
                    f (err, _socket) =>
                        socket = _socket; cb(err)
                else
                    cb()
        ], (err) =>
            cb(err, socket)
        )

    remove_multi_response_listener: (id) =>
        delete @call_callbacks[id]

    call: (opts) =>
        opts = defaults opts,
            mesg           : required
            timeout        : undefined  # NOTE: a nonzero timeout MUST be specified, or we will not even listen for a response from the local hub!  (Ensures leaking listeners won't happen.)
            multi_response : false   # if true, timeout ignored; call @remove_multi_response_listener(mesg.id) to remove
            cb             : undefined
        @dbg("call")
        if not opts.mesg.id?
            if opts.timeout or opts.multi_response   # opts.timeout being undefined or 0 both mean "don't do it"
                opts.mesg.id = uuid.v4()

        @local_hub_socket (err, socket) =>
            if err
                @dbg("call: failed to get socket -- #{err}")
                opts.cb?(err)
                return
            @dbg("call: get socket -- now writing message to the socket -- #{misc.trunc(misc.to_json(opts.mesg),200)}")
            socket.write_mesg 'json', opts.mesg, (err) =>
                if err
                    @free_resources()   # at least next time it will get a new socket
                    opts.cb?(err)
                    return
                if opts.multi_response
                    @call_callbacks[opts.mesg.id] = opts.cb
                else if opts.timeout
                    # Listen to exactly one response, them remove the listener:
                    @call_callbacks[opts.mesg.id] = (resp) =>
                        delete @call_callbacks[opts.mesg.id]
                        if resp.event == 'error'
                            opts.cb(resp.error)
                        else
                            opts.cb(undefined, resp)
                # As mentioned above -- there's no else -- if not timeout then
                # we do not listen for a response.

    # Read a file from a project into memory on the hub.
    # I think this is used only by the API, but not by browser clients anymore.
    read_file: (opts) => # cb(err, content_of_file)
        {path, project_id, archive, cb} = defaults opts,
            path       : required
            project_id : required
            archive    : 'tar.bz2'   # for directories; if directory, then the output object "data" has data.archive=actual extension used.
            cb         : required
        @dbg("read_file '#{path}'")
        socket    = undefined
        id        = uuid.v4()
        data      = undefined
        data_uuid = undefined
        result_archive = undefined

        async.series([
            # Get a socket connection to the local_hub.
            (cb) =>
                @local_hub_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                socket.write_mesg('json', message.read_file_from_project(id:id, project_id:project_id, path:path, archive:archive))
                socket.recv_mesg
                    type    : 'json'
                    id      : id
                    timeout : 60
                    cb      : (mesg) =>
                        switch mesg.event
                            when 'error'
                                cb(mesg.error)
                            when 'file_read_from_project'
                                data_uuid = mesg.data_uuid
                                result_archive = mesg.archive
                                cb()
                            else
                                cb("Unknown mesg event '#{mesg.event}'")
            (cb) =>
                socket.recv_mesg
                    type    : 'blob'
                    id      : data_uuid
                    timeout : 60
                    cb      : (_data) =>
                        # recv_mesg returns either a Buffer blob
                        # *or* a {event:'error', error:'the error'} object.
                        # Fortunately `new Buffer().event` is valid (and undefined).
                        if _data.event == 'error'
                            cb(_data.error)
                        else
                            data = _data
                            data.archive = result_archive
                            cb()
        ], (err) =>
            if err
                cb(err)
            else
                cb(undefined, data)
        )

    # Write a file to a project
    # I think this is used only by the API, but not by browser clients anymore.
    write_file: (opts) => # cb(err)
        {path, project_id, cb, data} = defaults opts,
            path       : required
            project_id : required
            data       : required   # what to write
            cb         : required
        @dbg("write_file '#{path}'")
        id        = uuid.v4()
        data_uuid = uuid.v4()

        @local_hub_socket (err, socket) =>
            if err
                opts.cb(err)
                return
            mesg = message.write_file_to_project
                id         : id
                project_id : project_id
                path       : path
                data_uuid  : data_uuid
            socket.write_mesg('json', mesg)
            socket.write_mesg('blob', {uuid:data_uuid, blob:data})
            socket.recv_mesg
                type    : 'json'
                id      : id
                timeout : 10
                cb      : (mesg) =>
                    switch mesg.event
                        when 'file_written_to_project'
                            opts.cb()
                        when 'error'
                            opts.cb(mesg.error)
                        else
                            opts.cb("unexpected message type '#{mesg.event}'")
