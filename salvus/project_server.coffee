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


# Username associated to a given project id:
username = (project_id) -> project_id.replace(/-/g,'_')

# Path to home directory of that user:
userpath = (project_id) -> "/home/#{username(mesg.project_id)}"

# salvus@cassandra01:~$  sudo dumpe2fs -h /dev/mapper/salvus--base-root|grep "Block size:"
# [sudo] password for salvus:
# dumpe2fs 1.42 (29-Nov-2011)
# Block size:               4096
BLOCK_SIZE = 4096   # units = bytes; This is used by the quota command via the conversion below.
megabytes_to_blocks = (mb) -> Math.floor(mb*1000000/BLOCK_SIZE) + 1

# Create new UNIX user with given name and quota, then do cb(err).
create_user = (username, quota, cb) ->  # quota = {disk:{soft:megabytes, hard:megabytes}, inode:{soft:num, hode:num}}
    async.series([
        # Create the user
        (cb) ->
            child_process.exec("useradd -U -m #{username}", cb)
        # Set the quota, being careful to check for validity of the quota specification.
        (cb) ->
            if not quota.disk?
                cb("disk space quota must be specified")
            else if not quota.disk.soft?
                cb("disk space soft quota must be specified")
            else if not quota.disk.hard?
                cb("disk space hard quota must be specified")
            if not quota.inode?
                cb("inode space quota must be specified")
            else if not quota.inode.soft?
                cb("inode space soft quota must be specified")
            else if not quota.inode.hard?
                cb("inode space hard quota must be specified")
            else
                # Everything is specified
                disk_soft  = parseInt(quota.disk.soft)
                disk_hard  = parseInt(quota.disk.hard)
                inode_soft = parseInt(quota.inode.soft)
                inode_hard = parseInt(quota.inode.hard)
                # Ensure it is valid -- parseInt could result in NaN, which is not >0:
                if not disk_soft > 0
                    cb("disk soft quota must be positive")
                    disk_soft = megabytes_to_blocks(disk_soft)
                elif not disk_hard > 0
                    cb("disk hard quota must be positive")
                    disk_hard = megabytes_to_blocks(disk_hard)
                elif not inode_soft > 0
                    cb("inode soft quota must be positive")
                elif not inode_hard > 0
                    cb("inode hard quota must be positive")
                else
                    # Everything is good, let's do it!
                    cmd = "setquota -u #{username} #{disk_soft} #{disk_hard} #{inode_soft} #{inode_hard} -a && quotaon -a"
                    child_process.exec(cmd, cb)
    ], cb)

# Delete the given UNIX user, corresponding group, and all files they own.
delete_user = (username, cb) ->
    if username.length != 36  # a sanity check to avoid accidentally deleting all my files!
        cb(true)
        return

    async.series([
        # Delete the UNIX user and their files.
        (cb) ->
            child_process.exec("deluser --remove-all-files #{username}", cb)
        # Delete the group
        (cb) ->
            child_process.exec("delgroup #{username}", cb)
    ], cb)

# Kill all processes running as a given user.
killall_user = (username, cb) ->
    child_process.exec("killall -s 9 -u #{username}", cb)

# Given an in-memory object "bundles" containing (in order) the
# possibly empty collection of bundles that define a git repo, extract
# it to the repo_path, which must not already exist.
extract_bundles = (username, bundles, repo_path, cb) ->
    bundle_path = "#{repo_path}/.git/bundles"

    # Create the bundle path and write the bundle files to disk
    tasks = [
        (c) -> fs.mkdir("#{repo_path}/.git", c),
        (c) -> fs.mkdir("#{repo_path}/.git/bundles", c)
    ]

    # Write the bundle files to disk.
    n = 0
    for uuid, content of bundles
        tasks.push((c) -> fs.writeFile("#{bundle_path}/#{n}.bundle", content, c))
        n += 1

    # Now the bundle files are all in place.  Make the repository.
    tasks.push((c) ->
        if n == 0
            # There were no bundles at all, so we make a new git repo.
            cmd = "cd #{repo_path} && git init && touch .gitignore && git add .gitignore && git commit -a -m 'Initial version.'"
            child_process.exec(cmd, c)
        else
            # There were bundles -- extract them.
            child_process.exec("diffbundler extract #{bundle_path} #{repo_path}", c)
    )

    # Change the repo so all files are owned by the given user,
    # read/write-able by that user, and not visible to anybody else.
    tasks.push((c) ->
        child_process.exec("chown -R #{username} #{repo_path} && chmod u+rw -R #{repo_path} && chmod og-rwx -R #{repo_path}", c)
    )

    # Actually do all of the tasks laid out above.
    async.series(tasks, cb)


# The first step in opening a project is waiting to receive all of
# the bundle blobs.
open_project = (socket, mesg) ->
    mesg.bundles = misc.pairs_to_obj( (u,null) for u in mesg.bundle_uuids )
    n = misc.len(mesg.bundles)
    if n == 0
        open_project2(socket, mesg)
    else
        # Create a function that listens on the socket for blobs that
        # are marked with one of the uuid's described in the mesg.
        recv_bundles = (type, m) ->
            if type == 'blob' and mesg.bundles[m.uuid]?
                mesg.bundles[m.uuid] = m.blob
                n -= 1
                if n <= 0
                    # We've received all blobs, so remove the listener.
                    socket.removeListener 'mesg', recv_bundles
                    open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Now that we have the bundle blobs, we extract the project.
