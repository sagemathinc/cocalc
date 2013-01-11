######################################################################
#
# project_server
#
# For local debugging, run this way (as root), since it gives better stack traces:
#
#         make_coffee && echo "require('project_server').start_server()" | coffee
#
#######################################################################

# SECURITY NOTE: This server, which runs as root, is probably the most
# susceptible to shell injection attacks of anything in Salvus.  Such
# an attack should not be devestating, because this server only runs
# in an untrusted VM with no state on which users are already allowed
# to run arbitrary code.  The VM is firewalled in that it can't access
# the database.  The only information of value on the VM is:
#
#      (1) The source code of salvus (which is protected by copyright, and
#          I plan to open source it someday).
#      (2) Ephemeral data from other random projects.
#

child_process  = require 'child_process'
winston        = require 'winston'
program        = require 'commander'
daemon         = require 'start-stop-daemon'
net            = require 'net'
fs             = require 'fs'
uuid           = require 'node-uuid'

async          = require 'async'

message        = require 'message'
misc_node      = require 'misc_node'
misc           = require 'misc'

{defaults, required} = misc

######################################################
# Creating and working with project repositories
#    --> See message.coffee for how projects work. <--
######################################################

# The username associated to a given project id is just the
# string of the uuid, but with -'s replaced by _'s so we
# obtain a valid unix account name.
username = (project_id) ->
    if '..' in project_id
        # a sanity check -- this should never ever be allowed to happen, ever.
        throw "invalid project id #{project_id}"
    return project_id.replace(/-/g,'')

# The path to the home directory of the user associated with
# the given project_id.
userpath = (project_id) ->
    return "/home/#{username(project_id)}"

bundlepath = (project_id) ->
    return "#{userpath(project_id)}/.git/salvus/bundles"


# Check for dangerous characters in a string.
BAD_SHELL_INJECTION_CHARS = '<>|,;$&"\''
has_bad_shell_chars = (s) ->
    for x in BAD_SHELL_INJECTION_CHARS
        if x in s
            return true
    return false

# Verify that path really describes something that would be a
# directory under userpath, rather than a shell injection attack
# or a path of another user.
verify_that_path_is_valid = (project_id, path, cb) ->
    if not path?
        cb("path is undefined")
        return

    resolvedPath = undefined

    async.series([
        (c) ->
            fs.realpath path, (err, _resolvedPath) ->
                resolvedPath = _resolvedPath
                if err and err.errno==34  # 34 = no such file Try
                    # again, but with the last segment of the path
                    # deleted; this could be a path to a file or
                    # directory that doesn't exist yet.
                    {head, tail} = misc.path_split(path)
                    verify_that_path_is_valid project_id, head, (err, _resolvedPath) ->
                        if err
                            c(err)
                        else if has_bad_shell_chars(tail)
                            c("filename '#{fname}' is not allowed to contain any of the following characters: '#{BAD_SHELL_INJECTION_CHARS}'")
                        else
                            resolvedPath = "#{_resolvedPath}/#{tail}"
                            c()
                else
                    c(err)
        (c) ->
            p = userpath(project_id)
            if resolvedPath.slice(0,p.length) != p
                c("path (=#{path}) must resolve to a directory or file under #{p}")
            else if has_bad_shell_chars(resolvedPath)
                c("path '#{resolvedPath}' is not allowed to contain any of the following characters: '#{BAD_SHELL_INJECTION_CHARS}'")
            c(false)
    ], (err) -> cb(err, resolvedPath)
    )


# salvus@cassandra01:~$  sudo dumpe2fs -h /dev/mapper/salvus--base-root|grep "Block size:"
# [sudo] password for salvus:
# dumpe2fs 1.42 (29-Nov-2011)
# Block size:               4096
BLOCK_SIZE = 4096   # units = bytes; This is used by the quota command via the conversion below.
megabytes_to_blocks = (mb) -> Math.floor(mb*1000000/BLOCK_SIZE) + 1

