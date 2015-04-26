###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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


#################################################################
#
# compute -- a node.js client/server that provides a TCP server
# that is used by the hubs to organize compute nodes that
# get their projects from Google Cloud storage and store and
# snapshot them using Btrfs.
#
#################################################################

STATES =
    closed:
        desc     : 'None of the files, users, etc. for this project are on the compute server.'
        stable   : true
        to       :
            open : 'opening'
        commands : ['open', 'move', 'status', 'destroy']

    opened:
        desc: 'All files and snapshots are ready to use and the project user has been created, but local hub is not running.'
        stable   : true
        to       :
            start : 'starting'
            close : 'closing'
            save  : 'saving'
        commands : ['start', 'close', 'save', 'copy_path', 'directory_listing', 'read_file', 'network', 'disk_quota', 'compute_quota', 'status']

    running:
        desc     : 'The project is opened and ready to be used.'
        stable   : true
        to       :
            stop : 'stopping'
            save : 'saving'
        commands : ['stop', 'save', 'address', 'copy_path', 'directory_listing', 'read_file', 'network', 'disk_quota', 'compute_quota', 'status']

    saving:
        desc     : 'The project is being snapshoted and saved to cloud storage.'
        to       : {}
        commands : ['address', 'copy_path', 'directory_listing', 'read_file', 'network', 'disk_quota', 'compute_quota', 'status']

    closing:
        desc     : 'The project is in the process of being closed, so the latest changes are being uploaded, everything is stopping, the files will be removed from this computer.'
        to       : {}
        commands : ['status']

    opening:
        desc     : 'The project is being opened, so all files and snapshots are being downloaded, the user is being created, etc.'
        to       : {}
        commands : ['status']

    starting:
        desc     : 'The project is starting up and getting ready to be used.'
        to       :
            save : 'saving'
        commands : ['save', 'copy_path', 'directory_listing', 'read_file', 'network', 'disk_quota', 'compute_quota', 'status']

    stopping:
        desc     : 'All processes associated to the project are being killed.'
        to       :
            save : 'saving'
        commands : ['save', 'copy_path', 'directory_listing', 'read_file', 'network', 'disk_quota', 'compute_quota', 'status']

###
Here's a picture of the finite state machine:

                              --------- [stopping] <--------
                             \|/                           |
[closed] --> [opening] --> [opened] --> [starting] --> [running]
                             /|\                          /|\
                              |                            |
                             \|/                          \|/
                           [saving]                     [saving]


###


async     = require('async')
winston   = require('winston')
program   = require('commander')
daemon    = require('start-stop-daemon')
net       = require('net')
fs        = require('fs')
message   = require('message')
misc      = require('misc')
misc_node = require('misc_node')
uuid      = require('node-uuid')
cassandra = require('cassandra')
cql       = require("cassandra-driver")

{EventEmitter} = require('events')

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

{defaults, required} = misc

TIMEOUT = 60*60

BTRFS   = if process.env.SMC_BTRFS? then process.env.SMC_BTRFS else 'projects'
BUCKET  = process.env.SMC_BUCKET
ARCHIVE = process.env.SMC_ARCHIVE


#################################################################
#
# Client code -- runs in hub
#
#################################################################

###
x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s)
###
compute_server_cache = undefined
exports.compute_server = compute_server = (opts) ->
    opts = defaults opts,
        database : undefined
        keyspace : undefined
        cb       : required
    if compute_server_cache?
        opts.cb(undefined, compute_server_cache)
    else
        new ComputeServerClient(opts)

class ComputeServerClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined
            keyspace : undefined
            cb       : required
        dbg = @dbg("constructor")
        @_project_cache = {}
        if opts.database?
            dbg("using database")
            @database = opts.database
            compute_server_cache = @
            opts.cb(undefined, @)
        else if opts.keyspace?
            dbg("using keyspace '#{opts.keyspace}'")
            fs.readFile "#{process.cwd()}/data/secrets/cassandra/hub", (err, password) =>
                if err
                    winston.debug("warning: no password file -- will only work if there is no password set.")
                    password = ''
                @database = new cassandra.Salvus
                    hosts       : ['localhost']
                    keyspace    : opts.keyspace
                    username    : 'hub'
                    consistency : cql.types.consistencies.localQuorum
                    password    : password.toString().trim()
                    cb          : (err) =>
                        if err
                            dbg("error getting database -- #{err}")
                            opts.cb(err)
                        else
                            dbg("got database")
                            compute_server_cache = @
                            opts.cb(undefined, @)
        else
            opts.cb("database or keyspace must be specified")

    dbg: (method) =>
        return (m) => winston.debug("ComputeServerClient.#{method}: #{m}")

    ###
    # get info about server and add to database
         require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);s.add_server(host:'localhost', cb:(e)->console.log("done",e)))
    ###
    add_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : 0         # 0, 1, 2, .etc.
            experimental : false     # if true, don't allocate new projects here
            timeout      : 30
            cb           : undefined
        dbg = @dbg("add_server(#{opts.host})")
        dbg("adding compute server to the database by grabbing conf files, etc.")

        get_file = (path, cb) =>
            dbg("get_file: #{path}")
            misc_node.execute_code
                command : "ssh"
                path    : process.cwd()
                timeout : opts.timeout
                args    : ['-o', 'StrictHostKeyChecking=no', opts.host, "cat #{path}"]
                verbose : 0
                cb      : (err, output) =>
                    if err
                        cb(err)
                    else if output?.stderr and output.stderr.indexOf('No such file or directory') != -1
                        cb(output.stderr)
                    else
                        cb(undefined, output.stdout)

        set =
            dc           : opts.dc
            port         : undefined
            secret       : undefined
            experimental : opts.experimental

        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        get_file program.port_file, (err, port) =>
                            set.port = parseInt(port); cb(err)
                    (cb) =>
                        get_file program.secret_file, (err, secret) =>
                            set.secret = secret
                            cb(err)
                ], cb)
            (cb) =>
                dbg("update database")
                @database.update
                    table : 'compute_servers'
                    set   : set
                    where : {host:opts.host}
                    cb    : cb
        ], (err) => opts.cb?(err))

    # choose a random host for a project from the available compute_servers
    random_host: (opts) =>
        opts = defaults opts,
            cb       : required
        dbg = @dbg("random_host")
        dbg("querying database")
        @database.select
            table     : 'compute_servers'
            columns   : ['host', 'experimental']
            objectify : true
            cb        : (err, s) =>
                if err
                    dbg("error querying database for servers -- #{err}")
                    opts.cb(err)
                else
                    # TODO: take into account load, health, etc.
                    v = (x.host for x in s when not x.experimental)
                    dbg("got compute servers: #{misc.to_json(v)}")
                    opts.cb(undefined, misc.random_choice(v))


    # get a socket connection to a particular compute server
    socket: (opts) =>
        opts = defaults opts,
            host : required
            cb   : required
        dbg = @dbg("socket(#{opts.host})")

        if not @_socket_cache?
            @_socket_cache = {}
        socket = @_socket_cache[opts.host]
        if socket?
            opts.cb(undefined, socket)
            return
        info = undefined
        async.series([
            (cb) =>
                dbg("getting port and secret...")
                @database.select_one
                    table     : 'compute_servers'
                    columns   : ['port', 'secret']
                    where     : {host: opts.host}
                    objectify : true
                    cb        : (err, x) =>
                        info = x; cb(err)
            (cb) =>
                dbg("connecting to #{opts.host}:#{info.port}...")
                misc_node.connect_to_locked_socket
                    host    : opts.host
                    port    : info.port
                    token   : info.secret
                    timeout : 15
                    cb      : (err, socket) =>
                        if err
                            dbg("failed to connect: #{err}")
                            cb(err)
                        else
                            @_socket_cache[opts.host] = socket
                            misc_node.enable_mesg(socket)
                            socket.id = uuid.v4()
                            dbg("successfully connected -- socket #{socket.id}")
                            socket.on 'close', () =>
                                dbg("socket #{socket.id} closed")
                                if @_socket_cache[opts.host].id == socket.id
                                    delete @_socket_cache[opts.host]
                                socket.removeAllListeners()
                            socket.on 'mesg', (type, mesg) =>
                                if type == 'json'
                                    if mesg.event == 'project_state_update'
                                        winston.debug("state_update #{misc.to_json(mesg)}")
                                        p = @_project_cache[mesg.project_id]
                                        if p? and p.host == opts.host  # ignore updates from wrong host
                                            p._state      = mesg.state
                                            p._state_time = new Date()
                                            p.emit(p._state, p)
                                            if STATES[mesg.state].is_stable
                                                p.emit('stable', mesg.state)
                                    else
                                        winston.debug("mesg (hub <- compute): #{misc.to_json(mesg)}")
                            cb()
        ], (err) =>
            opts.cb(err, @_socket_cache[opts.host])
        )

    ###
    Send message to a server and get back result:

    x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.call(host:'localhost',mesg:{event:'ping'},cb:console.log))
    ###
    call: (opts) =>
        opts = defaults opts,
            host    : required
            mesg    : undefined
            timeout : 15
            cb      : required

        dbg = @dbg("call(#{opts.host})")
        #dbg("(hub --> compute) #{misc.to_json(opts.mesg)}")
        #dbg("(hub --> compute) #{misc.to_safe_str(opts.mesg)}")
        socket = undefined
        resp = undefined
        if not opts.mesg.id?
            opts.mesg.id = uuid.v4()
        async.series([
            (cb) =>
                @socket
                    host : opts.host
                    cb   : (err, s) =>
                        socket = s; cb(err)
            (cb) =>
                socket.write_mesg 'json', opts.mesg, (err) =>
                    if err
                        cb("error writing to socket -- #{err}")
                    else
                        dbg("waiting to receive response with id #{opts.mesg.id}")
                        socket.recv_mesg
                            type    : 'json'
                            id      : opts.mesg.id
                            timeout : opts.timeout
                            cb      : (mesg) =>
                                dbg("got response -- #{misc.to_safe_str(mesg)}")
                                if mesg.event == 'error'
                                    dbg("error = #{mesg.error}")
                                    cb(mesg.error)
                                else
                                    delete mesg.id
                                    resp = mesg
                                    dbg("success: resp=#{misc.to_safe_str(resp)}")
                                    cb()
        ], (err) =>
            opts.cb(err, resp)
        )

    ###
    Get a project:
        x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:'20257d4e-387c-4b94-a987-5d89a3149a00',cb:(e,p)->console.log(e);x.p=p))
    ###
    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_project_cache?
            @_project_cache = {}
        p = @_project_cache[opts.project_id]
        if p?
            opts.cb(undefined, p)
        else
            new ProjectClient
                project_id     : opts.project_id
                compute_server : @
                cb             : (err, project) =>
                    if err
                        opts.cb(err)
                    else
                        @_project_cache[opts.project_id] = project
                        opts.cb(undefined, project)

