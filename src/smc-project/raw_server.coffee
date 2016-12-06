###
Raw http server
###

fs             = require('fs')
async          = require('async')
winston        = require('winston')
express        = require('express')
express_index  = require('serve-index')

misc_node = require('smc-util-node/misc_node')

{defaults, required} = require('smc-util/misc')

exports.start_raw_server = (opts) ->
    opts = defaults opts,
        project_id : required
        base_url   : required
        host       : required
        data_path  : required
        home       : required
        port       : undefined
        cb         : cb
    {project_id, base_url, host, data_path, home, cb} = opts
    winston.info("starting raw http server...")

    raw_port_file  = misc_node.abspath("#{data_path}/raw.port")
    raw_server     = express()

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
                            winston.debug("WARNING: error creating root symlink -- #{err}")
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
            winston.info("raw server: port=#{port}, host='#{host}', base='#{base}'")

            raw_server.use base, (req, res, next) ->
                # this middleware function has to come before the express.static server!
                # it sets the content type to octet-stream (aka "download me") if URL query ?download exists
                if req.query.download?
                    res.setHeader('Content-Type', 'application/octet-stream')
                # Disable any caching -- even cloudflare obeys these headers
                res.setHeader('Cache-Control', 'no-store, must-revalidate')
                res.setHeader('Expires', '0')
                return next()
            raw_server.use(base, express_index(home,  {hidden:true, icons:true}))
            raw_server.use(base, express.static(home, {hidden:true}))

            # NOTE: It is critical to only listen on the host interface (not localhost), since otherwise other users
            # on the same VM could listen in.   We also firewall connections from the other VM hosts above
            # port 1024, so this is safe without authentication.  TODO: should we add some sort of
            # auth (?) just in case?
            raw_server.listen(port, host, cb)
    ], (err) ->
        if err
            winston.debug("error starting raw_server: err = #{misc.to_json(err)}")
        cb(err)
    )