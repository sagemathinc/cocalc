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

exports.jupyter_backend = (syncdb, client) ->
    dbg = client.dbg("jupyter_backend")
    dbg()
    {JupyterActions} = require('smc-webapp/jupyter/actions')
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
            all  : false       # if all=true, cb(undefined, [all output messages]); used for testing mainly.
            cb   : required    # if all=false, this happens **repeatedly**:  cb(undefined, output message)
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
        if opts.all
            all_mesgs = []

        f = (mesg) =>
            dbg("got message -- #{JSON.stringify(mesg)}")
            if mesg.parent_header.msg_id == message.header.msg_id
                mesg = misc.copy_with(mesg,['metadata', 'content', 'buffers'])
                # TODO: mesg isn't a normal javascript object; it's **silently** immutable, which
                # is pretty annoying for our use. Investigate.  For now, we just copy it, which is a waste.
                mesg = misc.deep_copy(mesg)
                if opts.all
                    all_mesgs.push(mesg)
                else
                    opts.cb(undefined, mesg)
                if mesg.content?.execution_state == 'idle'
                    @removeListener('iopub', f)
                    if opts.all
                        opts.cb(undefined, all_mesgs)

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
        for i, type of types
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

    close: =>
        @dbg("close")()
        if @_state == 'closed'
            return
        @removeAllListeners()
        process.removeListener('exit', @close)
        if @_kernel?
            @_kernel.spawn.kill()
            fs.unlink(@_kernel.connectionFile)
            delete @_kernel
            delete @_channels
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



jupyter_kernel_handler = (base, router) ->
    jupyter_kernels_json = kernelspecs = undefined

    init = (cb) -> # TODO: move out and unit test...
        if jupyter_kernels_json?
            cb()
            return
        misc_node.execute_code
            command : 'jupyter'
            args    : ['kernelspec', 'list', '--json']
            cb      : (err, output) =>
                if err
                    cb(err)
                    return
                try
                    kernelspecs = JSON.parse(output.stdout).kernelspecs
                    v = []
                    for kernel, value of kernelspecs
                        v.push
                            name         : kernel
                            display_name : value.spec.display_name
                            language     : value.spec.language
                    v.sort (a,b) -> misc.cmp(a.name, b.name)
                    jupyter_kernels_json = JSON.stringify(v)
                    cb()
                catch err
                    cb(err)

    router.get base + 'kernels.json', (req, res) ->
        init (err) ->
            if err
                res.send(err)  # TODO: set some code
            else
                res.send(jupyter_kernels_json)

    router.get base + 'kernelspecs/*', (req, res) ->
        init (err) ->
            if err
                res.send(err)   # TODO: set some code
            else
                path = req.path.slice((base + 'kernelspecs/').length).trim()
                if path.length == 0
                    res.send(jupyter_kernels_json)
                    return
                segments = path.split('/')
                name = segments[0]
                kernel = kernelspecs[name]
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



exports.jupyter_router = (express) ->
    base = '/.smc/jupyter/'

    # Install handling for the blob store
    router = blob_store.express_router(base, express)

    # Handler for Jupyter kernels
    router = jupyter_kernel_handler(base, router)

    return router




