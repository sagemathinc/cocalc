###
Simplest possible implementation of a JSON API for handling the
messages described smc-util/message.coffee.  NOTHING fancy.

AGPLv3, (c) 2017, SageMath, Inc.
###

async = require('async')

misc = require('smc-util/misc')
{defaults, required} = misc

exports.http_message_api_v1 = (opts) ->
    opts = defaults opts,
        mesg    : undefined
        api_key : undefined
        cb      : required
    if not opts.mesg
        opts.cb("mesg must be specified")
        return
    client = resp = undefined
    async.series([
        (cb) ->
            get_client
                api_key : api_key
                cb      : (err, c) ->
                    client = c; cb(err)
        (cb) ->
            handle_message
                client : client
                mesg   : opts.mesg
                cb     : (err, r) ->
                    resp = r; cb(err)
    ], (err) ->
        otps.cb(err, resp)
    )

get_client = (opts) ->
    opts = defaults opts,
        api_key : undefined
        cb      : required
    if not opts.api_key?
        opts.cb()
        return

