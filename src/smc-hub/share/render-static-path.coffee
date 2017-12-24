###
Render a public path using a the official express static server.
###


fs = require('fs')
os_path              = require('path')

url                  = require('url')
serve_static         = require('serve-static')
finalhandler         = require('finalhandler')
serve_index          = require('serve-index')

misc                 = require('smc-util/misc')
{defaults, required} = misc

STATIC_OPTIONS =
    index: ['index.html', 'index.htm']

INDEX_OPTIONS =
    icons: true

# NOTE: we never clear these caches.  However, there is at most one for
# every public_path, so it probably wastes very little memory.  Someday
# should change to an LRU cache...

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

    # We first test that we have access to the file (and it exists) before
    # messing with the express static server.  I don't know why, but for some
    # reason it hangs forever when fed an uknown path, which obviously leads
    # to a very bad experience for users!
    opts.path = url.parse(opts.path).pathname  # see https://stackoverflow.com/questions/14166898/node-js-with-express-how-to-remove-the-query-string-from-the-url
    target = os_path.join(opts.dir, decodeURI(opts.path))
    fs.access target, fs.constants.R_OK, (err) ->
        if err
            res.sendStatus(404)
            return
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

