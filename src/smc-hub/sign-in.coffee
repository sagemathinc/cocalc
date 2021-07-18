#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
User sign in

Throttling policy:  It basically like this, except we reset the counters
each minute and hour, so a crafty attacker could get twice as many tries by finding the
reset interval and hitting us right before and after.  This is an acceptable tradeoff
for making the data structure trivial.

  * POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
  * POLICY 2: A given email address is allowed at most 30 failed login attempts per hour.
  * POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
  * POLICY 4: A given ip address is allowed at most 50 failed login attempts per hour.
###

async                = require('async')
message              = require('smc-util/message')
misc                 = require('smc-util/misc')
{required, defaults} = misc
auth                 = require('./auth')
{process_env_int}    = require("smc-util-node/misc")
Bottleneck           = require("bottleneck")

# these parameters are per group and per hub!
bottleneck_opts      =
    minTime        : process_env_int('THROTTLE_SIGN_IN_MINTIME', 100)
    maxConcurrent  : process_env_int('THROTTLE_SIGN_IN_CONCURRENT', 10)
limit_group          = new Bottleneck.Group(bottleneck_opts)

sign_in_fails =
    email_m : {}
    email_h : {}
    ip_m    : {}
    ip_h    : {}

clear_sign_in_fails_m = () ->
    sign_in_fails.email_m = {}
    sign_in_fails.ip_m = {}

clear_sign_in_fails_h = () ->
    sign_in_fails.email_h = {}
    sign_in_fails.ip_h = {}

_sign_in_fails_intervals = undefined

record_sign_in_fail = (opts) ->
    {email, ip, logger} = defaults opts,
        email  : required
        ip     : required
        logger : undefined
    if not _sign_in_fails_intervals?
        # only start clearing if there has been a failure...
        _sign_in_fails_intervals = [setInterval(clear_sign_in_fails_m, 60000), setInterval(clear_sign_in_fails_h, 60*60000)]

    logger?("WARNING: record_sign_in_fail(#{email}, #{ip})")
    s = sign_in_fails
    if not s.email_m[email]?
        s.email_m[email] = 0
    if not s.ip_m[ip]?
        s.ip_m[ip] = 0
    if not s.email_h[email]?
        s.email_h[email] = 0
    if not s.ip_h[ip]?
        s.ip_h[ip] = 0
    s.email_m[email] += 1
    s.email_h[email] += 1
    s.ip_m[ip] += 1
    s.ip_h[ip] += 1

sign_in_check = (opts) ->
    {email, ip} = defaults opts,
        email : required
        ip    : required
    s = sign_in_fails
    if s.email_m[email] > 3
        # A given email address is allowed at most 3 failed login attempts per minute
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@cocalc.com."
    if s.email_h[email] > 30
        # A given email address is allowed at most 30 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@cocalc.com."
    if s.ip_m[ip] > 10
        # A given ip address is allowed at most 10 failed login attempts per minute.
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@cocalc.com."
    if s.ip_h[ip] > 50
        # A given ip address is allowed at most 50 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@cocalc.com."
    return false

exports.sign_in = (opts) ->
    opts = defaults opts,
        client   : required
        mesg     : required
        logger   : undefined
        database : required
        host     : undefined
        port     : undefined
        cb       : undefined

    key = opts.client.ip_address

    done_cb = () ->
        opts.logger?.debug("sign_in(group='#{key}'): done")

    limit_group.key(key).submit(_sign_in, opts, done_cb)


_sign_in = (opts, done) ->
    {client, mesg} = opts
    if opts.logger?
        dbg = (m) ->
            opts.logger.debug("_sign_in(#{mesg.email_address}): #{m}")
        dbg()
    else
        dbg = ->
    tm = misc.walltime()

    sign_in_error = (error) ->
        dbg("sign_in_error -- #{error}")
        exports.record_sign_in
            database      : opts.database
            ip_address    : client.ip_address
            successful    : false
            email_address : mesg.email_address
            account_id    : account?.account_id
        client.push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:error))
        opts.cb?(error)

    if not mesg.email_address
        sign_in_error("Empty email address.")
        return

    if not mesg.password
        sign_in_error("Empty password.")
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    m = sign_in_check
        email : mesg.email_address
        ip    : client.ip_address
    if m
        sign_in_error("sign_in_check fail(ip=#{client.ip_address}): #{m}")
        return

    signed_in_mesg = undefined
    account = undefined
    {api_key_action} = require('./api/manage')   # here, rather than at beginning of file, due to some circular references...

    async.series([
        (cb) ->
            dbg("get account and check credentials")
            # NOTE: Despite people complaining, we do give away info about whether
            # the e-mail address is for a valid user or not.
            # There is no security in not doing this, since the same information
            # can be determined via the invite collaborators feature.
            opts.database.get_account
                email_address : mesg.email_address
                columns       : ['password_hash', 'account_id', 'passports', 'banned']
                cb            : (err, _account) ->
                    if err
                        cb(err)
                        return
                    account = _account
                    dbg("account = #{JSON.stringify(account)}")
                    if account.banned
                        dbg("banned account!")
                        cb("This account is BANNED.  Contact help@cocalc.com if you believe this is a mistake.")
                        return
                    cb()
        (cb) ->
            dbg("got account; now checking if password is correct...")
            auth.is_password_correct
                database      : opts.database
                account_id    : account.account_id
                password      : mesg.password
                password_hash : account.password_hash
                cb            : (err, is_correct) ->
                    if err
                        cb("Error checking correctness of password -- #{err}")
                        return
                    if not is_correct
                        if not account.password_hash
                            cb("The account #{mesg.email_address} exists but doesn't have a password. Either set your password by clicking 'Forgot Password?' or log in using #{misc.keys(account.passports).join(', ')}.  If that doesn't work, email help@cocalc.com and we will sort this out.")
                        else
                            cb("Incorrect password for #{mesg.email_address}.  You can reset your password by clicking the 'Forgot Password?' link.   If that doesn't work, email help@cocalc.com and we will sort this out.")
                    else
                        cb()
        # remember me
        (cb) ->
            if not mesg.remember_me
                # do not set cookie if already set (and message known)
                cb(); return
            dbg("remember_me -- setting the remember_me cookie")
            signed_in_mesg = message.signed_in
                id                : mesg.id
                account_id        : account.account_id
                email_address     : mesg.email_address
                remember_me       : false
                hub               : opts.host + ':' + opts.port
            client.remember_me
                account_id    : signed_in_mesg.account_id
                cb            : cb
        (cb) ->
            if not mesg.get_api_key
                cb(); return
            dbg("get_api_key -- also get_api_key")
            api_key_action
                database   : opts.database
                account_id : account.account_id
                password   : mesg.password
                action     : 'get'
                cb       : (err, api_key) =>
                    signed_in_mesg.api_key = api_key
                    cb(err)
        (cb) ->
            if not mesg.get_api_key or signed_in_mesg.api_key
                cb(); return
            dbg("get_api_key -- must generate key since don't already have it")
            api_key_action
                database   : opts.database
                account_id : account.account_id
                password   : mesg.password
                action     : 'regenerate'
                cb       : (err, api_key) =>
                    signed_in_mesg.api_key = api_key
                    cb(err)
    ], (err) ->
        if err
            dbg("send error to user (in #{misc.walltime(tm)}seconds) -- #{err}")
            sign_in_error(err)
            opts.cb?(err)
        else
            dbg("user got signed in fine (in #{misc.walltime(tm)}seconds) -- sending them a message")
            client.signed_in(signed_in_mesg)
            client.push_to_client(signed_in_mesg)
            opts.cb?()

        # final callback for bottleneck group
        done()
    )

