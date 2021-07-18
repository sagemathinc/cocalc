#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Password reset and change functionality.
###

async                = require('async')
misc                 = require('smc-util/misc')
message              = require('smc-util/message')     # message protocol between front-end and back-end
email                = require('./email')
{defaults, required} = misc
{is_valid_password}  = require('./client/create-account')
auth                 = require('./auth')
base_path   = require('smc-util-node/base-path').default

exports.PW_RESET_ENDPOINT = PW_RESET_ENDPOINT = '/auth/password_reset'
exports.PW_RESET_KEY = PW_RESET_KEY = 'token'

exports.forgot_password = (opts) ->
    opts = defaults opts,
        mesg       : required
        database   : required
        ip_address : required
        cb         : required
    ###
    Send an email message to the given email address with a code that
    can be used to reset the password for a certain account.

    Anti-spam/DOS throttling policies:
      * a given email address can be sent at most 30 password resets per hour
      * a given ip address can send at most 100 password reset request per minute
      * a given ip can send at most 250 per hour
    ###
    if opts.mesg.event != 'forgot_password'
        opts.cb("Incorrect message event type: #{opts.mesg.event}")
        return

    # This is an easy check to save work and also avoid empty email_address, which causes trouble below
    if not misc.is_valid_email_address(opts.mesg.email_address)
        opts.cb("Invalid email address.")
        return

    opts.mesg.email_address = misc.lower_email_address(opts.mesg.email_address)

    id = null
    locals =
        settings : undefined

    async.series([
        (cb) ->
            # Record this password reset attempt in our database
            opts.database.record_password_reset_attempt
                email_address : opts.mesg.email_address
                ip_address    : opts.ip_address
                cb            : cb
        (cb) ->
            # POLICY 1: We limit the number of password resets that an email address can receive
            opts.database.count_password_reset_attempts
                email_address : opts.mesg.email_address
                age_s         : 60*60  # 1 hour
                cb            : (err, count) ->
                    if err
                        cb(err)
                    else if count >= 31
                        cb("Too many password resets for this email per hour; try again later.")
                    else
                        cb()

        (cb) ->
            # POLICY 2: a given ip address can send at most 10 password reset requests per minute
            opts.database.count_password_reset_attempts
                ip_address : opts.ip_address
                age_s      : 60  # 1 minute
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 10
                        cb("Too many password resets per minute; try again later.")
                    else
                        cb()
        (cb) ->
            # POLICY 3: a given ip can send at most 60 per hour
            opts.database.count_password_reset_attempts
                ip_address : opts.ip_address
                age_s      : 60*60  # 1 hour
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 60
                        cb("Too many password resets per hour; try again later.")
                    else
                        cb()
        (cb) ->
            opts.database.account_exists
                email_address : opts.mesg.email_address
                cb : (err, exists) ->
                    if err
                        cb(err)
                    else if not exists
                        cb("No account with e-mail address #{opts.mesg.email_address}")
                    else
                        cb()
        (cb) ->
            # We now know that there is an account with this email address.
            # put entry in the password_reset uuid:value table with ttl of
            # 1 hour, and send an email
            opts.database.set_password_reset
                email_address : opts.mesg.email_address
                ttl           : 60*60
                cb            : (err, _id) ->
                    id = _id; cb(err)

        (cb) =>
            opts.database.get_server_settings_cached
                cb: (err, settings) =>
                    if err
                        cb(err)
                    else
                        locals.settings = settings
                        cb()

        (cb) ->
            # send an email to opts.mesg.email_address that has a password reset link
            theme = require('smc-util/theme')

            dns         = locals.settings.dns or theme.DNS
            DOMAIN_URL = "https://#{dns}"
            HELP_EMAIL  = locals.settings.help_email ? theme.HELP_EMAIL
            SITE_NAME   = locals.settings.site_name  ? theme.SITE_NAME

            path          = require('path').join(base_path, PW_RESET_ENDPOINT)
            RESET_URL     = "#{DOMAIN_URL}#{path}?#{PW_RESET_KEY}=#{id}"

            body = """
                <div>Hello,</div>
                <div>&nbsp;</div>
                <div>
                Somebody just requested to change the password of your #{SITE_NAME} account.
                If you requested this password change, please click this link:</div>
                <div>&nbsp;</div>
                <div style="text-align: center; font-size: 120%;">
                  <b><a href="#{RESET_URL}">#{RESET_URL}</a></b>
                </div>
                <div>&nbsp;</div>
                <div>If you don't want to change your password, ignore this message.</div>
                <div>&nbsp;</div>
                <div>In case of problems, email
                <a href="mailto:#{HELP_EMAIL}">#{HELP_EMAIL}</a> immediately!
                <div>&nbsp;</div>
                """

            email.send_email
                subject  : "#{SITE_NAME} Password Reset"
                body     : body
                from     : "CoCalc Help <#{HELP_EMAIL}>"
                to       : opts.mesg.email_address
                category : "password_reset"
                settings : locals.settings
                cb       : cb
    ], opts.cb)