# Create new UNIX user with given name and quota, then do cb(err).
#     quota = {disk:{soft:megabytes, hard:megabytes}, inode:{soft:num, hard:num}}
create_user = (project_id, quota, cb) ->
    uname = username(project_id)
    async.series([
        # Create the user
        (cb) ->
            console.log("useradd -U -m #{uname}")
            child_process.exec "useradd -U #{uname}", (err, stdout, stderr) ->
                cb(err)
        # Set the quota, being careful to check for validity of the quota specification.
        (cb) ->
            try
                disk_soft  = parseInt(quota.disk.soft)
                disk_hard  = parseInt(quota.disk.hard)
                inode_soft = parseInt(quota.inode.soft)
                inode_hard = parseInt(quota.inode.hard)
            catch err
                cb("Invalid quota specification: #{quota}")
                return
            # If some input is not valid, parseInt will be NaN,
            # which is not >0, hence will be detected below:
            if not (disk_soft > 0 and disk_hard > 0 and inode_soft > 0 and inode_hard > 0)
                cb("Invalid quota specification: #{quota}")
            else
                # Everything is good, let's do it!
                cmd = "setquota -u #{uname} #{disk_soft} #{disk_hard} #{inode_soft} #{inode_hard} -a && quotaon -a"
                child_process.exec(cmd, cb)
    ], (err) ->
        if err
            # We attempted to make the user, but something went wrong along the way, so we better clean up!
            console.log("Attempting to make user failed -- #{err}")
            delete_user_32(uname)
        cb(err)
    )

# Delete the given UNIX user, corresponding group, and all files they own.
delete_user_32 = (uname, cb) ->
    if uname.length != 32  # a sanity check to avoid accidentally deleting a non-salvus user!
        cb("delete_user -- the uname (='#{uname}') must be exactly 32 characters long")
        return

    async.series([
        # Delete the UNIX user and their files.
        (cb) ->
            child_process.exec("deluser --remove-home #{uname}", cb)
        # Delete the UNIX group (same as the user -- this is Linux).
        (cb) ->
            child_process.exec("delgroup #{uname}", cb)
    ], cb)

# Kill all processes running as a given user.
killall_user = (uname, cb) ->
    cmd = "killall -s 9 -u #{uname}"
    winston.debug(cmd)
    child_process.exec cmd, (err, stdout, stderr) ->
        # We ignore the return error code, since even if there are no
        # processes at all, we get a return code of 1.
        cb()

# Given an object called 'bundles' containing (in order) the possibly
# empty collection of bundles that define a git repo, extract each
# bundle to the repo_path, which must *not* already exist.
#
# NOTE: This object is entirely in memory, which potentially imposes
# memory/size constraints.
extract_bundles = (project_id, bundles, cb) ->
    console.log("extract_bundles -- #{project_id}")
    bundle_path = bundlepath(project_id)
    uname       = username(project_id)
    repo_path   = userpath(project_id)
    console.log("extracting bundles from bundle_path = ", bundle_path)

    # Below we create a sequence of tasks, then do them all at the end
    # with a call to async.series.  We do this, rather than defining
    # the tasks in place, because the number of tasks depends on the
    # number of bundles.

    # Create the bundle path and write the bundle files to disk.
    tasks = [
        (c) -> fs.mkdir("#{repo_path}", 0o700, c),
        (c) -> fs.mkdir("#{repo_path}/.git", 0o700, c),
        (c) -> fs.mkdir("#{repo_path}/.git/salvus", 0o700, c),
    ]

    if misc.len(bundles) > 0
        tasks.push((c) -> fs.mkdir(bundle_path, 0o700, c))

    # Write the bundle files to disk.
    n = 0
    for _, content of bundles
        task = (c) ->
            filename = "#{bundle_path}/#{arguments.callee.n}.bundle"
            console.log("Writing bundle #{filename} out to disk")
            fs.writeFile(filename, arguments.callee.content, c)
        task.n = n
        task.content = content
        n += 1
        tasks.push(task)

    # Now the bundle files are all in place.  Make the repository.
    tasks.push((c) ->
        if n == 0
            # There were no bundles at all, so we make a new empty git repo.
            # TODO: need a salvus .gitignore template, e.g., maybe ignore all dot files in $HOME.
            cmd = "cd #{repo_path} && git init"
            winston.debug(cmd)
            child_process.exec(cmd, c)
        else
            # There were bundles -- extract them.
            cmd = "diffbundler extract #{bundle_path} #{repo_path}"
            winston.debug(cmd)
            child_process.exec(cmd, c)
    )

    # At this point everything is owned by root (the project_server),
    # so we change the repo so all files are owned by the given user,
    # and read/write-able by that user.  For security reasons, we also
    # make them not visible to any other user that happens to have
    # a project running on this particular virtual machine.
    tasks.push((c) ->
        child_process.exec("chown -R #{uname}. #{repo_path} && chmod u+rw,og-rwx -R #{repo_path}", c)
    )

    # Do all of the tasks laid out above.
    async.series(tasks, cb)

