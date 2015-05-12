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

EXPERIMENTAL = false


###

Development testing:

id='e7a8a705-1c40-4397-836a-b60e259e1137'; x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:id,cb:(e,p)->console.log(e);x.p=p))

Live use


id='e7a8a705-1c40-4397-836a-b60e259e1137';  x={};require('compute').compute_server(db_hosts:['smc0-us-central1-c'],keyspace:'salvus',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:id,cb:(e,p)->console.log(e);x.p=p))

###


# obviously don't want to trigger this too quickly, since it may mean file loss.
AUTOMATIC_FAILOVER_TIME_S = 60*5  # 5 minutes

SERVER_STATUS_TIMEOUT_S = 7  # 7 seconds

# todo -- these should be in a table in the database.
DEFAULT_SETTINGS =
    disk_quota : 3000
    cores      : 1
    memory     : 1000
    cpu_shares : 256
    mintime    : 3600   # hour
    network    : false

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
        commands : ['open', 'move', 'status', 'destroy', 'mintime']

    opened:
        desc: 'All files and snapshots are ready to use and the project user has been created, but local hub is not running.'
        stable   : true
        to       :
            start : 'starting'
            close : 'closing'
            save  : 'saving'
        commands : ['start', 'close', 'save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    running:
        desc     : 'The project is opened and ready to be used.'
        stable   : true
        to       :
            stop : 'stopping'
            save : 'saving'
        commands : ['stop', 'save', 'address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    saving:
        desc     : 'The project is being snapshoted and saved to cloud storage.'
        to       : {}
        timeout  : 30*60
        commands : ['address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    closing:
        desc     : 'The project is in the process of being closed, so the latest changes are being uploaded, everything is stopping, the files will be removed from this computer.'
        to       : {}
        timeout  : 5*60
        commands : ['status', 'mintime']

    opening:
        desc     : 'The project is being opened, so all files and snapshots are being downloaded, the user is being created, etc.'
        to       : {}
        timeout  : 30*60
        commands : ['status', 'mintime']

    starting:
        desc     : 'The project is starting up and getting ready to be used.'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    stopping:
        desc     : 'All processes associated to the project are being killed.'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

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

BTRFS   = if process.env.SMC_BTRFS? then process.env.SMC_BTRFS else '/projects'
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
        keyspace : 'salvus'
        db_hosts : undefined
        cb       : required
    if compute_server_cache?
        opts.cb(undefined, compute_server_cache)
    else
        new ComputeServerClient(opts)

class ComputeServerClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined
            keyspace : 'salvus'
            db_hosts : ['localhost']
            cb       : required
        dbg = @dbg("constructor")
        @_project_cache = {}
        @_project_cache_cb = {}
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
                    hosts       : opts.db_hosts
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

        require('compute').compute_server(db_hosts:['localhost'],cb:(e,s)->console.log(e);s.add_server(host:'compute0-us', cb:(e)->console.log("done",e)))

        require('compute').compute_server(db_hosts:['smc0-us-central1-c'],cb:(e,s)->console.log(e);s.add_server(host:'compute0-us', cb:(e)->console.log("done",e)))

require('compute').compute_server(db_hosts:['smc0-us-central1-c'],cb:(e,s)->console.log(e);s.add_server(experimental:true, host:'compute0-amath-us', cb:(e)->console.log("done",e)))

         require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);s.add_server(host:'localhost', cb:(e)->console.log("done",e)))
    ###
    add_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : ''        # deduced from hostname (everything after -) if not given
            experimental : false     # if true, don't allocate new projects here
            timeout      : 30
            cb           : undefined
        dbg = @dbg("add_server(#{opts.host})")
        dbg("adding compute server to the database by grabbing conf files, etc.")

        if not opts.host
            i = opts.host.indexOf('-')
            if i != -1
                opts.dc = opts.host.slice(0,i)

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

    # Choose a host from the available compute_servers according to some
    # notion of load balancing (not really worked out yet)
    assign_host: (opts) =>
        opts = defaults opts,
            exclude  : []
            cb       : required
        dbg = @dbg("assign_host")
        dbg("querying database")
        @status
            cb : (err, nodes) =>
                if err
                    opts.cb(err)
                else
                    # Ignore any exclude nodes
                    for host in opts.exclude
                        delete nodes[host]
                    # We want to choose the best (="least loaded?") working node.
                    v = []
                    for host, info of nodes
                        if EXPERIMENTAL
                            # only use experimental nodes
                            if not info.experimental
                                continue
                        else
                            # definitely don't assign experimental nodes
                            if info.experimental
                                continue
                        v.push(info)
                        info.host = host
                        if info.error?
                            info.score = 0
                        else
                            # 10 points if no load; 0 points if massive load
                            info.score = Math.max(0, Math.round(10*(1 - info.load[0])))
                            # 1 point for each Gigabyte of available RAM that won't
                            # result in swapping if used
                            info.score += Math.round(info.memory.MemAvailable/1000)
                    if v.length == 0
                        opts.cb("no hosts available")
                        return
                    # sort so highest scoring is first.
                    v.sort (a,b) =>
                        if a.score < b.score
                            return 1
                        else if a.score > b.score
                            return -1
                        else
                            return 0
                    dbg("scored host info = #{misc.to_json(([info.host,info.score] for info in v))}")
                    # finally choose one of the hosts with the highest score at random.
                    best_score = v[0].score
                    i = 0
                    while i < v.length and v[i].score == best_score
                        i += 1
                    w = v.slice(0,i)
                    opts.cb(undefined, misc.random_choice(w).host)

    remove_from_cache: (opts) =>
        opts = defaults opts,
            host : required
        if @_socket_cache?
            delete @_socket_cache[opts.host]

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
                                for _, p of @_project_cache
                                    # tell every project whose state was set via
                                    # this socket that the state is no longer known.
                                    if p._socket_id == socket.id
                                        p.clear_state()
                                        delete p._socket_id
                                if @_socket_cache[opts.host]?.id == socket.id
                                    delete @_socket_cache[opts.host]
                                socket.removeAllListeners()
                            socket.on 'mesg', (type, mesg) =>
                                if type == 'json'
                                    if mesg.event == 'project_state_update'
                                        winston.debug("state_update #{misc.to_safe_str(mesg)}")
                                        p = @_project_cache[mesg.project_id]
                                        if p? and p.host == opts.host  # ignore updates from wrong host
                                            p._state      = mesg.state
                                            p._state_time = new Date()
                                            p._state_set_by = socket.id
                                            p._state_error = mesg.state_error  # error switching to this state
                                            p.emit(p._state, p)
                                            if STATES[mesg.state].stable
                                                p.emit('stable', mesg.state)
                                    else
                                        winston.debug("mesg (hub <- #{opts.host}): #{misc.to_safe_str(mesg)}")
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
            project : undefined
            cb      : required

        dbg = @dbg("call(hub --> #{opts.host})")
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
                if opts.project?
                    # record that this socket was used by the given project
                    # (so on close can invalidate info)
                    opts.project._socket_id = socket.id
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
        p = @_project_cache[opts.project_id]
        if p?
            opts.cb(undefined, p)
        else
            # This v is so that if project is called again before the first
            # call returns, then both calls get the same project back.
            v = @_project_cache_cb[opts.project_id]
            if v?
                v.push(opts.cb)
                return
            v = @_project_cache_cb[opts.project_id] = [opts.cb]
            new ProjectClient
                project_id     : opts.project_id
                compute_server : @
                cb             : (err, project) =>
                    delete @_project_cache_cb[opts.project_id]
                    if not err
                        @_project_cache[opts.project_id] = project
                    for cb in v
                        if err
                            cb(err)
                        else
                            cb(undefined, project)

    # get status information about compute servers
    status: (opts) =>
        opts = defaults opts,
            hosts   : undefined   # list of hosts or undefined=all compute servers
            timeout : SERVER_STATUS_TIMEOUT_S           # compute server must respond this quickly or {error:some sort of timeout error..}
            cb      : required    # cb(err, {host1:status, host2:status2, ...})
        dbg = @dbg('status')
        result = {}
        async.series([
            (cb) =>
                if opts.hosts?
                    cb(); return
                dbg("getting list of all compute server hostnames from database")
                @database.select
                    table     : 'compute_servers'
                    columns   : ['host', 'experimental']
                    objectify : true
                    cb        : (err, s) =>
                        if err
                            cb(err)
                        else
                            for x in s
                                result[x.host] = {experimental:x.experimental}
                            dbg("got #{s.length} compute servers")
                            cb()
            (cb) =>
                dbg("querying servers for their status")
                f = (host, cb) =>
                    @call
                        host    : host
                        mesg    : message.compute_server_status()
                        timeout : opts.timeout
                        cb      : (err, resp) =>
                            if err
                                result[host].error = err
                            else
                                if not resp?.status
                                    result[host].error = "invalid response -- no status"
                                else
                                    for k, v of resp.status
                                        result[host][k] = v
                            cb()
                async.map(misc.keys(result), f, cb)
        ], (err) =>
            opts.cb(err, result)
        )

    # require('compute').compute_server(db_hosts:['smc0-us-central1-c'],cb:(e,s)->s.vacate_hosts(hosts:['compute2-us','compute3-us'], cb:(e)->console.log("done",e)))
    vacate_hosts: (opts) =>
        opts = defaults opts,
            hosts : required    # array
            move  : false
            targets : undefined  # array
            cb    : required
        @database.select
            table   : 'projects'
            columns : ['project_id', 'compute_server']
            #consistency : require("cassandra-driver").types.consistencies.quorum
            stream  : true
            limit   : opts.query_limit
            cb      : (err, results) =>
                if err
                    opts.cb(err)
                else
                    winston.debug("got them; now processing...")
                    v = (x[0] for x in results when x[1] in opts.hosts)
                    winston.debug("found #{v.length} on #{opts.host}")
                    i = 0
                    f = (project_id, cb) =>
                        winston.debug("moving #{project_id} off of #{opts.host}")
                        if opts.move
                            @project
                                project_id : project_id
                                cb         : (err, project) =>
                                    if err
                                        cb(err)
                                    else
                                        project.move(cb)
                        else
                            if opts.targets?
                                i = (i + 1)%opts.targets.length
                            @database.update
                                table : 'projects'
                                set   :
                                    'compute_server' : if opts.targets? then opts.targets[i] else undefined
                                where :
                                    project_id : project_id
                                consistency : require("cassandra-driver").types.consistencies.all
                                cb    : cb
                    async.mapLimit(v, 15, f, opts.cb)

    ###
    projects = require('misc').split(fs.readFileSync('/home/salvus/work/2015-amath/projects').toString())
    require('compute').compute_server(db_hosts:['smc0-us-central1-c'],keyspace:'salvus',cb:(e,s)->console.log(e); s.set_quotas(projects:projects, cores:4, cb:(e)->console.log("DONE",e)))
    ###
    set_quotas: (opts) =>
        opts = defaults opts,
            projects     : required    # array of project id's
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            mintime      : undefined  # in seconds
            cb           : required
        projects = opts.projects
        delete opts.projects
        cb = opts.cb
        delete opts.cb
        f = (project_id, cb) =>
            o = misc.copy(opts)
            o.cb = cb
            @project
                project_id : project_id
                cb         : (err, project) =>
                    project.set_quotas(o)
        async.mapLimit(projects, 10, f, cb)

    ###
    projects = require('misc').split(fs.readFileSync('/home/salvus/work/2015-amath/projects-grad').toString())
    require('compute').compute_server(db_hosts:['smc0-us-central1-c'], cb:(e,s)->console.log(e); s.move(projects:projects, target:'compute1-amath-us', cb:(e)->console.log("DONE",e)))
    ###
    move: (opts) =>
        opts = defaults opts,
            projects : required    # array of project id's
            target   : required
            limit    : 10
            cb       : required
        projects = opts.projects
        delete opts.projects
        cb = opts.cb
        delete opts.cb
        f = (project_id, cb) =>
            @project
                project_id : project_id
                cb         : (err, project) =>
                    project.move(target: opts.target, cb:cb)
        async.mapLimit(projects, opts.limit, f, cb)

    # x={};require('compute').compute_server(db_hosts:['smc0-us-central1-c'], cb:(e,s)->console.log(e);x.s=s;x.s.tar_backup_recent(max_age_h:1, cb:(e)->console.log("DONE",e)))
    tar_backup_recent: (opts) =>
        opts = defaults opts,
            max_age_h : required     # must be at most 1 week
            limit     : 1            # number to backup in parallel
            cb        : required
        dbg = @dbg("tar_backup_recent")
        target = undefined
        async.series([
            (cb) =>
                @database.recently_modified_projects
                    max_age_s : opts.max_age_h*60*60
                    cb        : (err, results) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{results.length} projects modified in the last #{opts.max_age_h} hours")
                            target = results
                            cb()

            (cb) =>
                i = 0
                n = misc.len(target)
                winston.debug("next backing up resulting #{n} targets")
                running = {}
                f = (project_id, cb) =>
                  fs.exists "/projects/#{project_id}", (exists) =>
                    if not exists
                       winston.debug("skipping #{project_id} since not here")
                       cb(); return
                    j = i + 1
                    i += 1
                    running[j] = project_id
                    winston.debug("*****************************************************")
                    winston.debug("** #{j}/#{n}: #{project_id}")
                    winston.debug("RUNNING=#{misc.to_json(misc.keys(running))}")
                    winston.debug("*****************************************************")

                    smc_compute
                        args : ['tar_backup', project_id]
                        cb   : (err) =>
                            delete running[j]
                            winston.debug("*****************************************************")
                            winston.debug("** #{j}/#{n}: DONE -- #{project_id}, DONE")
                            winston.debug("RUNNING=#{misc.to_json(running)}")
                            winston.debug("*****************************************************")
                            winston.debug("result of backing up #{project_id}: #{err}")
                            cb(err)
                async.mapLimit(target, opts.limit, f, cb)
        ], opts.cb)


class ProjectClient extends EventEmitter
    constructor: (opts) ->
        opts = defaults opts,
            project_id     : required
            compute_server : required
            cb             : required
        @project_id = opts.project_id
        @compute_server = opts.compute_server
        @clear_state()
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
        (m) => winston.debug("ProjectClient(project_id='#{@project_id}','#{@host}').#{method}: #{m}")

    _set_host: (host) =>
        old_host = @host
        @host = host
        if old_host? and host != old_host
            @dbg("host_changed from #{old_host} to #{host}")
            @emit('host_changed', @host)  # event whenever host changes from one set value to another (e.g., move or failover)

    clear_state: () =>
        @dbg("clear_state")()
        delete @_state
        delete @_state_time
        delete @_state_error
        delete @_state_set_by
        if @_state_cache_timeout?
             clearTimeout(@_state_cache_timeout)
             delete @_state_cache_timeout

    update_host: (opts) =>
        opts = defaults opts,
            cb : undefined
        host          = undefined
        assigned      = undefined
        previous_host = @host
        dbg = @dbg("update_host")
        t = misc.mswalltime()
        async.series([
            (cb) =>
                dbg("querying database for compute server")
                @compute_server.database.select
                    table   : 'projects'
                    columns : ['compute_server', 'compute_server_assigned']
                    where   :
                        project_id : @project_id
                    cb      : (err, result) =>
                        if err
                            dbg("error querying database -- #{err}")
                            cb(err)
                        else
                            if result.length == 1 and result[0][0]
                                host     = result[0][0]
                                assigned = result[0][1]
                                if not assigned
                                    assigned = new Date() - 0
                                    @compute_server.database.update
                                        table : 'projects'
                                        set   :
                                            compute_server_assigned : assigned
                                        where : {project_id : @project_id}
                                dbg("got host='#{host}' that was assigned #{assigned}")
                            else
                                dbg("no host assigned")
                            cb()
            (cb) =>
                if host?
                    cb()
                else
                    dbg("assigning some host")
                    @compute_server.assign_host
                        cb : (err, h) =>
                            if err
                                dbg("error assigning random host -- #{err}")
                                cb(err)
                            else
                                host = h
                                assigned = new Date() - 0
                                dbg("new host = #{host} assigned #{assigned}")
                                @compute_server.database.update
                                    table : 'projects'
                                    set   :
                                        compute_server          : @host
                                        compute_server_assigned : assigned
                                    where : {project_id : @project_id}
                                    cb    : cb
        ], (err) =>
            if not err
                @_set_host(host)
                @assigned = assigned  # when host was assigned
                dbg("henceforth using host=#{@host} that was assigned #{@assigned}")
                if host != previous_host
                    @clear_state()
                    dbg("HOST CHANGE: #{previous_host} --> #{host}")
            dbg("time=#{misc.mswalltime(t)}ms")
            opts.cb?(err, host)
        )

    _action: (opts) =>
        opts = defaults opts,
            action  : required
            args    : undefined
            timeout : 30
            cb      : required
        dbg = @dbg("_action(action=#{opts.action})")
        dbg("args=#{misc.to_safe_str(opts.args)}")
        dbg("first update host to use the right compute server")
        @update_host
            cb : (err) =>
                if err
                    dbg("error updating host #{err}")
                    opts.cb(err); return
                dbg("calling compute server at '#{@host}'")
                @compute_server.call
                    host    : @host
                    project : @
                    mesg    :
                        message.compute
                            project_id : @project_id
                            action     : opts.action
                            args       : opts.args
                    timeout : opts.timeout
                    cb      : (err, resp) =>
                        if err
                            dbg("error calling compute server -- #{err}")
                            @compute_server.remove_from_cache(host:@host)
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
            force  : false   # don't use local cached or value obtained
            update : false   # make server recompute state (forces switch to stable state)
            cb     : required
        dbg = @dbg("state(force:#{opts.force},update:#{opts.update})")

        if @_state_time? and @_state?
            timeout = STATES[@_state].timeout * 1000
            if timeout?
                time_in_state = new Date() - @_state_time
                if time_in_state > timeout
                    dbg("forcing update since time_in_state=#{time_in_state}ms exceeds timeout=#{timeout}ms")
                    opts.update = true
                    opts.force  = true

        if opts.force or opts.update or (not @_state? or not @_state_time?)
            dbg("calling remote server for state")
            @_action
                action : "state"
                args   : if opts.update then ['--update']
                cb     : (err, resp) =>
                    if err
                        dbg("problem getting state -- #{err}")
                        opts.cb(err)
                    else
                        dbg("got state='#{@_state}'")
                        @clear_state()
                        @_state       = resp.state
                        @_state_time  = resp.time
                        @_state_error = resp.state_error
                        f = () =>
                             dbg("clearing cache due to timeout")
                             @clear_state()
                        @_state_cache_timeout = setTimeout(f, 30000)
                        opts.cb(undefined, resp)
        else
            dbg("getting state='#{@_state}' from cache")
            x =
                state : @_state
                time  : @_state_time
                error : @_state_error
            opts.cb(undefined, x)

    # information about project (ports, state, etc. )
    status: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("status")
        dbg()
        status = undefined
        async.series([
            (cb) =>
                @_action
                    action : "status"
                    cb     : (err, s) =>
                        if not err
                            status = s
                        cb(err)
            (cb) =>
                dbg("get status from compute server")
                f = (cb) =>
                    @_action
                        action : "status"
                        cb     : (err, s) =>
                            if not err
                                status = s
                            cb(err)
                # we retry getting status with exponential backoff until we hit max_time, which
                # triggers failover of project to another node.
                misc.retry_until_success
                    f           : f
                    start_delay : 15000
                    max_time    : AUTOMATIC_FAILOVER_TIME_S*1000
                    cb          : (err) =>
                        if err
                            m = "failed to get status -- project not working on #{@host} -- initiating automatic move to a new node -- #{err}"
                            dbg(m)
                            cb(m)
                            # Now we actually initiate the failover, which could take a long time,
                            # depending on how big the project is.
                            @move
                                force : true
                                cb    : (err) =>
                                    dbg("result of failover -- #{err}")
                        else
                            cb()
            (cb) =>
                @get_quotas
                    cb : (err, quotas) =>
                        if err
                            cb(err)
                        else
                            status.host = @host
                            status.ssh = @host
                            status.quotas = quotas
                            cb()
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, status)
        )


    # COMMANDS:

    # open project files on some node
    open: (opts) =>
        opts = defaults opts,
            ignore_recv_errors : false
            cb     : required
        @dbg("open")()
        args = [@assigned]
        if opts.ignore_recv_errors
            args.push('--ignore_recv_errors')
        @_action
            action : "open"
            args   : args
            cb     : opts.cb

    # start local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            set_quotas : true   # if true, also sets all quotas (in parallel with start)
            cb         : required
        dbg = @dbg("start")
        async.parallel([
            (cb) =>
                if opts.set_quotas
                    dbg("setting all quotas")
                    @set_all_quotas(cb:cb)
                else
                    cb()
            (cb) =>
                dbg("issuing the start command")
                @_action
                    action : "start"
                    cb     : cb
        ], (err) => opts.cb(err))

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
                    opts.cb("may only restart when state is opened or running or starting")

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
            ignore_recv_errors : false
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
                        ignore_recv_errors : opts.ignore_recv_errors
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @once 'opened', () =>
                                    dbg("it opened")
                                    state = 'opened'
                                    cb()
                                    # also fire off this, which will check if project hasn't yet
                                    # been migrated successfully, and if so run one safe
                                    # rsync --update (so it won't overwrite newer files)
                                    @migrate_update_if_never_before({})
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb(err, state))

    ensure_running: (opts) =>
        opts = defaults opts,
            cb : required
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
            target : undefined # hostname of a compute server; if not given, one (diff than current) will be chosen by load balancing
            force  : false     # if true, brutally ignore error trying to cleanup/save on current host
            cb     : required
        dbg = @dbg("move(target:'#{opts.target}')")
        if opts.target? and @host == opts.target
            dbg("project is already at target -- not moving")
            opts.cb()
            return
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        dbg("determine target")
                        if opts.target?
                            cb()
                        else
                            exclude = []
                            if @host?
                                exclude.push(@host)
                            @compute_server.assign_host
                                exclude : exclude
                                cb      : (err, host) =>
                                    if err
                                        cb(err)
                                    else
                                        dbg("assigned target = #{host}")
                                        opts.target = host
                                        cb()
                    (cb) =>
                        dbg("first ensure it is closed/deleted from current host")
                        @ensure_closed
                            cb   : (err) =>
                                if err
                                    if not opts.force
                                        cb(err)
                                    else
                                        dbg("errors trying to close but force requested so proceeding -- #{err}")
                                        @ensure_closed
                                            force  : true
                                            nosave : true
                                            cb     : (err) =>
                                                dbg("second attempt error, but ignoring -- #{err}")
                                                cb()
                                else
                                    cb()


                ], cb)
            (cb) =>
                dbg("update database with new project location")
                @assigned = new Date() - 0
                @compute_server.database.update
                    table : 'projects'
                    set   :
                        compute_server          : opts.target
                        compute_server_assigned : @assigned
                    where : {project_id : @project_id}
                    cb    : cb
            (cb) =>
                dbg("open on new host")
                @_set_host(opts.target)
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
                @_set_host(undefined)
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
            max_snapshots : 50
            min_interval  : 4  # fail if already saved less than this many MINUTES (use 0 to disable) ago
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
        dbg = @dbg("copy_path(#{opts.path} to #{opts.target_project_id})")
        dbg("copy a path using rsync from one project to another")
        if not opts.target_project_id
            opts.target_project_id = @project_id
        if not opts.target_path
            opts.target_path = opts.path
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
        dbg("created args=#{misc.to_safe_str(args)}")
        target_project = undefined
        async.series([
            (cb) =>
                @ensure_opened_or_running
                    cb : cb
            (cb) =>
                if opts.target_project_id == @project_id
                    cb()
                else
                    dbg("getting other project and ensuring that it is already opened")
                    @compute_server.project
                        project_id : opts.target_project_id
                        cb         : (err, x) =>
                            if err
                                dbg("error ")
                                cb(err)
                            else
                                target_project = x
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
                containing_path = misc.path_split(opts.target_path).head
                if not containing_path
                    dbg("target path need not be made since is home dir")
                    cb(); return
                dbg("create containing target directory = #{containing_path}")
                if opts.target_project_id != @project_id
                    target_project._action
                        action  : 'mkdir'
                        args    : [containing_path]
                        timeout : opts.timeout
                        cb      : cb
                else
                    @_action
                        action  : 'mkdir'
                        args    : [containing_path]
                        timeout : opts.timeout
                        cb      : cb
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
                    target_project.save
                        cb: (err) =>
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
        @ensure_opened_or_running
            cb : (err) =>
                if err
                    opts.cb(err)
                else
                    args = []
                    if opts.hidden
                        args.push("--hidden")
                    if opts.time
                        args.push("--time")
                    for k in ['path', 'start', 'limit']
                        args.push("--#{k}"); args.push(opts[k])
                    dbg("get listing of files using options #{misc.to_safe_str(args)}")
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
        @ensure_opened_or_running
            cb : (err) =>
                if err
                    opts.cb(err)
                else
                    @_action
                        action  : 'read_file'
                        args    : [opts.path, "--maxsize", opts.maxsize]
                        cb      : (err, resp) =>
                            if err
                                opts.cb(err)
                            else
                                opts.cb(undefined, new Buffer(resp.base64, 'base64'))

    get_quotas: (opts) =>
        opts = defaults opts,
            cb           : required
        dbg = @dbg("get_quotas")
        dbg("lookup project's quotas in the database")
        @compute_server.database.select_one
            table   : 'projects'
            where   : {project_id : @project_id}
            columns : ['settings']
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else
                    quotas = {}
                    result = result[0]
                    if result? and result.disk and not result.disk_quota
                        result.disk_quota = Math.round(misc.from_json(result.disk)*1.5)
                    for k, v of DEFAULT_SETTINGS
                        if not result?[k]
                            quotas[k] = v
                        else
                            quotas[k] = misc.from_json(result[k])

                    # TODO: this is a temporary workaround until I go through and convert everything in
                    # the database, after the switch.
                    if quotas.memory < 70
                        quotas.memory *= 1000
                    opts.cb(undefined, quotas)

    set_quotas: (opts) =>
        opts = defaults opts,
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            mintime      : undefined  # in seconds
            cb           : required
        dbg = @dbg("set_quotas")
        dbg("set various quotas")
        commands = undefined
        async.series([
            (cb) =>
                dbg("get state")
                @state
                    cb: (err, s) =>
                        if err
                            cb(err)
                        else
                            dbg("state = #{s.state}")
                            commands = STATES[s.state].commands
                            cb()
            (cb) =>
                async.parallel([
                    (cb) =>
                        f = (key, cb) =>
                            if not opts[key]? or key == 'cb'
                                cb(); return
                            dbg("updating quota for #{key} in the database")
                            @compute_server.database.cql
                                query : "UPDATE projects SET settings[?]=? WHERE project_id=?"
                                vals  : [key, misc.to_json(opts[key]), @project_id]
                                cb    : cb
                        async.map(misc.keys(opts), f, cb)
                    (cb) =>
                        if opts.network? and commands.indexOf('network') != -1
                            dbg("update network: #{opts.network}")
                            if typeof(opts.network) == 'string' and opts.network == 'false'
                                # this is messed up in the database due to bad client code...
                                opts.network = false
                            @_action
                                action : 'network'
                                args   : if opts.network then [] else ['--ban']
                                cb     : (err) =>
                                    cb(err)
                        else
                            cb()
                    (cb) =>
                        if opts.mintime? and commands.indexOf('mintime') != -1
                            dbg("update mintime quota on project")
                            @_action
                                action : 'mintime'
                                args   : [opts.mintime]
                                cb     : (err) =>
                                    cb(err)
                        else
                            cb()
                    (cb) =>
                        if opts.disk_quota? and commands.indexOf('disk_quota') != -1
                            dbg("disk quota")
                            @_action
                                action : 'disk_quota'
                                args   : [opts.disk_quota]
                                cb     : cb
                        else
                            cb()
                    (cb) =>
                        if (opts.cores? or opts.memory? or opts.cpu_shares?) and commands.indexOf('compute_quota') != -1
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
                ], cb)
        ], (err) =>
            dbg("done setting quotas")
            opts.cb(err)
        )

    set_all_quotas: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("set_all_quotas")
        quotas = undefined
        async.series([
            (cb) =>
                dbg("looking up quotas for this project")
                @get_quotas
                    cb : (err, x) =>
                        quotas = x; cb(err)
            (cb) =>
                dbg("setting the quotas")
                quotas.cb = cb
                @set_quotas(quotas)
        ], (err) => opts.cb(err))

    # delete this once it has been run on all projects
    migrate_update_if_never_before: (opts) =>
        opts = defaults opts,
            subdir : false
            cb     : undefined
        migrated = false
        dbg = @dbg("migrate_update_if_never_before")
        async.series([
            (cb) =>
                dbg("determine if migrated already")
                @compute_server.database.select_one
                    table : 'projects'
                    where : {project_id : @project_id}
                    columns : ['migrated']
                    cb      : (err, result) =>
                        dbg("got err=#{err}, result=#{misc.to_safe_str(result)}")
                        if err
                            cb(err)
                        else
                            migrated = result[0]
                            cb()
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("not migrated so migrating after first opening")
                    @ensure_opened_or_running
                        ignore_recv_errors : true
                        cb : cb
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("verify that open didn't cause error")
                    @state
                        cb: (err, state) =>
                            if err
                                dbg("failed getting state -- #{err}")
                                cb(err)
                            else if state.error
                                dbg("open failed -- #{state.error}")
                                cb(state.error)
                            else
                                dbg("yes!")
                                cb()
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("now migrating")
                    @migrate_update
                        subdir : opts.subdir
                        cb     : cb
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("initiating save")
                    @save
                        min_interval : 0
                        cb           : cb
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("waiting until save done")
                    @once 'stable', (state) =>
                        dbg("got stable state #{state}")
                        cb()
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("verify that save was a success")
                    @state
                        cb: (err, state) =>
                            if err
                                dbg("failed getting state -- #{err}")
                                cb(err)
                            else if state.error
                                dbg("save failed -- #{state.error}")
                                cb(state.error)
                            else
                                dbg("yes!")
                                cb()
            (cb) =>
                if migrated
                    cb()
                else
                    dbg("finally updating database")
                    @compute_server.database.update
                        table : 'projects'
                        set   : {migrated : true}
                        where : {project_id : @project_id}
                        cb      : cb
        ], (err) => opts.cb?(err))

    migrate_update: (opts) =>
        opts = defaults opts,
            subdir : false
            cb : undefined
        bup_location = undefined
        host = undefined
        async.series([
            (cb) =>
                @compute_server.database.select_one
                    table : 'projects'
                    where : {project_id : @project_id}
                    columns : ['bup_location']
                    cb      : (err, result) =>
                        if err
                            cb(err)
                        else
                            bup_location = result[0]
                            cb()
            (cb) =>
                if not bup_location?
                    cb(); return
                @compute_server.database.select_one
                    table     : 'storage_servers'
                    columns   : ['ssh']
                    where     :
                        dummy     : true
                        server_id : bup_location
                    cb        : (err, result) =>
                        if err
                            cb(err)
                        else
                            host = result[0][-1].split(':')[0]
                            cb()
            (cb) =>
                if not bup_location?
                    cb(); return
                args = ['--port', '2222', host]
                if opts.subdir
                    args.push("--subdir")
                @_action
                    action : 'migrate_live'
                    args   : args
                    timeout : 2000
                    cb     : cb
        ], (err) -> opts.cb?(err))

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
    winston.debug("smc_compute: running #{misc.to_safe_str(opts.args)}")
    misc_node.execute_code
        command : "sudo"
        args    : ["#{process.env.SALVUS_ROOT}/scripts/smc_compute.py", "--btrfs", BTRFS, '--bucket', BUCKET, '--archive', ARCHIVE].concat(opts.args)
        timeout : opts.timeout
        bash    : false
        path    : process.cwd()
        cb      : (err, output) =>
            #winston.debug(misc.to_safe_str(output))
            winston.debug("smc_compute: finished running #{misc.to_safe_str(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, if output.stdout then misc.from_json(output.stdout) else undefined)

project_cache = {}
project_cache_cb = {}
get_project = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    project = project_cache[opts.project_id]
    if project?
        opts.cb(undefined, project)
        return
    v = project_cache_cb[opts.project_id]
    if v?
        v.push(opts.cb)
        return
    v = project_cache_cb[opts.project_id] = [opts.cb]
    new Project
        project_id : opts.project_id
        cb         : (err, project) ->
            winston.debug("got project #{opts.project_id}")
            delete project_cache_cb[opts.project_id]
            if not err
                project_cache[opts.project_id] = project
            for cb in v
                if err
                    cb(err)
                else
                    cb(undefined, project)

class Project
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @project_id = opts.project_id
        @_command_cbs = {}
        @_state_listeners = {}
        @_last = {}  # last time a giving action was initiated
        dbg = @dbg("constructor")
        sqlite_db.select
            table   : 'projects'
            columns : ['state', 'state_time', 'state_error', 'mintime',
                       'network', 'cores', 'memory', 'cpu_shares']
            where   : {project_id : @project_id}
            cb      : (err, results) =>
                if err
                    dbg("error -- #{err}")
                    opts.cb(err); return
                if results.length == 0
                    dbg("nothing in db")
                    @_state      = undefined
                    @_state_time = new Date()
                    @_state_error = undefined
                    @_network = false
                else
                    @_state      = results[0].state
                    @_state_time = new Date(results[0].state_time)
                    @_state_error= results[0].state_error
                    @_mintime    = results[0].mintime
                    @_network    = results[0].network
                    @_cores      = results[0].cores
                    @_memory     = results[0].memory
                    @_cpu_shares = results[0].cpu_shares
                    dbg("fetched project info from db: state=#{@_state}, state_time=#{@_state_time}, state_error=#{@_state_error}, mintime=#{@_mintime}s")
                    if not STATES[@_state]?.stable
                        dbg("updating non-stable state")
                        @_update_state(@_state_error, ((err) => opts.cb(err, @)))
                        return
                opts.cb(undefined, @)

    dbg: (method) =>
        return (m) => winston.debug("Project(#{@project_id}).#{method}: #{m}")

    add_listener: (socket) =>
        if not @_state_listeners[socket.id]?
            dbg = @dbg("add_listener")
            dbg("adding #{socket.id}")
            @_state_listeners[socket.id] = socket
            socket.on 'close', () =>
                dbg("closing #{socket.id} and removing listener")
                delete @_state_listeners[socket.id]

    _update_state_db: (cb) =>
        dbg = @dbg("_update_state_db")
        dbg("new state=#{@_state}")
        sqlite_db.update
            table : 'projects'
            set   :
                state       : @_state
                state_time  : @_state_time - 0
                state_error : if not @_state_error? then '' else @_state_error
            where :
                project_id : @project_id
            cb : cb

    _update_state_listeners: () =>
        dbg = @dbg("_update_state_listeners")
        mesg = message.project_state_update
            project_id : @project_id
            state      : @_state
            time       : @_state_time
            state_error : @_state_error
        dbg("send message to each of the #{@_state_listeners.length} listeners that the state has been updated = #{misc.to_safe_str(mesg)}")
        for id, socket of @_state_listeners
            dbg("sending mesg to socket #{id}")
            socket.write_mesg('json', mesg)

    _command: (opts) =>
        opts = defaults opts,
            action      : required
            args        : undefined
            at_most_one : false     # ignores subsequent args if set -- only use this for things where args don't matter
            timeout     : TIMEOUT
            cb          : undefined
        dbg = @dbg("_command(action:'#{opts.action}')")

        if opts.at_most_one
            if @_command_cbs[opts.action]?
                @_command_cbs[opts.action].push(opts.cb)
                return
            else
                @_command_cbs[opts.action] = [opts.cb]

        @_last[opts.action] = new Date()
        args = [opts.action]
        if opts.args?
            args = args.concat(opts.args)
        args.push(@project_id)
        dbg("args=#{misc.to_safe_str(args)}")
        smc_compute
            args    : args
            timeout : opts.timeout
            cb      : (err, result) =>
                if opts.at_most_one
                    v = @_command_cbs[opts.action]
                    delete @_command_cbs[opts.action]
                    for cb in v
                        cb?(err, result)
                else
                    opts.cb?(err, result)

    command: (opts) =>
        opts = defaults opts,
            action     : required
            args       : undefined
            cb         : undefined
            after_command_cb : undefined   # called after the command completes (even if it is long)
        dbg = @dbg("command(action=#{opts.action}, args=#{misc.to_safe_str(opts.args)})")
        state = undefined
        state_info = undefined
        assigned   = undefined
        resp = undefined
        async.series([
            (cb) =>
                dbg("get state")
                @state
                    cb: (err, s) =>
                        dbg("got state=#{misc.to_safe_str(s)}, #{err}")
                        if err
                            opts.after_command_cb?(err)
                            cb(err)
                        else
                            state = s.state
                            cb()
            (cb) =>
                if opts.action == 'open'
                    # When opening a project we have to also set
                    # the time the project was assigned to this node, which is the first
                    # argument to open.  We then remove that argument.
                    assigned = opts.args[0]
                    opts.args.shift()
                if opts.action == 'open' or opts.action == 'start'
                    if not opts.args?
                        opts.args = []
                    for k in ['cores', 'memory', 'cpu_shares']
                        v = @["_#{k}"]
                        if v?
                            opts.args.push("--#{k}")
                            opts.args.push(v)

                state_info = STATES[state]
                if not state_info?
                    err = "bug / internal error -- unknown state '#{misc.to_safe_str(state)}'"
                    dbg(err)
                    opts.after_command_cb?(err)
                    cb(err)
                    return
                i = state_info.commands.indexOf(opts.action)
                if i == -1
                    err = "command #{opts.action} not allowed in state #{state}"
                    dbg(err)
                    opts.after_command_cb?(err)
                    cb(err)
                else
                    next_state = state_info.to[opts.action]
                    if next_state?
                        dbg("next_state: #{next_state} -- launching")
                        # This action causes state change and could take a while,
                        # so we (1) change state, (2) launch the command, (3)
                        # respond immediately that it's started.
                        @_state = next_state  # change state
                        @_state_time = new Date()
                        delete @_state_error
                        @_update_state_db()
                        @_update_state_listeners()
                        @_command      # launch the command: this might take a long time
                            action  : opts.action
                            args    : opts.args
                            timeout : state_info.timeout
                            cb      : (err, ignored) =>
                                dbg("finished command -- will transition to new state as result (#{err})")
                                @_state_error = err
                                if err
                                    dbg("state change command ERROR -- #{err}")
                                else
                                    dbg("state change command success -- #{misc.to_safe_str(ignored)}")
                                    if assigned?
                                        # Project was just opened and opening is an allowed command.
                                        # Set when this was done.
                                        sqlite_db.update
                                            table : 'projects'
                                            set   : {assigned: assigned}
                                            where : {project_id: @project_id}

                                @_update_state(err, ((err2) =>opts.after_command_cb?(err or err2)))

                        resp = {state:next_state, time:new Date()}
                        cb()
                    else
                        dbg("An action that doesn't involve state change")
                        if opts.action == 'network'  # length==0 is allow network
                            dbg("do network setting")
                            # refactor this out
                            network = opts.args.length == 0
                            async.parallel([
                                (cb) =>
                                    sqlite_db.update  # store network state in database in case things get restarted.
                                        table : 'projects'
                                        set   :
                                            network : network
                                        where :
                                            project_id : @project_id
                                        cb    : cb
                                (cb) =>
                                    uname = @project_id.replace(/-/g,'')
                                    if network
                                        args = ['--whitelist_users', uname]
                                    else
                                        args = ['--blacklist_users', uname]
                                    firewall
                                        command : "outgoing"
                                        args    : args
                                        cb      : cb
                            ], (err) =>
                                if err
                                    resp = message.error(error:err)
                                else
                                    resp = {network:network}
                                cb(err)
                            )
                        else
                            dbg("doing action #{opts.action}")
                            if opts.action == 'status' or opts.action == 'state'
                                at_most_one = true
                            else
                                at_most_one = false
                            @_command
                                action      : opts.action
                                args        : opts.args
                                at_most_one : at_most_one
                                cb          : (err, r) =>
                                    dbg("got #{misc.to_safe_str(r)}, #{err}")
                                    resp = r
                                    cb(err)
                                    opts.after_command_cb?(err)
            (cb) =>
                if assigned?
                    dbg("Project was just opened and opening is an allowed command... so saving that")
                    # Set when this assign happened, so we can return this as
                    # part of the status in the future, which the global hubs use
                    # to see whether the project on this node was some mess left behind
                    # during auto-failover, or is legit.
                    sqlite_db.update
                        table : 'projects'
                        set   : {assigned: assigned}
                        where : {project_id: @project_id}
                        cb    : cb
                else
                    cb()
            (cb) =>
                if opts.action == 'status'
                    dbg("status:  so get additional info from database")
                    sqlite_db.select
                        table   : 'projects'
                        columns : ['assigned']
                        where   : {project_id: @project_id}
                        cb      : (err, result) =>
                            if err
                                cb(err)
                            else
                                resp.assigned = result[0].assigned
                                cb()
                else
                    cb()
        ], (err) =>
            if err
                dbg("failed -- #{err}")
                opts.cb?(err)
            else
                dbg("success -- #{misc.to_safe_str(resp)}")
                opts.cb?(undefined, resp)
        )

    _update_state: (state_error, cb) =>
        dbg = @dbg("_update_state")
        if @_update_state_cbs?
            dbg("waiting on previously launched status subprocess...")
            @_update_state_cbs.push(cb)
            return
        @_update_state_cbs = [cb]
        dbg("state likely changed -- determined what it changed to")
        before = @_state
        @_command
            action  : 'state'
            timeout : 60
            cb      : (err, r) =>
                if err
                    dbg("error getting status -- #{err}")
                else
                    if r['state'] != before
                        @_state = r['state']
                        @_state_time = new Date()
                        @_state_error = state_error
                        dbg("got new state -- #{@_state}")
                        @_update_state_db()
                        @_update_state_listeners()

                v = @_update_state_cbs
                delete @_update_state_cbs
                dbg("calling #{v.length} callbacks")
                for cb in v
                    cb?(err)

    state: (opts) =>
        opts = defaults opts,
            update : false
            cb    : required
        @dbg("state")()
        f = (cb) =>
            if not opts.update and @_state?
                cb()
            else
                @_update_state(@_state_error, cb)
        f (err) =>
            if err
                opts.cb(err)
            else
                x =
                    state       : @_state
                    time        : @_state_time
                    state_error : @_state_error
                opts.cb(undefined, x)

    set_mintime: (opts) =>
        opts = defaults opts,
            mintime : required
            cb      : required
        dbg = @dbg("mintime(mintime=#{opts.mintime}s)")
        @_mintime = opts.mintime
        sqlite_db.update
            table : 'projects'
            set   : {mintime:    opts.mintime}
            where : {project_id: @project_id}
            cb    : (err) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, {})

    _update_network: (cb) =>
        @command
            action     : 'network'
            args       : if @_network then [] else ['--ban']
            cb         : cb

    set_network: (opts) =>
        opts = defaults opts,
            network : required
            cb      : required
        dbg = @dbg("network(network=#{opts.network})")
        @_network = opts.network
        resp = undefined
        async.parallel([
            (cb) =>
                sqlite_db.update
                    table : 'projects'
                    set   : {network: opts.network}
                    where : {project_id: @project_id}
                    cb    : () => cb()
            (cb) =>
                @_update_network (err, r) =>
                    resp = r
                    cb(err)
        ], (err) => opts.cb?(err, resp))

    set_compute_quota: (opts) =>
        opts = defaults opts,
            args : required
            cb   : required
        dbg = @dbg("set_compute_quota")
        i = 0
        quotas = {}
        while i < opts.args.length
            k = opts.args[i].slice(2)
            v = parseInt(opts.args[i+1])
            quotas[k] = v
            @["_#{k}"] = v
            i += 2
        sqlite_db.update
            table : 'projects'
            set   : quotas
            where : {project_id: @project_id}
            cb    : () =>
        @command
            action     : 'compute_quota'
            args       : opts.args
            cb         : opts.cb

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

handle_compute_mesg = (mesg, socket, cb) ->
    dbg = (m) => winston.debug("handle_compute_mesg(hub -> compute, id=#{mesg.id}): #{m}")
    p = undefined
    resp = undefined
    async.series([
        (cb) ->
            get_project
                project_id : mesg.project_id
                cb         : (err, _p) ->
                    p = _p; cb(err)
        (cb) ->
            p.add_listener(socket)
            if mesg.action == 'state'
                dbg("getting state")
                p.state
                    update : mesg.args? and mesg.args.length > 0 and mesg.args[0] == '--update'
                    cb    : (err, r) ->
                        dbg("state -- got #{err}, #{misc.to_safe_str(r)}")
                        resp = r; cb(err)
            else if mesg.action == 'mintime'
                p.set_mintime
                    mintime : mesg.args[0]
                    cb      : (err, r) ->
                        resp = r; cb(err)
            else if mesg.action == 'network'
                p.set_network
                    network : mesg.args.length == 0 # no arg = enable
                    cb      : (err, r) ->
                        resp = r; cb(err)
            else if mesg.action == 'compute_quota'
                p.set_compute_quota
                    args    : mesg.args
                    cb      : (err, r) ->
                        resp = r; cb(err)
            else
                dbg("running command")
                p.command
                    action     : mesg.action
                    args       : mesg.args
                    cb         : (err, r) ->
                        resp = r; cb(err)
    ], (err) ->
        if err
            cb(message.error(error:err))
        else
            cb(resp)
    )

handle_status_mesg = (mesg, socket, cb) ->
    dbg = (m) => winston.debug("handle_status_mesg(hub -> compute, id=#{mesg.id}): #{m}")
    dbg()
    status = {nproc:STATS.nproc}
    async.parallel([
        (cb) =>
            sqlite_db.select
                table   : 'projects'
                columns : ['state']
                cb      : (err, result) =>
                    if err
                        cb(err)
                    else
                        projects = status.projects = {}
                        for x in result
                            s = x.state
                            if not projects[s]?
                                projects[s] = 1
                            else
                                projects[s] += 1
                        cb()
        (cb) =>
            fs.readFile '/proc/loadavg', (err, data) =>
                if err
                    cb(err)
                else
                    # http://stackoverflow.com/questions/11987495/linux-proc-loadavg
                    x = misc.split(data.toString())
                    # this is normalized based on number of procs
                    status.load = (parseFloat(x[i])/STATS.nproc for i in [0..2])
                    v = x[3].split('/')
                    status.num_tasks   = parseInt(v[1])
                    status.num_active = parseInt(v[0])
                    cb()
        (cb) =>
            fs.readFile '/proc/meminfo', (err, data) =>
                if err
                    cb(err)
                else
                    # See this about what MemAvailable is:
                    #   https://git.kernel.org/cgit/linux/kernel/git/torvalds/linux.git/commit/?id=34e431b0ae398fc54ea69ff85ec700722c9da773
                    x = data.toString()
                    status.memory = memory = {}
                    for k in ['MemAvailable', 'SwapTotal', 'MemTotal', 'SwapFree']
                        i = x.indexOf(k)
                        y = x.slice(i)
                        i = y.indexOf('\n')
                        memory[k] = parseInt(misc.split(y.slice(0,i).split(':')[1]))/1000
                    cb()
    ], (err) =>
        if err
            cb(message.error(error:err))
        else
            cb(message.compute_server_status(status:status))
    )

handle_mesg = (socket, mesg) ->
    dbg = (m) => winston.debug("handle_mesg(hub -> compute, id=#{mesg.id}): #{m}")
    dbg(misc.to_safe_str(mesg))

    f = (cb) ->
        switch mesg.event
            when 'compute'
                handle_compute_mesg(mesg, socket, cb)
            when 'compute_server_status'
                handle_status_mesg(mesg, socket, cb)
            when 'ping'
                cb(message.pong())
            else
                cb(message.error(error:"unknown event type: '#{mesg.event}'"))
    f (resp) ->
        resp.id = mesg.id
        dbg("resp = '#{misc.to_safe_str(resp)}'")
        socket.write_mesg('json', resp)

sqlite_db = undefined
sqlite_db_set = (opts) ->
    opts = defaults opts,
        key   : required
        value : required
        cb    : required
    sqlite_db.update
        table : 'keyvalue'
        set   :
            value : misc.to_json(opts.value)
        where :
            key   : misc.to_json(opts.key)
        cb    : opts.cb

sqlite_db_get = (opts) ->
    opts = defaults opts,
        key : required
        cb  : required
    sqlite_db.select
        table : 'keyvalue'
        columns : ['value']
        where :
            key   : misc.to_json(opts.key)
        cb    : (err, result) ->
            if err
                opts.cb(err)
            else if result.length == 0
                opts.cb(undefined, undefined)
            else
                opts.cb(undefined, misc.from_json(result[0][0]))

init_sqlite_db = (cb) ->
    exists = undefined
    async.series([
        (cb) ->
            fs.exists program.sqlite_file, (e) ->
                exists = e
                cb()
        (cb) ->
            require('sqlite').sqlite
                filename : program.sqlite_file
                cb       : (err, db) ->
                    sqlite_db = db; cb(err)
        (cb) ->
            if exists
                cb()
            else
                # initialize schema
                #    project_id -- the id of the project
                #    state -- opened, closed, etc.
                #    state_time -- when switched to current state
                #    assigned -- when project was first opened on this node.
                f = (query, cb) ->
                    sqlite_db.sql
                        query : query
                        cb    : cb
                async.map([
                    'CREATE TABLE projects(project_id TEXT PRIMARY KEY, state TEXT, state_error TEXT, state_time INTEGER, mintime INTEGER, assigned INTEGER, network BOOLEAN, cores INTEGER, memory INTEGER, cpu_shares INTEGER)',
                    'CREATE TABLE keyvalue(key TEXT PRIMARY KEY, value TEXT)'
                    ], f, cb)
    ], cb)

# periodically check to see if any projects need to be killed
kill_idle_projects = (cb) ->
    dbg = (m) -> winston.debug("kill_idle_projects: #{m}")
    all_projects = undefined
    async.series([
        (cb) ->
            dbg("query database for all projects")
            sqlite_db.select
                table : 'projects'
                columns : ['project_id', 'state_time', 'mintime']
                where   :
                    state : 'running'
                cb      : (err, r) ->
                    all_projects = r; cb(err)
        (cb) ->
            now = new Date() - 0
            v = []
            for p in all_projects
                if not p.mintime
                    continue
                last_change = (now - p.state_time)/1000
                dbg("project_id=#{p.project_id}, last_change=#{last_change}s ago, mintime=#{p.mintime}s")
                if p.mintime < last_change
                    dbg("plan to kill project #{p.project_id}")
                    v.push(p.project_id)
            if v.length > 0
                f = (project_id, cb) ->
                    dbg("killing #{project_id}")
                    get_project
                        project_id : project_id
                        cb         : (err, project) ->
                            if err
                                cb(err)
                            else
                                project.command
                                    action : 'save'
                                    after_command_cb : (err) =>
                                        project.command
                                            action : 'stop'
                                            cb     : cb
                async.map(v, f, cb)
            else
                dbg("nothing idle to kill")
                cb()
    ], (err) ->
        if err
            dbg("error killing idle -- #{err}")
        cb?()
    )

init_mintime = (cb) ->
    setInterval(kill_idle_projects, 3*60*1000)
    kill_idle_projects(cb)

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

# Initialize basic information about this node once and for all.
# So far, not much -- just number of processors.
STATS = {}
init_stats = (cb) =>
    misc_node.execute_code
        command : "nproc"
        cb      : (err, output) =>
            if err
                cb(err)
            else
                STATS.nproc = parseInt(output.stdout)
                cb()

# Gets metadata from Google, or if that fails, from the local SQLITe database.  Saves
# result in database for future use in case metadata fails.
get_metadata = (opts) ->
    opts = defaults opts,
        key : required
        cb  : required
    dbg = (m) -> winston.debug("get_metadata: #{m}")
    value = undefined
    key = "metadata-#{opts.key}"
    async.series([
        (cb) ->
            dbg("query google metdata server for #{opts.key}")
            misc_node.execute_code
                command : "curl"
                args    : ["http://metadata.google.internal/computeMetadata/v1/project/attributes/#{opts.key}",
                           '-H', 'Metadata-Flavor: Google']
                cb      : (err, output) ->
                    if err
                        dbg("nonfatal error querying metadata -- #{err}")
                        cb()
                    else
                        if output.stdout.indexOf('not found') == -1
                            value = output.stdout
                        cb()
        (cb) ->
            if value?
                dbg("save to local database")
                sqlite_db_set
                    key   : key
                    value : value
                    cb    : cb
            else
                dbg("querying local database")
                sqlite_db_get
                    key   : key
                    cb    : (err, result) ->
                        if err
                            cb(err)
                        else
                            value = result
                            cb()
    ], (err) ->
        if err
            opts.cb(err)
        else
            opts.cb(undefined, value)
    )

get_whitelisted_users = (opts) ->
    opts = defaults opts,
        cb : required
    sqlite_db.select
        table   : 'projects'
        where   :
            network : true
        columns : ['project_id']
        cb      : (err, results) ->
            if err
                opts.cb(err)
            else
                opts.cb(undefined, ['root','salvus'].concat((x.project_id.replace(/-/g,'') for x in results)))

NO_OUTGOING_FIREWALL = false
firewall = (opts) ->
    opts = defaults opts,
        command : required
        args    : []
        cb      : required
    if opts.command == 'outgoing' and NO_OUTGOING_FIREWALL
        opts.cb()
        return
    misc_node.execute_code
        command : 'sudo'
        args    : ["#{process.env.SALVUS_ROOT}/scripts/smc_firewall.py", opts.command].concat(opts.args)
        bash    : false
        timeout : 30
        path    : process.cwd()
        cb      : opts.cb

#
# Initialize the iptables based firewall.  Must be run after sqlite db is initialized.
#
#
init_firewall = (cb) ->
    dbg = (m) -> winston.debug("init_firewall: #{m}")
    tm = misc.walltime()
    dbg("starting firewall configuration")
    incoming_whitelist_hosts = ''
    outgoing_whitelist_hosts = 'sagemath.com'
    whitelisted_users        = ''
    admin_whitelist = ''
    storage_whitelist = ''
    async.series([
        (cb) ->
            async.parallel([
                (cb) ->
                    dbg("getting incoming_whitelist_hosts")
                    get_metadata
                        key : "smc-servers"
                        cb  : (err, w) ->
                            incoming_whitelist_hosts = w
                            cb(err)
                (cb) ->
                    dbg("getting admin whitelist")
                    get_metadata
                        key : "admin-servers"
                        cb  : (err, w) ->
                            admin_whitelist = w
                            cb(err)
                (cb) ->
                    dbg("getting storage whitelist")
                    get_metadata
                        key : "storage-servers"
                        cb  : (err, w) ->
                            storage_whitelist = w
                            cb(err)
                (cb) ->
                    dbg('getting whitelisted users')
                    get_whitelisted_users
                        cb  : (err, users) ->
                            whitelisted_users = users.join(',')
                            cb(err)
            ], cb)
        (cb) ->
            dbg("clear existing firewall")
            firewall
                command : "clear"
                cb      : cb
        (cb) ->
            dbg("starting firewall -- applying incoming rules")
            if admin_whitelist
                incoming_whitelist_hosts += ',' + admin_whitelist
            if storage_whitelist
                incoming_whitelist_hosts += ',' + storage_whitelist
            firewall
                command : "incoming"
                args    : ["--whitelist_hosts", incoming_whitelist_hosts]
                cb      : cb
        (cb) ->
            if incoming_whitelist_hosts.split(',').indexOf(require('os').hostname()) != -1
                dbg("this is a frontend web node, so not applying outgoing firewall rules (probably being used for development)")
                NO_OUTGOING_FIREWALL = true
                cb()
            else
                dbg("starting firewall -- applying outgoing rules")
                firewall
                    command : "outgoing"
                    args    : ["--whitelist_hosts_file", "#{process.env.SALVUS_ROOT}/scripts/outgoing_whitelist_hosts",
                               "--whitelist_users", whitelisted_users]
                    cb      : cb
    ], (err) ->
        dbg("finished firewall configuration in #{misc.walltime(tm)} seconds")
        cb(err)
    )

update_states = (cb) ->
    # TEMPORARY until I have time to fix a bug.
    # Right now when a project times out starting, it gets stuck like that forever unless the client
    # does a project.state(force:true,update:true,cb:...), which the hub clients at this moment
    # evidently don't do.  So as a temporary workaround (I don't want to restart them until making status better!),
    # we have this:
    # 1. query database for all projects in starting state which started more than 60 seconds ago.
    # 2. call .state(force:true,update:true,cb:...)
    projects = undefined
    dbg = (m) -> winston.debug("update_state: #{m}")
    dbg()
    async.series([
        (cb) ->
            dbg("querying db")
            sqlite_db.select
                table   : 'projects'
                columns : ['project_id', 'state_time', 'state']
                cb      : (err, x) ->
                    if err
                        dbg("query err=#{misc.to_safe_str(err)}")
                        cb(err)
                    else
                        projects = (a for a in x when a.state == 'starting' or a.state == 'stopping' or a.state == 'saving')
                        dbg("got #{projects.length} projects that are '....ing'")
                        cb()
        (cb) ->
            if projects.length == 0
                cb(); return
            dbg("possibly updating each of #{projects.length} projects")
            f = (x, cb) ->
                if x.state_time >= new Date() - 1000*STATES[x.state].timeout
                    dbg("not updating #{x.project_id}")
                    cb()
                else
                    dbg("updating #{x.project_id}")
                    get_project
                        project_id : x.project_id
                        cb         : (err, project) ->
                            if err
                                cb(err)
                            else
                                project.state(update:true, cb:cb)
            async.map(projects, f, cb)
        ], (err) ->
            setTimeout(update_states, 2*60*1000)
            cb?(err)
        )


start_server = (cb) ->
    winston.debug("start_server")
    async.series [init_stats, read_secret_token, init_sqlite_db, init_firewall, init_mintime, start_tcp_server, update_states], (err) ->
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

    .option('--sqlite_file [string]',    'store sqlite3 database here', String, "#{CONF}/compute.sqlite3")

    .option('--debug [string]',          'logging debug level (default: "" -- no debugging output)', String, 'debug')

    .option('--port [integer]',          'port to listen on (default: assigned by OS)', String, 0)
    .option('--address [string]',        'address to listen on (default: all interfaces)', String, '')

    .parse(process.argv)

program.port = parseInt(program.port)

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