open_project2 = (socket, mesg) ->
    uname = username(mesg.project_id)
    path  = userpath(mesg.project_id)

    async.series([
        # Create a user with username the project_id (with dashes removed)
        (cb) ->
            create_user(uname, mesg.quota, cb)
        # Extract the bundles into the home directory.
        (cb) ->
            extract_bundles(uname, mesg.bundles, path, cb)
    ], (err, results) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            # Send message back to hub that project is opened and ready to go.
            socket.write_mesg('json', message.project_opened(id:mesg.id))
    )

# Commit all changes to files in the project, plus add all new files
# that are not .gitignore'd to the current branch, whatever it may be.
commit_all = (username, userpath, commit_mesg, cb) ->
    commit_file = "#{userpath}/.git/COMMIT_MESG"
    async.series([
        (cb) ->
            fs.writeFile(commit_file, commit_mesg, cb)
        (cb) ->
            cmd = "su - #{username} -c 'cd && git add && git commit -a -F #{commit_file}'"
            child_process.exec(cmd, cb)
    ], cb)


# Obtain all branches in this repo.
get_branches = (path, cb) ->
    child_process.exec("cd #{path} && git branch --no-color", (err, stdout, stderr) ->
        if err
            cb(err)
        else
            branches = []
            current_branch = 'master'
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
            get_branches(path, (err, r) ->
                if err
                    cb(err)
                else
                    branches       = r.branches
                    current_branch = r.current_branch
                    if not branches? or not current_branch?
                        cb("Error getting branches of git repo.")
                    else
                        cb()

        # Get the list of all files in each branch
        (cb) ->
            child_process.exec("cd #{path} && gitfiles", (err, stdout, stderr) ->
                files = stdout
                cb(err)
            )

        # Get the log for each branch
        (cb) ->
            child_process.exec("cd #{path} && gitlogs", (err, stdout, stderr) ->
                logs = stdout
                cb(err)
            )
    ], (err) ->
        if err
            cb(err)
        else
            cb(false, {branches:branches, current_branch:current_branch, files:files, logs:logs})
    )


# Save the project
save_project = (socket, mesg) ->
    path     = userpath(mesg.project_id)
    bundles  = "#{path}/.git/bundles"
    resp     = message.project_saved(id:mesg.id, files:{}, logs:{}, branches:null, current_branch:null)

    tasks    = []
    async.series([
        # Commit all changes
        (cb) -> commit_all(username(mesg.project_id), path, mesg.commit_mesg, cb)

        # If necessary (e.g., there were changes) create an additional
        # bundle containing these changes
        (cb) -> child_process.exec("diffbundler update #{path} #{bundles}", cb)

        # Determine which bundle files to send.  We may send some even
        # if none were created, due to the hub not being totally up to date.
        (cb) ->
            fs.readdir(bundles, (err, files) ->
                if err
                    cb(err)
                else
                    n = mesg.starting_bundle_number
                    while "#{n}.bundle" in files
                        uuid = misc.uuid()
                        resp.bundle_uuids[uuid] = n
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

        # Obtain the branches, logs, and file lists for the repo.
        (cb) ->
            get_files_and_logs(path, (err, result) ->
                resp.files = result.files
                resp.logs = result.logs
                resp.branches = result.branches
                resp.current_branch = result.current_branch

        # Read and send the bundle files
        (cb) ->
            async.series(tasks, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id), error:err)
        else
            socket.write_mesg('json', resp)
    )

# Close the given project, which involves killing all processes of
# this user and deleting all of their associated files.
close_project = (socket, mesg) ->
    uname = username(mesg.project_id)
    async.series([
        # Kill all processes that the user is running.
        (cb) ->
            killall_user(uname, cb)

        # Delete the user and all associated files.
        (cb) ->
            delete_user(uname, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            socket.write_mesg('json', message.project_closed(id:mesg.id))
    )

# Read a file in the given project.  This will result in an error if
# the readFile function files, e.g., if the file doesn't exist or the
# project isn't even open.  The read file is sent over socket as a blob.
read_file_from_project = (socket, mesg) ->
    data = undefined
    async.series([
        (cb) ->
            fs.readFile("#{userpath(mesg.project_id)}/#{mesg.path}", (err, _data) ->
                data = _data
                cb(err)
            )
        (cb) ->
            uuid = misc.uuid()
            socket.write_mesg('json', message.file_read_from_project(id:mesg.id, data_uuid:uuid))
            socket.write_mesg('blob', {uuid:uuid, blob:data})
            cb()
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

# Write a file to the project
write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid
    if mesg.path.indexOf('..') != -1
        # a sanity check, since we write the file as root first, and something bad could sneak in.
        socket.write_mesg('json', message.error(id:mesg.id, error:'path must not contain ..'))
        return
    # Listen for the blob containg the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener(write_file)
            path = "#{userpath(mesg.project_id)}/#{mesg.path}"
            async.series([
                (cb) ->
                    fs.writeFile(path, value.blob, cb)
                # Finally, set the permissions on the file to the correct user (instead of root)
                (cb) ->
                    child_process.exec("chown #{username(mesg.project_id)}. #{path}", cb)
            ], (err) ->
                if err
                    socket.write_mesg('json', message.error(id:mesg.id, error:err))
                else
                    socket.write_mesg('json', message.file_written_to_project(id:mesg.id))
            )

    socket.on 'mesg', write_file

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
                when 'read_file_from_project'
                    read_file_from_project(socket, mesg)
                when 'write_file_to_project'
                    write_file_to_project(socket, mesg)
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




