######################################################################
#
# project_server
#
# For local debugging, run this way (as root), since it gives better stack traces:
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
    project_id.replace(/-/g,'_')

# The path to the home directory of the user associated with
# the given project_id.
userpath = (project_id) ->
    if '..' in project_id
        # a sanity check -- this should never ever be allowed to happen, ever.
        throw "invalid project id #{project_id}"
    return "/home/#{username(mesg.project_id)}"

# Verify that path really describes something that would be a
# directory under userpath, rather than some evil hack.
verify_that_path_is_valid = (project_id, path, cb) ->
    if not path?
        cb("path is undefined")
        return

    fs.realpath path, (err, resolvedPath) ->
        if err
            cb(err)
        p = userpath(project_id)
        if resolvedPath.slice(0,p.length) != p
            cb("path (=#{path}) must resolve to a directory or file under #{p}")
        # TODO: I do *not* like this one bit.
        else if ';' in resolvedPath
            cb("path contains suspicious character -- semicolon")
        else if '"' in resolvedPath
            cb("path contains suspicious character -- double quote")
        else if "'" in resolvedPath
            cb("path contains suspicious character -- single quote")
        else
            cb(false, resolvedPath)

# salvus@cassandra01:~$  sudo dumpe2fs -h /dev/mapper/salvus--base-root|grep "Block size:"
# [sudo] password for salvus:
# dumpe2fs 1.42 (29-Nov-2011)
# Block size:               4096
BLOCK_SIZE = 4096   # units = bytes; This is used by the quota command via the conversion below.
megabytes_to_blocks = (mb) -> Math.floor(mb*1000000/BLOCK_SIZE) + 1

