######################################################################
#
# project_server
#
# For local debugging, run this way (as root), since it gives better stack traces:
#
#         echo "require('project_server').start_server()" | coffee
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
crypto         = require('crypto')


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
    if '..' in project_id or project_id.length != 36
        # a sanity check -- this should never ever be allowed to happen, ever.
        throw "invalid project id #{project_id}"
    # Return a for-sure safe username
    return project_id.slice(0,8).replace(/[^a-z0-9]/g,'')


# The path to the home directory of the user associated with
# the given project_id.
userpath = (project_id) ->
    return "/home/#{username(project_id)}"

bundlepath = (project_id) ->
    return "#{userpath(project_id)}/.git/salvus/bundles"

tmppath = (project_id) ->
    return "#{userpath(project_id)}/.git/salvus/tmp"

git0 = (project_id) ->
    return "/home/#{username(project_id)}/.git/salvus/git0"

# Check for dangerous characters in a string.
BAD_SHELL_INJECTION_CHARS = '<>|,;$&"\''
has_bad_shell_chars = (s) ->
    for x in BAD_SHELL_INJECTION_CHARS
        if x in s
            return true
    return false


# Script for computing git-enhanced ls of a path
gitls   = fs.readFileSync('scripts/git-ls')
diffbundler   = fs.readFileSync('scripts/diffbundler')
git0_script   = fs.readFileSync('scripts/git0')
modtimes_script   = fs.readFileSync('scripts/modtimes')
shell_completions_script   = fs.readFileSync('scripts/shell_completions.py')
bashrc = fs.readFileSync('scripts/bashrc')

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
                c("path (='#{path}') must resolve to a directory or file under #{p}")
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
            winston.debug("useradd -U #{uname}")
            child_process.execFile 'useradd', ['-U', uname], {}, (err) ->
                if err
                    delete_user_8 uname, (err) ->
                        child_process.execFile('useradd', ['-U', uname], {}, cb)
                else
                    cb()

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
                winston.debug("setquota -u #{uname} #{disk_soft} #{disk_hard} #{inode_soft} #{inode_hard} -a && quotaon -a")
                async.series([
                    (c) ->
                        child_process.execFile("setquota", ['-u', uname, disk_soft, disk_hard, inode_soft, inode_hard, '-a'], {}, c)
                    (c) ->
                        child_process.execFile("quotaon", ['-a'], {}, c)
                ], cb)
    ], (err) ->
        if err
            # We attempted to make the user, but something went wrong along the way, so we better clean up!
            winston.debug("** Attempting to make user failed -- #{err}... cleaning up.** ")
            delete_user_8(uname)
        cb(err)
    )

# Delete the given UNIX user, corresponding group, and all files they own.
delete_user_8 = (uname, cb) ->
    if uname.length != 8  # a sanity check to avoid accidentally deleting a non-salvus user!
        cb("delete_user -- the uname (='#{uname}') must be exactly 8 characters long")
        return

    # clear cached uid for this user
    delete getuid.cache[uname]

    async.series([
        # Delete the UNIX user and their files.
        (cb) ->
            child_process.execFile "deluser", ['--remove-home', uname], {}, (err) ->
                if err
                    winston.debug("deluser error: #{err}")
                cb(err)
        # Delete the UNIX group (same as the user -- this is Linux).
        (cb) ->
            child_process.execFile "delgroup", [uname], {}, (err) ->
                if err
                    winston.debug("delgroup error: #{err}")
                cb(err)
    ], cb)

# Kill all processes running as a given user.
killall_user = (uname, cb) ->
    winston.debug("killall -s 9 -u #{uname}")
    child_process.execFile("killall", ['-s', 9, '-u', uname], {}, () ->
        # We ignore the return error code, since even if there are no
        # processes at all, we get a return code of 1.
        cb()
    )

