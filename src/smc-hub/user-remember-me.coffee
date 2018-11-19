###
A cached function from remember_me cookie to account_id.
Cache expires after 60s, to stop accepting requests from user
in case they invalidate their cookie.
###

Cache = require('expiring-lru-cache')

auth    = require('./auth')

remember_me_cache = new Cache(size:5000, expiry:60000)

exports.get_account_id = (database, remember_me, cb) ->
    if not remember_me?
        cb('not signed in')
        return
    account_id = remember_me_cache.get(remember_me)
    if account_id
        cb(undefined, account_id)
        return
    x = remember_me.split('$')
    try
        hash = auth.generate_hash(x[0], x[1], x[2], x[3])
    catch err
        cb("not signed in")
        return
    database.get_remember_me
        hash : hash
        cb   : (err, signed_in_mesg) ->
            if err
                cb(err)
                return
            remember_me_cache.set(remember_me, signed_in_mesg?.account_id)
            if not signed_in_mesg?
                cb('not signed in')
            else
                cb(undefined, signed_in_mesg.account_id)