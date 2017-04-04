###
Jupyter Backend
###

require('coffee-cache').setCacheDir("#{process.env.HOME}/.coffee/cache")

{EventEmitter} = require('events')

fs = require('fs')

misc = require('smc-util/misc')
{defaults, required} = misc

misc_node = require('smc-util-node/misc_node')

{blob_store} = require('./jupyter-blobs')

node_cleanup = require('node-cleanup')

exports.jupyter_backend = (syncdb, client) ->
    dbg = client.dbg("jupyter_backend")
    dbg()
    {JupyterActions} = require('smc-webapp/jupyter/project-actions')
    {JupyterStore}   = require('smc-webapp/jupyter/store')
    smc_react        = require('smc-webapp/smc-react')

    project_id = client.client_id()

    # This path is the file we will watch for chnages and save to, which is in the original
    # official ipynb format:
    path = misc.original_path(syncdb._path) + '.ipynb2' # TODO: change to ipynb when done

    redux_name = smc_react.redux_name(project_id, path)
    actions    = new JupyterActions(redux_name, smc_react.redux)
    store      = new JupyterStore(redux_name, smc_react.redux)

    actions._init(project_id, path, syncdb, store, client)

    syncdb.once 'init', (err) ->
        dbg("syncdb init complete -- #{err}")

# for interactive testing
class Client
    dbg: (f) ->
        return (m) -> console.log("Client.#{f}: ", m)

exports.kernel = (opts) ->
    opts = defaults opts,
        name    : required   # name of the kernel as a string
        client  : undefined
        verbose : true
    if not opts.client?
        opts.client = new Client()
    return new Kernel(opts.name, if opts.verbose then opts.client?.dbg)

###
Jupyter Kernel interface.

The kernel does *NOT* start up until either spawn is explicitly called, or
code execution is explicitly requested.  This makes it possible to
call process_output without spawning an actual kernel.
###
_jupyter_kernels = {}

node_cleanup =>
    for id, kernel of _jupyter_kernels
        kernel.close()