# Given an object called 'bundles' containing (in order) the possibly
# empty collection of bundles that define a git repo, extract each
# bundle to the repo_path, which must *not* already exist.
#
# NOTE: This object is entirely in memory, which potentially imposes
# memory/size constraints.
extract_bundles = (project_id, bundles, cb) ->
    winston.debug("extract_bundles -- #{project_id}")
    bundle_path = bundlepath(project_id)
    uname       = username(project_id)
    repo_path   = userpath(project_id)
    winston.debug("extracting bundles from bundle_path = ", bundle_path)

    # Below we create a sequence of tasks, then do them all at the end
    # with a call to async.series.  We do this, rather than defining
    # the tasks in place, because the number of tasks depends on the
    # number of bundles.

    tasks = [
        # Create the bundle path
        (c) ->
            winston.debug("create the bundle path")
            fs.mkdir("#{repo_path}", 0o700, c)
        (c) ->
            if misc.len(bundles) == 0
                winston.debug("create the initial default gitconfig")
                fs.writeFile("#{repo_path}/.gitconfig", "[user]\n    name = Project #{project_id}\n    email = salvus@salv.us\n", c)  # TODO -- change to project owner
            else
                c()
        (c) ->
            fs.mkdir("#{repo_path}/.git", 0o700, c)
        (c) ->
            fs.mkdir("#{repo_path}/.git/salvus", 0o700, c)
        (c) ->
            fs.mkdir(tmppath(project_id), 0o700, c)
        (c) ->
            winston.debug("Write script to get listing")
            fs.writeFile("#{repo_path}/.git/salvus/git-ls", gitls, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/git-ls", 0o777, c)
        (c) ->
            winston.debug("Write script to get diff bundles")
            fs.writeFile("#{repo_path}/.git/salvus/diffbundler", diffbundler, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/diffbundler", 0o777, c)

        (c) ->
            winston.debug("Write wrapped git command")
            fs.writeFile("#{repo_path}/.git/salvus/git0", git0_script, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/git0", 0o777, c)

        (c) ->
            winston.debug("Writing modtimes command")
            fs.writeFile("#{repo_path}/.git/salvus/modtimes", modtimes_script, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/modtimes", 0o777, c)

        (c) ->
            winston.debug("Write wrapped git command")
            fs.writeFile("#{repo_path}/.git/salvus/shell_completions.py", shell_completions_script, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/shell_completions.py", 0o777, c)

        (c) ->
            winston.debug("Write special bashrc")
            fs.writeFile("#{repo_path}/.git/salvus/bashrc", bashrc, c)
        (c) ->
            fs.chmod("#{repo_path}/.git/salvus/bashrc", 0o777, c)
    ]

    if misc.len(bundles) > 0
        tasks.push((c) -> fs.mkdir(bundle_path, 0o700, c))

    # Write the bundle files to disk.
    n = 0
    for _, content of bundles
        task = (c) ->
            filename = "#{bundle_path}/#{arguments.callee.n}.diffbundle"
            winston.debug("Writing bundle #{filename} out to disk")
            fs.writeFile(filename, arguments.callee.content, c)
        task.n = n
        task.content = content
        n += 1
        tasks.push(task)

    # At this point everything is owned by root (the project_server),
    # so we change the repo so all files are owned by the given user,
    # and read/write-able by that user.  For security reasons, we also
    # make them not visible to any other user that happens to have
    # a project running on this particular virtual machine.
    tasks.push((c) ->
        child_process.execFile("chown", ['-R', uname, repo_path], {}, c)
    )

    tasks.push((c) ->
        child_process.execFile("chmod", ['u+rw,og-rwx', '-R', repo_path], {}, c)
    )

    # Now the bundle files are all in place.  Make the repository.
    tasks.push((c) ->
        if n == 0
            # There were no bundles at all, so we make a new empty git repo and add a file
            async.series([
                (cb) ->
                    exec_as_user
                        project_id : project_id
                        command    : 'git'
                        args       : ['init']
                        cb         : cb
                (cb) ->
                    exec_as_user
                        project_id : project_id
                        command   : 'touch'
                        args       : ['.gitignore']
                        cb         : cb
                (cb) ->
                    exec_as_user
                        project_id : project_id
                        command   : 'git'
                        args       : ['add', '.gitignore']
                        cb         : cb
            ], c)
        else
            # There were bundles -- extract them.
            exec_as_user
                project_id : project_id
                command    : '.git/salvus/diffbundler'
                args       : ['extract', bundle_path, repo_path]
                timeout    : 30
                cb         : c
    )

    tasks.push (c) ->
        winston.debug("**** Restoring modification times ****")
        exec_as_user
            project_id : project_id
            command    : '.git/salvus/modtimes'
            args       : ['--restore']
            timeout    : 15
            cb         : (err) ->
                if err
                    winston.debug(err)
                c() # non-fatal

    # Do all of the tasks laid out above.
    console.log("do #{tasks.length} tasks")
    async.series(tasks, cb)


write_status = (opts) ->
    opts = defaults opts,
        err : required
        id  : required
        socket : required
        out : undefined
    if opts.err
        err = opts.err
        if opts.out?
            err += ' \n' + opts.out.stderr
        opts.socket.write_mesg('json', message.error(id:opts.id, error:err))
    else
        opts.socket.write_mesg('json', message.success(id:opts.id))

getuid = (user, cb) ->
    id = getuid.cache[user]
    if id?
        cb(false, id)
    else
        child_process.execFile "id", ['-u', user], {}, (err, id, stderr) ->
            if err
                cb(err)
            else
                try
                    id = parseInt(id)
                catch e
                    cb("parse error #{id} should be an integer")
                getuid.cache[user] = id
                cb(false, id)
getuid.cache = {}

exec_as_user = (opts) ->
    opts = defaults opts,
        project_id : required
        command    : required
        args       : []
        path       : undefined   # defaults to home directory (base of repo)
        timeout    : 10          # timeout in *seconds*
        err_on_exit: true        # if true, then a nonzero exit code will result in cb(error_message)
        max_output : undefined   # bound on size of stdout and stderr; further output ignored
        bash       : false       # if true, ignore args and evaluate command as a bash command
        cb         : required

    winston.debug(misc.to_json(opts))

    user = username(opts.project_id)
    home = userpath(opts.project_id)

    if opts.bash
        tmpfilename = "/#{home}/.git/salvus/tmp/#{uuid.v4()}"
    else
        s = opts.command.split(/\s+/g) # split on whitespace
        if opts.args.length == 0 and s.length > 1
            # try to work out command from a single command line string
            # TODO -- the following is dumb and doesn't take into account escapes, strings with spaces, etc.
            opts.args = s.slice(1)
            opts.command = s[0]

    if not opts.path?
        opts.path = home
    else if opts.path[0] != '/'
        opts.path = home + '/' + opts.path
    uid  = undefined
    stdout = ''
    stderr = ''
    exit_code = undefined

    env = {HOME:home}

    async.series([
        (c) ->
            if opts.bash
                winston.debug("Write tmpfile that contains bash program.")
                if opts.timeout?
                    # This ensures that everything involved with this
                    # command really does die no matter what; it's
                    # better than killing from outside, since it gets
                    # all subprocesses since they inherit the limits.
                    cmd = "ulimit -t #{opts.timeout}\n#{opts.command}"
                else
                    cmd = opts.command
                fs.writeFile(tmpfilename, cmd, c)
                opts.command = 'bash'
                opts.args = [tmpfilename]
            else
                c()

        # Get the uid of the user; this will err if the project isn't currently
        # hosted on this project server.
        (c) ->
            winston.debug("Get the user id")
            getuid user, (err, id) ->
                if err
                    c(err)
                else
                    uid = id
                    c()
        (c) ->
            winston.debug("Spawn the command #{opts.command} with given args #{opts.args}")
            r = child_process.spawn(opts.command, opts.args,
                   {cwd:opts.path, uid:uid, gid:uid, env:env})

            winston.debug("Listen for stdout, stderr and exit events.")
            stdout = ''
            r.stdout.on 'data', (data) ->
                data = data.toString()
                if opts.max_output?
                    if stdout.length < opts.max_output
                        stdout += data.slice(0,opts.max_output - stdout.length)
                else
                    stdout += data
            r.stderr.on 'data', (data) ->
                data = data.toString()
                if opts.max_output?
                    if stderr.length < opts.max_output
                        stderr += data.slice(0,opts.max_output - stderr.length)
                else
                    stderr += data

            stderr_is_done = stdout_is_done = false

            r.stderr.on 'end', () ->
                stderr_is_done = true
                finish()

            r.stdout.on 'end', () ->
                stdout_is_done = true
                finish()

            r.on 'exit', (code) ->
                exit_code = code
                finish()

            finish = () ->
                if stdout_is_done and stderr_is_done and exit_code?
                    if opts.err_on_exit and exit_code != 0
                        c("command '#{opts.command}' (args=#{misc.to_json(opts.args)}) exited with nonzero code #{exit_code}")
                    else
                        if opts.max_output?
                            if stdout.length >= opts.max_output
                                stdout += " (truncated at #{opts.max_output} characters)"
                            if stderr.length >= opts.max_output
                                stderr += " (truncated at #{opts.max_output} characters)"
                        c()

            if opts.timeout?
                f = () ->
                    winston.debug("in timeout function")
                    if r.exitCode == null
                        winston.debug("process did not exit yet -- kill")
                        r.kill("SIGKILL")  # this does not kill the process group :-(
                        c("killed command '#{opts.command}' (args=#{misc.to_json(opts.args)}) since it exceeded the timeout of #{opts.timeout}")
                setTimeout(f, opts.timeout*1000)
    ], (err) ->
        winston.debug("Result of command: stdout='#{stdout}', stderr='#{stderr}', exit_code=#{exit_code}, err=#{err}; original cmd=#{misc.to_json(opts)}")
        opts.cb(err, {stdout:stdout, stderr:stderr, exit_code:exit_code})
        # Do not litter:
        if opts.bash
            fs.unlink(tmpfilename)
    )

########################################################################
# Event Handlers -- these handle various messages as documented
# in the file "message.coffee".  The function foo handles the message
# event foo.
########################################################################

events = {}

# Open the project described by the given mesg, which was sent over
# the socket.
events.open_project = (socket, mesg)  ->
    # The first step in opening a project is to wait to receive all of
    # the bundle blobs.  We do the extract step below in _open_project2.

    mesg.bundles = misc.pairs_to_obj( [u, ""] for u in mesg.bundle_uuids )
    winston.debug(misc.to_json(mesg.bundles))
    n = misc.len(mesg.bundles)
    if n == 0
        winston.debug("open_project -- 0 bundles so skipping waiting")
        _open_project2(socket, mesg)
    else
        winston.debug("open_project -- waiting for #{n} bundles: #{mesg.bundle_uuids}")
        # Create a function that listens on the socket for blobs that
        # are marked with one of the uuid's described in the mesg.
        recv_bundles = (type, m) ->
            if type == 'blob'
                winston.debug("open_project -- received bundle with uuid #{m.uuid} #{type=='blob'} #{mesg.bundles[m.uuid]} #{mesg.bundles[m.uuid]?}")
            if type == 'blob' and mesg.bundles[m.uuid]?
                winston.debug("open_project -- recording bundle... of length #{m.blob.length}")
                mesg.bundles[m.uuid] = m.blob
                n -= 1
                winston.debug("open_project -- waiting for #{n} more bundles")
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
        winston.debug("finished open_project -- #{err}")
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            # Send message back to hub that project is opened and ready to go.
            socket.write_mesg('json', message.project_opened(id:mesg.id))
    )

# Commit all changes to files in the project, plus (if add_all is
# true) add all new files that are not .gitignore'd to the current
# branch, whatever it may be.
#
commit = (opts) ->
    opts = defaults opts,
        project_id  : required
        author      : required
        commit_mesg : required
        cb          : required
        add_all     : false
    if opts.commit_mesg == ''
        opts.commit_mesg = 'no message'

    nothing_to_do = false
    async.series([
        (cb) ->
            if not opts.add_all
                cb()
            exec_as_user
                project_id : opts.project_id
                command    : git0(opts.project_id)
                args       : ['add', '--all']
                cb         : (err, output) ->
                    if err or output.exit_code
                        cb("#{err} -- #{misc.trunc(misc.to_json(output))}")
                    else
                        cb()
        (cb) ->
            exec_as_user
                project_id : opts.project_id
                command    : git0(opts.project_id)
                args       : ['status']
                cb         : (err, output) ->
                    if err or output.exit_code
                        cb("#{err} -- #{misc.trunc(misc.to_json(output))}")
                    else if output.stdout.indexOf('nothing to commit') != -1
                        # DONE -- nothing further to do
                        nothing_to_do = true
                        cb(true)
                    else
                        # Add and commit as usual.
                        cb()
        (cb) ->
            exec_as_user
                project_id : opts.project_id
                command    : git0(opts.project_id)
                args       : ['commit', '-a', '-m', opts.commit_mesg, "--author", opts.author]
                cb         : (err, output) ->
                    if err or output?.exit_code
                        cb("#{err} -- #{misc.trunc(misc.to_json(output))}")
                    else
                        cb()
    ], (err) =>
        if err and not nothing_to_do
            opts.cb("Error commiting all changed files under control to the repository -- #{err}")
        else
            opts.cb() # good
    )


get_last_bundle_filename = (project_id, cb) ->   # cb(err, name)
    path = bundlepath(project_id)
    exec_as_user  # TODO: do it directly in node instead of shell...
        project_id : project_id
        command    : "ls -1 #{path}|sort -n|tail -1"
        bash       : true
        cb         : (err, output) ->
            if err
                cb(err)
            else
                name = output.stdout.slice(0,output.stdout.length-1)     # get rid of trailing \n
                if name == ""
                    cb(false, undefined)
                else
                    cb(false, path + '/' + name)

# Save the project
events.save_project = (socket, mesg) ->
    path     = userpath(mesg.project_id)
    bundles  = bundlepath(mesg.project_id)
    response = message.project_saved
        id             : mesg.id
        bundle_uuids   : {}

    remade_last_bundle = false
    last_bundle_filename = undefined
    tasks    = []
    async.series([
        (cb) ->
            if mesg.commit_mesg?
                winston.debug("Commit everything first.")
                commit
                    project_id  : mesg.project_id
                    author      : mesg.author
                    commit_mesg : mesg.commit_mesg
                    add_all     : mesg.add_all
                    cb          : cb
            else
                cb()


        (cb) ->
            winston.debug("****   Save modification times.   ****")
            exec_as_user
                project_id : mesg.project_id
                command    : '.git/salvus/modtimes'
                args       : ['--save', '--commit']
                timeout    : 15
                cb         : (err) ->
                    if err
                        winston.debug(err)
                    cb() # non-fatal

        # NOTE: It is important to garbage collect, make bundles,
        # etc., because the user may have typed "git commit"
        # explicitly themselves a few times before save is called.

        # Garbage collect the git repo, since we are about to call
        # diffbundler, and we do not want to store non garbage collected
        # data in the database forever.
        (cb) ->
            exec_as_user
                project_id : mesg.project_id
                command    : "#{git0(mesg.project_id) } gc"   # do not do "--aggressive", because it doesn't scale well, and has little payoff
                cb         : (err, output) ->
                    winston.debug(misc.to_json(output))
                    cb(err)

        # If the last bundle is below a certain size threshhold,
        # delete it, since we'll be recreating it.  First, get name of the file:
        (cb) ->
            winston.debug("save_project -- delete last bundle if it is too small.")
            get_last_bundle_filename mesg.project_id, (err, name) ->
                if err
                    cb(err)
                else
                    last_bundle_filename = name
                    cb()

        (cb) ->
            winston.debug("Actually delete the last file, if necessary")
            if not last_bundle_filename?  # no bundles yet
                winston.debug("No last bundle file.")
                cb()
            else
                # get size
                winston.debug("getting size")
                fs.lstat last_bundle_filename, (err, stats) ->
                    if err
                        winston.debug("error -- #{err}")
                        cb(err)
                    else
                        winston.debug("got: #{err}, #{stats.size}")
                        if stats.size <= mesg.bundle_size_threshold
                            winston.debug("Last bundle is below size threshold, so recreating it.")
                            remade_last_bundle = true
                            fs.unlink(last_bundle_filename, cb)
                        else
                            winston.debug("Leaving it and moving on to the next one.")
                            cb()

        # If necessary (e.g., there were changes) create an additional
        # bundle containing these changes
        (cb) ->
            winston.debug("save_project -- bundle changes -- diffbundler create #{path} #{bundles}")
            exec_as_user
                project_id : mesg.project_id
                command    : '.git/salvus/diffbundler'
                args       : ['create', path, bundles]
                cb         : (err, output) ->
                    winston.debug(misc.to_json(output))
                    cb(err)

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
                    # If we remade the last bundle, then we subtract 1
                    # to ensure that the last bundle is resent (this
                    # is slightly sloppy; in rare cases this could
                    # result in needlessly sending another bundle).
                    if remade_last_bundle
                        n -= 1
                    while "#{n}.diffbundle" in files
                        winston.debug("Sending '#{n}.diffbundle'")
                        id = uuid.v4()
                        response.bundle_uuids[id] = n
                        task = (c) ->
                            fs.readFile "#{bundles}/#{arguments.callee.n}.diffbundle", (err, data) ->
                                if err
                                    c(err)
                                else
                                    socket.write_mesg 'blob', {uuid:id, blob:data}
                                    c()
                        task.n = n
                        tasks.push(task)
                        n += 1
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
    winston.debug('cleanup')
    async.series([
        (cb) ->
            winston.debug('cleanup -- killall_user')
            killall_user(uname, () -> cb())  # ignore failure in subcommand
        (cb) ->
            winston.debug('cleanup -- delete_user_8')
            delete_user_8(uname, () -> cb())  # ignore failure in subcommand
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
    path = userpath(mesg.project_id) + '/' + mesg.path
    winston.debug("** the path = ", path)
    is_directory = undefined
    id = undefined
    async.series([
        (cb) ->
            winston.debug("Check that the path is valid (in the user's directory).")
            verify_that_path_is_valid mesg.project_id, path, (err, realpath) ->
                if err
                    cb(err)
                else
                    path = realpath
                    cb()
        (cb) ->
            winston.debug("Determine whether the path is a directory or file.")
            fs.stat path, (err, stats) ->
                if err
                    cb(err)
                else
                    is_directory = stats.isDirectory()
                    cb()
        (cb) ->
            if is_directory
                winston.debug("It is a directory, so archive it to /tmp/ (but not readable by anybody but root!!), and change path.")
                target = '/tmp/a.tar.bz2'  # TODO
                child_process.execFile 'tar', ['jcvf', target, path], (err, stdout, stderr) ->
                    if err
                        cb(err)
                    else
                        path = target
                        cb()
            else
                cb()


        (cb) ->
            winston.debug("Read the file into memory.")
            fs.readFile path, (err, _data) ->
                data = _data
                cb(err)

        (cb) ->
            winston.debug("Compute hash of file.")
            id = misc_node.uuidsha1(data)
            winston.debug("Hash = #{id}")
            cb()

        # (cb) ->
        #     winston.debug("Send hash of file to hub to see whether or not we really need to send the file itself; it might already be known.")
        #     cb()

        # (cb) ->
        #     winston.debug("Get message back from hub -- do we send file or not?")
        #     cb()


        (cb) ->
            if is_directory
                winston.debug("It was a directory, so remove the temporary archive '#{path}'.")
                fs.unlink(path, cb)
            else
                cb()
        (cb) ->
            winston.debug("Finally, we send the file as a blob back to the hub.")
            socket.write_mesg 'json', message.file_read_from_project(id:mesg.id, data_uuid:id)
            socket.write_mesg 'blob', {uuid:id, blob:data}
            cb()
    ], (err) ->
        if err and err != 'file already known'
            socket.write_mesg 'json', message.error(id:mesg.id, error:err)
    )

# Make sure that that the directory containing the file indicated by the path exists
# and has the right permissions. 
ensure_containing_directory_exists = (project_id, uid, path, cb) ->   # cb(err)
    dir = misc.path_split(path).head

    fs.exists dir, (exists) ->
        if exists
            cb()
        else
            async.series([
                (cb) ->
                    # Some extra paranoia...
                    p = userpath(project_id)
                    if dir.slice(0, p.length) != p
                        cb("Path '#{dir}' must be in home directory '#{p}'")
                    else
                        cb()
                (cb) ->
                    fs.mkdir(dir, 0o700, cb)
                (cb) ->
                    fs.chown(dir, uid, uid, cb)
            ], cb)

# Write a file to the project
events.write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid

    # Listen for the blob containg the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener 'mesg', write_file
            path = "#{userpath(mesg.project_id)}/#{mesg.path}"
            user = username(mesg.project_id)
            winston.debug("mesg --> #{misc.to_json(mesg)}, path=#{path}")
            uid = undefined
            async.series([
                (c) ->
                    verify_that_path_is_valid mesg.project_id, path, (err, realpath) ->
                        if err
                            c(err)
                        else
                            path = realpath
                            c()
                (c) ->
                    getuid user, (err, id) ->
                        if err
                            c(err)
                        else
                            uid = id
                            c()
                (c) ->
                    ensure_containing_directory_exists(mesg.project_id, uid, path, c)
                (c) ->
                    fs.writeFile(path, value.blob, c)
                # Set the permissions on the file to the correct user (instead of root)
                (c) ->
                    fs.chown(path, uid, uid, c)

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
            exec_as_user
                project_id : mesg.project_id
                command    : "mkdir"
                args       : ["-p", mesg.path]
                cb         : c
        (c) ->
            # Git does not record the existence of empty directories,
            # so we add an empty .gitignore file to the newly created
            # directory.
            exec_as_user
                project_id : mesg.project_id
                command    : "touch"
                args       : [mesg.path + '/.gitignore']
                cb         : c

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
            exec_as_user
                project_id : mesg.project_id
                command    : "git"
                args       : ["mv", "-f", mesg.src, mesg.dest]   # -f = force
                cb         : c
        (c) ->
            socket.write_mesg('json', message.file_moved_in_project(id:mesg.id))
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
    )

# Delete a file from the project, using the proper git command.
events.remove_file_from_project = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : "git"
        args       : ["rm", "-rf",  mesg.path]
        cb         : (err, out) -> write_status(err:err, socket:socket, id:mesg.id, out:out)

events.create_project_branch = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : "git"
        args       : ["branch", mesg.branch]
        cb         : (err, out) -> write_status(err:err, socket:socket, id:mesg.id, out:out)

events.checkout_project_branch = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : "git"
        args       : ["checkout", mesg.branch]
        cb         : (err, out) -> write_status(err:err, socket:socket, id:mesg.id, out:out)

events.delete_project_branch = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : "git"
        args       : ["branch", "-D", mesg.branch]
        cb         : (err, out) -> write_status(err:err, socket:socket, id:mesg.id, out:out)

events.merge_project_branch = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : "git"
        args       : ["merge", mesg.branch]
        cb         : (err, out) -> write_status(err:err, socket:socket, id:mesg.id, out:out)

events.project_exec = (socket, mesg) ->
    exec_as_user
        project_id : mesg.project_id
        command    : mesg.command
        args       : mesg.args
        path       : mesg.path
        timeout    : mesg.timeout
        max_output : mesg.max_output
        bash       : mesg.bash
        err_on_exit : false
        cb         : (err, out) ->
            if err
                write_status(err:err, socket:socket, id:mesg.id, out:out)
            else
                winston.debug(misc.to_json(out))
                socket.write_mesg 'json', message.project_exec_output
                    id        : mesg.id
                    stdout    : out.stdout
                    stderr    : out.stderr
                    exit_code : out.exit_code

####################################################################
#
# The TCP Socket server, which listens for incoming connections and
# messages and calls the appropriate event handler.
#
# We do not use SSL, because that is handled by our VPN.
#
####################################################################
server = net.createServer (socket) ->
    winston.debug("new connection!")
    misc_node.enable_mesg(socket)  # enable sending/receiving json, blob, etc. messages over this socket.
    socket.on 'mesg', (type, mesg) ->   # handle json messages
        if type == 'json' # other types are handled elsewhere in event code.
            winston.debug(misc.to_json(mesg))
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
