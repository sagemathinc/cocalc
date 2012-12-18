pty      = require 'pty.js'
message  = require 'message'
{defaults, required} = require 'misc'
{setrlimit} = require 'posix'

process.on 'message', (opts, socket) ->
    if opts.gid?
        process.setgid(opts.gid)
        delete opts.gid
    if opts.uid?
        process.setuid(opts.uid)
        delete opts.uid

    opts = defaults opts,
        home    : required
        cwd     : required
        path    : required
        rows    : required
        cols    : required
        command : required
        args    : required
        ps1     : required
        cputime : required  # limit on cputime                        POSIX rlimit name: 'cpu'
        vmem    : required  # limit on virtual memory (in megabytes)  POSIX rlimit name: 'as' (address space)
        numfiles: required  # limit on number of file descriptors     POSIX rlimit name: 'nofile'

    term_opts =
        name : 'xterm'
        rows : opts.rows
        cols : opts.cols
        cwd  : opts.cwd
        env  : {HOME:opts.home, PATH:opts.path, PS1:opts.ps1}

    setrlimit 'cpu',    {soft:opts.cputime,  hard:opts.cputime}
    setrlimit 'as',     {soft:opts.vmem*1000000,     hard:opts.vmem*1000000}
    setrlimit 'nofile', {soft:opts.numfiles, hard:opts.numfiles}

    term = pty.fork(opts.command, opts.args, term_opts)

    socket.on 'data', (data) ->
        term.write data

    term.on 'data', (data) ->
        socket.write data

