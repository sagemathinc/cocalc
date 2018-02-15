###
HTTP-based User API

These are authenticated using the cookie only, unlike the secret-key based API.

They allow for evenly distributing user requests across a cluster in a stateless way.
###

async   = require('async')

misc = require('smc-util/misc')
{defaults, required} = misc

{Client} = require('./client')

{get_account_id} = require('./user-remember-me')

exports.init = (opts) ->
    opts = defaults opts,
        router         : required
        cookie_name    : required
        database       : required
        compute_server : required
        logger         : undefined
    opts.router.post '/user_api', (req, res) ->
        if not req.body.message?
            res.send({error:'missing message'})
            return
        locals =
            message    : undefined
            account_id : undefined
            resp       : undefined

        try
            # TODO -- issues of size?
            locals.message   = misc.from_json(req.body.message)
        catch err
            res.send({error:"JSON parse error -- '#{err}'"})
            return

        if not locals.message?
            res.send({error:"missing message"})
            return

        async.series([
            (cb) ->
                get_account_id opts.database, req.cookies[opts.cookie_name], (err, account_id) ->
                    locals.account_id = account_id
                    if not account_id and not err
                        err ='user must be signed in'
                    cb(err)
            (cb) ->
                user_api_call
                    account_id     : locals.account_id
                    ip_address     : req.ip
                    message        : locals.message
                    database       : opts.database
                    compute_server : opts.compute_server
                    logger         : opts.logger
                    cb             : (err, resp) ->
                        locals.resp = resp
                        cb(err)
        ], (err) ->
            if err
                res.send({error:err})
            else
                res.send(locals.resp)
        )

user_api_call = (opts) ->
    opts = defaults opts,
        account_id     : required
        ip_address     : undefined
        message        : required
        database       : required
        compute_server : required
        logger         : undefined
        cb             : required

    # client often expects id to be defined.
    opts.message.id ?= misc.uuid()

    locals =
        client : undefined
        resp   : undefined

    async.series([
        (cb) ->
            get_client
                account_id     : opts.account_id
                ip_address     : opts.ip_address
                logger         : opts.logger
                database       : opts.database
                compute_server : opts.compute_server
                cb      : (err, client) ->
                    locals.client = client
                    cb(err)
        (cb) ->
            handle_message
                client : locals.client
                mesg   : opts.message
                logger : opts.logger
                cb     : (err, resp) ->
                    locals.resp = resp
                    cb(err)
    ], (err) ->
        locals.client?.destroy()
        opts.cb(err, locals.resp)
    )

get_client = (opts) ->
    opts = defaults opts,
        account_id     : required
        ip_address     : undefined
        logger         : undefined
        database       : required
        compute_server : required
        cb             : required
    options =
        logger         : opts.logger
        database       : opts.database
        compute_server : opts.compute_server
    client = new Client(options)
    client.push_to_client = (mesg, cb) =>
        client.emit('push_to_client', mesg)
        cb?()
    client.account_id = opts.account_id
    client.ip_address = opts.ip_address
    opts.cb(undefined, client)

handle_message = (opts) ->
    opts = defaults opts,
        mesg   : required
        client : required
        logger : undefined
        cb     : required
    name = "mesg_#{opts.mesg.event}"
    f = opts.client[name]
    if not f?
        opts.cb("unknown message event type '#{opts.mesg.event}'")
        return
    opts.client.once 'push_to_client', (mesg) ->
        opts.cb(undefined, mesg)
    f(opts.mesg)


