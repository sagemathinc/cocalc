#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Execute code in a subprocess, etc.

{getLogger}   = require('./logger')
temp          = require('temp')
async         = require('async')
fs            = require('fs')
child_process = require('child_process')
shell_escape = require('shell-escape')

misc          = require('smc-util/misc')

{walltime, defaults, required} = misc

{aggregate}   = require('smc-util/aggregate')

exports.execute_code = execute_code = aggregate (opts) ->
    opts = defaults opts,
        command    : required
        args       : []
        path       : undefined   # defaults to home directory; where code is executed from
        timeout    : 10          # timeout in *seconds*
        ulimit_timeout : true    # If set, use ulimit to ensure a cpu timeout -- don't use when launching a daemon!
                                 # This has no effect if bash not true.
        err_on_exit: true        # if true, then a nonzero exit code will result in cb(error_message)
        max_output : undefined   # bound on size of stdout and stderr; further output ignored
        bash       : false       # if true, ignore args and evaluate command as a bash command
        home       : undefined
        uid        : undefined
        gid        : undefined
        env        : undefined   # if given, added to exec environment
        aggregate  : undefined   # if given, aggregates multiple calls with same sequence number into one -- see smc-util/aggregate; typically make this a timestamp for compiling code.
        verbose    : true
        cb         : undefined

    winston = getLogger('execute-code')
    start_time = walltime()
    if opts.verbose
        winston.debug("execute_code: \"#{opts.command} #{opts.args.join(' ')}\"")

    s = opts.command.split(/\s+/g) # split on whitespace
    if opts.args.length == 0 and s.length > 1
        opts.bash = true
    else if opts.bash and opts.args.length > 0
        # Selected bash, but still passed in args.
        opts.command = shell_escape([opts.command].concat(opts.args))
        opts.args = []

    if not opts.home?
        opts.home = process.env.HOME

    if not opts.path?
        opts.path = opts.home
    else if opts.path[0] != '/'
        opts.path = opts.home + '/' + opts.path

    stdout = ''
    stderr = ''
    exit_code = undefined

    env = misc.copy(process.env)

    if opts.env?
        for k, v of opts.env
            env[k] = v

    if opts.uid?
        env.HOME = opts.home

    ran_code = false
    info = undefined

    async.series([
        (c) ->
            if not opts.bash
                c()
                return
            if opts.timeout and opts.ulimit_timeout
                # This ensures that everything involved with this
                # command really does die no matter what; it's
                # better than killing from outside, since it gets
                # all subprocesses since they inherit the limits.
                cmd = "ulimit -t #{opts.timeout}\n#{opts.command}"
            else
                cmd = opts.command

            if opts.verbose
                winston.debug("execute_code: writing temporary file that contains bash program.")
            temp.open '', (err, _info) ->
                if err
                    c(err)
                else
                    info = _info
                    opts.command = 'bash'
                    opts.args    = [info.path]
                    fs.writeFile(info.fd, cmd, c)
        (c) ->
            if info?
                fs.close(info.fd, c)
            else
                c()
        (c) ->
            if info?
                fs.chmod(info.path, 0o700, c)
            else
                c()

        (c) ->
            if opts.verbose
                winston.debug("Spawning the command #{opts.command} with given args #{opts.args} and timeout of #{opts.timeout}s...")
            o = {cwd:opts.path}
            if env?
                o.env = env
            if opts.uid
                o.uid = opts.uid
            if opts.gid
                o.gid = opts.gid

            try
                r = child_process.spawn(opts.command, opts.args, o)
                if not r.stdout? or not r.stderr?
                    # The docs/examples at https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
                    # suggest that r.stdout and r.stderr are always defined.  However, this is
                    # definitely NOT the case in edge cases, as we have observed.
                    c("error creating child process -- couldn't spawn child process")
                    return
            catch e
                # Yes, spawn can cause this error if there is no memory, and there's no event! --  Error: spawn ENOMEM
                ran_code = false
                c("error #{misc.to_json(e)}")
                return

            ran_code = true

            if opts.verbose
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

            r.stderr.on 'end', ->
                stderr_is_done = true
                finish()

            r.stdout.on 'end', ->
                stdout_is_done = true
                finish()

            r.on 'exit', (code) ->
                exit_code = code
                finish()

            # This can happen, e.g., "Error: spawn ENOMEM" if there is no memory.  Without this handler,
            # an unhandled exception gets raised, which is nasty.
            # From docs: "Note that the exit-event may or may not fire after an error has occured. "
            r.on 'error', (err) ->
                if not exit_code?
                    exit_code = 1
                stderr += misc.to_json(err)
                # a fundamental issue, we were not running some code
                ran_code = false
                finish()

            callback_done = false
            finish = ->
                if stdout_is_done and stderr_is_done and exit_code?
                    if opts.err_on_exit and exit_code != 0
                        if not callback_done
                            callback_done = true
                            c("command '#{opts.command}' (args=#{opts.args.join(' ')}) exited with nonzero code #{exit_code} -- stderr='#{stderr}'")
                    else if not ran_code # regardless of opts.err_on_exit !
                        if not callback_done
                            callback_done = true
                            c("command '#{opts.command}' (args=#{opts.args.join(' ')}) was not able to run -- stderr='#{stderr}'")
                    else
                        if opts.max_output?
                            if stdout.length >= opts.max_output
                                stdout += " (truncated at #{opts.max_output} characters)"
                            if stderr.length >= opts.max_output
                                stderr += " (truncated at #{opts.max_output} characters)"
                        if not callback_done
                            callback_done = true
                            c()

            if opts.timeout
                f = ->
                    if r.exitCode == null
                        if opts.verbose
                            winston.debug("execute_code: subprocess did not exit after #{opts.timeout} seconds, so killing with SIGKILL")
                        try
                            r.kill("SIGKILL")  # this does not kill the process group :-(
                        catch e
                            # Exceptions can happen, which left uncaught messes up calling code bigtime.
                            if opts.verbose
                                winston.debug("execute_code: r.kill raised an exception.")
                        if not callback_done
                            callback_done = true
                            c("killed command '#{opts.command} #{opts.args.join(' ')}'")
                setTimeout(f, opts.timeout*1000)
        (c) ->
            if info?.path?
                # Do not litter:
                fs.unlink(info.path, c)
            else
                c()
    ], (err) ->
        if not exit_code?
            exit_code = 1  # don't have one due to SIGKILL

        # This log message is very dangerous, e.g., it could print out a secret_token to a log file.
        # So it commented out.  Only include for low level debugging.
        # winston.debug("(time: #{walltime() - start_time}): Done running '#{opts.command} #{opts.args.join(' ')}'; resulted in stdout='#{misc.trunc(stdout,512)}', stderr='#{misc.trunc(stderr,512)}', exit_code=#{exit_code}, err=#{err}")

        if opts.verbose
            winston.debug("finished exec of #{opts.command} (took #{walltime(start_time)}s)")
            winston.debug("stdout='#{misc.trunc(stdout,512)}', stderr='#{misc.trunc(stderr,512)}', exit_code=#{exit_code}")
        if (not opts.err_on_exit) and ran_code
            # as long as we made it to running some code, we consider this a success (that is what err_on_exit means).
            opts.cb?(false, {stdout:stdout, stderr:stderr, exit_code:exit_code})
        else
            opts.cb?(err, {stdout:stdout, stderr:stderr, exit_code:exit_code})
    )


