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

    env = {HOME:opts.home, PATH:opts.path, PS1:opts.ps1}
    # env = process.env   # for testing sometimes do this...

    term_opts =
        name : 'xterm'
        rows : opts.rows
        cols : opts.cols
        cwd  : opts.cwd
        env  : env

    if opts.cputime
        # If cputime is not 0, limit it for setrlimit:
        setrlimit 'cpu',    {soft:opts.cputime,  hard:opts.cputime}

    setrlimit 'as',     {soft:opts.vmem*1000000,     hard:opts.vmem*1000000}
    setrlimit 'nofile', {soft:opts.numfiles, hard:opts.numfiles}

    term = pty.fork(opts.command, opts.args, term_opts)

    # See http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
    # CSI Ps ; Ps ; Ps t
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
        s = data.toString('ascii')
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
        term.write data

    term.on 'data', (data) ->
        socket.write data

    socket.on 'end', () ->
        # If the hub connection dies, there is no point in
        # letting this process continue running, since it can't send
        # its output anywhere.  So we terminate.
        process.exit(1)