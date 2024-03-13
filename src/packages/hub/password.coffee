#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Password reset and change functionality.
###

async                = require('async')
misc                 = require('@cocalc/util/misc')
message              = require('@cocalc/util/message')     # message protocol between front-end and back-end
email                = require('./email')
{defaults, required} = misc
{is_valid_password}  = require('./client/create-account')
auth                 = require('./auth')
base_path   = require('@cocalc/backend/base-path').default
passwordHash = require("@cocalc/backend/auth/password-hash").default;
{checkEmailExclusiveSSO} = require("@cocalc/server/auth/check-email-exclusive-sso")
getConn = require("@cocalc/server/stripe/connection").default;

exports.PW_RESET_ENDPOINT = PW_RESET_ENDPOINT = '/auth/password-reset'
exports.PW_RESET_KEY = PW_RESET_KEY = 'token'


# DEPRECATED -- see packages/server/accounts/set-email-address.ts
# except this is still used by client.coffee, etc.  It's just that
# I've also rewritten it.
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
            checkEmailExclusiveSSO opts.database, opts.account_id, opts.mesg.new_email_address, (err, exclusive) =>
                if err
                    cb(err)
                    return
                if exclusive
                    cb("you are not allowed to change your email address or change to this one")
                    return
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
                stripe        : await getConn()
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
