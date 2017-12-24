###
Authentication.
###

immutable             = require('immutable')
basic_auth            = require('basic-auth')

password_hash_library = require('password-hash')

misc                 = require('smc-util/misc')
{defaults, required} = misc


exports.is_authenticated = (opts) ->
    opts = defaults opts,
        req    : required
        res    : required
        path   : required    # string
        auth   : undefined   # immutable.js map -- {path:[{name:[string], pass:[password-hash]}, ...], ...}
        logger : undefined

    if not opts.auth?
        return true   # no authentication needed

    # strip any /'s from beginning of opts.path  (auth path's are assumed relative)
    while opts.path[0] == '/'
        opts.path = opts.path.slice(1)

    auth_info = undefined
    opts.auth.forEach (info, path) ->
        if misc.startswith(opts.path, path)
            auth_info = info
            return false  # break

    if not auth_info?
        # don't need auth for this path
        return true

    if not immutable.List.isList(auth_info)
        opts.res.statusCode = 401
        opts.res.end('auth is misconfigured  -- invalid auth field in the public_paths database.')
        return false

    credentials = basic_auth(opts.req)
    fail = true
    if credentials?.name and credentials?.pass
        for i in [0...auth_info.size]
            x = auth_info.get(i)
            if x.get('name') == credentials.name
                if password_hash_library.verify(credentials.pass, x.get('pass'))
                    fail = false
                break

    if fail
        opts.res.statusCode = 401
        opts.res.setHeader('WWW-Authenticate', 'Basic realm="cocalc.com"')
        opts.res.end('Access denied')
        return false

    # access granted
    return true