class ProjectClient extends EventEmitter
    constructor: (opts) ->
        opts = defaults opts,
            project_id     : required
            compute_server : required
            cb             : required
        @project_id = opts.project_id
        @compute_server = opts.compute_server
        @_state = undefined
        @_state_time = undefined
        dbg = @dbg('constructor')
        dbg("getting project's host")
        @update_host
            cb : (err) =>
                if err
                    dbg("failed to create project getting host -- #{err}")
                    opts.cb(err)
                else
                    dbg("successfully created project on '#{@host}'")
                    opts.cb(undefined, @)

        # Watch for state change to saving, which means that a save
        # has started (possibly initiated by another hub).  We note
        # that in the @_last_save variable so we don't even try
        # to save until later.
        @on 'saving', () =>
            @_last_save = new Date()

    dbg: (method) =>
        (m) => winston.debug("ProjectClient(#{@project_id},#{@host}).#{method}: #{m}")


    update_host: (opts) =>
        opts = defaults opts,
            cb : required
        host = undefined
        previous_host = @host
        dbg = @dbg("update_host")
        t = misc.mswalltime()
        async.series([
            (cb) =>
                dbg("querying database for compute server")
                @compute_server.database.select
                    table   : 'projects'
                    columns : ['compute_server']
                    where   :
                        project_id : @project_id
                    cb      : (err, result) =>
                        if err
                            dbg("error querying database -- #{err}")
                            cb(err)
                        else
                            if result.length == 1 and result[0][0]
                                dbg("got host='#{host}'")
                                host = result[0][0]
                            cb()
            (cb) =>
                if host?
                    cb()
                else
                    dbg("assigning random host")
                    @compute_server.random_host
                        cb : (err, h) =>
                            if err
                                dbg("error assigning random host -- #{err}")
                                cb(err)
                            else
                                host = h
                                dbg("chose random host #{host}")
                                @compute_server.database.update
                                    table : 'projects'
                                    set   : {compute_server : @host}
                                    where : {project_id : @project_id}
                                    cb    : cb
        ], (err) =>
            if not err
                @host = host
                if host != previous_host
                    dbg("host changed from #{previous_host} to #{host}")
            dbg("time=#{misc.mswalltime(t)}ms")
            opts.cb(err, host)
        )

    _action: (opts) =>
        opts = defaults opts,
            action  : required
            args    : undefined
            timeout : 30
            cb      : required
        dbg = @dbg("_action")
        dbg("action=#{opts.action}; params=#{misc.to_safe_str(opts.params)}")
        dbg("first update host to use the right compute server")
        @update_host
            cb : (err) =>
                if err
                    dbg("error updating host #{err}")
                    opts.cb(err); return
                dbg("calling compute server at '#{@host}'")
                @compute_server.call
                    host : @host
                    mesg :
                        message.compute
                            project_id : @project_id
                            action     : opts.action
                            args       : opts.args
                    timeout : opts.timeout
                    cb      : (err, resp) =>
                        if err
                            dbg("error calling compute server")
                            opts.cb(err)
                        else
                            dbg("got response #{misc.to_safe_str(resp)}")
                            if resp.error?
                                opts.cb(resp.error)
                            else
                                opts.cb(undefined, resp)

    ###
    x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:'20257d4e-387c-4b94-a987-5d89a3149a00',cb:(e,p)->console.log(e);x.p=p; x.p.state(cb:console.log)))
    ###

    # STATE/STATUS info
    state: (opts) =>
        opts = defaults opts,
            force  : false   # don't use local cached or value obtaine
            cb     : required
        dbg = @dbg("state(force:#{opts.force})")
        if opts.force or (not @_state? or not @_state_time?)
            dbg("calling remote server for state")
            @_action
                action : "state"
                cb     : (err, resp) =>
                    if err
                        dbg("problem getting state -- #{err}")
                        opts.cb(err)
                    else
                        dbg("got state='#{@_state}'")
                        @_state      = resp.state
                        @_state_time = resp.time
                        opts.cb(undefined, resp)
        else
            dbg("getting state='#{@_state}' from cache")
            x =
                state : @_state
                time  : @_state_time
            opts.cb(undefined, x)

    # information about project (ports, state, etc.)
    status: (opts) =>
        opts = defaults opts,
            cb     : required
        @dbg("status")()
        @_action
            action : "status"
            cb     : opts.cb

    # COMMANDS:

    # open project files on some node
    open: (opts) =>
        opts = defaults opts,
            cb     : required
        @dbg("open")()
        @_action
            action : "open"
            cb     : opts.cb

    # start local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            cb     : required
        @dbg("start")()
        @_action
            action : "start"
            cb     : opts.cb

    # restart project -- must be opened or running
    restart: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("restart")
        dbg("get state")
        @state
            cb : (err, s) =>
                if err
                    dbg("error getting state - #{err}")
                    opts.cb(err)
                    return
                dbg("got state '#{s.state}'")
                if s.state == 'opened'
                    dbg("just start it")
                    @start(cb: opts.cb)
                    return
                else if s.state == 'running'
                    dbg("stop it")
                    @stop
                        cb : (err) =>
                            if err
                                opts.cb(err)
                                return
                            # return to caller since the once below
                            # can take a long time.
                            opts.cb()
                            # wait however long for stop to finish, then
                            # issue a start
                            @once 'opened', () =>
                                # now we can start it again
                                @start
                                    cb : (err) =>
                                        dbg("start finished -- #{err}")
                else
                    opts.cb("may only restart when state is opened or running")


    # kill everything and remove project from this compute
    # node  (must be opened somewhere)
    close: (opts) =>
        opts = defaults opts,
            force  : false
            nosave : false
            cb     : required
        args = []
        dbg = @dbg("close(force:#{opts.force},nosave:#{opts.nosave})")
        if opts.force
            args.push('--force')
        if opts.nosave
            args.push('--nosave')
        dbg("force=#{opts.force}; nosave=#{opts.nosave}")
        @_action
            action : "close"
            args   : args
            cb     : opts.cb

    ensure_opened_or_running: (opts) =>
        opts = defaults opts,
            cb     : required   # cb(err, state='opened' or 'running')
        state = undefined
        dbg = @dbg("ensure_opened_or_running")
        async.series([
            (cb) =>
                dbg("get state")
                @state
                    cb : (err, s) =>
                        if err
                            cb(err); return
                        state = s.state
                        dbg("got state #{state}")
                        if STATES[state].stable
                            cb()
                        else
                            dbg("wait for a stable state")
                            @once 'stable', (s) =>
                                state = s
                                dbg("got stable state #{state}")
                                cb()
            (cb) =>
                if state == 'running' or state == 'opened'
                    cb()
                else if state == 'closed'
                    dbg("opening")
                    @open
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @once 'opened', () =>
                                    dbg("it opened")
                                    state = 'opened'
                                    cb()
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb(err, state))

    ensure_running: (opts) =>
        opts = defaults opts,
            cb     : required
        state = undefined
        dbg = @dbg("ensure_running")
        async.series([
            (cb) =>
                dbg("get the state")
                @state
                    cb : (err, s) =>
                        if err
                            cb(err); return
                        state = s.state
                        if STATES[state].stable
                            cb()
                        else
                            dbg("wait for a stable state")
                            @once 'stable', (s) =>
                                state = s
                                cb()
            (cb) =>
                f = () =>
                    dbg("start running")
                    @start
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @once 'running', () => cb()
                if state == 'running'
                    cb()
                else if state == 'opened'
                    f()
                else if state == 'closed'
                    dbg("open first")
                    @open
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @once 'opened', () =>
                                    dbg("project opened; now start running")
                                    f()
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb(err))

    ensure_closed: (opts) =>
        opts = defaults opts,
            force  : false
            nosave : false
            cb     : required
        dbg = @dbg("ensure_closed(force:#{opts.force},nosave:#{opts.nosave})")
        state = undefined
        async.series([
            (cb) =>
                dbg("get state")
                @state
                    cb : (err, s) =>
                        if err
                            cb(err); return
                        state = s.state
                        if STATES[state].stable
                            cb()
                        else
                            dbg("wait for a stable state")
                            @once 'stable', (s) =>
                                state = s
                                cb()
            (cb) =>
                f = () =>
                    dbg("close project")
                    @close
                        force  : opts.force
                        nosave : opts.nosave
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @once 'closed', () => cb()
                if state == 'closed'
                    cb()
                else if state == 'opened'
                    f()
                else if state == 'running'
                    dbg("is running so first stop it")
                    @stop
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                dbg("now wait for it to be done stopping")
                                @once 'opened', () =>
                                    f()
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb(err))


    # move project from one compute node to another one
    move: (opts) =>
        opts = defaults opts,
            target : required  # hostname of a compute server
            cb     : required
        dbg = @dbg("move(target:'#{opts.target}')")
        async.series([
            (cb) =>
                dbg("first ensure it is closed/deleted from current host")
                @ensure_closed
                    cb   : cb
            (cb) =>
                dbg("update database with new project location")
                @compute_server.database.update
                    table : 'projects'
                    set   : {compute_server : opts.target}
                    where : {project_id : @project_id}
                    cb    : cb
            (cb) =>
                dbg("open on new host")
                @host = opts.target
                @open(cb:cb)
        ], opts.cb)

    destroy: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("destroy")
        dbg("permanently delete everything about this projects -- complete destruction...")
        async.series([
            (cb) =>
                dbg("first ensure project is closed, forcing and not saving")
                @ensure_closed
                    force  : true
                    nosave : true
                    cb     : cb
            (cb) =>
                dbg("now remove project from btrfs stream storage too")
                @host = undefined
                @_action
                    action : "destroy"
                    cb     : cb
        ], (err) => opts.cb(err))

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        @dbg("stop")("will kill all processes")
        @_action
            action : "stop"
            cb     : opts.cb

    save: (opts) =>
        opts = defaults opts,
            max_snapshots : 60
            min_interval  : 10  # fail if there is a snapshot that is younger than this many MINUTES (use 0 to disable)
            cb     : required
        dbg = @dbg("save(max_snapshots:#{opts.max_snapshots}, min_interval:#{opts.min_interval})")
        dbg("")
        # Do a client-side test to see if we have saved recently; much faster
        # than going server side trying and failing.
        if opts.min_interval and @_last_save and (new Date() - @_last_save) < 1000*60*opts.min_interval
            dbg("already saved")
            opts.cb("already saved within min_interval")
            return
        last_save_attempt = new Date()
        dbg('doing actual save')
        @_action
            action : "save"
            args   : ['--max_snapshots', opts.max_snapshots, '--min_interval', opts.min_interval]
            cb     : (err, resp) =>
                if not err
                    @_last_save = last_save_attempt
                opts.cb(err, resp)

    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address")
        dbg("get project location and listening port -- will open and start project if necessary")
        address = undefined
        async.series([
            (cb) =>
                dbg("first ensure project is running")
                @ensure_running(cb:cb)
            (cb) =>
                dbg("now get the status")
                @status
                    cb : (err, status) =>
                        if err
                            cb(err)
                        else
                            if status.state != 'running'
                                dbg("something went wrong and not running ?!")
                                cb("not running")
                            else
                                dbg("status includes info about address...")
                                address =
                                    host         : @host
                                    port         : status['local_hub.port']
                                    secret_token : status.secret_token
                                cb()
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, address)
        )

    # copy a path using rsync from one project to another
    copy_path: (opts) =>
        opts = defaults opts,
            path              : ""
            target_project_id : ""
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : false     # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete_missing    : false     # if true, delete files in dest path not in source, **including** newer files
            timeout           : 5*60
            bwlimit           : undefined
            cb                : required
        dbg = @dbg("copy_path")
        if not opts.target_project_id
            opts.target_project_id = @project_id
        args = ["--path", opts.path,
                "--target_project_id", opts.target_project_id,
                "--target_path", opts.target_path]
        if opts.overwrite_newer
            args.push('--overwrite_newer')
        if opts.delete_missing
            args.push('--delete_missing')
        if opts.bwlimit
            args.push('--bwlimit')
            args.push(opts.bwlimit)
        dbg("created args=#{misc.to_json(args)}")
        target_project = undefined
        async.series([
            (cb) =>
                if opts.target_project_id == @project_id
                    cb()
                else
                    dbg("getting other project and ensuring that it is already opened")
                    @compute_server.project
                        project_id : opts.target_project_id
                        cb         : (err, target_project) =>
                            if err
                                dbg("error ")
                                cb(err)
                            else
                                target_project.ensure_opened_or_running
                                    cb : (err) =>
                                        if err
                                            cb(err)
                                        else
                                            dbg("got other project on #{target_project.host}")
                                            args.push("--target_hostname")
                                            args.push(target_project.host)
                                            cb()
            (cb) =>
                dbg("doing the actual copy")
                @_action
                    action  : 'copy_path'
                    args    : args
                    timeout : opts.timeout
                    cb      : cb
            (cb) =>
                if target_project?
                    dbg("target is another project, so saving that project (if possible)")
                    target_project.save (err) =>
                        if err
                            #  NON-fatal: this could happen, e.g, if already saving...  very slightly dangerous.
                            dbg("warning: can't save target project -- #{err}")
                        cb()
                else
                    cb()
        ], (err) =>
            if err
                dbg("error -- #{err}")
            opts.cb(err)
        )

    directory_listing: (opts) =>
        opts = defaults opts,
            path      : ''
            hidden    : false
            time      : false        # sort by timestamp, with newest first?
            start     : 0
            limit     : -1
            cb        : required
        dbg = @dbg("directory_listing")
        args = []
        if opts.hidden
            args.push("--hidden")
        if opts.time
            args.push("--time")
        for k in ['path', 'start', 'limit']
            args.push("--#{k}"); args.push(opts[k])
        dbg("get listing of files using options #{misc.to_json(args)}")
        @_action
            action : 'directory_listing'
            args   : args
            cb     : opts.cb

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')")
        dbg("read a file or directory from disk")  # directories get zip'd
        args =  [opts.path, "--maxsize", opts.maxsize]
        @_action
            action  : 'read_file'
            args    : args
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, new Buffer(resp.base64, 'base64'))

    set_quota: (opts) =>
        opts = defaults opts,
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            cb           : required
        dbg = @dbg("set_quota")
        dbg("set various quotas")
        async.parallel([
            (cb) =>
                if opts.network?
                    dbg("network quota")
                    @_action
                        action : 'network'
                        args   : if opts.network then [] else ['--ban']
                        cb     : (err) =>
                            cb(err)
                else
                    cb()
            (cb) =>
                if opts.disk_quota?
                    dbg("disk quota")
                    @_action
                        action : 'disk_quota'
                        args   : [opts.disk_quota]
                        cb     : cb
                else
                    cb()
            (cb) =>
                if opts.cores? or opts.memory? or opts.cpu_shares?
                    dbg("compute quota")
                    args = []
                    for s in ['cores', 'memory', 'cpu_shares']
                        if opts[s]?
                            args.push("--#{s}"); args.push(opts[s])
                    @_action
                        action : 'compute_quota'
                        args   : args
                        cb     : cb
                else
                    cb()
        ], (err) =>
            dbg("done setting quotas")
            opts.cb(err)
        )



#################################################################
#
# Server code -- runs on the compute server
#
#################################################################

TIMEOUT = 60*60

smc_compute = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    winston.debug("smc_compute: running #{misc.to_json(opts.args)}")
    misc_node.execute_code
        command : "sudo"
        args    : ["/usr/local/bin/smc_compute.py", "--btrfs", BTRFS, '--bucket', BUCKET, '--archive', ARCHIVE].concat(opts.args)
        timeout : opts.timeout
        bash    : false
        path    : process.cwd()
        cb      : (err, output) =>
            #winston.debug(misc.to_json(output))
            winston.debug("smc_compute: finished running #{misc.to_json(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, if output.stdout then misc.from_json(output.stdout) else undefined)

projects_cache = {}
get_project = (project_id) ->
    if not projects_cache[project_id]?
        projects_cache[project_id] = new Project(project_id)
    return projects_cache[project_id]

class Project
    constructor: (@project_id) ->
        @_state      = undefined
        @_state_time = new Date()
        @_state_listeners = {}

        @_last = {}  # last time a giving action was initiated

    dbg: (method) =>
        return (m) => winston.debug("Project.#{method}: #{m}")

    add_listener: (socket) =>
        if not @_state_listeners[socket.id]?
            @_state_listeners[socket.id] = socket
            socket.on 'close', () =>
                delete @_state_listeners[socket.id]
            @dbg("add_listener")(socket.id)

    _update_state_listeners: () =>
        dbg = @dbg("_update_state_listeners")
        mesg = message.project_state_update
            project_id : @project_id
            state      : @_state
            time       : @_state_time
        dbg("send message to each listener that state has been updated = #{misc.to_safe_str(mesg)}")
        for id, socket of @_state_listeners
            dbg("sending mesg to socket #{id}")
            socket.write_mesg('json', mesg)

    _command: (opts) =>
        opts = defaults opts,
            action     : required
            args       : undefined
            cb         : required
        dbg = @dbg("_command(action:'#{opts.action}')")
        @_last[opts.action] = new Date()
        args = [opts.action]
        if opts.args?
            args = args.concat(opts.args)
        args.push(@project_id)
        dbg("args=#{misc.to_json(args)}")
        smc_compute
            args : args
            cb   : opts.cb

    command: (opts) =>
        opts = defaults opts,
            action     : required
            args       : undefined
            cb         : required
        dbg = @dbg("command(action=#{opts.action}, args=#{misc.to_json(opts.args)})")
        state = undefined
        state_info = undefined
        resp = undefined
        async.series([
            (cb) =>
                dbg("get state")
                @state
                    cb: (err, s) =>
                        if err
                            cb(err)
                        else
                            state = s.state
                            cb()
            (cb) =>
                state_info = STATES[state]
                if not state_info?
                    cb("bug / internal error -- unknown state '#{misc.to_json(state)}'")
                    return
                i = state_info.commands.indexOf(opts.action)
                if i == -1
                    cb("command #{opts.action} not allowed in state #{state}")
                else
                    next_state = state_info.to[opts.action]
                    if next_state?
                        dbg("next_state: #{next_state} -- launching")
                        # This action causes state change and could take a while,
                        # so we (1) change state, (2) launch the command, (3)
                        # respond immediately that it's started.
                        @_state = next_state  # change state
                        @_state_time = new Date()
                        @_update_state_listeners()
                        @_command      # launch the command: this might take a long time
                            action : opts.action
                            args   : opts.args
                            cb     : (err, ignored) =>
                                # finished command -- will transition to new state as result
                                if err
                                    dbg("state change command ERROR -- #{err}")
                                else
                                    dbg("state change command success -- #{misc.to_safe_str(resp)}")
                                @_update_state()
                        resp = {state:next_state, time:new Date()}
                        cb()
                    else
                        # Fairly quick action that doesn't involve state change
                        @_command
                            action : opts.action
                            args   : opts.args
                            cb     : (err, r) =>
                                resp = r; cb(err)
        ], (err) => opts.cb(err, resp))

    _update_state: (cb) =>
        dbg = @dbg("_update_state")
        dbg("state likely changed -- determined what it changed to")
        before = @_state
        @_command
            action : 'status'
            cb     : (err, r) =>
                if err
                    dbg("error getting status -- #{err}")
                    cb?(err)
                else
                    if r['state'] != before
                        @_state = r['state']
                        @_state_time = new Date()
                        dbg("got new state -- #{@_state}")
                        @_update_state_listeners()
                    cb?()

    state: (opts) =>
        opts = defaults opts,
            cb : required
        @dbg("state")()
        f = (cb) =>
            if @_state?
                cb()
            else
                @_update_state(cb)
        f (err) =>
            if err
                opts.cb(err)
            else
                x =
                    state : @_state
                    time  : @_state_time
                opts.cb(undefined, x)

secret_token = undefined
read_secret_token = (cb) ->
    if secret_token?
        cb()
        return
    dbg = (m) -> winston.debug("read_secret_token: #{m}")

    async.series([
        # Read or create the file; after this step the variable secret_token
        # is set and the file exists.
        (cb) ->
            dbg("check if file exists")
            fs.exists program.secret_file, (exists) ->
                if exists
                    dbg("exists -- now reading '#{program.secret_file}'")
                    fs.readFile program.secret_file, (err, buf) ->
                        if err
                            dbg("error reading the file '#{program.secret_file}'")
                            cb(err)
                        else
                            secret_token = buf.toString().trim()
                            cb()
                else
                    dbg("creating '#{program.secret_file}'")
                    require('crypto').randomBytes 64, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(program.secret_file, secret_token, cb)
        (cb) ->
            dbg("Ensure restrictive permissions on the secret token file.")
            fs.chmod(program.secret_file, 0o600, cb)
    ], cb)

handle_mesg = (socket, mesg) ->
    dbg = (m) => winston.debug("handle_mesg(hub -> compute, id=#{mesg.id}): #{m}")
    dbg(misc.to_safe_str(mesg))

    f = (cb) ->
        switch mesg.event
            when 'compute'
                dbg("compute event")
                p = get_project(mesg.project_id)
                dbg("got project")
                p.add_listener(socket)
                if mesg.action == 'state'
                    dbg("getting state")
                    p.state
                        cb : (err, x) ->
                            dbg("state -- got #{err}, #{misc.to_safe_str(x)}")
                            if err
                                cb(message.error(error:err))
                            else
                                cb(x)
                else
                    dbg("running command")
                    p.command
                        action     : mesg.action
                        args       : mesg.args
                        cb         : (err, resp) ->
                            if err
                                cb(message.error(error:err))
                            else
                                cb(resp)
            when 'ping'
                cb(message.pong())
            else
                cb(message.error(error:"unknown event type: '#{mesg.event}'"))
    f (resp) ->
        resp.id = mesg.id
        dbg("resp = '#{misc.to_safe_str(resp)}'")
        socket.write_mesg('json', resp)

start_tcp_server = (cb) ->
    dbg = (m) -> winston.debug("tcp_server: #{m}")
    dbg("start")

    server = net.createServer (socket) ->
        dbg("received connection")
        socket.id = uuid.v4()
        misc_node.unlock_socket socket, secret_token, (err) ->
            if err
                dbg("ERROR: unable to unlock socket -- #{err}")
            else
                dbg("unlocked connection")
                misc_node.enable_mesg(socket)
                socket.on 'mesg', (type, mesg) ->
                    if type == "json"   # other types ignored -- we only deal with json
                        dbg("(socket id=#{socket.id}) -- received  #{misc.to_safe_str(mesg)}")
                        try
                            handle_mesg(socket, mesg)
                        catch e
                            dbg(new Error().stack)
                            winston.error("ERROR(socket id=#{socket.id}): '#{e}' handling message '#{misc.to_safe_str(mesg)}'")

    get_port = (c) ->
        dbg("get_port")
        if program.port
            c()
        else
            dbg("attempt once to use the same port as in port file, if there is one")
            fs.exists program.port_file, (exists) ->
                if not exists
                    dbg("no port file so choose new port")
                    program.port = 0
                    c()
                else
                    dbg("port file exists, so read")
                    fs.readFile program.port_file, (err, data) ->
                        if err
                            program.port = 0
                            c()
                        else
                            program.port = data.toString()
                            c()
    listen = (c) ->
        dbg("trying port #{program.port}")
        server.listen program.port, program.address, () ->
            dbg("listening on #{program.address}:#{program.port}")
            program.port = server.address().port
            fs.writeFile(program.port_file, program.port, cb)
        server.on 'error', (e) ->
            dbg("error getting port -- #{e}; try again in one second (type 'netstat -tulpn |grep #{program.port}' to figure out what has the port)")
            try_again = () ->
                server.close()
                server.listen(program.port, program.address)
            setTimeout(try_again, 1000)

    get_port () ->
        listen(cb)


start_server = (cb) ->
    winston.debug("start_server")
    async.series [read_secret_token, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")
        cb?(err)

###########################
## Command line interface
###########################

CONF = BTRFS + '/conf'

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]',        'store pid in this file', String, "#{CONF}/compute.pid")
    .option('--logfile [string]',        'write log to this file', String, "#{CONF}/compute.log")

    .option('--port_file [string]',      'write port number to this file', String, "#{CONF}/compute.port")
    .option('--secret_file [string]',    'write secret token to this file', String, "#{CONF}/compute.secret")

    .option('--debug [string]',          'logging debug level (default: "" -- no debugging output)', String, 'debug')

    .option('--port [integer]',          'port to listen on (default: assigned by OS)', String, 0)
    .option('--address [string]',        'address to listen on (default: the tinc network if there, or eth1 if there, or 127.0.0.1)', String, '')

    .parse(process.argv)

program.port = parseInt(program.port)

if not program.address
    program.address = require('os').networkInterfaces().tun0?[0].address
    if not program.address
        program.address = require('os').networkInterfaces().eth1?[0].address  # my laptop vm...
    if not program.address  # useless
        program.address = '127.0.0.1'

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, {level: program.debug, timestamp:true, colorize:true})

    winston.debug("running as a deamon")
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    fs.exists CONF, (exists) ->
        if exists
            fs.chmod(CONF, 0o700)     # just in case...

    daemon({max:999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name.split('.')[0] == 'compute'
    main()
