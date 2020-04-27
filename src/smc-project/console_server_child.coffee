

pty      = require('pty.js')
{setrlimit} = require('posix')

message  = require('smc-util/message')
misc = require('smc-util/misc')
{defaults, required} = misc

process.on 'message', (opts, socket) ->
    opts = defaults opts,
        rows     : required
        cols     : required
        command  : required
        args     : required
        path     : undefined
        filename : undefined

    # I noticed that LATELY sometimes we don't see output until hitting input from the client side.
    # Setting the socket to immediately send when written to might help.
    # See https://nodejs.org/api/net.html#net_socket_setnodelay_nodelay
    socket.setNoDelay()

    fn = misc.path_split(opts.filename).tail
    env = misc.merge({SMC_FILENAME: fn}, process.env)

    term_opts =
        name : 'xterm'
        rows : opts.rows
        cols : opts.cols
        env  : env

    if opts.path?
        term_opts.cwd = opts.path
    if opts.home?
        term_opts.home = opts.home

    #console.log("about to pty.fork with: opts.command=#{opts.command}, opts.args=#{misc.to_json(opts.args)}, term_opts=#{misc.to_json(term_opts)}")
    term = pty.fork(opts.command, opts.args, term_opts)

    # See http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
    # CSI  Ps ; Ps ; Ps t
    # CSI[4];[height];[width]t
    CSI = String.fromCharCode(0x9b)
    resize_sequence = undefined

    parse_resize = (data) ->
        i = data.indexOf('t')
        if i == -1
            resize_sequence += data
            return data.length
        else
            # Got complete sequence
            s = (resize_sequence + data.slice(0,i)).slice(3)
            resize_sequence = undefined
            j = s.indexOf(';')
            if j != -1
                rows = parseInt(s.slice(0,j))
                cols = parseInt(s.slice(j+1))
                term.resize(cols, rows)
            return i+1

    CSI_code = (data) ->
        s = data.toString('utf-8')
        if resize_sequence?
            start = 0
            end = parse_resize(s)
        else
            i = s.lastIndexOf(CSI)
            if i != -1
                resize_sequence = ''
                start = i
                end = start + parse_resize(s.slice(i))

        if start?
            # skip data consumed in CSI
            data = data.slice(0,start) + data.slice(end+1)

        return data

    socket.on 'data', (data) ->
        data = CSI_code(data)
        term.write(data)

    term.on 'data', (data) ->
        socket.write(data)

    term.on 'exit', () ->
        socket.end()

    socket.on 'end', () ->
        # If the hub connection dies, there is no point in
        # letting this process continue running, since it can't send
        # its output anywhere.  So we terminate.
        process.exit(1)