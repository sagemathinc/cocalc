###
HTTP-based User Queries.

These are authenticated using the cookie only.

They allow for evenly distributing all user_queries (except changefeeds)
across the cluster in a stateless way.
###

async   = require('async')
winston = require('winston')

misc = require('smc-util/misc')

{get_account_id} = require('./user-remember-me')

{remember_me_cookie_name} = require('./auth')

exports.init = (router, base_url, database) ->
    handle_request = (req, res) ->
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
            # there are two remember_me cookies to check. the default and a legacy fallback
            # https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients
            (cb) ->
                remme = remember_me_cookie_name(base_url, false)
                winston.debug("user-query/remember_me_cookie_name/1", remme)
                get_account_id database, req.cookies[remme], (err, account_id) ->
                    if account_id
                        locals.account_id = account_id
                    cb(err)

            (cb) ->
                # fallback, same as above except legacy=true
                if locals.account_id
                    cb()
                    return

                remme = remember_me_cookie_name(base_url, true)
                winston.debug("user-query/remember_me_cookie_name/2", remme)
                get_account_id database, req.cookies[remme], (err, account_id) ->
                    if account_id
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
                res.send({error:"#{err}"})  # very important that error is a string so can JSON.
            else
                res.send({result:locals.result})
        )

    router.post '/user_query', handle_request

    # User queries, but via the db-standby server (so 100% read only)
    router.post '/db_standby', handle_request