class Kernel extends EventEmitter
    constructor : (@name, @_dbg) ->
        @_set_state('off')
        @_identity = misc.uuid()
        _jupyter_kernels[@_identity] = @
        dbg = @dbg('constructor')
        dbg()
        process.on('exit',=>console.log("exiting"))

    _set_state: (state) =>
        # state = 'off' --> 'spawning' --> 'starting' --> 'running' --> 'closed'
        @_state = state
        @emit('state', @_state)

    spawn: (cb) =>
        dbg = @dbg('spawn')
        if @_state == 'closed'
            cb?('closed')
            return
        if @_state in ['running', 'starting']
            cb?()
            return
        if @_state == 'spawning'
            @_spawn_cbs.push(cb)
            return
        @_spawn_cbs = [cb]
        @_set_state('spawning')
        dbg('spawning kernel...')
        require('spawnteract').launch(@name, {detached: true}).then (kernel) =>
            dbg("spawned kernel; now creating comm channels...")
            @_kernel = kernel
            @_channels = require('enchannel-zmq-backend').createChannels(@_identity, @_kernel.config)
            @_channels.shell.subscribe((mesg) => @emit('shell', mesg))

            @_channels.iopub.subscribe (mesg) =>
                if mesg.content?.execution_state?
                    @emit('execution_state', mesg.content?.execution_state)
                @emit('iopub', mesg)

            @once 'iopub', =>
                # first iopub message from the kernel means it has start running
                @_set_state('running')

            kernel.spawn.on('close', @close)

            @_set_state('starting') # so we can send code execution to the kernel, etc.

            for cb in @_spawn_cbs
                cb?()
        return

    signal: (signal) =>
        dbg = @dbg("signal")
        pid = @_kernel?.spawn?.pid
        dbg("pid=#{pid}, signal=#{signal}")
        if pid
            try
                @_clear_execute_code_queue()
                process.kill(-pid, signal)   # negative to kill the process group
            catch err
                dbg("error: #{err}")

    close: =>
        @dbg("close")()
        if @_state == 'closed'
            return
        @_set_state('closed')
        delete _jupyter_kernels[@_identity]
        @removeAllListeners()
        process.removeListener('exit', @close)
        if @_kernel?
            @_kernel.spawn?.removeAllListeners()
            @signal('SIGKILL')  # kill the process group
            fs.unlink(@_kernel.connectionFile)
            delete @_kernel
            delete @_channels
        if @_execute_code_queue?
            for opts in @_execute_code_queue
                opts.cb('closed')
            delete @_execute_code_queue

    dbg: (f) =>
        if not @_dbg?
            return ->
        else
            return @_dbg("jupyter.Kernel('#{@name}',identity='#{@_identity}').#{f}")

    _ensure_running: (cb) =>
        if @_state == 'closed'
            cb("closed")
            return
        if @_state != 'running'
            @spawn(cb)
        else
            cb()
        return

    execute_code: (opts) =>
        opts = defaults opts,
            code : required
            id   : undefined   # optional tag to be used by cancel_execute
            all  : false       # if all=true, cb(undefined, [all output messages]); used for testing mainly.
            cb   : required    # if all=false, this happens **repeatedly**:  cb(undefined, output message)

        @_execute_code_queue ?= []
        @_execute_code_queue.push(opts)
        if @_execute_code_queue.length == 1
            @_process_execute_code_queue()

    cancel_execute: (opts) =>
        opts = defaults opts,
            id : required
        dbg = @dbg("cancel_execute(id='#{opts.id}')")
        if not @_execute_code_queue? or @_execute_code_queue.length == 0
            dbg("nothing to do")
            return
        if @_execute_code_queue.length > 1
            dbg("mutate @_execute_code_queue removing everything with the given id")
            for i in [@_execute_code_queue.length - 1 .. 1]
                o = @_execute_code_queue[i]
                if o.id == opts.id
                    dbg("removing entry #{i} from queue")
                    @_execute_code_queue.splice(i, 1)
                    o.cb("cancelled")
        # if the currently running computation involves this id, send an
        # interrupt signal (that's the best we can do)
        if @_execute_code_queue[0].id == opts.id
            dbg("interrupting running computation")
            @signal("SIGINT")

    _process_execute_code_queue: =>
        dbg = @dbg("_process_execute_code_queue")
        if not @_execute_code_queue?
            dbg("no queue")
            return
        n = @_execute_code_queue.length
        if n == 0
            dbg("queue is empty")
            return
        dbg("queue has #{n} items; ensure kernel running")
        @_ensure_running (err) =>
            if err
                dbg("error running kernel -- #{err}")
                opts.cb(err)
            else
                dbg("now executing oldest item in queue")
                @_execute_code(@_execute_code_queue[0])
        return

    _clear_execute_code_queue: =>
        # ensure no future queued up evaluation occurs (currently running
        # one will complete and new executions could happen)
        if not @_execute_code_queue?
            return
        for opts in @_execute_code_queue.slice(1)
            opts.cb('interrupt')
        @_execute_code_queue = []

    _execute_code: (opts) =>
        opts = defaults opts,
            code : required
            id   : undefined   # optional tag that can be used as input to cancel_execute.
            all  : false       # if all=true, cb(undefined, [all output messages]); used for testing mainly.
            cb   : required    # if all=false, this happens **repeatedly**:  cb(undefined, output message)
        dbg = @dbg("_execute_code('#{misc.trunc(opts.code, 15)}')")
        dbg("code='#{opts.code}', all=#{opts.all}")

        message =
            header:
                msg_id   : "execute_#{misc.uuid()}"
                username : ''
                session  : ''
                msg_type : 'execute_request'
                version  : '5.0'
            content:
                code             : opts.code
                silent           : false
                store_history    : true   # so execution_count is updated.
                user_expressions : {}
                allow_stdin      : false

        # setup handling of the results
        if opts.all
            all_mesgs = []

        f = (mesg) =>
            if mesg.parent_header.msg_id == message.header.msg_id
                dbg("got message -- #{JSON.stringify(mesg)}")
                done = mesg.content?.execution_state == 'idle'  # check this before giving opts.cb the chance to mutate.

                # TODO: mesg isn't a normal javascript object; it's **silently** immutable, which
                # is pretty annoying for our use. For now, we just copy it, which is a waste.
                mesg = misc.copy_with(mesg,['metadata', 'content', 'buffers'])
                mesg = misc.deep_copy(mesg)
                if opts.all
                    all_mesgs.push(mesg)
                else
                    opts.cb(undefined, mesg)
                if done
                    @removeListener('iopub', f)
                    @_execute_code_queue.shift()   # finished
                    @_process_execute_code_queue()
                    if opts.all
                        opts.cb(undefined, all_mesgs)
            else
                dbg("IGNORE message -- #{JSON.stringify(mesg)}")

        @on('iopub', f)

        dbg("send the message")
        @_channels.shell.next(message)

    process_output: (content) ->
        if @_state == 'closed'
            return
        dbg = @dbg("process_output")
        dbg(JSON.stringify(content))
        if not content.data?
            # todo: FOR now -- later may remove large stdout, stderr, etc...
            dbg("no data, so nothing to do")
            return

        # We only keep the *left-most* representation, since it provides the richest
        # representation in the client; there is no need for the others.
        # 1. We could make this rendering preferences table configurable.
        # 2. TODO: we will still have to store all of these somewhere (in the backend only) for the .ipynb export!
        # NOTES:
        #   - html produced by kernels tends to be of much better quality than markdown.
        #     E.g., the R markdown output is crap but the HTML is great.
        types = ['image/svg+xml', 'image/png', 'image/jpeg', 'text/html', 'text/markdown', 'text/plain', 'text/latex']
        blob = false
        keep = undefined
        for type in types
            if content.data[type]?
                if type.split('/')[0] == 'image'
                    blob = true
                keep = type
                break
        if keep?
            for type,_ of content.data
                if type != keep
                    delete content.data[type]
        if blob
            content.data[keep] = blob_store.save(content.data[keep], keep)
        dbg("keep='#{keep}'; blob='#{blob}'")

    get_identity: =>
        return @_identity

    # Returns a reference to the blob store.
    get_blob_store: =>
        return blob_store

    # Returns information about all available kernels
    get_kernel_data: (cb) =>   # cb(err, kernel_data)  # see below.
        get_kernel_data(cb)

    complete: (opts) =>
        opts = defaults opts,
            code       : required
            cursor_pos : required
            cb         : required
        dbg = @dbg("complete")
        dbg("code='#{opts.code}', cursor_pos='#{opts.cursor_pos}'")
        @_ensure_running (err) =>
            if err
                opts.cb(err)
            else
                @_complete(opts)

    _complete: (opts) =>
        dbg = @dbg("_complete")
        message =
            header:
                msg_id   : "complete_#{misc.uuid()}"
                username : ''
                session  : ''
                msg_type : 'complete_request'
                version  : '5.0'
            content:
                code       : opts.code
                cursor_pos : opts.cursor_pos

        # setup handling of the results
        if opts.all
            all_mesgs = []

        f = (mesg) =>
            if mesg.parent_header.msg_id == message.header.msg_id
                @removeListener('shell', f)
                mesg = misc.deep_copy(mesg.content)
                if misc.len(mesg.metadata) == 0
                    delete mesg.metadata
                opts.cb(undefined, mesg)
        @on('shell', f)

        dbg("send the message")
        @_channels.shell.next(message)

    introspect: (opts) =>
        opts = defaults opts,
            code         : required
            cursor_pos   : required
            detail_level : required
            cb           : required
        dbg = @dbg("introspect")
        dbg("code='#{opts.code}', cursor_pos='#{opts.cursor_pos}'")
        @_ensure_running (err) =>
            if err
                opts.cb(err)
            else
                @_introspect(opts)

    _introspect: (opts) =>
        dbg = @dbg("_introspect")
        message =
            header:
                msg_id   : "introspect_#{misc.uuid()}"
                username : ''
                session  : ''
                msg_type : 'inspect_request'
                version  : '5.0'
            content:
                code         : opts.code
                cursor_pos   : opts.cursor_pos
                detail_level : opts.detail_level

        # setup handling of the results
        if opts.all
            all_mesgs = []

        f = (mesg) =>
            if mesg.parent_header.msg_id == message.header.msg_id
                @removeListener('shell', f)
                mesg = misc.deep_copy(mesg.content)
                if misc.len(mesg.metadata) == 0
                    delete mesg.metadata
                opts.cb(undefined, mesg)
        @on('shell', f)

        dbg("send the message")
        @_channels.shell.next(message)

    http_server: (opts) =>
        opts = defaults opts,
            segments : required
            query    : required
            cb       : required
        switch opts.segments[0]

            when 'signal'
                @signal(opts.segments[1])
                opts.cb(undefined, {})

            when 'complete'
                code = opts.query.code
                if not code
                    opts.cb('must specify code to complete')
                    return
                if opts.query.cursor_pos?
                    try
                        cursor_pos = parseInt(opts.query.cursor_pos)
                    catch
                        cursor_pos = code.length
                else
                    cursor_pos = code.length
                @complete
                    code       : opts.query.code
                    cursor_pos : cursor_pos
                    cb         : opts.cb

            when 'introspect'
                code = opts.query.code
                if not code?
                    opts.cb('must specify code to introspect')
                    return
                if opts.query.cursor_pos?
                    try
                        cursor_pos = parseInt(opts.query.cursor_pos)
                    catch
                        cursor_pos = code.length
                else
                    cursor_pos = code.length
                if opts.query.level?
                    try
                        level = parseInt(opts.query.level)
                        if level < 0 or level > 1
                            level = 0
                    catch
                        level = 0
                else
                    level = 0
                @introspect
                    code         : opts.query.code
                    cursor_pos   : cursor_pos
                    detail_level : level
                    cb           : opts.cb

            else
                opts.cb("no route '#{opts.segments.join('/')}'")