exports.sign_in_using_auth_token = (opts) ->
    opts = defaults opts,
        client   : required
        mesg     : required
        logger   : undefined
        database : required
        host     : undefined
        port     : undefined
        cb       : undefined

    key = opts.client.ip_address

    done_cb = () ->
        opts.logger?.debug("sign_in_using_auth_token(group='#{key}'): done")

    limit_group.key(key).submit(_sign_in_using_auth_token, opts, done_cb)

_sign_in_using_auth_token = (opts, done) ->
    {client, mesg} = opts
    if opts.logger?
        dbg = (m) ->
            opts.logger.debug("_sign_in_using_auth_token(#{mesg.email_address}): #{m}")
        dbg()
    else
        dbg = ->
    tm = misc.walltime()

    sign_in_error = (error) ->
        dbg("sign_in_using_auth_token_error -- #{error}")
        exports.record_sign_in
            database      : opts.database
            ip_address    : client.ip_address
            successful    : false
            email_address : mesg.auth_token  # yes, we abuse the email_address field
            account_id    : account?.account_id
        client.push_to_client(message.error(id:mesg.id, error:error))
        opts.cb?(error)

    if not mesg.auth_token
        sign_in_error("missing auth_token.")
        return

    if mesg.auth_token?.length != 24
        sign_in_error("auth_token must be exactly 24 characters long")
        return

    m = sign_in_check
        email : mesg.auth_token
        ip    : client.ip_address
    if m
        sign_in_error("sign_in_check fail(ip=#{client.ip_address}): #{m}")
        return

    signed_in_mesg = undefined
    account = account_id = undefined
    async.series([
        (cb) ->
            dbg("get account and check credentials")
            opts.database.get_auth_token_account_id
                auth_token : mesg.auth_token
                cb         : (err, _account_id) ->
                    if not err and not _account_id
                        err = 'auth_token is not valid'
                    account_id = _account_id; cb(err)
        (cb) ->
            dbg("successly got account_id; now getting more information about the account")
            opts.database.get_account
                account_id : account_id
                columns    : ['email_address', 'lti_id']
                cb         : (err, _account) ->
                    # for LTI accounts, we set the email address at least to an empty string
                    if !!_account.lti_id
                        _account.email_address ?= ''
                    account = _account; cb(err)
        # remember me
        (cb) ->
            dbg("remember_me -- setting the remember_me cookie")
            signed_in_mesg = message.signed_in
                id            : mesg.id
                account_id    : account_id
                email_address : account.email_address
                lti_id        : account.lti_id
                remember_me   : false
                hub           : opts.host + ':' + opts.port
            client.remember_me
                account_id    : signed_in_mesg.account_id
                lti_id        : signed_in_mesg.lti_id
                ttl           : 12*3600
                cb            : cb
    ], (err) ->
        if err
            dbg("send error to user (in #{misc.walltime(tm)}seconds) -- #{err}")
            sign_in_error(err)
            opts.cb?(err)
        else
            dbg("user got signed in fine (in #{misc.walltime(tm)}seconds) -- sending them a message")
            client.signed_in(signed_in_mesg)
            client.push_to_client(signed_in_mesg)
            opts.cb?()

        # final callback for bottleneck group
        done()
    )


# Record to the database a failed and/or successful login attempt.
exports.record_sign_in = (opts) ->
    opts = defaults opts,
        ip_address       : required
        successful       : required
        database         : required
        email_address    : undefined
        account_id       : undefined
        remember_me      : false

    if not opts.successful
        record_sign_in_fail
            email : opts.email_address
            ip    : opts.ip_address
    else
        data =
            ip_address    : opts.ip_address
            email_address : opts.email_address ? null
            remember_me   : opts.remember_me
            account_id    : opts.account_id

        opts.database.log
            event : 'successful_sign_in'
            value : data