# Create new UNIX user with given name and quota, then do cb(err).
create_user = (username, quota, cb) ->    # quota = {disk:{soft:megabytes, hard:megabytes}, inode:{soft:num, hard:num}}
    async.series([
        # Create the user
        (cb) ->
            child_process.exec("useradd -U -m #{username}", cb)
        # Set the quota, being careful to check for validity of the quota specification.
        (cb) ->
            if not quota?
                cb("quota must be specified")
            else if not quota.disk?
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
                # If some input is not valid, parseInt will be NaN,
                # which is not >0, hence will be detected below:
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
delete_user_36 = (username, cb) ->
    if username.length != 36  # a sanity check to avoid accidentally deleting all my files!
        cb("delete_user -- the username (='#{username}') must be exactly 36 characters long")
        return

    async.series([
        # Delete the UNIX user and their files.
        (cb) ->
            child_process.exec("deluser --remove-all-files #{username}", cb)
        # Delete the UNIX group (same as the user -- this is Linux).
        (cb) ->
            child_process.exec("delgroup #{username}", cb)
    ], cb)

# Kill all processes running as a given user.
killall_user = (username, cb) ->
    child_process.exec("killall -s 9 -u #{username}", cb)

# Given an in-memory object bundles containing (in order) the possibly
# empty collection of bundles that define a git repo, extract each
# bundle to the repo_path, which must *not* already exist.
extract_bundles = (username, bundles, repo_path, cb) ->
    bundle_path = "#{repo_path}/.git/bundles"

    # Below we create a sequence of tasks, then do them all at the end
    # with a call to async.series.  We do this, rather than defining
    # the tasks in place, because the number of tasks depends on the
    # number of bundles.

    # Create the bundle path and write the bundle files to disk
    tasks = [
        (c) -> fs.mkdir("#{repo_path}/.git", 0o700, c),
        (c) -> fs.mkdir("#{repo_path}/.git/bundles", 0o700, c)
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
            # TODO: need a salvus .gitignore template, e.g., ignore all dot files in $HOME.
            cmd = "cd #{repo_path} && git init && touch .gitignore && git add .gitignore && git commit -a -m 'Initial version.'"
            child_process.exec(cmd, c)
        else
            # There were bundles -- extract them.
            child_process.exec("diffbundler extract #{bundle_path} #{repo_path}", c)
    )

    # At this point everything is owned by root (the project_server),
    # so we change the repo so all files are owned by the given user,
    # and read/write-able by that user.  For security reasons, we also
    # make them not visible to any other user that happens to be have
    # a project running on this particular host virtual machine.
    tasks.push((c) ->
        child_process.exec("chown -R #{username}. #{repo_path} && chmod u+rw -R #{repo_path} && chmod og-rwx -R #{repo_path}", c)
    )

    # Do all of the tasks laid out above.
    async.series(tasks, cb)

# Open the project described by the given mesg, which was sent over
# the socket.
open_project = (socket, mesg) ->
    # The first step in opening a project is to wait to receive all of
    # the bundle blobs.  We do the extract step below in _open_project2.
    mesg.bundles = misc.pairs_to_obj( (u, null) for u in mesg.bundle_uuids )
    n = misc.len(mesg.bundles)
    if n == 0
        _open_project2(socket, mesg)
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
                    _open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Part 2 of opening a project: create user, extract bundles, write
# back response message.
_open_project2 = (socket, mesg) ->
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
commit_all = (opts) ->
    opts = defaults opts,
        user        : required
        path        : required
        commit_mesg : required
        cb          : required
    commit_file = "#{opts.user}/.git/COMMIT_MESG"
    async.series([
        (cb) ->
            fs.writeFile(commit_file, opts.commit_mesg, cb)
        (cb) ->
            cmd = "su - #{opts.user} -c 'cd && git add && git commit -a -F #{commit_file}'"
            child_process.exec(cmd, cb)
    ], opts.cb)


# Obtain all branches in this repo.
get_branches = (path, cb) ->
    child_process.exec("cd #{path} && git branch --no-color", (err, stdout, stderr) ->
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
            child_process.exec("cd '#{path}' && gitfiles", (err, stdout, stderr) ->
                files = stdout
                cb(err)
            )

        # Get the log for each branch
        (cb) ->
            child_process.exec("cd '#{path}' && gitlogs", (err, stdout, stderr) ->
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
    resp     = message.project_saved
        id    : mesg.id
        files : {master:{}}
        logs  : {master:{}}
        current_branch : 'master'

    tasks    = []
    async.series([
        # Commit all changes
        (cb) -> commit_all
            user        : username(mesg.project_id)
            path        : path
            commit_mesg : mesg.commit_mesg
            cb          : cb

        # If necessary (e.g., there were changes) create an additional
        # bundle containing these changes
        (cb) -> child_process.exec("diffbundler update #{path} #{bundles}", cb)

        # Determine which bundle files to send.  We may send some even
        # if none were created, due to the database not being totally
        # up to date.
        (cb) ->
            fs.readdir(bundles, (err, files) ->
                if err
                    cb(err)
                else
                    n = mesg.starting_bundle_number
                    while "#{n}.bundle" in files
                        id = uuid.v4()
                        resp.bundle_uuids[id] = n
                        tasks.push((c) ->
                            fs.readFile("#{n}.bundle", (err, data) ->
                                if err
                                    c(err)
                                else
                                    socket.write_mesg('blob', {uuid:id, blob:data})
                                    c()
                            )
                        )
                        n += 1
                    cb()
            )

        # Obtain the branches, logs, and file lists for the repo.
        (cb) ->
            get_files_and_logs(path, (err, result) ->
                resp.files = result.files
                resp.logs = result.logs
                resp.current_branch = result.current_branch

        # Read and send the bundle files
        (cb) ->
            async.series(tasks, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
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
            delete_user_36(uname, cb)

    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            socket.write_mesg('json', message.project_closed(id:mesg.id))
    )

# Read a file in the given project.  This will result in an error if
# the readFile function fails, e.g., if the file doesn't exist or the
# project is not open.  We send the read file over the socket as a
# blob message.
read_file_from_project = (socket, mesg) ->
    data = undefined
    async.series([
        (cb) ->
            fs.readFile "#{userpath(mesg.project_id)}/#{mesg.path}", (err, _data) ->
                data = _data
                cb(err)
        (cb) ->
            id = uuid.v4()
            socket.write_mesg('json', message.file_read_from_project(id:mesg.id, data_uuid:id))
            socket.write_mesg('blob', {uuid:id, blob:data})
            cb()
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

# Write a file to the project
write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid

    if mesg.path[mesg.path.length-1] == '/'
        errmesg = message.error
            id    : mesg.id
            error : 'path must be a filename, not a directory name (it must not end in "/")'
        socket.write_mesg('json', errmesg)
        return

    # Listen for the blob containg the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener(write_file)
            path = "#{userpath(mesg.project_id)}/#{mesg.path}"
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
                    fs.writeFile(path, value.blob, c)
                # Finally, set the permissions on the file to the correct user (instead of root)
                (c) ->
                    child_process.exec("chown #{user}. #{path}", c)
            ], (err) ->
                if err
                    socket.write_mesg('json', message.error(id:mesg.id, error:err))
                else
                    socket.write_mesg('json', message.file_written_to_project(id:mesg.id))
            )
    socket.on 'mesg', write_file

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
            child_process.exec('chown -R #{user}. #{mesg.path}', c)
        (c) ->
            socket.write_mesg('json', message.directory_made_in_project(id:mesg.id))
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

move_file_in_project = (socket, mesg) ->
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


remove_file_in_project = (socket, mesg) ->
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
                when 'make_directory_in_project'
                    make_directory_in_project(socket, mesg)
                when 'move_file_in_project'
                    move_file_in_project(socket, mesg)
                when 'remove_file_in_project'
                    remove_file_in_project(socket, mesg)
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