########################################################################
# Event Handlers -- these handle various messages as documented
# in the file "message.coffee".  The function foo handles the message
# event foo.
########################################################################

events = {}

# Open the project described by the given mesg, which was sent over
# the socket.
events.open_project = (socket, mesg) ->
    # The first step in opening a project is to wait to receive all of
    # the bundle blobs.  We do the extract step below in _open_project2.

    mesg.bundles = misc.pairs_to_obj( [u, ""] for u in mesg.bundle_uuids )
    console.log(misc.to_json(mesg.bundles))
    n = misc.len(mesg.bundles)
    winston.debug
    if n == 0
        console.log("open_project -- 0 bundles so skipping waiting")
        _open_project2(socket, mesg)
    else
        console.log("open_project -- waiting for #{n} bundles: #{mesg.bundle_uuids}")
        # Create a function that listens on the socket for blobs that
        # are marked with one of the uuid's described in the mesg.
        recv_bundles = (type, m) ->
            if type == 'blob'
                console.log("open_project -- received bundle with uuid #{m.uuid} #{type=='blob'} #{mesg.bundles[m.uuid]} #{mesg.bundles[m.uuid]?}")
            if type == 'blob' and mesg.bundles[m.uuid]?
                console.log("open_project -- recording bundle... of length #{m.blob.length}")
                mesg.bundles[m.uuid] = m.blob
                n -= 1
                console.log("open_project -- waiting for #{n} more bundles")
                if n <= 0
                    # We've received all blobs, so remove the listener.
                    socket.removeListener 'mesg', recv_bundles
                    _open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Part 2 of opening a project: create user, extract bundles, write
# back response message.
_open_project2 = (socket, mesg) ->
    async.series([
        # Create a user with username
        (cb) ->
            create_user(mesg.project_id, mesg.quota, cb)
        # Extract the bundles into the home directory.
        (cb) ->
            extract_bundles(mesg.project_id, mesg.bundles, cb)
    ], (err) ->
        console.log("finished open_project -- #{err}")
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            # Send message back to hub that project is opened and ready to go.
            socket.write_mesg('json', message.project_opened(id:mesg.id))
    )

# Commit all changes to files in the project, plus add all new files
# that are not .gitignore'd to the current branch, whatever it may be.
commit_all = (opts) ->
    opts = defaults opts,
        user        : required
        path        : required
        commit_mesg : required
        gitconfig   : required
        cb          : required
    commit_file = "#{opts.path}/.git/salvus/COMMIT_MESG"
    config_file = "#{opts.path}/.gitconfig"
    async.series([
        (cb) ->
            fs.writeFile(config_file, opts.gitconfig, cb)
        (cb) ->
            fs.writeFile(commit_file, opts.commit_mesg, cb)
        (cb) ->
            cmd = "su - #{opts.user} -c 'cd && git add . && git commit -a -F #{commit_file}'"
            winston.debug(cmd)
            child_process.exec cmd, (err, stdout, stderr) ->
                if stdout.indexOf("nothing to commit") >= 0
                    # not an error
                    cb()
                else
                    cb(err)

    ], opts.cb)


# Obtain all branches in this repo.
get_branches = (path, cb) ->
    child_process.exec "cd #{path} && git branch --no-color", (err, stdout, stderr) ->
        if err
            cb(err)
        else
            branches = []
            current_branch = 'master'   # the default; gets changed below
            for m in stdout.split('\n')
                t = m.split(' ')
                if t.length > 0
                    branch = t[t.length-1]
                    if branch.length > 0
                        branches.push(branch)
                        if t[0] == '*'
                            current_branch = branch
            cb(false, {branches:branches, current_branch:current_branch})

