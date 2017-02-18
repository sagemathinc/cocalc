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

require('coffee-cache')

###

compute-server -- runs on the compute nodes; is also imported as a module

###

CONF = '/projects/conf'
SQLITE_FILE = undefined
DEV = false    # if true, in special single-process dev mode, where this code is being run directly by the hub.

START_TIME = new Date().getTime() # milliseconds

# IMPORTANT: see schema.coffee for some important information about the project states.
STATES = require('smc-util/schema').COMPUTE_STATES

net         = require('net')
fs          = require('fs')

async       = require('async')
winston     = require('winston')
program     = require('commander')

uuid        = require('node-uuid')

misc_node   = require('smc-util-node/misc_node')

message     = require('smc-util/message')
misc        = require('smc-util/misc')

sqlite      = require('smc-util-node/sqlite')


# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

{defaults, required} = misc

TIMEOUT = 60*60

if process.env.SMC_STORAGE?
    STORAGE = process.env.SMC_STORAGE
else if misc.startswith(require('os').hostname(), 'compute')   # my official deploy: TODO -- should be moved to conf file.
    STORAGE = 'storage0-us'
else
    STORAGE = ''
    # TEMPORARY:



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
    if DEV
        winston.debug("dev_smc_compute: running #{misc.to_json(opts.args)}")
        path = require('path')
        command = path.join(process.env.SALVUS_ROOT, 'smc_pyutil/smc_pyutil/smc_compute.py')
        PROJECT_PATH = path.join(process.env.SALVUS_ROOT, 'data', 'projects')
        v = ['--dev', "--projects", PROJECT_PATH]
    else
        winston.debug("smc_compute: running #{misc.to_safe_str(opts.args)}")
        command = "sudo"
        v = ["/usr/local/bin/smc-compute"]
    if program.single
        v.push("--single")

    misc_node.execute_code
        command : command
        args    : v.concat(opts.args)
        timeout : opts.timeout
        bash    : false
        path    : process.cwd()
        cb      : (err, output) =>
            #winston.debug(misc.to_safe_str(output))
            winston.debug("smc_compute: finished running #{opts.args.join(' ')} -- #{err}")
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
        dbg("send message to each of the #{misc.len(@_state_listeners)} listeners that the state has been updated = #{misc.to_safe_str(mesg)}")
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
                if opts.action == 'save'
                    # The actual save is done completely from the outside by the storage servers.
                    # However, we update the state change time (e.g., from running --> saving --> running)
                    # so that the kill when idle code can use it!
                    @_state_time = new Date()
                    @_update_state_db()
                    resp = {}
                    cb()
                    return

                if opts.action == 'start'
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
                    if resp.state? and STATES[@_state]?.stable
                        # We just computed the status, which includes the state.  Let's save this,
                        # since it is now our most up to date view of the state.
                        @_state = resp.state
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
        result = undefined
        async.series([
            (cb) =>
                @_command
                    action  : 'state'
                    timeout : 60
                    cb      : (err, r) =>
                        result = r
                        cb(err)
            (cb) =>
                if result?.state == 'broken'
                    dbg("project broken, so try to stop once")
                    @_command
                        action  : 'stop'
                        cb      : cb
                else
                    cb()
            (cb) =>
                if result?.state == 'broken'
                    dbg("project was broken; we stopped, so now trying to get state again")
                    @_command
                        action  : 'state'
                        timeout : 60
                        cb      : (err, r) =>
                            result = r
                            cb(err)
                else
                    cb()
            ], (err) =>
                if err
                    dbg("error getting status -- #{err}")
                else
                    if result.state != before
                        @_state = result.state
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
        )

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
            if DEV
                cb(); return
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
            if DEV
                cb(); return
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
    winston.debug("init_sqlite_db: #{SQLITE_FILE}")
    exists = undefined
    async.series([
        (cb) ->
            fs.exists SQLITE_FILE, (e) ->
                exists = e
                cb()
        (cb) ->
            sqlite.sqlite
                filename : SQLITE_FILE
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
    if program.single
        winston.debug("init_mintime: running in single-machine mode; not initializing idle timeout")
        cb()
        return
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
    if DEV
        return
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
                opts.cb(undefined, ['root','salvus','monitoring','_apt'].concat((x.project_id.replace(/-/g,'') for x in results)))

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
    if program.single
        dbg("running in single machine mode; not creating firewall")
        cb()
        return
    hostname = require("os").hostname()
    if not misc.startswith(hostname, 'compute')
        dbg("not starting firewall since hostname does not start with 'compute'")
        cb()
        return
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
                            incoming_whitelist_hosts = w.replace(/ /g,',')
                            outgoing_whitelist_hosts += ',' + w  # allow users to connect to get blobs when printing sage worksheets
                            cb(err)
                (cb) ->
                    dbg("getting admin whitelist")
                    get_metadata
                        key : "admin-servers"
                        cb  : (err, w) ->
                            admin_whitelist = w.replace(/ /g,',')
                            cb(err)
                (cb) ->
                    dbg("getting storage whitelist")
                    get_metadata
                        key : "storage-servers"
                        cb  : (err, w) ->
                            storage_whitelist = w.replace(/ /g,',')
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
            dbg("not disabling incoming connections -- no need to")
            # CRITICAL: this causes a lot of trouble for no gain at all
            cb()
            return

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
            async.mapLimit(projects, 8, f, cb)
        ], (err) ->
            # slow down during the first 10 minutes after startup
            startup = ((new Date().getTime()) - START_TIME) < 10*60*1000
            delay_s = if startup then 10 else 2
            setTimeout(update_states, delay_s * 60 * 1000)
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
# Devel testing interface (same process as hub)
###########################
start_fake_server = (cb) ->
    winston.debug("start_fake_server")
    # change global CONF path for local dev purposes
    DEV = true
    SQLITE_FILE = require('path').join(process.env.SALVUS_ROOT, 'data', 'compute.sqlite3')
    async.series [init_sqlite_db, init_mintime], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")
        cb?(err)

{EventEmitter} = require('events')

class FakeDevSocketFromCompute extends EventEmitter
    constructor: (@socket_from_hub) ->
        @callbacks = {}

    write_mesg: (type, resp, cb) =>
        f = @callbacks[resp.id]
        if f?
            # response to message
            f(resp)
            delete @callbacks[resp.id]
        else
            # our own initiated message (e.g., for state updates)
            @socket_from_hub.emit('mesg', type, resp)

    recv_mesg: (opts) =>
        opts = defaults opts,
            type    : 'json'
            id      : required
            timeout : undefined
            cb      : required

class FakeDevSocketFromHub extends EventEmitter
    constructor: ->
        @_socket = new FakeDevSocketFromCompute(@)

    write_mesg: (type, mesg, cb) =>
        if type == 'json'
            winston.debug("FakeDevSocket.write_mesg: #{misc.to_json(mesg)}")
        else
            winston.debug("FakeDevSocket.write_mesg: sending message of type #{type}")
        cb?()  # must be before handle_mesg, so client can install recv_mesg handler before we send message!
        handle_mesg(@_socket, mesg)

    recv_mesg: (opts) =>
        opts = defaults opts,
            type    : 'json'
            id      : required
            timeout : undefined
            cb      : required
        winston.debug("FakeDevSocket.recv_mesg: #{opts.id}")
        @_socket.callbacks[opts.id] = opts.cb

fake_server = undefined
exports.fake_dev_socket = (cb) ->
    async.series([
        (cb) ->
            if fake_server?
                cb()
            else
                start_fake_server(cb)
    ], (err) ->
        if err
            cb(err)
        else
            fake_server = true
            cb(undefined, new FakeDevSocketFromHub())
    )




###########################
# Command line interface
###########################

try
    program.usage('[start/stop/restart/status] [options]')
        .option('--pidfile [string]',        'store pid in this file', String, "#{CONF}/compute.pid")
        .option('--logfile [string]',        'write log to this file', String, "#{CONF}/compute.log")
        .option('--port_file [string]',      'write port number to this file', String, "#{CONF}/compute.port")
        .option('--secret_file [string]',    'write secret token to this file', String, "#{CONF}/compute.secret")
        .option('--sqlite_file [string]',    'store sqlite3 database here', String, "#{CONF}/compute.sqlite3")
        .option('--debug [string]',          'logging debug level (default: "" -- no debugging output)', String, 'debug')
        .option('--port [integer]',          'port to listen on (default: assigned by OS)', String, 0)
        .option('--address [string]',        'address to listen on (default: all interfaces)', String, '')
        .option('--single',                  'if given, assume no storage servers and everything is running on one VM')
        .parse(process.argv)
catch e
    # Stupid bug in the command module when loaded as a module.
    program._name = 'xxx'

program.port = parseInt(program.port)

exports.program = program  # so can use the defaults above in other libraries, namely compute-client

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, {level: program.debug, timestamp:true, colorize:true})

    SQLITE_FILE = program.sqlite_file

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

    daemon  = require("start-stop-daemon")  # don't import unless in a script; otherwise breaks in node v6+
    daemon({max:999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null'}, start_server)

if program._name.split('.')[0] == 'compute'
    main()
