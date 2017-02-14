###
Projects
###

winston = require('winston')

postgres = require('./postgres')
local_hub_connection = require('./local_hub_connection')
message = require('smc-util/message')

misc    = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')
{defaults, required} = misc

# Create a project object that is connected to a local hub (using
# appropriate port and secret token), login, and enhance socket
# with our message protocol.

_project_cache = {}
exports.new_project = (project_id, database, compute_server) ->
    P = _project_cache[project_id]
    if not P?
        P = new Project(project_id, database, compute_server)
        _project_cache[project_id] = P
    return P

class Project
    constructor: (@project_id, @database, @compute_server) ->
        @dbg("instantiating Project class")
        @local_hub = local_hub_connection.new_local_hub(@project_id, @database, @compute_server)
        # we always look this up and cache it
        @get_info()

    dbg: (m) =>
        winston.debug("project(#{@project_id}): #{m}")

    _fixpath: (obj) =>
        if obj? and @local_hub?
            if obj.path?
                if obj.path[0] != '/'
                    obj.path = @local_hub.path+ '/' + obj.path
            else
                obj.path = @local_hub.path

    owner: (cb) =>
        if not @database?
            cb('need database in order to determine owner')
            return
        @database.get_project
            project_id : @project_id
            columns : ['account_id']
            cb      : (err, result) =>
                if err
                    cb(err)
                else
                    cb(err, result[0])

    # get latest info about project from database
    get_info: (cb) =>
        if not @database?
            cb('need database in order to determine owner')
            return
        @database.get_project
            project_id : @project_id
            columns    : postgres.PROJECT_COLUMNS
            cb         : (err, result) =>
                if err
                    cb?(err)
                else
                    @cached_info = result
                    cb?(undefined, result)

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            multi_response : false
            timeout : 15
            cb      : undefined
        #@dbg("call")
        @_fixpath(opts.mesg)
        opts.mesg.project_id = @project_id
        @local_hub.call(opts)

    jupyter_port: (opts) =>
        opts = defaults opts,
            cb : required
        @dbg("jupyter_port")
        @call
            mesg    : message.jupyter_port(mathjax_url : misc_node.MATHJAX_URL)
            timeout : 30
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    @dbg("jupyter_port -- #{resp.port}")
                    opts.cb(undefined, resp.port)

    move_project: (opts) =>
        opts = defaults opts,
            target : undefined   # optional prefered target
            cb : undefined
        @dbg("move_project")
        @local_hub.move(opts)

    read_file: (opts) =>
        @dbg("read_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.read_file(opts)

    write_file: (opts) =>
        @dbg("write_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.write_file(opts)

    console_session: (opts) =>
        @dbg("console_session")
        @_fixpath(opts.params)
        opts.project_id = @project_id
        @local_hub.console_session(opts)

    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            cb           : undefined
        @dbg("terminate_session")
        opts.project_id = @project_id
        @local_hub.terminate_session(opts)
