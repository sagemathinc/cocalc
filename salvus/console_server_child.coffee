pty      = require 'pty.js'
message  = require 'message'
{defaults, required} = require 'misc'

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

    term_opts =
        name : 'xterm'
        rows : opts.rows
        cols : opts.cols
        cwd  : opts.cwd
        env  : {HOME:opts.home, PATH:opts.path, PS1:opts.ps1}

    term = pty.fork(opts.command, opts.args, term_opts)

    socket.on 'data', (data) ->
        term.write data

    term.on 'data', (data) ->
        socket.write data