exports.reset_forgot_password = (opts) ->
    opts = defaults opts,
        mesg       : required
        database   : required
        cb         : required
    if opts.mesg.event != 'reset_forgot_password'
        opts.cb("incorrect message event type: #{opts.mesg.event}")
        return

    email_address = account_id = db = null

    async.series([
        (cb) ->
            # Verify password is valid and compute its hash.
            [valid, reason] = is_valid_password(opts.mesg.new_password)
            if not valid
                cb(reason); return
            # Check that request is still valid
            opts.database.get_password_reset
                id : opts.mesg.reset_code
                cb   : (err, x) ->
                    if err
                        cb(err)
                    else if not x
                        cb("Password reset request is no longer valid.")
                    else
                        email_address = x
                        cb()
        (cb) ->
            # Get the account_id.
            opts.database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, account) ->
                    account_id = account?.account_id; cb(err)
        (cb) ->
            # Make the change
            opts.database.change_password
                account_id    : account_id
                password_hash : auth.password_hash(opts.mesg.new_password)
                cb            : (err, account) ->
                    if err
                        cb(err)
                    else
                        # only allow successful use of this reset token once
                        opts.database.delete_password_reset
                            id : opts.mesg.reset_code
                            cb : cb
    ], opts.cb)

exports.change_password = (opts) ->
    opts = defaults opts,
        mesg       : required
        account_id : required   # user they are auth'd as
        database   : required
        ip_address : required
        cb         : required
    account = null
    async.series([
        (cb) ->
            # get account and validate the password (if they have one)
            opts.database.get_account
              account_id : opts.account_id
              columns    : ['password_hash']
              cb : (error, result) ->
                if error
                    cb({other:error})
                    return
                account = result
                auth.is_password_correct
                    database             : opts.database
                    account_id           : opts.account_id
                    password             : opts.mesg.old_password
                    password_hash        : account.password_hash
                    allow_empty_password : true
                    cb                   : (err, is_correct) ->
                        if err
                            cb(err)
                        else
                            if not is_correct
                                err = "invalid old password"
                                opts.database.log
                                    event : 'change_password'
                                    value : {email_address:opts.mesg.email_address, client_ip_address:opts.ip_address, message:err}
                                cb(err)
                            else
                                cb()
        (cb) ->
            # check that new password is valid
            [valid, reason] = is_valid_password(opts.mesg.new_password)
            if not valid
                cb({new_password:reason})
            else
                cb()

        (cb) ->
            # record current password hash (just in case?) and that we
            # are changing password and set new password
            opts.database.log
                event : "change_password"
                value :
                    account_id             : opts.account_id
                    client_ip_address      : opts.ip_address
                    previous_password_hash : account.password_hash

            opts.database.change_password
                account_id    : opts.account_id
                password_hash : auth.password_hash(opts.mesg.new_password),
                cb            : cb
    ], opts.cb)

exports.change_email_address = (opts) ->
    opts = defaults opts,
        mesg       : required
        database   : required
        account_id : required
        ip_address : required
        logger     : undefined
        cb         : required

    if opts.logger?
        dbg = (m...) -> opts.logger?.debug("change_email_address(#{opts.mesg.account_id}): ", m...)
        dbg()
    else
        dbg = ->

    opts.mesg.new_email_address = misc.lower_email_address(opts.mesg.new_email_address)

    if not misc.is_valid_email_address(opts.mesg.new_email_address)
        dbg("invalid email address")
        opts.cb('email_invalid')
        return

    if opts.mesg.account_id != opts.account_id
        opts.cb("account_id in mesg is not what user is signed in as")
        return

    async.series([
        (cb) ->
            auth.is_password_correct
                database             : opts.database
                account_id           : opts.mesg.account_id
                password             : opts.mesg.password
                allow_empty_password : true  # in case account created using a linked passport only
                cb                   : (err, is_correct) ->
                    if err
                        cb("Error checking password -- please try again in a minute -- #{err}.")
                    else if not is_correct
                        cb("invalid_password")
                    else
                        cb()

        (cb) ->
            # Record current email address (just in case?) and that we are
            # changing email address to the new one.  This will make it
            # easy to implement a "change your email address back" feature
            # if I need to at some point.
            dbg("log change to db")
            opts.database.log
                event : 'change_email_address'
                value :
                    client_ip_address : opts.ip_address
                    new_email_address : opts.mesg.new_email_address

            dbg("actually make change in db")
            opts.database.change_email_address
                account_id    : opts.mesg.account_id
                email_address : opts.mesg.new_email_address
                cb            : cb
        (cb) ->
            # If they just changed email to an address that has some actions, carry those out...
            # TODO: move to hook this only after validation of the email address?
            # TODO: NO -- instead this should get completely removed and these actions
            #       should be replaced by special URL's (e.g., a URL that when visited
            #       makes it so you get added to a project, or a code you enter on the page).
            #       That would be way more secure *and* flexible.
            opts.database.do_account_creation_actions
                email_address : opts.mesg.new_email_address
                account_id    : opts.mesg.account_id
                cb            : cb
    ], opts.cb)
