###
Express HTTP server
###

fs             = require('fs')
async          = require('async')
express        = require('express')
express_index  = require('serve-index')
body_parser    = require('body-parser')
misc_node = require('smc-util-node/misc_node')

{defaults, required} = require('smc-util/misc')

{jupyter_router} = require('./jupyter/jupyter')

{upload_endpoint} = require('./upload')

exports.start_raw_server = (opts) ->
    opts = defaults opts,
        project_id : required
        base_url   : required
        host       : required
        data_path  : required
        home       : required
        port       : undefined
        logger     : undefined
        cb         : cb
    {project_id, base_url, host, data_path, home, cb} = opts
    opts.logger?.info("starting express http server...")

    raw_port_file  = misc_node.abspath("#{data_path}/raw.port")
    raw_server     = express()

    # Needed for POST file to custom path.
    raw_server.use(body_parser.urlencoded({ extended: true }))

    port = opts.port # either undefined or the port number

    async.series([
        (cb) ->
            # create the root symbolic link, so that it is possible to
            # browse the entire filesystem, including tmp
            target = process.env.SMC + '/root'
            fs.exists target, (exists) ->
                if exists
                    cb()
                else
                    # make symbolic link from / to target
                    fs.symlink '/', target, (err) ->
                        if err
                            # nonfatal error
                            opts.logger?.debug("WARNING: error creating root symlink -- #{err}")
                        cb()
        (cb) ->
            if port  # 0 or undefined
                cb()
            else
                misc_node.free_port (err, _port) ->
                    port = _port; cb(err)
        (cb) ->
            fs.writeFile(raw_port_file, port, cb)
        (cb) ->
            base = "#{base_url}/#{project_id}/raw/"
            opts.logger?.info("raw server: port=#{port}, host='#{host}', base='#{base}'")

            {init_health_metrics} = require('./kucalc')
            init_health_metrics(raw_server)

            # Setup the /.smc/jupyter/... server, which is used by our jupyter server for blobs, etc.
            raw_server.use(base, jupyter_router(express))

            # Setup the upload POST endpoint
            raw_server.use(base, upload_endpoint(express, opts.logger))

            # Setup the static raw HTTP server.  This must happen after anything above!!
            raw_server.use base, (req, res, next) ->
                # this middleware function has to come before the express.static server!
                # it sets the content type to octet-stream (aka "download me") if URL query ?download exists
                if req.query.download?
                    res.setHeader('Content-Type', 'application/octet-stream')
                # Disable optimistic caching -- cloudflare obeys these headers
                res.setHeader('Cache-Control', 'private, no-cache, must-revalidate')
                return next()
            raw_server.use(base, express_index(home,  {hidden:true, icons:true}))
            raw_server.use(base, express.static(home, {hidden:true}))


            # NOTE: It is critical to only listen on the host interface (not localhost),
            # since otherwise other users on the same VM could listen in.
            # We also firewall connections from the other VM hosts above
            # port 1024, so this is safe without authentication.  TODO: should we add some sort of
            # auth (?) just in case?
            raw_server.listen(port, host, cb)
    ], (err) ->
        if err
            opts.logger?.debug("error starting raw_server: err = #{misc.to_json(err)}")
        cb(err)
    )