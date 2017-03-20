###
Jupyter Backend
###

{EventEmitter} = require('events')

fs = require('fs')

misc = require('smc-util/misc')
{defaults, required} = misc

exports.jupyter_backend = (syncdb, client) ->
    dbg = client.dbg("jupyter_backend")
    dbg()
    {JupyterActions} = require('smc-webapp/jupyter/actions')
    {JupyterStore}   = require('smc-webapp/jupyter/store')
    smc_react        = require('smc-webapp/smc-react')

    project_id = client.client_id()
    path       = syncdb._path
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
        name   : required   # name of the kernel as a string
        client : undefined
    if not opts.client?
        opts.client = new Client()
    return new Kernel(opts.name, opts.client?.dbg)

class Kernel extends EventEmitter
    constructor : (@name, @_dbg) ->
        dbg = @dbg('constructor')
        @_state = 'init'
        @_identity = misc.uuid()
        dbg('spawning kernel')
        require('spawnteract').launch(@name).then (kernel) =>
            dbg("got kernel; creating channels")
            @_kernel = kernel
            @_channels = require('enchannel-zmq-backend').createChannels(@_identity, @_kernel.config)
            @_channels.shell.subscribe((mesg) => @emit('shell', mesg))
            @_channels.iopub.subscribe((mesg) => @emit('iopub', mesg))
            @_state = 'running'
            @emit('init')

            # kill this kernel no matter what if process exits.
            process.on('exit', @close)

    dbg: (f) =>
        if not @_dbg?
            return ->
        else
            return @_dbg("jupyter.Kernel('#{@name}').#{f}")

    execute_code: (opts) =>
        opts = defaults opts,
            code : required
            cb   : required    # this happens **repeatedly**:  cb(undefined, output message)
        dbg = @dbg("execute_code")
        dbg("code='#{opts.code}'")
        if not @_channels?
            if @_state == 'closed'
                opts.cb("closed")
            else
                dbg("wait until kernel/channels are setup, then try again.")
                @once('init', => @execute_code(opts))
            return
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
        f = (mesg) =>
            dbg("got message -- #{JSON.stringify(mesg)}")
            if mesg.parent_header.msg_id == message.header.msg_id
                if mesg.content?.execution_state == 'idle'
                    @removeListener('iopub', f)
                opts.cb(undefined, misc.copy_with(mesg,['metadata', 'content', 'buffers']))
        @on('iopub', f)

        dbg("send the message")
        @_channels.shell.next(message)

    process_large_output: (content) ->
        if @_state == 'closed'
            return
        dbg = @dbg("process_large_output")
        dbg(JSON.stringify(content))
        if not content.data?
            # todo: FOR now -- later may remove large stdout, stderr, etc...
            dbg("no data, so nothing to do")
            return
        if content.data['image/png']?
            dbg("there is an image/png")
            image = content.data['image/png']
            content.data['image/png'] = 'removed!'
            dbg("removed img/png -- new content: #{JSON.stringify(content)}")
        else
            dbg("no image/png")
        # TODO: actually store images and make available via raw http server
        # TODO: remove other types of output, e.g., big text.  Have UI make
        # it selectively available.

    close: =>
        @dbg("close")()
        if @_state == 'closed'
            return
        process.removeListener('exit', @close)
        if @_kernel?
            @_kernel.spawn.kill()
            fs.unlink(@_kernel.connectionFile)
            delete @_kernel
        # TODO -- clean up channels?
        @_state = 'closed'

    export_ipynb: (opts) =>
        opts = defaults opts,
            path : required   # path ending in .ipynb
            cb   : required
        opts.cb('todo')

    export_pdf: (opts) =>
        opts = defaults opts,
            path : required   # path ending in .pdf
            cb   : required
        opts.cb('todo')

    export_py: (opts) =>
        opts = defaults opts,
            path : required   # path ending in .py
            cb   : required
        opts.cb('todo')
