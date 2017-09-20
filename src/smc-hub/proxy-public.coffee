###
Proxy a public service.
###

http_proxy = require('http-proxy')

misc    = require('smc-util/misc')
{defaults, required} = misc

proxy_cache = {}

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
    host = opts.request.headers.host
    n = "project-".length
    project_id = host.slice(n, n+36)
    dbg("project_id=", project_id)

    port = host.slice(n+37)
    i = 0
    while port[i] >= '0' and port[i] <= '9'
        i += 1
    port = port.slice(0, i)
    if not port
        port = '8000'  # default
    port = parseInt(port)
    dbg("port=", port)

    #opts.response.end("public server at #{project_id}:#{port}")
    opts.compute_server.project
        project_id : project_id
        cb         : (err, project) ->
            dbg("first compute_server.project finished (mark: #{misc.walltime(tm)}) -- #{err}")
            if err
                opts.response.end("error getting project -- #{err}")
                return
            host = project.host
            if not host
                opts.response.end("project not running")
                return
            t = "http://#{host}:#{port}"
            if proxy_cache[t]?                # location in the cache, so use it.
                proxy = proxy_cache[t]
                dbg("used cached proxy")
            else
                dbg("make a new proxy")
                proxy = http_proxy.createProxyServer(ws:false, target:t, timeout:10000)
                # and cache it.
                proxy_cache[t] = proxy
                dbg("created new proxy: #{misc.walltime(tm)}")
                # setup error handler, so that if something goes wrong with this proxy
                # we remove it from cache(it will,
                proxy.on "error", (e) ->
                    dbg("http proxy error -- #{e}")
                    delete proxy_cache[t]

            bg("now finally let proxy handle the request")
            proxy.web(opts.request, opts.response)


