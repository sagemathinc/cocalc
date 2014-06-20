#################################################################
#
# bup_server -- a node.js program that provides a TCP server
# that is used by the hubs to organize project storage
#
#  (c) William Stein, 2014
#
#  NOT released under any open source license.
#
#################################################################

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
cql       = require("node-cassandra-cql")

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

{defaults, required} = misc

TIMEOUT = 60*60

# never do a save action more frequently than this - more precisely, saves just get
# ignored until this much time elapses *and* an interesting file changes.
MIN_SAVE_INTERVAL_S = 90

STORAGE_SERVERS_UPDATE_INTERVAL_S = 60*3  # How frequently (in seconds)  to query the database for the list of storage servers

IDLE_TIMEOUT_INTERVAL_S = 120   # The idle timeout checker runs once ever this many seconds.

ZPOOL = if process.env.BUP_POOL? then process.env.BUP_POOL else 'bup'

#console.log("ZPOOL=",ZPOOL)
CONF = "/bup/conf"
fs.exists CONF, (exists) ->
    if exists
        # only makes sense to do this on server nodes...
        fs.chmod(CONF, 0o700)     # just in case...

DATA = 'data'


###########################
## server-side: Storage server code
###########################

bup_storage = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    winston.debug("bup_storage: running #{misc.to_json(opts.args)}")
    misc_node.execute_code
        command : "sudo"
        args    : ["/usr/local/bin/bup_storage.py", "--zpool", ZPOOL].concat(opts.args)
        timeout : opts.timeout
        path    : process.cwd()
        cb      : (err, output) =>
            winston.debug("bup_storage: finished running #{misc.to_json(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, if output.stdout then misc.from_json(output.stdout) else undefined)


# A single project from the point of view of the storage server
class Project
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            verbose    : true

        @project_id      = opts.project_id
        @verbose         = opts.verbose

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("Project(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    exec: (opts) =>
        opts = defaults opts,
            args    : required
            timeout : TIMEOUT
            cb      : required

        args = []
        for a in opts.args
            args.push(a)
        args.push(@project_id)

        @dbg("exec", opts.args, "executing bup_storage.py script")
        bup_storage
            args    : args
            timeout : opts.timeout
            cb      : opts.cb

    action: (opts) =>
        opts = defaults opts,
            action  : required    # sync, save, etc.
            timeout : TIMEOUT
            param   : undefined   # if given, should be an array or string
            cb      : undefined   # cb?(err)

        @dbg('action', opts)
        if opts.action == 'get_state'
            @get_state(cb : (err, state) => opts.cb?(err, state))
            return


        state  = undefined
        result = undefined
        # STATES: stopped, starting, running, restarting, stopping, saving, error
        async.series([
            (cb) =>
                @get_state
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                if opts.param == 'force'
                    force = true
                    delete opts.param
                else
                    force = false
                switch opts.action
                    when 'start'
                        if state in ['stopped', 'error'] or force
                            @state = 'starting'
                            @_action
                                action  : 'start'
                                param   : opts.param
                                timeout : opts.timeout
                                cb      : (err, r) =>
                                    result = r
                                    if err
                                        @dbg("action", opts, "start -- error starting=#{err}")
                                        @state = 'error'
                                    else
                                        @dbg("action", opts, "started successfully -- changing state to running")
                                        @state = 'running'
                                    cb(err)
                        else
                            cb()

                    when 'restart'
                        if state in ['running', 'error'] or force
                            @state = 'restarting'
                            @_action
                                action  : 'restart'
                                param   : opts.param
                                timeout : opts.timeout
                                cb      : (err, r) =>
                                    result = r
                                    if err
                                        @dbg("action", opts, "failed to restart -- #{err}")
                                        @state = 'error'
                                    else
                                        @dbg("action", opts, "restarted successfully -- changing state to running")
                                        @state = 'running'
                                    cb(err)
                        else
                            cb()

                    when 'stop'
                        if state in ['running', 'error'] or force
                            @state = 'stopping'
                            @_action
                                action  : 'stop'
                                param   : opts.param
                                timeout : opts.timeout
                                cb      : (err, r) =>
                                    result = r
                                    if err
                                        @dbg("action", opts, "failed to stop -- #{err}")
                                        @state = 'error'
                                    else
                                        @dbg("action", opts, "stopped successfully -- changing state to stopped")
                                        @state = 'stopped'
                                    cb(err)
                        else
                            cb()


                    when 'save'
                        if state in ['running'] or force
                            if not @_last_save? or misc.walltime() - @_last_save >= MIN_SAVE_INTERVAL_S
                                @state = 'saving'
                                @_last_save = misc.walltime()
                                @_action
                                    action  : 'save'
                                    param   : opts.param
                                    timeout : opts.timeout
                                    cb      : (err, r) =>
                                        result = r
                                        if err
                                            @dbg("action", opts, "failed to save -- #{err}")
                                            @state = 'error'
                                        else
                                            @dbg("action", opts, "saved successfully -- changing state from saving back to running")
                                            @state = 'running'
                                        cb(err)
                            else
                                # ignore
                                cb()
                        else
                            cb()

                    else
                        @_action
                            action  : opts.action
                            param   : opts.param
                            timeout : opts.timeout
                            cb      : (err, r) =>
                                result = r
                                cb(err)
        ], (err) =>
            opts.cb?(err, result)
        )

    _action: (opts) =>
        opts = defaults opts,
            action  : required    # sync, save, etc.
            param   : undefined   # if given, should be an array or string
            timeout : TIMEOUT
            cb      : undefined   # cb?(err)
        dbg = (m) => @dbg("_action", opts, m)
        dbg()
        switch opts.action
            when "get_state"
                @get_state
                    cb : opts.cb

            else

                dbg("Doing action #{opts.action} that involves executing script")
                args = [opts.action]
                if opts.param? and opts.param != 'force'
                    if typeof opts.param == 'string'
                        opts.param = misc.split(opts.param)  # turn it into an array
                    args = args.concat(opts.param)
                @exec
                    args    : args
                    timeout : opts.timeout
                    cb      : opts.cb

    get_state: (opts) =>
        opts = defaults opts,
            cb : required

        if @state?
            if @state not in ['starting', 'stopping', 'restarting']   # stopped, running, saving, error
                winston.debug("get_state -- confirming running status")
                @_action
                    action : 'status'
                    param  : '--running'
                    cb     : (err, status) =>
                        winston.debug("get_state -- confirming based on status=#{misc.to_json(status)}")
                        if err
                            @state = 'error'
                        else if status.running
                            # set @state to a running state: either 'saving' or 'running'
                            if @state != 'saving'
                                @state = 'running'
                        else
                            @state = 'stopped'
                        opts.cb(undefined, @state)
            else
                winston.debug("get_state -- trusting running status since @state=#{@state}")
                opts.cb(undefined, @state)
            return
        # We -- the server running on this compute node -- don't know the state of this project.
        # This might happen if the server were restarted, the machine rebooted, the project not
        # ever started, here, etc.  So we run a script and try to guess a state.
        @_action
            action : 'status'
            cb     : (err, status) =>
                @dbg("get_state",'',"basing on status=#{misc.to_json(status)}")
                if err
                    @state = 'error'
                else if status.running
                    @state = 'running'
                else
                    @state = 'stopped'
                opts.cb(undefined, @state)


projects = {}
get_project = (project_id) ->
    if not projects[project_id]?
        projects[project_id] = new Project(project_id: project_id)
    return projects[project_id]

handle_mesg = (socket, mesg) ->
    winston.debug("storage_server: handling '#{misc.to_safe_str(mesg)}'")
    id = mesg.id
    if mesg.event == 'storage'
        if mesg.action == 'server_id'
            mesg.server_id = SERVER_ID
            socket.write_mesg('json', mesg)
        else
            t = misc.walltime()
            if mesg.action == 'sync'
                if not mesg.param?
                    mesg.param = []
            project = get_project(mesg.project_id)
            project.action
                action : mesg.action
                param  : mesg.param
                cb     : (err, result) ->
                    if err
                        resp = message.error(error:err, id:id)
                    else
                        resp = message.success(id:id)
                    if result?
                        resp.result = result
                    resp.time_s = misc.walltime(t)
                    socket.write_mesg('json', resp)
    else
        socket.write_mesg('json', message.error(id:id, error:"unknown event type: '#{mesg.event}'"))

up_since = undefined
init_up_since = (cb) ->
    fs.readFile "/proc/uptime", (err, data) ->
        if err
            cb(err)
        else
            up_since = cassandra.seconds_ago(misc.split(data.toString())[0])
            cb()

SERVER_ID = undefined

init_server_id = (cb) ->
    file = program.server_id_file
    fs.exists file, (exists) ->
        if not exists
            SERVER_ID = uuid.v4()
            fs.writeFile file, SERVER_ID, (err) ->
                if err
                    winston.debug("Error writing server_id file!")
                    cb(err)
                else
                    winston.debug("Wrote new SERVER_ID =#{SERVER_ID}")
                    cb()
        else
            fs.readFile file, (err, data) ->
                if err
                    cb(err)
                else
                    SERVER_ID = data.toString()
                    cb()


idle_timeout = () ->
    dbg = (m) -> winston.debug("idle_timeout: #{m}")
    dbg('Periodic check for projects that are running and call "kill --only_if_idle" on them all.')
    uids = []
    async.series([
        (cb) ->
            dbg("get uids of active projects")
            misc_node.execute_code
                command : "ps -Ao uid| sort |uniq"
                timeout : 30
                bash    : true
                cb      : (err, output) =>
                    if err
                        cb(err); return
                    v = output.stdout.split('\n')
                    dbg("got #{v.length} uids")
                    for uid in v
                        uid = parseInt(uid)
                        if uid > 65535
                            uids.push(uid)
                    cb()
        (cb) ->
            f = (uid, c) ->
                misc_node.execute_code
                    command : "getent passwd '#{uid}' | cut -d: -f6"
                    timeout : 30
                    bash    : true
                    cb      : (err, output) =>
                        if err
                            dbg("WARNING: error getting username for uid #{uid} -- #{err}")
                            c()
                        else if output.stdout.indexOf('nobody') != -1
                            c()
                        else
                            dbg("#{uid} --> #{output.stdout}")
                            v = output.stdout.split('/')
                            project_id = v[v.length-1].trim()
                            get_project(project_id).action
                                action : 'stop'
                                param  : '--only_if_idle'
                                cb     : (err) ->
                                    if err
                                        dbg("WARNING: error stopping #{project_id} -- #{err}")
                                    c()
            async.map(uids, f, cb)
    ])


start_tcp_server = (cb) ->
    winston.info("starting tcp server...")

    setInterval(idle_timeout, IDLE_TIMEOUT_INTERVAL_S * 1000)

    server = net.createServer (socket) ->
        winston.debug("received connection")
        socket.id = uuid.v4()
        misc_node.unlock_socket socket, secret_token, (err) ->
            if err
                winston.debug("ERROR: unable to unlock socket -- #{err}")
            else
                winston.debug("unlocked connection")
                misc_node.enable_mesg(socket)
                socket.on 'mesg', (type, mesg) ->
                    if type == "json"   # other types ignored -- we only deal with json
                        winston.debug("received mesg #{misc.to_safe_str(mesg)}")
                        try
                            handle_mesg(socket, mesg)
                        catch e
                            winston.debug(new Error().stack)
                            winston.error "ERROR: '#{e}' handling message '#{misc.to_safe_str(mesg)}'"

    get_port = (c) ->
        if program.port
            c()
        else
            # attempt once to use the same port as in port file, if there is one
            fs.exists program.portfile, (exists) ->
                if not exists
                    program.port = 0
                    c()
                else
                    fs.readFile program.portfile, (err, data) ->
                        if err
                            program.port = 0
                            c()
                        else
                            program.port = data.toString()
                            c()
    listen = (c) ->
        winston.debug("trying port #{program.port}")
        server.listen program.port, program.address, (err) ->
            if err
                winston.debug("failed to listen to #{program.port} -- #{err}")
                c(err)
            else
                program.port = server.address().port
                fs.writeFile(program.portfile, program.port, cb)
                winston.debug("listening on #{program.address}:#{program.port}")
                c()
    get_port () ->
        listen (err) ->
            if err
                winston.debug("fail so let OS assign port...")
                program.port = 0
                listen()


secret_token = undefined
read_secret_token = (cb) ->
    if secret_token?
        cb()
        return
    winston.debug("read_secret_token")

    async.series([
        # Read or create the file; after this step the variable secret_token
        # is set and the file exists.
        (cb) ->
            fs.exists program.secret_file, (exists) ->
                if exists
                    winston.debug("read '#{program.secret_file}'")
                    fs.readFile program.secret_file, (err, buf) ->
                        secret_token = buf.toString().trim()
                        cb()
                else
                    winston.debug("create '#{program.secret_file}'")
                    require('crypto').randomBytes 64, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(program.secret_file, secret_token, cb)

        # Ensure restrictive permissions on the secret token file.
        (cb) ->
            fs.chmod(program.secret_file, 0o600, cb)
    ], cb)


start_server = () ->
    winston.debug("start_server")
    async.series [init_server_id, init_up_since, read_secret_token, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")


###########################
## GlobalClient -- client for working with *all* storage/compute servers
###########################

###

# Adding new servers form the coffeescript command line and pushing out config files:

c=require('cassandra');x={};d=new c.Salvus(hosts:['10.1.11.2'], keyspace:'salvus', username:'salvus', password:fs.readFileSync('/home/salvus/salvus/salvus/data/secrets/cassandra/salvus').toString().trim(),consistency:1,cb:((e,d)->console.log(e);x.d=d))

require('bup_server').global_client(database:x.d, cb:(e,c)->x.e=e;x.c=c)

(x.c.register_server(host:"10.1.#{i}.5",dc:0,cb:console.log) for i in [10..21])

(x.c.register_server(host:"10.1.#{i}.5",dc:1,cb:console.log) for i in [1..7])

(x.c.register_server(host:"10.3.#{i}.4",dc:1,cb:console.log) for i in [1..8])

x.c.push_servers_files(cb:console.log)

###

# A project viewed globally (but from a particular hub)
class GlobalProject
    constructor: (@project_id, @global_client) ->
        @database = @global_client.database

    get_location_pref: (cb) =>
        @database.select_one
            table   : "projects"
            columns : ["bup_location"]
            where   : {project_id : @project_id}
            cb      : (err, result) =>
                if err
                    cb(err)
                else
                    cb(undefined, result[0])

    set_location_pref: (server_id, cb) =>
        @database.update
            table : "projects"
            set   : {bup_location : server_id}
            where   : {project_id : @project_id}
            cb      : cb


    # starts project if necessary, waits until it is running, and
    # gets the hostname port where the local hub is serving.
    local_hub_address: (opts) =>
        opts = defaults opts,
            timeout : 30
            cb : required      # cb(err, {host:hostname, port:port, status:status, server_id:server_id})
        if @_local_hub_address_queue?
            @_local_hub_address_queue.push(opts.cb)
        else
           @_local_hub_address_queue = [opts.cb]
           @_local_hub_address
               timeout : opts.timeout
               cb      : (err, r) =>
                   for cb in @_local_hub_address_queue
                       cb(err, r)
                   delete @_local_hub_address_queue

    _local_hub_address: (opts) =>
        opts = defaults opts,
            timeout : 90
            cb : required      # cb(err, {host:hostname, port:port, status:status, server_id:server_id})
        dbg = (m) -> winston.info("local_hub_address(#{@project_id}): #{m}")
        dbg()
        server_id = undefined
        port      = undefined
        status    = undefined
        attempt = (cb) =>
            dbg("attempt")
            async.series([
                (cb) =>
                    dbg("see if host running")
                    @get_host_where_running
                        cb : (err, s) =>
                            port = undefined
                            server_id = s
                            cb(err)
                (cb) =>
                    if not server_id?
                        dbg("not running anywhere, so try to start")
                        @start(cb:cb)
                    else
                        dbg("running or starting somewhere, so test it out")
                        @project
                            server_id : server_id
                            cb        : (err, project) =>
                                if err
                                    cb(err)
                                else
                                    project.status
                                        cb : (err, _status) =>
                                            status = _status
                                            port = status?['local_hub.port']
                                            cb()
                (cb) =>
                    if port?
                        dbg("success -- we got our host #{server_id} at port #{port}")
                        @_update_project_settings(cb)
                    else
                        dbg("fail -- not working yet")
                        cb(true)
             ], cb)

        t = misc.walltime()
        f = () =>
            if misc.walltime() - t > opts.timeout
                # give up
                opts.cb("unable to start project running somewhere within about #{opts.timeout} seconds")
            else
                # try to open...
                attempt (err) =>
                    if err
                        dbg("attempt to get address failed -- #{err}; try again in 5 seconds")
                        setTimeout(f, 5000)
                    else
                        # success!?
                        host = @global_client.servers.by_id[server_id]?.host
                        if not host?
                            opts.cb("unknown server #{server_id}")
                        else
                            opts.cb(undefined, {host:host, port:port, status:status, server_id:server_id})
         f()


    _update_project_settings: (cb) =>
        dbg = (m) -> winston.debug("GlobalProject.update_project_settings(#{@project_id}): #{m}")
        dbg()
        @database.select_one
            table   : 'projects'
            columns : ['settings']
            where   : {project_id: @project_id}
            cb      : (err, result) =>
                dbg("got settings from database: #{misc.to_json(result[0])}")
                if err or not result[0]?   # result[0] = undefined if no special settings
                    cb?(err)
                else
                    opts = result[0]
                    opts.cb = (err) =>
                        if err
                            dbg("set settings for project -- #{err}")
                        else
                            dbg("successful set settings")
                        cb?(err)
                    @settings(opts)

    start: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = (m) -> winston.debug("GlobalProject.start(#{@project_id}): #{m}")
        dbg()
        state     = undefined
        project   = undefined
        server_id = undefined
        target    = undefined

        async.series([
            (cb) =>
                @get_location_pref (err, result) =>
                    if not err and result?
                        dbg("setting prefered start target to #{result[0]}")
                        target = result
                        cb()
                    else
                        cb(err)
            (cb) =>
                dbg("get global state of the project")
                @get_state
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                running_on = (server_id for server_id, s of state when s in ['running', 'starting', 'restarting', 'saving'])
                if running_on.length == 0
                    dbg("find a place to run project")
                    v = (server_id for server_id, s of state when s not in ['error'])
                    if v.length == 0
                        v = misc.keys(state)
                    if target? and v.length > 1
                        v = (server_id for server_id in v when server_id != @_next_start_avoid)
                        delete @_next_start_avoid
                    if target? and target in v
                        server_id = target
                        cb()
                    else
                        dbg("order good servers by most recent save time, and choose randomly from those")
                        @get_last_save
                            cb : (err, last_save) =>
                                if err
                                    cb(err)
                                else
                                    for server_id in v
                                        if not last_save[server_id]?
                                            last_save[server_id] = 0
                                    w = []
                                    for server_id, timestamp of last_save
                                        if server_id not in v
                                            delete last_save[server_id]
                                        else
                                            w.push(timestamp)
                                    if w.length > 0
                                        w.sort()
                                        newest = w[w.length-1]
                                        # we use date subtraction below because equality testing of dates does *NOT* work correctly
                                        # for our purposes, maybe due to slight rounding errors and milliseconds.  And strategically
                                        # it also makes sense to lump 2 projects with a save within a few seconds in our random choice.
                                        v = (server_id for server_id in v when Math.abs(last_save[server_id] - newest) < 10*1000)
                                    dbg("choosing randomly from #{v.length} choices with optimal save time")
                                    server_id = misc.random_choice(v)
                                    if not server_id?
                                        e = "no host available on which to open project"
                                        dbg(e)
                                        cb(e)
                                    else
                                        dbg("our choice is #{server_id}")
                                        cb()

                else if running_on.length == 1
                    dbg("done -- nothing further to do -- project already running on one host")
                    cb()
                else
                    dbg("project running on more than one host -- repair by killing all but first; this will force any clients to move to the correct host when their connections get dropped")
                    running_on.sort() # sort so any client doing the same thing will kill the same other ones.
                    @_stop_all(running_on.slice(1))
                    cb()

            (cb) =>
                if not server_id?  # already running
                    cb(); return
                dbg("got project on #{server_id} so we can start it there")
                @project
                    server_id : server_id
                    cb        : (err, p) =>
                        project = p; cb (err)
            (cb) =>
                if not server_id?  # already running
                    cb(); return
                dbg("get current non-default settings from the database and set before starting project")
                @get_settings
                    cb : (err, settings) =>
                        if err
                            cb(err)
                        else
                            settings.cb = cb
                            project.settings(settings)
            (cb) =>
                if not server_id?  # already running
                    cb(); return
                dbg("start project on #{server_id}")
                project.start
                    cb : (err) =>
                        if not err
                            dbg("success -- record that #{server_id} is now our preferred start location")
                            @set_location_pref(server_id)
                        cb(err)
        ], (err) => opts.cb?(err))


    restart: (opts) =>
        dbg = (m) => winston.debug("GlobalProject.restart(#{@project_id}): #{m}")
        dbg()
        @running_project
            cb : (err, project) =>
                if err
                    dbg("unable to determine running project -- #{err}")
                    opts.cb(err)
                else if project?
                    dbg("project is running somewhere, so restart it there")
                    project.restart(opts)
                else
                    dbg("project not running anywhere, so start it somewhere")
                    @start(opts)


    save: (opts) =>
        opts = defaults opts,
            cb : undefined
        # if we just saved this project, return immediately -- note: THIS IS "CLIENT" side, but there is a similar guard on the actual compute node
        if @_last_save? and misc.walltime() - @_last_save < MIN_SAVE_INTERVAL_S
            opts.cb?(undefined)
            return

        # put this here -- we don't even want to *try* more frequently than MIN_SAVE_INTERVAL_S, in case of save bup repo being broken (?)
        @_last_save = misc.walltime()

        dbg = (m) => winston.debug("GlobalProject.save(#{@project_id}): #{m}")

        need_to_save = false
        project      = undefined
        targets      = undefined
        server_id    = undefined
        errors       = []
        async.series([
            (cb) =>
                dbg("figure out where/if project is running")
                @get_host_where_running
                    cb : (err, s) =>
                        server_id = s
                        if err
                            cb(err)
                        else if not server_id?
                            dbg("not running anywhere -- nothing to save")
                            cb()
                        else if @state?[server_id] == 'saving'
                            dbg("already saving -- nothing to do")
                            cb()
                        else
                            need_to_save = true
                            cb()
            (cb) =>
                if not need_to_save
                    cb(); return
                dbg("get the project itself")
                @project
                    server_id : server_id
                    cb        : (err, p) =>
                        project = p; cb(err)
            (cb) =>
                if not need_to_save
                    cb(); return
                dbg("get the targets for replication")
                @get_hosts
                    cb : (err, t) =>
                        targets = (@global_client.servers.by_id[x].host for x in t when x != server_id)  # targets as ip addresses
                        dbg("sync_targets = #{misc.to_json(targets)}")
                        cb(err)
            (cb) =>
                if not need_to_save
                    cb(); return
                dbg("save the project and sync")
                project.save
                    targets : targets
                    cb      : (err, result) =>
                        r = result?.result
                        dbg("RESULT = #{misc.to_json(result)}")
                        if not err and r? and r.timestamp? and r.files_saved > 0
                            dbg("record info about saving #{r.files_saved} files in database")
                            last_save = {}
                            last_save[server_id] = r.timestamp*1000
                            if r.sync?
                                for x in r.sync
                                    if x.host == '' # special case - the server hosting the project
                                        s = server_id
                                    else
                                        s = @global_client.servers.by_host[x.host].server_id
                                    if not x.error?
                                        last_save[s] = r.timestamp*1000
                                    else
                                        # this replication failed
                                        errors.push("replication to #{s} failed -- #{x.error}")
                            @set_last_save
                                last_save        : last_save
                                bup_repo_size_kb : r.bup_repo_size_kb
                                cb               : cb
                        else
                            cb(err)
        ], (err) =>
            if err
                opts.cb?(err)
            else if errors.length > 0
                opts.cb?(errors)
            else
                opts.cb?()
        )


    sync: (opts) =>
        opts = defaults opts,
            destructive : false
            snapshots   : true   # whether to sync snapshots -- if false, only syncs live files
            union       : false  # if true, sync's by making the files and bup repo the union of that on all replicas -- this is for *REPAIR*
            timeout     : TIMEOUT
            cb          : undefined

        dbg = (m) => winston.debug("GlobalProject.sync(#{@project_id}): #{m}")

        project   = undefined
        targets   = undefined
        server_id = undefined
        result    = undefined
        errors    = []
        async.series([
            (cb) =>
                dbg("figure out master if there is one")
                @get_location_pref (err,s) =>
                        server_id = s
                        dbg("got master=#{server_id}")
                        cb(err)
            (cb) =>
                dbg("lookup the servers that host this project")
                @get_hosts
                    cb : (err, hosts) =>
                        if err
                            cb(err)
                        else
                            targets = hosts
                            dbg("servers=#{misc.to_json(targets)}")
                            if not server_id? # no master (project never used), so choose one at random
                                server_id = misc.random_choice(targets)
                            targets = (@global_client.servers.by_id[x].host for x in targets when x!= server_id)
                            cb()
            (cb) =>
                dbg("get the project itself")
                @project
                    server_id : server_id
                    cb        : (err, p) =>
                        project = p; cb(err)
            (cb) =>
                dbg("do the sync")
                tm = cassandra.now()
                project.sync
                    targets     : targets
                    union       : opts.union
                    destructive : opts.destructive
                    snapshots   : opts.snapshots
                    timeout     : opts.timeout
                    cb          : (err, x) =>
                        if err
                            cb(err)
                        else
                            r = x.result
                            if not r?
                                cb()
                                return
                            dbg("record info about syncing in database")
                            last_save = {}
                            last_save[server_id] = tm
                            for x in r
                                if x.host == '' # special case - the server hosting the project
                                    s = server_id
                                else
                                    s = @global_client.servers.by_host[x.host].server_id
                                if not x.error?
                                    last_save[s] = tm
                                else
                                    errors.push(x.error)
                            @set_last_save
                                last_save : last_save
                                cb        : cb
        ], (err) =>
            if err
                opts.cb?(err)
            else if errors.length > 0
                opts.cb?(errors)
            else
                opts.cb?(undefined, result)
        )

    # if some project is actually running, return it; otherwise undefined
    running_project: (opts) =>
        opts = defaults opts,
            cb : required   # (err, project)
        @get_host_where_running
            cb : (err, server_id) =>
                if err
                    opts.cb?(err)
                else if not server_id?
                    opts.cb?() # not running anywhere
                else
                    @project
                        server_id : server_id
                        cb        : opts.cb

    # return status of *running* project, if running somewhere, or {}.
    status: (opts) =>
        @running_project
            cb : (err, project) =>
                if err
                    opts.cb(err)
                else if project?
                    project.status(opts)
                else
                    opts.cb(undefined, {})  # no running project, so no status

    # set settings of running project, if running somewhere, or an error.
    settings: (opts) =>
        @running_project
            cb : (err, project) =>
                if err
                    opts.cb?(err)
                else if project?
                    project.settings(opts)
                else
                    opts.cb?("project not running anywhere")

    stop: (opts) =>
        opts = defaults opts,
            force : false
            cb    : undefined
        @get_host_where_running
            cb : (err, server_id) =>
                if err
                    opts.cb?(err)
                else if not server_id?
                    opts.cb?() # not running anywhere -- nothing to save
                else
                    @_stop_all([server_id])
                    opts.cb?()

    # change the location preference for the next start, and attempts to stop
    # if running somewhere now.
    move: (opts) =>
        opts = defaults opts,
            target : undefined
            cb     : undefined
        dbg = (m) -> winston.debug("GlobalProject.move(#{@project_id}): #{m}")
        dbg()
        async.series([
            (cb) =>
                if opts.target?
                    dbg("set next open location preference -- target=#{opts.target}")
                    @set_location_pref(opts.target, cb)
                else
                    cb()
            (cb) =>
                @get_host_where_running
                    cb : (err, server_id) =>
                        if err
                            dbg("error determining info about running status -- #{err}")
                            cb(err)
                        else
                            @_next_start_avoid = server_id
                            if server_id?
                                # next start will happen on new machine...
                                @stop
                                    cb: (err) =>
                                        dbg("non-fatal error stopping -- expected given that move is used when host is down -- #{err}")
                                        cb()
                            else
                                cb()
        ], (err) =>
            dbg("move completed -- #{err}")
            opts.cb?(err)
        )

    get_host_where_running: (opts) =>
        opts = defaults opts,
            cb : required    # cb(err, serverid or undefined=not running anywhere)
        @get_state
            cb : (err, state) =>
                if err
                      opts.cb(err); return
                running_on = (server_id for server_id, s of state when s in ['running', 'starting', 'restarting', 'saving'])
                if running_on.length == 0
                    opts.cb()
                else
                    running_on.sort() # sort -- so any other client doing the same thing will kill the same other ones.
                    server_id = running_on[0]
                    @_stop_all(  (x for x,s in state when x != server_id)  )
                    @set_location_pref(server_id)   # remember in db so we'll prefer this host in future
                    opts.cb(undefined, server_id)

    _stop_all: (v) =>
        if v.length == 0
            return
        winston.debug("GlobalProject: repair by stopping on #{misc.to_json(v)}")
        for server_id in v
            @project
                server_id:server_id
                cb : (err, project) =>
                    if not err
                        project.stop(force:true)

    # get local copy of project on a specific host
    project: (opts) =>
        opts = defaults opts,
            server_id : undefined  # if server_id is not given uses the preferred location
            cb        : required
        project = undefined
        async.series([
            (cb) =>
                if not opts.server_id?
                    @get_location_pref (err, server_id) =>
                        opts.server_id = server_id
                        cb(err)
                else
                    cb()
            (cb) =>
                @global_client.storage_server
                    server_id : opts.server_id
                    cb        : (err, s) =>
                        if err
                            cb(err)
                        else
                            s.project   # this is cached
                                project_id : @project_id
                                cb         : (err, p) =>
                                    project = p
                                    cb(err)
        ], (err) =>
            opts.cb(err, project))

    set_last_save: (opts) =>
        opts = defaults opts,
            last_save : required    # map  {server_id:timestamp, ...}
            bup_repo_size_kb : undefined  # if given, should be int
            allow_delete : false
            cb        : undefined
        async.series([
            (cb) =>
                s = "UPDATE projects SET bup_last_save[?]=? WHERE project_id=?"
                f = (server_id, cb) =>
                    if not opts.last_save[server_id] and not opts.allow_delete
                        winston.debug("refusing to delete last_save entry! -- #{@project_id}, #{server_id}")
                        cb()
                    else
                        args = [server_id, opts.last_save[server_id], @project_id]
                        winston.debug("#{s} -- #{misc.to_json(args)}")
                        @database.cql(s, args, cql.types.consistencies.localQuorum, cb)
                winston.debug("#{misc.keys(opts.last_save)}")
                async.map(misc.keys(opts.last_save), f, cb)
            (cb) =>
                if opts.bup_repo_size_kb?
                    @database.update
                        table   : "projects"
                        set     : {bup_repo_size_kb : opts.bup_repo_size_kb}
                        where   : {project_id : @project_id}
                        cb      : cb
                else
                    cb()
        ], (err) -> opts.cb?(err))


    get_last_save: (opts) =>
        opts = defaults opts,
            cb : required
        @database.select
            table : 'projects'
            where : {project_id:@project_id}
            columns : ['bup_last_save']
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else
                    if result.length == 0 or not result[0][0]?
                        last_save = {}
                    else
                        last_save = result[0][0]
                    opts.cb(undefined, last_save)

    get_hosts: (opts) =>
        opts = defaults opts,
            cb : required
        hosts = []
        dbg = (m) -> winston.debug("GlobalProject.get_hosts(#{@project_id}): #{m}")
        async.series([
            (cb) =>
                dbg("get last save info from database...")
                @database.select
                    table   : 'projects'
                    where   : {project_id:@project_id}
                    columns : ['bup_last_save']
                    consistency : cql.types.consistencies.localQuorum
                    cb      : (err, r) =>
                        if err or not r? or r.length == 0
                            cb(err)
                        else
                            if r[0][0]?
                                hosts = misc.keys(r[0][0])
                            cb()
            (cb) =>
                servers = @global_client.servers
                dbg("hosts=#{misc.to_json(hosts)}; ensure that we have (at least) one host from each of the #{misc.keys(servers.by_dc).length} data centers (excluding dc's with no non-experimental hosts)")
                last_save = {}
                now = cassandra.now()
                for dc, s of servers.by_dc
                    # get just the non-experimental servers in this data center
                    servers_in_dc = {}
                    for id, r of s
                        if not r.experimental
                            servers_in_dc[id] = r
                    if misc.len(servers_in_dc) == 0
                        # skip this dc; there are no servers at all to use.
                        continue
                    have_one = false
                    for h in hosts
                        if servers_in_dc[h]?
                            have_one = true
                            break
                    if not have_one
                        h = misc.random_choice(misc.keys(servers_in_dc))
                        hosts.push(h)
                        last_save[h] = now # brand new, so nothing to save yet
                if misc.len(last_save) > 0
                    dbg("added new hosts: #{misc.to_json(last_save)}")
                    @set_last_save
                        last_save : last_save
                        cb        : cb
                else
                    cb()
        ], (err) => opts.cb(undefined, hosts))

    # determine state just on pref host.
    get_local_state: (opts) =>
        opts = defaults opts,
            timeout : 25
            cb      : required
        server_id = undefined
        project = undefined
        state = 'error'
        dbg = (m) -> winston.debug("GlobalProject.get_local_state(#{@project_id}): #{m}")
        async.series([
            (cb) =>
                @get_location_pref (err, s) =>
                    server_id = s; cb(err)
            (cb) =>
                if not server_id?
                    cb(); return
                @project
                    server_id : server_id
                    cb        : (err, p) =>
                        if err
                            dbg("failed to get project on server #{server_id} -- #{err}")
                        project = p
                        cb(err)
            (cb) =>
                if not server_id?
                    state = 'closed'
                    cb(); return
                project.get_state
                    timeout : opts.timeout
                    cb : (err, s) =>
                        state = s; cb(err)
        ], (err) =>
            opts.cb(undefined, {state:state, host:@global_client.servers.by_id[server_id]?.host, server_id:server_id})
        )

    # determine the global state by querying *all servers*
    # guaranteed to return length > 0
    get_state: (opts) =>
        opts = defaults opts,
            timeout : 30
            id      : true     # if false, instead give hostnames as keys instead of server_id's  (useful for interactive work)
            cb      : required
        dbg = (m) => winston.info("get_state: #{m}")
        dbg()
        servers = undefined
        @state = {}
        async.series([
            (cb) =>
                dbg("lookup the servers that host this project")
                @get_hosts
                    cb : (err, hosts) =>
                        if err
                            cb(err)
                        else
                            servers = hosts
                            dbg("servers=#{misc.to_json(servers)}")
                            cb()
            (cb) =>
                dbg("query each server for the project's state there")
                f = (server_id, cb) =>
                    dbg("query #{server_id} for state")
                    project = undefined
                    async.series([
                        (cb) =>
                            @project
                                server_id : server_id
                                cb        : (err, p) =>
                                    if err
                                        dbg("failed to get project on server #{server_id} -- #{err}")
                                    project = p
                                    cb(err)
                        (cb) =>
                            project.get_state
                                timeout : opts.timeout
                                cb : (err, s) =>
                                    if err
                                        dbg("error getting state on #{server_id} -- #{err}")
                                        s = 'error'
                                    if opts.id
                                        key = server_id
                                    else
                                        key = @global_client.servers.by_id[server_id].host
                                    @state[key] = s
                                    cb()
                    ], cb)

                async.map servers, f, (err) => cb(err)

        ], (err) => opts.cb?(err, @state)
        )

    # mount a remote project (or directory in one) so that it is accessible in this project
    # NOTE: Neither project has to be running; however, both must have a defined master "bup_location".

    # WARNING: This is valid at the time when mounted.  However, if the remote project moves
    # *and* the client is restarted, it will loose the interval timer state
    # below, and the mount will become invalid.   Thus use with extreme caution until
    # this state is better tracked (e.g., via a local database whose state survives restart, or
    # via the database, or some other approach).
    mount_remote: (opts) =>
        opts = defaults opts,
            project_id  : required    # id of the remote project
            remote_path : ''          # path to mount in the remote project (relative to $HOME of that project)
            mount_point : required    # local mount point, relative to $HOME
            cb          : undefined

        dbg = (m) => winston.info("mount_remote(#{misc.to_json(opts)}): #{m}")
        dbg()

        remote_host = undefined
        project     = undefined
        interval    = 30000

        # This client will query the database every interval seconds to see if the remote
        # project has moved -- if so, it will change the mount accordingly.    I'm putting
        # this code in specifically for limited testing use to get a feel for this feature
        # before planning something more robust!
        if not @_mount_remote_interval?
            @_mount_remote_interval = {}

        async.series([
            (cb) =>
                dbg("get current location of remote project")
                @global_client.get_project(opts.project_id).get_location_pref (err, server_id) =>
                    if err
                        cb(err)
                    else
                        remote_host = @global_client.servers.by_id[server_id].host
                        dbg("remote_host=#{remote_host}")
                        cb()
            (cb) =>
                dbg("get this project on prefered host")
                @project
                    cb : (err, p) =>
                        project = p; cb(err)
            (cb) =>
                dbg("execute mount command")
                project.mount_remote
                    remote_host : remote_host
                    project_id  : opts.project_id
                    mount_point : opts.mount_point
                    remote_path : opts.remote_path
                    cb          : cb
        ], (err) =>
            if err
                opts.cb?(err)
            else
                key = opts.mount_point  # if something else was already mounted here, above code would have failed.
                if not @_mount_remote_interval[key]?
                    dbg("setup interval check to see if remote project moves, and if so remount it")
                    # see comments above -- this is just for testing purposes
                    f = () =>
                        @global_client.get_project(opts.project_id).get_location_pref (err, server_id) =>
                            if err
                                # database error -- try again later
                                return
                            if remote_host != @global_client.servers.by_id[server_id].host
                                @umount_remote
                                    mount_point : opts.mount_point
                                    cb          : (err) =>
                                        @mount_remote(opts)
                    @_mount_remote_interval[key] = setInterval(f, interval)
                opts.cb?()
        )

    umount_remote: (opts) =>
        opts = defaults opts,
            mount_point : required
            cb          : undefined
        winston.info("umount_remote: #{opts.mount_points}")
        @project
            cb : (err, project) =>
                if err
                    opts.cb?(err)
                else
                    project.umount_remote
                        mount_point : opts.mount_point
                        cb          : (err) =>
                            if @_mount_remote_interval[opts.mount_point]?
                                clearInterval(@_mount_remote_interval[opts.mount_point])
                                delete @_mount_remote_interval[opts.mount_point]
                            opts.cb?(err)

    set_settings: (opts) =>
        # For the options see the settings method of ClientProject.
        # This method changes settings in the database; also, if the project is currently running
        # somewhere, it updates the settings on that running instance.
        dbg = (m) => winston.info("set_settings(#{misc.to_json(opts)}): #{m}")
        dbg()

        cb0     = opts.cb
        timeout = opts.timeout
        delete opts.cb
        delete opts.timeout
        async.series([
            (cb) =>
                dbg("change settings in the database")
                f = (key, c) =>
                    if opts[key]?
                        @database.cql("UPDATE projects SET settings[?]=? WHERE project_id=?", [key, "#{opts[key]}", @project_id], c)
                    else
                        c()
                async.map(misc.keys(opts), f, (err) => cb(err))
            (cb) =>
                dbg("checking if project is running, and if so set settings locally there.")
                @get_host_where_running
                    cb : (err, server_id) =>
                        if err or not server_id?
                            dbg("project not running")
                            cb(err)
                        else
                            dbg("project running at #{server_id}, so changing settings there")
                            @project
                                server_id : server_id
                                cb        : (err, project) =>
                                    if err
                                        cb(err)
                                    else
                                        opts.cb = cb
                                        opts.timeout = timeout
                                        project.settings(opts)
        ], (err) => cb0?(err))

    get_settings: (opts) =>
        opts = defaults opts,
            cb          : undefined
        # Get project settings from the database; these are only the settings that
        # over-ride defaults.
        @database.select_one
            table     : 'projects'
            columns   : ['settings']
            objectify : false
            where     : {project_id : @project_id}
            cb        : (err, result) =>
                if err
                    opts.cb(err)
                else
                    if result[0]?
                        opts.cb(undefined, result[0])
                    else
                        opts.cb(undefined, {})






global_client_cache=undefined

exports.global_client = (opts) ->
    opts = defaults opts,
        database           : undefined
        cb                 : required
    C = global_client_cache
    if C?
        opts.cb(undefined, C)
    else
        global_client_cache = new GlobalClient
            database : opts.database
            cb       : opts.cb


class GlobalClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined   # connection to cassandra database
            cb       : required   # cb(err, @) -- called when initialized

        @_project_cache = {}

        async.series([
            (cb) =>
                if opts.database?
                    @database = opts.database
                    cb()
                else
                    fs.readFile "#{process.cwd()}/data/secrets/cassandra/hub", (err, password) =>
                        if err
                            cb(err)
                        else
                            if process.env.USER=='wstein'
                                hosts = ['localhost']
                            else
                                v = program.address.split('.')
                                a = parseInt(v[1]); b = parseInt(v[3])
                                if program.address == '10.1.15.7'  # devel
                                    hosts = ["10.1.15.2", '10.1.16.2', '10.1.14.2']
                                else if a == 1 and b>=1 and b<=7
                                    hosts = ("10.1.#{i}.2" for i in [1..7])
                                else if a == 1 and b>=10 and b<=21
                                    hosts = ("10.1.#{i}.2" for i in [10..21])
                                else if a == 3 or a == 4
                                    hosts = ("10.#{a}.#{i}.2" for i in [1..4])
                            winston.debug("database hosts=#{misc.to_json(hosts)}")
                            @database = new cassandra.Salvus
                                hosts       : hosts
                                keyspace    : if process.env.USER=='wstein' then 'test' else 'salvus'
                                username    : if process.env.USER=='wstein' then 'salvus' else 'hub'
                                consistency : 2
                                password    : password.toString().trim()
                                cb          : cb
            (cb) =>
                @_update(cb)
        ], (err) =>
            if not err
                f = () =>
                    setInterval(@_update, 1000*STORAGE_SERVERS_UPDATE_INTERVAL_S)  # update regularly
                # wait a random amount of time before starting the update interval, so that the database
                # doesn't get hit all at once over few minutes, when we start a large number of hubs at once.
                setTimeout(f, Math.random()*1000*STORAGE_SERVERS_UPDATE_INTERVAL_S)

                opts.cb(undefined, @)
            else
                opts.cb(err, @)
        )

    get_project: (project_id) =>
        P = @_project_cache[project_id]
        if not P?
            P = @_project_cache[project_id] = new GlobalProject(project_id, @)
        return P

    _update: (cb) =>
        dbg = (m) -> winston.debug("GlobalClient._update: #{m}")
        #dbg("updating list of available storage servers...")
        @database.select
            table     : 'storage_servers'
            columns   : ['server_id', 'host', 'port', 'dc', 'health', 'secret', 'experimental']
            objectify : true
            where     : {dummy:true}
            cb        : (err, results) =>
                if err
                    cb?(err); return
                #dbg("got #{results.length} storage servers")
                # parse result
                @servers = {by_dc:{}, by_id:{}, by_host:{}}
                x = {}
                max_dc = 0
                for r in results
                    max_dc = Math.max(max_dc, r.dc)
                    r.host = cassandra.inet_to_str(r.host)  # parse inet datatype
                    @servers.by_id[r.server_id] = r
                    if not @servers.by_dc[r.dc]?
                        @servers.by_dc[r.dc] = {}
                    @servers.by_dc[r.dc][r.server_id] = r
                    @servers.by_host[r.host] = r
                cb?()

    push_servers_files: (opts) =>
        opts = defaults opts,
            timeout : 30           # timeout if scp fails after this much time -- will happen if a server down or stale...
            cb      : undefined    # cb(err)
        console.log("starting...")
        dbg = (m) -> winston.info("push_servers_files: #{m}")
        dbg('starting... logged')
        errors = {}
        file = "#{DATA}/bup_servers"
        async.series([
            (cb) =>
                dbg("updating")
                @_update(cb)
            (cb) =>
                dbg("writing file")
                # @servers = {server_id:{host:'ip address', dc:2}, ...}
                servers_conf = {}
                for server_id, x of @servers.by_id
                    servers_conf[server_id] = {host:x.host, dc:x.dc}
                fs.writeFile(file, misc.to_json(servers_conf), cb)
            (cb) =>
                f = (server_id, c) =>
                    host = @servers.by_id[server_id].host
                    dbg("copying #{file} to #{host}...")
                    misc_node.execute_code
                        command : "scp"
                        timeout : opts.timeout
                        path    : process.cwd()
                        args    : ['-o', 'StrictHostKeyChecking=no', file, "#{host}:#{program.servers_file}"]
                        cb      : (err) =>
                            if err
                                errors[server_id] = err
                            c()
                async.map misc.keys(@servers.by_id), f, (err) =>
                    if misc.len(errors) == 0
                        opts.cb?()
                    else
                        opts.cb?(errors)
        ], (err) =>
            dbg("done!")
            if err
                dbg(err)
                opts.cb?(err)
            else
                opts.cb?()
        )

    register_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : 0             # 0, 1, 2, .etc.
            experimental : false   # if true, don't allocate new projects here
            timeout      : 30
            cb     : undefined
        dbg = (m) -> winston.debug("GlobalClient.add_storage_server(#{opts.host}, #{opts.dc}): #{m}")
        dbg("adding storage server to the database by grabbing server_id files, etc.")
        get_file = (path, cb) =>
            dbg("get_file: #{path}")
            misc_node.execute_code
                command : "ssh"
                path    : process.cwd()
                timeout : opts.timeout
                args    : ['-o', 'StrictHostKeyChecking=no', opts.host, "cat #{path}"]
                cb      : (err, output) =>
                    if err
                        cb(err)
                    else if output?.stderr and output.stderr.indexOf('No such file or directory') != -1
                        cb(output.stderr)
                    else
                        cb(undefined, output.stdout)

        set =
            host         : opts.host
            dc           : opts.dc
            port         : undefined
            secret       : undefined
            experimental : opts.experimental

        where =
            server_id : undefined
            dummy     : true

        async.series([
            (cb) =>
                get_file program.portfile, (err, port) =>
                    set.port = parseInt(port); cb(err)
            (cb) =>
                get_file program.server_id_file, (err, server_id) =>
                    where.server_id = server_id
                    cb(err)
            (cb) =>
                get_file program.secret_file, (err, secret) =>
                    set.secret = secret
                    cb(err)
            (cb) =>
                dbg("update database")
                @database.update
                    table : 'storage_servers'
                    set   : set
                    where : where
                    cb    : cb
        ], (err) => opts.cb?(err))


    score_servers: (opts) =>
        opts = defaults opts,
            healthy   : undefined     # list of server_ids we have found to be healthy
            unhealthy : undefined     # list of server_ids we have found to be unhealthy
            cb        : undefined     # cb(err)
        s = []
        if opts.healthy?
            s = s.concat(opts.healthy)
        else
            opts.healthy = []
        if opts.unhealthy?
            s = s.concat(opts.unhealthy)
        else
            opts.unhealthy = []
        if s.length == 0
            opts.cb?(); return
        @database.select
            table     : 'storage_servers'
            columns   : ['server_id', 'health']
            objectify : true
            where     : {dummy:true, server_id:{'in':s}}
            cb        : (err, results) =>
                f = (result, cb) =>
                    # TODO: replace formula before by what's done in gossip/cassandra, which is provably sensible.
                    # There is definitely a potential for "race conditions" below, but it doesn't matter -- it is just health.
                    if result.server_id in opts.healthy
                        if not result.health?
                            result.health = 1
                        else
                            result.health = (result.health + 1)/2.0
                    else if result.server_id in opts.unhealthy
                        if not result.health?
                            result.health = 0
                        else
                            result.health = (result.health + 0)/2.0
                    @database.update
                        table : 'storage_servers'
                        set   : {health:result.health}
                        where : {dummy:true, server_id:result.server_id}
                        cb    : cb
                async.map(results, f, (err) => opts.cb?(err))

    storage_server: (opts) =>
        opts = defaults opts,
            server_id : required
            cb        : required
        if not @servers.by_id[opts.server_id]?
            opts.cb("server #{opts.server_id} unknown")
            return
        s = @servers.by_id[opts.server_id]
        if not s.host?
            opts.cb("no hostname known for #{opts.server_id}")
            return
        if not s.port?
            opts.cb("no port known for #{opts.server_id}")
            return
        if not s.secret?
            opts.cb("no secret token known for #{opts.server_id}")
            return
        opts.cb(undefined, storage_server_client(host:s.host, port:s.port, secret:s.secret, server_id:opts.server_id))

    project_location: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        winston.debug("project_location(#{opts.project_id}): get current bup project location from database")
        @database.select_one
            table     : 'projects'
            where     : {project_id : opts.project_id}
            columns   : ['bup_location']
            objectify : false
            cb        : (err, result) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, result[0])


    project: (opts) =>
        opts = defaults opts,
            project_id : required
            server_id  : undefined  # if undefined gets best working client pre-started; if defined connect if possible but don't start anything
            prefer     : undefined  # if given, should be array of prefered servers -- only used if project isn't already opened somewhere
            prefer_not : undefined  # array of servers we prefer not to use
            cb         : required   # cb(err, Project client connection on some host)
        dbg = (m) => winston.debug("GlobalClient.project(#{opts.project_id}): #{m}")
        dbg()

        if opts.server_id?
            dbg("open on a specified client")
            @storage_server
                server_id : opts.server_id
                cb        : (err, s) =>
                    if err
                        opts.cb(err); return
                    s.project
                        project_id : opts.project_id
                        cb         : opts.cb
            return

        bup_location = undefined
        project      = undefined
        works        = undefined
        status       = undefined
        errors       = {}
        async.series([
            (cb) =>
                @project_location
                    project_id : opts.project_id
                    cb         : (err, result) =>
                        bup_location = result
                        cb(err)
            (cb) =>
                if not bup_location?
                    dbg("no current location")
                    cb()
                else
                    dbg("there is current location (=#{bup_location}) and project is working at current location, use it")
                    @project
                        project_id : opts.project_id
                        server_id  : bup_location
                        cb         : (err, _project) =>
                            if not err
                                project = _project
                            cb()
            (cb) =>
                if not project?
                    dbg("no accessible project currently started...")
                    cb()
                else
                    dbg("if project will start at current location, use it")
                    project.works
                        cb: (err, _works) =>
                            if err
                                project = undefined
                                cb()
                            else
                                works = _works
                                cb()
            (cb) =>
                if works
                    cb(); return
                dbg("try harder: get list of all locations (except current) and ask in parallel about status of each")
                @project_status
                    project_id  : opts.project_id
                    cb          : (err, _status) =>
                        if err
                            cb(err)
                        else
                            status = _status
                            cb()
            (cb) =>
                if works
                    cb(); return
                dbg("until success, choose one that responded with best status and try to start there")
                # remove those with error getting status
                for x in status
                    if x.error?
                        errors[x.replica_id] = x.error
                v = (x.replica_id for x in status when not x.error? and x.status?.bup in ['working', 'uninitialized'])

                prefer = opts.prefer; prefer_not = opts.prefer_not
                if prefer? or prefer_not?
                    # The following ugly code is basically "status=v" but with some re-ordering based on preference.
                    # put prefer servers at front of list; prefer_not servers at back; everything else in between
                    status = []
                    if prefer?
                        for s in prefer
                            if s in v
                                status.push(s)
                    if not prefer_not?
                        prefer_not = []
                    for s in v
                        if s not in status and s not in prefer_not
                            status.push(s)
                    for s in prefer_not
                        if s in v
                            status.push(s)
                else
                    status = v


                f = (replica_id, cb) =>
                    if works
                        cb(); return
                    @project
                        project_id : opts.project_id
                        server_id  : replica_id
                        cb         : (err, _project) =>
                            if err
                                dbg("error trying to open project on #{replica_id} -- #{err}")
                                cb(); return # skip to next
                            _project.restart
                                cb : (err) =>
                                    if not err
                                        project = _project
                                        bup_location = replica_id
                                        works = true
                                    else
                                        errors[replica_id] = err
                                        dbg("error trying to start project on #{replica_id} -- #{err}")
                                    cb()
                async.mapSeries(status, f, (err) => cb())
            (cb) =>
                if works and project? and bup_location?
                    dbg("succeeded at opening the project at #{bup_location} -- now recording this in DB")
                    @database.update
                        table : 'projects'
                        where : {project_id   : opts.project_id}
                        set   : {bup_location : bup_location}
                        cb    : cb
                else
                    cb("unable to open project anywhere")
        ], (err) =>
            if err
                opts.cb("unable to deploy project anywhere -- #{err}, #{misc.to_json(errors)}")
            else
                opts.cb(undefined, project)
        )

    project_status: (opts) =>
        opts = defaults opts,
            project_id         : required
            timeout            : 30   # seconds
            cb                 : required    # cb(err, sorted list of status objects)
        status = []
        f = (replica, cb) =>
            t = {replica_id:replica}
            status.push(t)
            @project
                project_id : opts.project_id
                server_id  : replica
                cb         : (err, project) =>
                    if err
                        t.error = err
                        cb()
                    else
                        project.status
                            timeout : opts.timeout
                            cb      : (err, _status) =>
                                if err
                                    @score_servers(unhealthy : [replica])
                                    t.error = err
                                    cb()
                                else
                                    @score_servers(healthy   : [replica])
                                    t.status = _status
                                    cb()
        hosts = undefined
        async.series([
            (cb) =>
                @get_project(opts.project_id).get_hosts
                    cb : (err, h) =>
                        hosts = h; cb(err)
            (cb) =>
                async.map hosts, f, (err) =>
                    status.sort (a,b) =>
                        if a.error? and b.error?
                            return 0  # doesn't matter -- both are broken/useless
                        if a.error? and not b.error
                            # b is better
                            return 1
                        if b.error? and not a.error?
                            # a is better
                            return -1
                        # sort of arbitrary -- mainly care about newest snapshot being newer = better = -1
                        if a.status.newest_snapshot?
                            if not b.status.newest_snapshot?
                                # a is better
                                return -1
                            else if a.status.newest_snapshot > b.status.newest_snapshot
                                # a is better
                                return -1
                            else if a.status.newest_snapshot < b.status.newest_snapshot
                                # b is better
                                return 1
                        else
                            if b.status.newest_snapshot?
                                # b is better
                                return 1
                        # Next compare health of server
                        health_a = @servers.by_id[a.replica_id]?.health
                        health_b = @servers.by_id[b.replica_id]?.health
                        if health_a? and health_b?
                            health_a = Math.round(3.8*health_a)
                            health_b = Math.round(3.8*health_b)
                            if health_a < health_b
                                # b is better
                                return 1
                            else if health_a > health_b
                                # a is better
                                return -1
                        # no error, so load must be defined
                        # smaller load is better -- later take into account free RAM, etc...
                        if a.status.load[0] < b.status.load[0]
                            return -1
                        else if a.status.load[0] > b.status.load[0]
                            return 1
                        return 0
                    cb()
            ], (err) =>
                opts.cb(err, status)
            )

    # For every project, check that the bup_last_save times are all the same, so that everything is fully replicated.
    # If not, replicate from the current location (or newest) out to others.
    repair: (opts) =>
        opts = defaults opts,
            limit       : 5           # number to do in parallel
            qlimit      : 10000000    # limit on number of projects to pull from database
            destructive : false
            timeout     : TIMEOUT
            dryrun      : false       # if true, just return the projects that need sync; don't actually sync
            status      : []
            cb          : required    # cb(err, errors)
        dbg = (m) => winston.debug("GlobalClient.repair(#{opts.project_id}): #{m}")
        dbg()
        projects = []
        errors = {}
        async.series([
            (cb) =>
                dbg("querying database....")
                @database.select
                    table     : 'projects'
                    columns   : ['project_id', 'bup_location', 'bup_last_save']
                    objectify : true
                    limit     : opts.qlimit # TODO: change to use paging...
                    cb        : (err, r) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{r.length} records")
                            r.sort (a,b) ->
                                if a.project_id < b.project_id
                                    return -1
                                else if a.project_id > b.project_id
                                    return 1
                                else
                                    return 0
                            for project in r
                                if not project.bup_last_save? or misc.len(project.bup_last_save) == 0
                                    continue
                                times = {}
                                for _, tm of project.bup_last_save
                                    times[tm] = true
                                times = misc.keys(times)
                                if times.length > 1
                                    # at least one replica must be out of date
                                    if project.bup_location?
                                        # choose the running location rather than newest, just in case.
                                        # should usually be the same, but might not be in case of split brain, etc.
                                        project.source_id = project.bup_location
                                        t = project.bup_last_save[project.bup_location]
                                    else
                                        times.sort()
                                        t = times[times.length-1]
                                        # choose any location with that time
                                        for server_id, tm of project.bup_last_save
                                            if "#{tm}" == t   # t is an map key so a string.
                                                project.source_id = server_id
                                                project.timestamp = tm
                                                break
                                        if not project.source_id?  # should be impossible
                                            cb("BUG -- project.source_id didn't get set -- #{misc.to_json(project)}")
                                            return
                                    project.targets = (server_id for server_id, tm of project.bup_last_save when "#{tm}" != t)
                                    projects.push(project)
                            cb()
            (cb) =>
                if opts.dryrun
                    cb(); return
                i = 0
                j = 0
                f = (project, cb) =>
                    i += 1
                    dbg("*** syncing project #{i}/#{projects.length} ***: #{project.project_id}")
                    s = {'status':'running...', project:project}
                    opts.status.push(s)
                    async.series([
                        (cb) =>
                            @project
                                project_id : project.project_id
                                server_id  : project.source_id
                                cb         : (err, p) =>
                                    if err
                                        cb(err)
                                    else
                                        p.sync
                                            targets     : (@servers.by_id[server_id].host for server_id in project.targets)
                                            timeout     : opts.timeout
                                            destructive : opts.destructive
                                            snapshots   : true
                                            cb          : cb
                        (cb) =>
                            # success -- update database
                            last_save = {}
                            for server_id in project.targets
                                last_save[server_id] = project.timestamp
                            @get_project(project.project_id).set_last_save
                                last_save : last_save
                                cb        : cb
                    ], (err) =>
                        j += 1
                        dbg("*** got result #{j}/#{projects.length} for #{project.project_id}: #{err}")
                        s['status'] = 'done'
                        if err
                            s['error'] = err
                        cb(err)
                    )

                dbg("#{projects.length} projects need to be sync'd")
                async.mapLimit(projects, opts.limit, f, (err) => cb())
        ], (err) =>
            if err
                opts.cb?(err)
            else if misc.len(errors) > 0
                opts.cb?(errors)
            else
                if opts.dryrun
                    opts.cb?(undefined, projects)
                else
                    opts.cb?()
        )



    sync_union: (opts) =>
        opts = defaults opts,
            limit       : 5           # number to do in parallel
            qlimit      : 10000000    # limit on number of projects to pull from database
            timeout     : TIMEOUT
            dryrun      : false       # if true, just return the projects that need sync; don't actually sync
            status      : []
            projects     : undefined   # if given, do sync on exactly these projects and no others
            cb          : required    # cb(err, errors)
        dbg = (m) => winston.debug("GlobalClient.sync_union: #{m}")
        dbg()
        projects = []
        errors = {}
        async.series([
            (cb) =>
                if opts.projects?
                    projects = opts.projects
                    cb()
                    return
                dbg("querying database for all projects with any data")
                @database.select
                    table     : 'projects'
                    columns   : ['project_id', 'bup_last_save']
                    objectify : true
                    limit     : opts.qlimit # TODO: change to use paging...
                    consistency : 1
                    cb        : (err, r) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{r.length} records")
                            r.sort (a,b) ->
                                if a.project_id < b.project_id
                                    return -1
                                else if a.project_id > b.project_id
                                    return 1
                                else
                                    return 0
                            projects = (x.project_id for x in r when x.bup_last_save? and misc.len(x.bup_last_save) > 0)
                            cb()
            (cb) =>
                if opts.dryrun
                    cb(); return
                i = 0
                j = 0
                f = (project_id, cb) =>
                    i += 1
                    dbg("*** syncing project #{i}/#{projects.length} ***: #{project_id}")
                    s = {'status':'running...', project_id:project_id}
                    opts.status.push(s)
                    @get_project(project_id).sync
                        union : true
                        cb    : (err) =>
                            j += 1
                            dbg("*** got result #{j}/#{projects.length} for #{project_id}: #{err}")
                            s['status'] = 'done'
                            if err
                                errors[project_id] = err
                                s['error'] = err
                            cb()
                dbg("#{projects.length} projects need to be sync'd")
                async.mapLimit(projects, opts.limit, f, (err) => cb())

        ], (err) =>
            if err
                opts.cb?(err)
            else if misc.len(errors) > 0
                opts.cb?(errors)
            else
                if opts.dryrun
                    opts.cb?(undefined, projects)
                else
                    opts.cb?()
        )

    # one-time throw-away code... but keep since could be useful to adapt!
    set_quotas: (opts) =>
        opts = defaults opts,
            limit    : 5           # number to do in parallel
            errors   : required    # map where errors are stored as they happen
            stop     : 99999999    # stop a
            dryrun   : true
            cb       : required    # cb(err, quotas)
        dbg = (m) => winston.debug("GlobalClient.set_quotas: #{m}")
        dbg()
        errors = {}
        quotas = {}
        async.series([
            (cb) =>
                fs.readFile "use-bups", (err, data) =>
                    if err
                        cb(err)
                    else
                        for x in data.toString().split('\n')
                            v = x.split('\t')
                            if v.length >= 2
                                a = v[0]
                                a.slice(0, a.length-2)
                                usage = parseInt(a)
                                project_id = v[1].trim()
                                quotas[project_id] = Math.min(20000, Math.max(3*Math.round(usage), 5000))
                        cb()
            (cb) =>
                if opts.dryrun
                    cb(); return
                i = 0
                f = (project_id, cb) =>
                    i += 1
                    dbg("setting quota for project #{project_id} -- #{i}/#{misc.len(quotas)}")
                    @get_project(project_id).set_settings
                        disk : quotas[project_id]
                        cb   : (err) =>
                            if err
                                opts.errors[project_id] = err
                            cb(err)
                async.mapLimit(misc.keys(quotas).slice(0,opts.stop), opts.limit, f, (err) => cb())
        ], (err) =>
            opts.cb?(err, quotas)
        )


###########################
## Client -- code below mainly sets up a connection to a given storage server
###########################


class Client
    constructor: (opts) ->
        opts = defaults opts,
            host      : required
            port      : required
            secret    : required
            server_id : required
            verbose   : required
        @host      = opts.host
        @port      = opts.port
        @secret    = opts.secret
        @verbose   = opts.verbose
        @server_id = opts.server_id

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    connect: (cb) =>
        dbg = (m) => winston.debug("Storage client (#{@host}:#{@port}): #{m}")
        dbg()
        async.series([
            (cb) =>
                dbg("connect to locked socket")
                misc_node.connect_to_locked_socket
                    host    : @host
                    port    : @port
                    token   : @secret
                    timeout : 25
                    cb      : (err, socket) =>
                        if err
                            dbg("failed to connect: #{err}")
                            @socket = undefined
                            cb(err)
                        else
                            dbg("successfully connected")
                            @socket = socket
                            misc_node.enable_mesg(@socket)
                            cb()
        ], cb)


    mesg: (project_id, action, param) =>
        mesg = message.storage
            id         : uuid.v4()
            project_id : project_id
            action     : action
            param      : param
        return mesg

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 60
            cb      : undefined
        async.series([
            (cb) =>
                if not @socket?
                    @connect (err) =>
                        if err
                            opts.cb?(err)
                            cb(err)
                        else
                            cb()
                else
                    cb()
            (cb) =>
                @_call(opts)
                cb()
        ])

    _call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 300
            cb      : undefined
        @dbg("call", opts, "start call")
        @socket.write_mesg 'json', opts.mesg, (err) =>
            @dbg("call", opts, "got response from socket write mesg: #{err}")
            if err
                if not @socket?   # extra messages but socket already gone -- already being handled below
                    return
                if err == "socket not writable"
                    @socket = undefined
                    @dbg("call",opts,"socket closed: reconnect and try again...")
                    @connect (err) =>
                        if err
                            opts.cb?(err)
                        else
                            @call
                                mesg    : opts.mesg
                                timeout : opts.timeout
                                cb      : opts.cb
                else
                    opts.cb?(err)
            else
                @dbg("call",opts,"waiting to receive response")
                @socket.recv_mesg
                    type    : 'json'
                    id      : opts.mesg.id
                    timeout : opts.timeout
                    cb      : (mesg) =>
                        @dbg("call",opts,"got response -- #{misc.to_json(mesg)}")
                        mesg.project_id = opts.mesg.project_id
                        if mesg.event == 'error'
                            opts.cb?(mesg.error)
                        else
                            delete mesg.id
                            opts.cb?(undefined, mesg)

    action: (opts) =>
        opts = defaults opts,
            action     : required
            param      : undefined
            project_id : undefined   # a single project id
            project_ids: undefined   # or a list of project ids -- in which case, do the actions in parallel with limit at once
            timeout    : TIMEOUT     # different defaults depending on the action
            limit      : 3
            cb         : undefined

        errors = {}
        f = (project_id, cb) =>
            @call
                mesg    : @mesg(project_id, opts.action, opts.param)
                timeout : opts.timeout
                cb      : (err, result) =>
                    if err
                        errors[project_id] = err
                    cb(undefined, result)

        if opts.project_id?
            f(opts.project_id, (ignore, result) => opts.cb?(errors[opts.project_id], result))

        if opts.project_ids?
            async.mapLimit opts.project_ids, opts.limit, f, (ignore, results) =>
                if misc.len(errors) == 0
                    errors = undefined
                opts.cb?(errors, results)

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        client_project
            client     : @
            project_id : opts.project_id
            cb         : opts.cb

client_cache = {}

storage_server_client = (opts) ->
    opts = defaults opts,
        host      : required
        port      : required
        secret    : required
        server_id : required
        verbose   : true
    dbg = (m) -> winston.debug("storage_server_client(#{opts.host}:#{opts.port}): #{m}")
    dbg()
    key = opts.host + opts.port + opts.secret
    C = client_cache[key]
    if not C?
        C = client_cache[key] = new Client(host:opts.host, port:opts.port, secret: opts.secret, verbose:opts.verbose, server_id:opts.server_id)
    return C

# A client on a *particular* server
class ClientProject
    constructor: (@client, @project_id) ->
        @dbg("constructor",[],"")

    dbg: (f, args, m) =>
        winston.debug("storage ClientProject(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    action: (opts) =>
        opts = defaults opts,
            action     : required
            param      : undefined
            timeout    : TIMEOUT
            cb         : undefined
        opts.project_id = @project_id
        @client.action(opts)

    start: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'start'
        @action(opts)

    # state is one of the following: stopped, starting, running, restarting, stopping, saving, error
    get_state: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required  # cb(err, state)
        opts.action = 'get_state'
        cb = opts.cb
        opts.cb = (err, resp) =>
            cb(err, resp?.result)
        @action(opts)

    # extensive information about the project, e.g., port it is listening on, quota information, etc.
    status: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required
        opts.action = 'status'
        cb = opts.cb
        opts.cb = (err, resp) =>
            cb(err, resp?.result)
        @action(opts)

    works: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required   # cb(undefined, true if works)    -- never errors, since "not works=error"
        # using status for now -- may want to use something cheaper (?)
        works = false
        async.series([
            (cb) =>
                @status
                    timeout : opts.timeout
                    cb      : (err, status) =>
                        if err or not status?['local_hub.port']?
                            cb()
                        else
                            works = true
                            cb()
            (cb) =>
                if works
                    cb(); return
                @restart(cb : cb)
            (cb) =>
                if works
                    cb(); return
                @status
                    timeout : opts.timeout
                    cb      : (err, status) =>
                        if err or not status?['local_hub.port']?
                            cb()
                        else
                            works = true
                            cb()
        ], (err) =>
            if err or not works
                opts.cb(undefined, false)
            else
                opts.cb(undefined, true)
        )

    stop: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            force      : false
            cb         : undefined
        opts.action = 'stop'
        if opts.force
            opts.param = 'force'
        delete opts.force
        @action(opts)


    restart: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'restart'
        @action(opts)

    save: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            targets    : undefined    # undefined or a list of ip addresses
            cb         : undefined
        opts.action = 'save'
        if opts.targets?
            opts.param = "--targets=#{opts.targets.join(',')}"
        delete opts.targets
        @action(opts)

    init: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'init'
        @action(opts)

    snapshots: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required
        opts.action = 'snapshots'
        cb = opts.cb
        opts.cb = (err, resp) =>
            cb(err, resp?.result)
        @action(opts)

    settings: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            memory     : undefined
            cpu_shares : undefined   # fair is 256, not 1 !!!!
            cores      : undefined
            disk       : undefined
            scratch    : undefined
            inode      : undefined
            mintime    : undefined
            login_shell: undefined
            cb         : undefined

        param = []
        for x in ['memory', 'cpu_shares', 'cores', 'disk', 'scratch', 'inode', 'mintime', 'login_shell']
            if opts[x]?
                param.push("--#{x}")
                param.push(opts[x])
        @action
            timeout : opts.timeout
            action  : 'settings'
            param   : param
            cb      : opts.cb

    sync: (opts) =>
        opts = defaults opts,
            targets     : required   # array of hostnames (not server id's!) to sync to
            timeout     : TIMEOUT
            destructive : false
            snapshots   : true   # whether to sync snapshots -- if false, only syncs live files
            union       : false  # if true, sync's by making the files and bup repo the union of that on all replicas -- this is for *REPAIR*
            cb          : undefined
        if opts.targets.length == 0  # trivial special case
            opts.cb?()
            return
        params = []
        params.push("--targets=#{opts.targets.join(',')}")
        if opts.snapshots
            params.push('--snapshots')
        if opts.destructive
            params.push('--destructive')
        if opts.union
            params.push('--union')
        @action
            action  : 'sync'
            param   : params
            timeout : opts.timeout
            cb      : opts.cb


    mount_remote: (opts) =>
        opts = defaults opts,
            remote_host : required
            project_id  : required
            mount_point : required
            remote_path : required
            timeout     : TIMEOUT
            cb          : undefined
        params = ["--remote_host", opts.remote_host,
                  "--project_id",  opts.project_id,
                  "--mount_point", opts.mount_point,
                  "--remote_path", opts.remote_path]
        @action
            action  : 'mount_remote'
            param   : params
            timeout : opts.timeout
            cb      : opts.cb

    umount_remote: (opts) =>
        opts = defaults opts,
            mount_point : required
            timeout     : TIMEOUT
            cb          : undefined
        @action
            action  : 'umount_remote'
            param   : ["--mount_point", opts.mount_point]
            timeout : opts.timeout
            cb      : opts.cb



client_project_cache = {}

client_project = (opts) ->
    opts = defaults opts,
        client     : required
        project_id : required
        cb         : required
    if not misc.is_valid_uuid_string(opts.project_id)
        opts.cb("invalid project id")
        return
    key = "#{opts.client.host}-#{opts.client.port}-#{opts.project_id}"
    P = client_project_cache[key]
    if not P?
        P = client_project_cache[key] = new ClientProject(opts.client, opts.project_id)
    opts.cb(undefined, P)


###########################
## Command line interface
###########################

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]', 'store pid in this file', String, "#{CONF}/bup_server.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{CONF}/bup_server.log")
    .option('--portfile [string]', 'write port number to this file', String, "#{CONF}/bup_server.port")
    .option('--server_id_file [string]', 'file in which server_id is stored', String, "#{CONF}/bup_server_id")
    .option('--servers_file [string]', 'contains JSON mapping {uuid:hostname,...} for all servers', String, "#{CONF}/bup_servers")
    .option('--secret_file [string]', 'write secret token to this file', String, "#{CONF}/bup_server.secret")

    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')
    .option('--replication [string]', 'replication factor (default: 2)', String, '2')

    .option('--port [integer]', "port to listen on (default: assigned by OS)", String, 0)
    .option('--address [string]', 'address to listen on (default: the tinc network if there, or eth1 if there, or 127.0.0.1)', String, '')

    .parse(process.argv)

program.port = parseInt(program.port)

if not program.address
    program.address = require('os').networkInterfaces().tun0?[0].address
    if not program.address
        program.address = require('os').networkInterfaces().eth1?[0].address  # my laptop vm...
    if not program.address  # useless
        program.address = '127.0.0.1'

#console.log(program.address)

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)

    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error("Uncaught exception: #{err}")
    daemon({max:999999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name.split('.')[0] == 'bup_server'
    main()

