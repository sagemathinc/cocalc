###
Render a public path using a the official express static server.
###

serve_static         = require('serve-static')
finalhandler         = require('finalhandler')
serve_index          = require('serve-index')

misc                 = require('smc-util/misc')
{defaults, required} = misc

STATIC_OPTIONS =
    index: ['index.html', 'index.htm']

INDEX_OPTIONS =
    icons: true

_serve_static_cache = {}
get_serve_static = (dir) ->
    return _serve_static_cache[dir] ?= serve_static(dir, STATIC_OPTIONS)

_serve_index_cache = {}
get_serve_index = (dir) ->
    return _serve_index_cache[dir] ?= serve_index(dir, INDEX_OPTIONS)

# res = html response object
# obj = immutable js data about this public path
exports.render_static_path = (opts) ->
    {req, res, dir, path} = defaults opts,
        res   : required
        req   : required
        dir   : required   # directory on disk containing files for this path
        path  : required

    s_static = get_serve_static(dir)
    s_index  = get_serve_index(dir)
    if path == ''
        path = '/'
    req.url  = path
    s_static req, res, (err) ->
        if err
            finalhandler(err)
        else
            s_index(req, res, finalhandler)

