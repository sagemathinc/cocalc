pty = require 'pty.js'

process.on 'message', (opts, socket) ->
    if opts.gid?
        process.setgid(opts.gid)
    if opts.uid?
        process.setuid(opts.uid)
    if opts.HOME?
        cwd = opts.HOME
    else
        cwd = process.env.HOME
    rows = if opts.rows? then opts.rows else 24
    cols = if opts.cols? then opts.cols else 80

    opts =
        name : 'xterm'
        rows : rows
        cols : cols
        cwd  : cwd
        env  : {HOME:cwd}

    term = pty.fork('bash', [], opts)

    socket.on 'data', (data) ->
        term.write data

    term.on 'data', (data) ->
        socket.write data

