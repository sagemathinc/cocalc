######################################################################
#
# project_server
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('project_server').start_server()" | coffee
#
#######################################################################

child_process  = require 'child_process'
winston        = require 'winston'
program        = require 'commander'
daemon         = require 'start-stop-daemon'
net            = require 'net'

async          = require 'async'

message        = require 'message'
misc_node      = require 'misc_node'
misc           = require 'misc'

######################################################
# Creating and working with project repositories
#    --> See message.coffee for how projects work. <--
######################################################
#

username = (project_uuid) -> project_uuid.replace(/-/g,'')
userpath = (project_uuid) -> "/home/#{username(mesg.project_uuid)}"

create_user = (username, cb) ->
    child_process.exec("useradd -U -m #{username}", ((err, stdout, stderr) -> cb(err)))

delete_user = (username, cb) ->
    async.series([
        (c) ->
            child_process.exec("deluser --remove-all-files #{username}", ((error, stdout, stderr) -> c()))
        (c) ->
            child_process.exec("delgroup #{username}", ((error, stdout, stderr) -> cb(); c()))
    ], cb)

extract_bundles = (bundles, path, cb) ->
    #
    # TODO: worry about file permissions!
    # 
    bundle_path = "#{path}/.git/bundles"

    # Create the bundle path and write the bundle files to disk
    tasks = [
        (c) -> fs.mkdir("#{path}/.git", c),
        (c) -> fs.mkdir("#{path}/.git/bundles", c)
    ]
    n = 0
    for uuid, content of bundles
        tasks.push((c) -> fs.writeFile("#{bundle_path}/#{n}.bundle", content, c))
        n += 1

    async.series(tasks, (err) ->
        if err
            cb(err)
        else
            # Now the bundle files are all in place.  Make the repository.
            if n == 0
                # There were no bundles at all, so we make a new git repo.
                cmd = "cd #{path} && git init && touch .gitignore && git add .gitignore && git commit -a -m 'Initial version.'"
                child_process.exec(cmd, (err, stdout, stderr) -> cb(err))
            else
                # There were bundles -- extract them.
                child_process.exec "diffbundler extract #{bundle_path} #{path}",
                    (err, stdout, stderr) -> cb(err)
    )

# The first step in opening a project is waiting to receive all of
# the bundle blobs.
open_project = (socket, mesg) ->
    n = misc.len(mesg.bundles)
    if n == 0
        open_project2(socket, mesg)
    else
        recv_bundles = (type, m) ->
            if type == 'blob' and mesg.bundles[m.uuid]?
                mesg.bundles[m.uuid] = m.blob
                n -= 1
                if n <= 0
                    socket.removeListener 'mesg', recv_bundles
                    open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Now that we have the bundle blobs, we extract the project.
open_project2 = (socket, mesg) ->
    uname = username(mesg.project_uuid)
    path = userpath(mesg.project_uuid)
    async.series([
        # Create a user with username the project_uuid (with dashes removed)
        (cb) -> create_user(uname, cb)
        # Extract the bundles into the home directory.
        (cb) -> extract_bundles(mesg.bundles, path, cb)
    ], (err, results) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            # Send message back to hub that project is opened and ready to go.
            socket.write_mesg('json', message.project_opened(id:mesg.id))
    )

commit_all = (path, cb) ->
    # TODO: better commit message; maybe always do this in a snapshot branch, etc...?
    child_process.exec("git add && git commit -a -m 'snapshot'", cb)

save_project = (socket, mesg) ->
    path    = userpath(mesg.project_uuid)
    bundles = "#{path}/.git/bundles"
    resp    = message.project_saved(id:mesg.id, files:[], log:[])

    tasks = []
    async.series([
        # Commit all changes
        (cb) -> commit_all(path, cb)

        # If necessary (e.g., there were changes) create an additional
        # bundle containing these changes
        (cb) -> child_process.exec("diffbundler update #{path} #{bundles}", cb)

        # Determine which bundle files to send -- we may send some
        # even if none were created this time.
        (cb) ->
            fs.readdir(bundles, (err, files) ->
                if err
                    cb(err)
                else
                    n = mesg.starting_bundle_number
                    while "#{n}.bundle" in files
                        uuid = misc.uuid()
                        resp.bundle_uuids[n] = uuid
                        tasks.push((c) -> fs.readFile("#{n}.bundle", ((err, data) ->
                            if err
                                c(err)
                            else
                                socket.write_mesg('blob', {uuid:uuid, blob:data})
                                c()
                        )))
                        n += 1
                    cb()
            )

        # Read and send the bundle files
        (cb) -> async.series(tasks, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id), error:err)
    )

close_project = (socket, mesg) ->


server = net.createServer (socket) ->
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        if type == 'json' # other types are handled elsewhere
            switch mesg.event
                when 'open_project'
                    open_project(socket, mesg)
                when 'save_project'
                    save_project(socket, mesg)
                when 'close_project'
                    close_project(socket, mesg)
                else
                    socket.write(message.error("Unknown message event '#{mesg.event}'"))

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 6002)', parseInt, 6002)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/project_server.pid")', String, "data/pids/project_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/project_server.log")', String, "data/logs/project_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent user binding more specific host attack
    .parse(process.argv)

if program._name == 'project_server.js'
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)




