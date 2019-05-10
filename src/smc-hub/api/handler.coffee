###
API for handling the messages described smc-util/message.coffee

AGPLv3, (c) 2017, SageMath, Inc.
###

async = require('async')

misc = require('smc-util/misc')
{defaults, required} = misc

messages = require('smc-util/message')

{ HELP_EMAIL } = require("smc-util/theme")

{Client} = require('../client')

log = (name, logger) ->
    if logger?
        return (m...) -> logger.debug("API.#{name}: ", m...)
    else
        return ->

exports.http_message_api_v1 = (opts) ->
    opts = defaults opts,
        event          : required
        body           : required
        api_key        : required
        database       : required
        compute_server : required
        ip_address     : required
        logger         : undefined
        cb             : required
    dbg = log('http_message_api_v1', opts.logger)
    dbg("event=", opts.event, 'body=', opts.body)

    f = messages[opts.event]
    if not f?
        opts.cb("unknown endpoint '#{opts.event}'")
        return

    if not messages.api_messages[opts.event]
        opts.cb("endpoint '#{opts.event}' is not part of the HTTP API")
        return

    try
        mesg = f(opts.body, true)
    catch err
        opts.cb("invalid parameters '#{err}'")
        return

    if mesg.event == 'query' and mesg.multi_response
        otps.cb("multi_response queries aren't supported")
        return

    # client often expects id to be defined.
    mesg.id ?= misc.uuid()

    client = resp = undefined
    async.series([
        (cb) ->
            get_client
                api_key        : opts.api_key
                logger         : opts.logger
                database       : opts.database
                compute_server : opts.compute_server
                ip_address     : opts.ip_address
                cb      : (err, c) ->
                    client = c; cb(err)
        (cb) ->
            handle_message
                client : client
                mesg   : mesg
                logger : opts.logger
                cb     : (err, r) ->
                    resp = r; cb(err)
    ], (err) ->
        opts.cb(err, resp)
    )

auth_cache = {}
get_client = (opts) ->
    opts = defaults opts,
        api_key        : required
        logger         : undefined
        database       : required
        compute_server : required
        ip_address     : required
        cb             : required
    dbg = log('get_client', opts.logger)

    account_id = auth_cache[opts.api_key]
    async.series([
        (cb) ->
            if account_id?
                cb()
            else
                opts.database.get_account_with_api_key
                    api_key : opts.api_key
                    cb      : (err, a) ->
                        if err
                            cb(err)
                        else
                            account_id = a
                            # cache api key being valid for a minute
                            auth_cache[opts.api_key] = account_id
                            setTimeout((->delete auth_cache[opts.api_key]), 60000)
                            cb()

        (cb) ->
            # check if user is banned:
            opts.database.is_banned_user
                account_id : account_id
                cb         : (err, is_banned) ->
                    if err
                        cb(err)
                        return
                    if is_banned
                        cb("User is BANNED.  If this is a mistake, please contact #{HELP_EMAIL}")
                        return
                    cb()

    ], (err) ->
        if err
            opts.cb(err)
            return
        options =
            logger         : opts.logger
            database       : opts.database
            compute_server : opts.compute_server
        client = new Client(options)
        client.push_to_client = (mesg, cb) =>
            client.emit('push_to_client', mesg)
            cb?()
        client.ip_address = opts.ip_address
        client.account_id = account_id
        opts.cb(undefined, client)
    )

handle_message = (opts) ->
    opts = defaults opts,
        mesg   : required
        client : required
        logger : undefined
        cb     : required
    dbg = log('handle_message', opts.logger)
    dbg(opts.mesg, opts.client.id)
    name = "mesg_#{opts.mesg.event}"
    f = opts.client[name]
    if not f?
        opts.cb("unknown message event type '#{opts.mesg.event}'")
        return
    opts.client.once 'push_to_client', (mesg) ->
        opts.cb(undefined, mesg)
    f(opts.mesg)