# Obtain the file lists and logs for all the branches in the repo.
get_files_and_logs = (path, cb) ->
    branches = undefined
    current_branch = undefined
    files = {}
    logs  = {}
    async.series([
        # Get the branches and the current branch
        (cb) ->
            get_branches path, (err, r) ->
                if err
                    cb(err)
                else
                    branches       = r.branches
                    current_branch = r.current_branch
                    if not branches? or not current_branch?
                        cb("Error getting branches of git repo.")
                    else
                        cb()
        # Get the list of all files and logs in each branch, as a JSON string
        (cb) ->
            child_process.exec "cd '#{path}' && gitlogs", (err, stdout, stderr) ->
                v = stdout.split('\n')
                files = v[0]
                logs = v[1]
                cb(err)
    ], (err) ->
        if err
            cb(err)
        else
            cb(false, {branches:branches, current_branch:current_branch, files:files, logs:logs})
    )

# Save the project
events.save_project = (socket, mesg) ->
    path     = userpath(mesg.project_id)
    bundles  = bundlepath(mesg.project_id)
    response = message.project_saved
        id             : mesg.id
        files          : {master:{}}
        logs           : {master:{}}
        bundle_uuids   : {}
        current_branch : 'master'

    tasks    = []
    async.series([
        # Commit all changes
        (cb) ->
            winston.debug("save_project -- commit_all")
            commit_all
                user        : username(mesg.project_id)
                path        : path
                commit_mesg : mesg.commit_mesg
                gitconfig   : mesg.gitconfig
                cb          : cb

        # If necessary (e.g., there were changes) create an additional
        # bundle containing these changes
        (cb) ->
            winston.debug("save_project -- bundle changes")
            cmd = "diffbundler update #{path} #{bundles}"
            winston.debug(cmd)
            child_process.exec(cmd, cb)

        # Determine which bundle files to send.  We may send some even
        # if none were created just now, due to the database not being
        # totally up to date, which could happen if some component
        # (hub, database, network, project_server) died at a key
        # moment during a previous save.
        (cb) ->
            winston.debug("save_project -- determine bundles to send")
            fs.readdir bundles, (err, files) ->
                if err
                    cb(err)
                else
                    n = mesg.starting_bundle_number
                    while "#{n}.bundle" in files
                        id = uuid.v4()
                        response.bundle_uuids[id] = n
                        task = (c) ->
                            fs.readFile "#{bundles}/#{arguments.callee.n}.bundle", (err, data) ->
                                if err
                                    c(err)
                                else
                                    socket.write_mesg 'blob', {uuid:id, blob:data}
                                    c()
                        task.n = n
                        tasks.push(task)
                        n += 1
                    cb()

        # Obtain the branches, logs, and file lists for the repo.
        (cb) ->
            winston.debug("save_project -- get branches, logs, and files")
            get_files_and_logs path, (err, result) ->
                if err
                    cb(err)
                else
                    response.files          = result.files
                    response.logs           = result.logs
                    response.current_branch = result.current_branch
                    cb()

        # Read and send the bundle files
        (cb) ->
            winston.debug("save_project -- read and send meta info, then bundle files")
            socket.write_mesg('json', response)
            async.series(tasks, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

cleanup = (uname, cb) ->
    console.log('cleanup')
    async.series([
        (cb) ->
            console.log('cleanup -- killall_user')
            killall_user(uname, cb)
        (cb) ->
            console.log('cleanup -- delete_user_32')
            delete_user_32(uname, cb)
    ], cb)

# Close the given project, which involves killing all processes of
# this user and deleting all of their associated files.
events.close_project = (socket, mesg) ->
    cleanup username(mesg.project_id), (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            socket.write_mesg('json', message.project_closed(id:mesg.id))

# Read a file located in the given project.  This will result in an
# error if the readFile function fails, e.g., if the file doesn't
# exist or the project is not open.  We then send the resulting file
# over the socket as a blob message.
events.read_file_from_project = (socket, mesg) ->
    data = undefined
    async.series([
        # Check that the file is valid (in the user's directory).
        (cb) ->
            verify_that_path_is_valid mesg.project_id, mesg.path, (err, realpath) ->
                if err
                    cb(err)
                else
                    mesg.path = realpath
                    cb()
        # Read the file into memory.
        (cb) ->
            fs.readFile "#{userpath(mesg.project_id)}/#{mesg.path}", (err, _data) ->
                data = _data
                cb(err)
        # Send the file as a blob back to the hub.
        (cb) ->
            id = uuid.v4()
            socket.write_mesg 'json', message.file_read_from_project(id:mesg.id, data_uuid:id)
            socket.write_mesg 'blob', {uuid:id, blob:data}
            cb()
    ], (err) ->
        if err
            socket.write_mesg 'json', message.error(id:mesg.id, error:err)
    )

# Write a file to the project
events.write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid

    # Listen for the blob containg the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener 'mesg', write_file
            path = "#{userpath(mesg.project_id)}/#{mesg.path}"
            user = username(mesg.project_id)
            console.log("mesg --> #{misc.to_json(mesg)}, path=#{path}")
            async.series([
                (c) ->
                    verify_that_path_is_valid mesg.project_id, path, (err, realpath) ->
                        if err
                            c(err)
                        else
                            mesg.path = realpath
                            c()
                (c) ->
                    console.log("writeFile(#{path}, #{value.blob})")
                    fs.writeFile(path, value.blob, c)
                # Set the permissions on the file to the correct user (instead of root)
                (c) ->
                    child_process.exec "chown #{user}. #{path}", c
            ], (err) ->
                if err
                    socket.write_mesg 'json', message.error(id:mesg.id,error:err)
                else
                    socket.write_mesg 'json', message.file_written_to_project(id:mesg.id)
            )
    socket.on 'mesg', write_file

# Make a new directory in the project.
make_directory_in_project = (socket, mesg) ->
    user = username(mesg.project_id)
    async.series([
        (c) ->
            verify_that_path_is_valid mesg.project_id, mesg.path, (err, realpath) ->
                if err
                    c(err)
                else
                    mesg.path = realpath
                    c()
        (c) ->
            fs.mkdir(mesg.path, 0o700, c)
        (c) ->
            # Git does not record the existence of empty directories,
            # so we add an empty .gitignore file to the newly created
            # directory.
            fs.writeFile("#{mesg.path}/.gitignore", "", c)
        (c) ->
            # It would be better if I knew an easy way to figure out the
            # uid and gid of the user, and could use: fs.chown(mesg.path, uid, gid)
            child_process.exec('chown #{user}. #{mesg.path}', c)
        (c) ->
            socket.write_mesg 'json', message.directory_made_in_project(id:mesg.id)
    ], (err) ->
        if err
            socket.write_mesg 'json', message.error(id:mesg.id, error:err)
    )

# Move a file (or directory) from one point to another in the project,
# using the proper git command.
events.move_file_in_project = (socket, mesg) ->
    user = username(mesg.project_id)
    async.series([
        (c) ->
            verify_that_path_is_valid mesg.project_id, mesg.src, (err, realpath) ->
                if err
                    c(err)
                else
                    mesg.src = realpath
                    c()
        (c) ->
            verify_that_path_is_valid mesg.project_id, mesg.dest, (err, realpath) ->
                if err
                    c(err)
                else
                    mesg.dest = realpath
                    c()
        (c) ->
            child_process.exec("su - #{user} -c 'git mv \"#{mesg.src}\" \"#{mesg.dest}\"'", c)
        (c) ->
            socket.write_mesg('json', message.file_moved_in_project(id:mesg.id))
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

# Delete a file from the project, using the proper git command.
events.remove_file_in_project = (socket, mesg) ->
    user = username(mesg.project_id)
    async.series([
        (c) ->
            verify_that_path_is_valid mesg.project_id, mesg.path, (err, realpath) ->
                if err
                    c(err)
                else
                    mesg.path = realpath
                    c()
        (c) ->
            child_process.exec("su - #{user} -c 'git rm -rf \"#{mesg.path}\"'", c)
        (c) ->
            socket.write_mesg('json', message.file_removed_in_project(id:mesg.id))
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

####################################################################
#
# The TCP Socket server, which listens for incoming connections and
# messages and calls the appropriate event handler.
#
# We do not use SSL, because that is handled by our VPN.
#
####################################################################
server = net.createServer (socket) ->
    console.log("new connection!")
    misc_node.enable_mesg(socket)  # enable sending/receiving json, blob, etc. messages over this socket.
    socket.on 'mesg', (type, mesg) ->   # handle json messages
        if type == 'json' # other types are handled elsewhere in event code.
            handler = events[mesg.event]
            if handler?
                winston.debug("Handling message: #{misc.to_json(mesg)}")
                handler(socket, mesg)
            else
                socket.write(message.error("Unknown message event '#{mesg.event}'"))

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 6002)', parseInt, 6002)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/project_server.pid")', String, "data/pids/project_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/project_server.log")', String, "data/logs/project_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent the user-binding-to-a-more-specific-host attack
    .parse(process.argv)

if program._name == 'project_server.js'
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
