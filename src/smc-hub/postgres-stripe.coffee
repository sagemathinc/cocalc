###
PostgreSQL -- implementation of all the queries needed for the backend servers

These are all the non-reactive non-push queries, e.g., adding entries to logs,
checking on cookies, creating accounts and projects, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

async   = require('async')

{defaults, types} = misc = require('smc-util/misc')
required = defaults.required

{PostgreSQL, one_result} = require('./postgres')

class exports.PostgreSQL extends PostgreSQL
    # Set the stripe id in our database of this user.  If there is no user with this
    # account_id, then this is a NO-OP.
    set_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            customer_id : required
            cb          : required
        @_query
            query : 'UPDATE accounts'
            set   : 'stripe_customer_id::TEXT' : opts.customer_id
            where : 'account_id = $::UUID'     : opts.account_id
            cb    : opts.cb

    # Get the stripe id in our database of this user (or undefined if not stripe_id or no such user).
    get_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            cb          : required
        @_query
            query : 'SELECT stripe_customer_id FROM accounts'
            where : 'account_id = $::UUID' : opts.account_id
            cb    : one_result('stripe_customer_id', opts.cb)

    ###
    Stripe integration/sync:
    Get all info about the given account from stripe and put it in our own local database.
    Call it with force right after the user does some action that will change their
    account info status.  This will never touch stripe if the user doesn't have
    a stripe_customer_id.   TODO: This should be replaced by webhooks...
    ###
    stripe_update_customer: (opts) =>
        opts = defaults opts,
            account_id  : required   # user's account_id
            stripe      : undefined  # api connection to stripe
            customer_id : undefined  # will be looked up if not known
            cb          : undefined
        customer = undefined
        dbg = @_dbg("stripe_update_customer(account_id='#{opts.account_id}')")
        async.series([
            (cb) =>
                if opts.customer_id?
                    cb(); return
                dbg("get_stripe_customer_id")
                @get_stripe_customer_id
                    account_id : opts.account_id
                    cb         : (err, x) =>
                        dbg("their stripe id is #{x}")
                        opts.customer_id = x; cb(err)
            (cb) =>
                if opts.customer_id? and not opts.stripe?
                    @get_server_setting
                        name : 'stripe_secret_key'
                        cb   : (err, secret) =>
                            if err
                                cb(err)
                            else if not secret
                                cb("stripe must be configured")
                            else
                                opts.stripe = require("stripe")(secret)
                                cb()
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    opts.stripe.customers.retrieve opts.customer_id, (err, x) =>
                        dbg("got stripe info -- #{err}")
                        customer = x; cb(err)
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    @_query
                        query : 'UPDATE accounts'
                        set   : 'stripe_customer::JSONB' : customer
                        where : 'account_id = $::UUID'   : opts.account_id
                        cb    : opts.cb
                else
                    cb()
        ], opts.cb)

    ###
    Auxillary billing related queries
    ###
    get_coupon_history: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        @_dbg("Getting coupon history")
        @_query
            query : "SELECT coupon_history FROM accounts"
            where : 'account_id = $::UUID' : opts.account_id
            cb    : one_result("coupon_history", opts.cb)

    update_coupon_history: (opts) =>
        opts = defaults opts,
            account_id     : required
            coupon_history : required
            cb             : undefined
        @_dbg("Setting to #{opts.coupon_history}")
        @_query
            query : 'UPDATE accounts'
            set   : 'coupon_history::JSONB' : opts.coupon_history
            where : 'account_id = $::UUID'  : opts.account_id
            cb    : opts.cb
