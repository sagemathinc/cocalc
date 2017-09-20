###
Proxy a public service.
###

misc    = require('smc-util/misc')
{defaults, required} = misc

exports.proxy_public_service = (opts) ->
    opts = defaults opts,
        database       : required
        compute_server : required
        request        : required
        response       : required
        logging        : undefined
    if opts.logging?
        dbg = (args...) ->
            opts.logging.debug('proxy_public_service:', args...)
        dbg()
    else
        dbg = ->
    # request.headers.host = project-[project_id]-[port]-other_stuff.cocalc.com
    host = request.headers.host
    n = "project-".length
    project_id = host.slice(n, n+36)
    dbg("project_id=", project_id)
    port = host.slice(n+37)
    i = Math.min(port.indexOf('.'), port.indexOf('-'))
    port = port.slice(0, i)
    dbg("port=", port)
    opts.response.send("public server!")


