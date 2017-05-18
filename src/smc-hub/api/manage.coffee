###
User management of their API key.

(c) SageMath, Inc.   LGPLv3
###

async = require('async')

misc    = require('smc-util/misc')
message = require('smc-util/message')     # salvus message protocol
{defaults, required} = misc

{is_password_correct} = require('../auth')

exports.api_key_action = (opts) ->
    opts = defaults opts,
        database   : required
        account_id : undefined
        password   : undefined
        action     : undefined    # 'get', 'delete', 'regenerate'
        cb         : required
    if not opts.password?
        opts.cb("password must be given")
        return
    if not opts.action?
        opts.cb("action must be given")
        return
    if not opts.account_id?
        opts.cb("account_id must be signed in")
        return

    api_key = undefined
    async.series([
        (cb) ->
            is_password_correct
                database             : opts.database
                password             : opts.password
                account_id           : opts.account_id
                allow_empty_password : false
                cb                   : (err, is_correct) ->
                    if err?  # auth failed
                        cb(err)
                    else if not is_corret
                        cb("password is invalid")
                    else
                        cb()
        (cb) ->
            # do the action
            switch opts.action
                when 'get'
                    opts.database.get_api_key
                        account_id : opts.account_id
                        cb         : (err, x) ->
                            api_key = x; cb(err)
                when 'delete'
                    opts.database.delete_api_key
                        account_id : opts.account_id
                        cb         : cb
                when 'regenerate'
                    opts.database.regenerate_api_key
                        account_id : opts.account_id
                        cb         : (err, x) ->
                            api_key = x; cb(err)
                else
                    cb("unknown action '#{opts.action}'")
    ], (err) ->
        opts.cb(err, api_key)
    )
