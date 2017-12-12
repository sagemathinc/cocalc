###
Render the public path

###

serve_static         = require('serve-static')
finalhandler         = require('finalhandler')
serve_index          = require('serve-index')

misc                 = require('smc-util/misc')
{defaults, required} = misc

# res = html response object
# obj = immutable js data about this public path
exports.render_static_path = (opts) ->
    {req, res, dir, path} = defaults opts,
        res   : required
        req   : required
        dir   : required   # directory on disk containing files for this path
        path  : required

    s_static = serve_static(dir, {'index': ['index.html', 'index.htm']})
    s_index  = serve_index(dir, {'icons': true})
    req.url = path
    if req.url == ''
        req.url = '/'
    s_static req, res, (err) ->
        if err
            finalhandler(err)
        else
            s_index(req, res, finalhandler)

