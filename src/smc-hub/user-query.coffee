###
HTTP-based User Queries.

These are authenticated using the cookie only.

They allow for evenly distributing all user_queries (except changefeeds)
across the cluster in a stateless way.
###

async   = require('async')

misc = require('smc-util/misc')

{get_account_id} = require('./user-remember-me')

exports.init = (router, cookie_name, database) ->
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
                res.send({error:"#{err}"})  # very important that error is a string so can JSON.
            else
                res.send({result:locals.result})
        )

    router.post '/user_query', handle_request

    # User queries, but via the db-standby server (so 100% read only)
    router.post '/db_standby', handle_request

