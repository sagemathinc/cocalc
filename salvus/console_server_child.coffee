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
        home    : process.env.HOME
        path    : '/usr/local/bin:/usr/bin:/bin'
        rows    : 24
        cols    : 80
        command : '/bin/bash'
        args    : []

    term_opts =
        name : 'xterm'
        rows : opts.rows
        cols : opts.cols
        cwd  : opts.cwd
        env  : {HOME:opts.home, PATH:opts.path}

    term = pty.fork(opts.command, opts.args, term_opts)
    
    socket.on 'data', (data) ->
        term.write data

    term.on 'data', (data) ->
        socket.write data