_kernel_data =
    kernelspecs          : undefined
    jupyter_kernels      : undefined
    jupyter_kernels_json : undefined

get_kernel_data = (cb) -> # TODO: move out and unit test...
    if _kernel_data.jupyter_kernels_json?
        cb(undefined, _kernel_data)
        return

    misc_node.execute_code
        command : 'jupyter'
        args    : ['kernelspec', 'list', '--json']
        cb      : (err, output) =>
            if err
                cb(err)
                return
            try
                _kernel_data.kernelspecs = JSON.parse(output.stdout).kernelspecs
                v = []
                for kernel, value of _kernel_data.kernelspecs
                    v.push
                        name         : kernel
                        display_name : value.spec.display_name
                        language     : value.spec.language
                v.sort (a,b) -> misc.cmp(a.name, b.name)
                _kernel_data.jupyter_kernels = v
                _kernel_data.jupyter_kernels_json = JSON.stringify(_kernel_data.jupyter_kernels)
                cb(undefined, _kernel_data)
            catch err
                cb(err)


jupyter_kernel_info_handler = (base, router) ->

    router.get base + 'kernels.json', (req, res) ->
        get_kernel_data (err, kernel_data) ->
            if err
                res.send(err)  # TODO: set some code
            else
                res.send(kernel_data.jupyter_kernels_json)

    router.get base + 'kernelspecs/*', (req, res) ->
        get_kernel_data (err, kernel_data) ->
            if err
                res.send(err)   # TODO: set some code
            else
                path = req.path.slice((base + 'kernelspecs/').length).trim()
                if path.length == 0
                    res.send(kernel_data.jupyter_kernels_json)
                    return
                segments = path.split('/')
                name = segments[0]
                kernel = kernel_data.kernelspecs[name]
                if not kernel?
                    res.send("no such kernel '#{name}'")  # todo: error?
                    return
                path = require('path').join(kernel.resource_dir, segments.slice(1).join('/'))
                path = require('path').resolve(path)
                if not misc.startswith(path, kernel.resource_dir)
                    # don't let user use .. or something to get any file on the server...!
                    # (this really can't happen due to url rules already; just being super paranoid.)
                    res.send("suspicious path '#{path}'")
                else
                    res.sendFile(path)

    return router


jupyter_kernel_http_server = (base, router) ->

    router.get base + 'kernels/*', (req, res) ->
        path = req.path.slice((base + 'kernels/').length).trim()
        if path.length == 0
            res.send(kernel_data.jupyter_kernels_json)
            return
        segments = path.split('/')
        identity = segments[0]
        kernel = _jupyter_kernels[identity]
        if not kernel?
            res.send(JSON.stringify({error:"no kernel with identity '#{identity}'"}))
            return
        kernel.http_server
            segments : segments.slice(1)
            query    : req.query
            cb       : (err, resp) ->
                if err
                    res.send(JSON.stringify({error:err}))
                else
                    res.send(JSON.stringify(resp))

    return router


exports.jupyter_router = (express) ->
    base = '/.smc/jupyter/'

    # Install handling for the blob store
    router = blob_store.express_router(base, express)

    # Handler for Jupyter kernel info
    router = jupyter_kernel_info_handler(base, router)

    # Handler for http messages for **specific kernels**
    router = jupyter_kernel_http_server(base, router)

    return router




