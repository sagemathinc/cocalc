###
Account Creation (and Deletion)
###

async                = require('async')

message              = require('smc-util/message')
client_lib           = require('smc-util/client')
misc                 = require('smc-util/misc')
{required, defaults} = misc

auth                 = require('./auth')

exports.is_valid_password = is_valid_password = (password) ->
    [valid, reason] = client_lib.is_valid_password(password)
    if not valid
        return [valid, reason]
    return [true, '']

exports.create_account = (opts) ->
    opts = defaults opts,
        client   : required
        mesg     : required
        database : required
        logger   : undefined
        host     : undefined
        port     : undefined
        sign_in  : false      # if true, the newly created user will also be signed in; only makes sense for browser clients!
        cb       : undefined
    id = opts.mesg.id
    locals =
        token  : null
        mesg1  : null
    account_id = null
    dbg = (m) -> opts.logger?("create_account (#{opts.mesg.email_address}): #{m}")
    tm = misc.walltime()
    if opts.mesg.email_address?
        opts.mesg.email_address = misc.lower_email_address(opts.mesg.email_address)

    if not opts.mesg.first_name? or not opts.mesg.last_name?
        opts.cb?("first and last name must be defined")
        return
    async.series([
        (cb) ->
            dbg("run tests on generic validity of input")
            # issues_with_create_account also does check is_valid_password!
            issues = client_lib.issues_with_create_account(opts.mesg)

            # TODO -- only uncomment this for easy testing to allow any password choice.
            # the client test suite will then fail, which is good, so we are reminded to comment this out before release!
            # delete issues['password']

            if misc.len(issues) > 0
                cb(issues)
            else
                cb()

        (cb) ->
            # Make sure this ip address hasn't requested too many accounts recently,
            # just to avoid really nasty abuse, but still allow for demo registration
            # behind a single router.
            dbg("make sure not too many accounts were created from the given ip")
            opts.database.count_accounts_created_by
                ip_address : opts.client.ip_address
                age_s      : 60*30
                cb         : (err, n) ->
                    if err
                        cb(other:err)
                    else if n > 150
                        cb(other:"Too many accounts are being created from the ip address #{opts.client.ip_address}; try again later.")
                    else
                        cb()
        (cb) ->
            dbg("query database to determine whether the email address is available")
            opts.database.account_exists
                email_address : opts.mesg.email_address
                cb            : (error, not_available) ->
                    if error
                        cb(other:"Unable to create account.  Please try later. -- #{misc.to_json(error)}")
                    else if not_available
                        cb(email_address:"This e-mail address is already taken.")
                    else
                        cb()

        (cb) ->
            dbg("check that account is not banned")
            opts.database.is_banned_user
                email_address : opts.mesg.email_address
                cb            : (err, is_banned) ->
                    if err
                        cb(other:"Unable to create account.  Please try later.")
                    else if is_banned
                        cb(email_address:"This e-mail address is banned.")
                    else
                        cb()
        (cb) ->
            dbg("check if a registration token is required")
            opts.database.get_server_setting
                name : 'account_creation_token'
                cb   : (err, token) =>
                    if not token
                        cb()
                    else
                        if token != opts.mesg.token
                            cb(token:"Incorrect registration token.")
                        else
                            cb()
        (cb) ->
            dbg("create new account")
            opts.database.create_account
                first_name    : opts.mesg.first_name
                last_name     : opts.mesg.last_name
                email_address : opts.mesg.email_address
                password_hash : auth.password_hash(opts.mesg.password)
                created_by    : opts.client.ip_address
                usage_intent  : opts.mesg.usage_intent
                cb: (error, result) ->
                    if error
                        cb(other:"Unable to create account right now.  Please try later.")
                    else
                        account_id = result
                        cb()
                        # log to db -- no need to make client wait for this:
                        data =
                            account_id    : account_id
                            first_name    : opts.mesg.first_name
                            last_name     : opts.mesg.last_name
                            email_address : opts.mesg.email_address
                            created_by    : opts.client.ip_address
                        data.utm          = opts.mesg.utm          if opts.mesg.utm
                        data.referrer     = opts.mesg.referrer     if opts.mesg.referrer
                        data.landing_page = opts.mesg.landing_page if opts.mesg.landing_page
                        opts.database.log
                            event : 'create_account'
                            value : data
        (cb) ->
            dbg("check for account creation actions")
            opts.database.do_account_creation_actions
                email_address : opts.mesg.email_address
                account_id    : account_id
                cb            : cb
        (cb) ->
            if not opts.sign_in
                cb(); return
            if opts.mesg.get_api_key   # do not set remember me if just signing in to get api key.
                cb(); return
            dbg("set remember_me cookie...")
            # so that proxy server will allow user to connect and
            # download images, etc., the very first time right after they make a new account.
            opts.client.remember_me
                email_address : opts.mesg.email_address
                account_id    : account_id
                cb            : cb
        (cb) ->
            if not opts.sign_in and not opts.mesg.get_api_key
                cb(); return
            dbg("send message back to user that they are logged in as the new user (in #{misc.walltime(tm)}seconds)")
            # no utm/referrer info being logged, because it is already done in the create_account entry above.
            locals.mesg1 = message.signed_in
                id            : opts.mesg.id
                account_id    : account_id
                email_address : opts.mesg.email_address
                first_name    : opts.mesg.first_name
                last_name     : opts.mesg.last_name
                remember_me   : false
                hub           : opts.host + ':' + opts.port
            opts.client.signed_in(locals.mesg1)   # records this creation in database...
            cb()
        (cb) ->
            dbg("email verification?")
            if not opts.mesg.email_address?
                cb(); return
            auth = require('./auth')
            auth.verify_email_send_token
                account_id : account_id
                database   : opts.database
                cb         : (err) ->
                    if err
                        dbg("error during creating welcome email: #{err}")
            cb() # we return immediately, because there is no need for the user to wait for this.
        (cb) ->
            if not opts.mesg.get_api_key
                cb(); return
            dbg("get_api_key -- generate key and include")
            {api_key_action} = require('./api/manage')
            api_key_action
                database   : opts.database
                account_id : account_id
                password   : opts.mesg.password
                action     : 'regenerate'
                cb       : (err, api_key) =>
                    locals.mesg1.api_key = api_key
                    cb(err)
    ], (reason) ->
        if reason
            dbg("send message to user that there was an error (in #{misc.walltime(tm)}seconds) -- #{misc.to_json(reason)}")
            opts.client.push_to_client(message.account_creation_failed(id:id, reason:reason))
            cb?("error creating account -- #{misc.to_json(reason)}")
        else
            if locals.mesg1
                opts.client.push_to_client(locals.mesg1)
            opts.client.push_to_client(message.account_created(id:id, account_id:account_id))
            cb?()
    )

exports.delete_account = (opts) ->
    opts = defaults opts,
        client         : undefined
        mesg           : required
        database       : required
        logger         : undefined
        cb             : undefined

    opts.logger?("delete_account(opts.mesg.account_id)")

    opts.database.mark_account_deleted
        account_id    : opts.mesg.account_id
        cb            : (err) =>
            opts.client?.push_to_client(message.account_deleted(id:opts.mesg.id, error:err))
            opts.cb?(err)
