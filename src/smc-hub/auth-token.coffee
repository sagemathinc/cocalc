###
Temporary authentication token for user.
###

async             = require('async')

random_key        = require("random-key")

misc              = require('smc-util/misc')
{defaults, types, required} = misc

auth              = require('./auth')

# map {account_id:{user_account_id:timestamp}}
ban = {}

BAN_TIME_MS = 1000*60

exports.get_user_auth_token = (opts) ->
    opts = defaults opts,  # temporary until types is more than just a WARNING
        database        : required
        account_id      : required
        user_account_id : required
        password        : required    # admin can get token by using password = ''.
        lti             : false       # LTI auth mode
        cb              : required
    types opts,
        database        : types.object.isRequired
        account_id      : types.string.isRequired
        user_account_id : types.string.isRequired
        password        : types.string.isRequired
        lti             : types.bool               # LTI auth mode
        cb              : types.func.isRequired    # cb(err, auth_token)

    auth_token = undefined
    b = ban[opts.account_id]?[opts.user_account_id]
    if b? and (new Date() - b < BAN_TIME_MS)
        opts.cb("banned -- please wait at least #{BAN_TIME_MS/1000}s before trying again")
        return

    is_admin = false
    is_lti = false

    async.series([
        (cb) ->
            if opts.password != ''
                is_admin = false
                cb()
                return
            if not opts.lti
                # must be an admin or NOPE.
                opts.database.is_admin
                    account_id : opts.account_id
                    cb         : (err, _is_admin) =>
                        is_admin = _is_admin
                        cb(err)
            else
                # must have an lti_id
                opts.database.get_account
                    account_id : opts.account_id
                    columns    : ["lti_id"]
                    cb         : (err, lti_id) =>
                        is_lti = !!lti_id
                        cb(err)
        (cb) ->
            if (is_admin or is_lti) and opts.password == ''
                # no need to do anything further
                cb()
                return
            # confirm auth
            auth.is_password_correct
                database             : opts.database
                account_id           : opts.user_account_id
                password             : opts.password
                allow_empty_password : false  # user must have a password
                cb                   : (err, is_correct) ->
                    if err
                        cb(err)
                    else if not is_correct
                        # ban opts.account_id from attempting again for 1 minute (say)
                        b = ban[opts.account_id] ?= {}
                        b[opts.user_account_id] = new Date()
                        cb("incorrect password")
                    else
                        cb()
        (cb) ->
            # generate token
            auth_token = random_key.generate(24)
            # save in db
            opts.database.save_auth_token
                account_id : opts.user_account_id
                auth_token : auth_token
                ttl        : 12*3600    # ttl in seconds (12 hours)
                cb         : cb
        (cb) ->
            # log that we created an auth_token for an account...
            # just in case (this is entirely a security thing)
            opts.database.log
                event : 'get_user_auth_token'
                value : {account_id : opts.account_id, user_account_id:opts.user_account_id, is_admin:is_admin}
                cb    : cb

    ], (err) ->
        opts.cb(err, auth_token)
    )

exports.revoke_user_auth_token = (opts) ->
    opts = defaults opts,
        database   : required
        auth_token : required
        cb         : required
    types opts,
        database   : types.object.isRequired
        auth_token : types.string.isRequired
        cb         : types.func.isRequired    # cb(err, auth_token)
    opts.database.delete_auth_token
        auth_token : opts.auth_token
        cb         : cb