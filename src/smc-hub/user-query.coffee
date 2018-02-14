###
HTTP-based User Queries.

These are authenticated using the cookie only.

They allow for evenly distributing all user_queries (except changefeeds)
across the cluster in a stateless way.
###

async   = require('async')

auth    = require('./auth')

misc = require('smc-util/misc')

Cache = require('expiring-lru-cache')

remember_me_cache = new Cache(size:5000, expiry:60000)

get_account_id = (database, remember_me, cb) ->
    if not remember_me?
        cb('not signed in')
        return
    account_id = remember_me_cache.get(remember_me)
    if account_id
        cb(undefined, account_id)
        return
    x = remember_me.split('$')
    database.get_remember_me
        hash : auth.generate_hash(x[0], x[1], x[2], x[3])
        cb   : (err, signed_in_mesg) ->
            if err
                cb(err)
            remember_me_cache.set(remember_me, signed_in_mesg?.account_id)
            if not signed_in_mesg?
                cb('not signed in')
            else
                cb(undefined, signed_in_mesg.account_id)

exports.init = (router, cookie_name, database) ->
    router.post '/user_query', (req, res) ->
        if not req.body.query?
            res.send({error:'missing query'})
            return
        locals =
            query      : undefined
            options    : undefined
            account_id : undefined
            result     : undefined
        try
            # TODO -- issues of size?
            locals.query   = misc.from_json(req.body.query)
            locals.options = if req.body.options then misc.from_json(req.body.options)
        catch err
            res.send({error:"JSON parse error -- '#{err}'"})
            return
        async.series([
            (cb) ->
                get_account_id database, req.cookies[cookie_name], (err, account_id) ->
                    locals.account_id = account_id
                    cb(err)
            (cb) ->
                database.user_query
                    client_id  : locals.account_id  # for query throttling.
                    account_id : locals.account_id
                    query      : locals.query
                    options    : locals.options
                    cb         : (err, result) ->
                        locals.result = result
                        cb(err)
        ], (err) ->
            if err
                res.send({error:err})
            else
                res.send({result:locals.result})
        )

