###
# Client code -- runs in hub
###


compute_server_cache = undefined
exports.compute_server = (project_id) ->
    if not compute_server_cache?
        compute_server_cache = new ComputeServerClient()
    return compute_server_cache

class ComputeServerClient
    constructor: () ->

    add_server: (opts) =>
        defaults opts,
            hostname : required
            cb       : required

    servers: (opts) =>
        defaults opts,
            cb       : required
        # compute server id's and health/load info

    call: (opts) =>
        defaults opts,
            server_id : required
            mesg      : undefined
            cb        : required
        # send message to a server and get back result


client_project_cache = {}
exports.client_project = (project_id) ->
    if not client_project_cache[project_id]?
        client_project_cache[project_id] = new ProjectClient(project_id:project_id)
    return client_project_cache[project_id]

class ProjectClient
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required

    close: (opts) =>
        opts = defaults opts,
            force  : false
            nosave : false
            cb     : required
        # kill everything and remove project from this compute node

    move: (opts) =>
        opts = defaults opts,
            target : required
            cb     : required
        # move project from this compute node to another one

    restart: (opts) =>
        opts = defaults opts,
            cb     : required
        # kill all processes, then start key daemons

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        # kill all processes

    save: (opts) =>
        opts = defaults opts,
            cb     : required
        # create snapshot, save incrementals to cloud storage

    address: (opts) =>
        opts = defaults opts,
            cb     : required
        # project location and listening port

    status: (opts) =>
        opts = defaults opts,
            cb     : required
        # information about project (ports, state, etc.)

    state: (opts) =>
        opts = defaults opts,
            cb     : required
        # the state of the project, which is one of:
        #   closed, opened, running,
        #   opening, starting, restarting, stopping
        #   error


    copy_path: (opts) =>
        opts = defaults opts,
            target_project_id : required
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : false     # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete            : false     # if true, delete files in dest path not in source, **including** newer files
            timeout           : undefined
            bwlimit           : undefined
            cb                : required
        # copy a path using rsync from one project to another

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required
        # read a file or directory from disk

    set_settings: (opts) =>
        # set various quotas
        opts = defaults opts,
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            cb           : required



###
# Server code -- runs on the compute server
###
class ComputeServer
    constructor: () ->
        @projects = {}

    project_command: (opts) =>
        # run a command for a project (error if not allowed now due to state)

    project_state: (opts) =>
        # returns state of a project on this node

