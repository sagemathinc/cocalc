#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Sync remote stripe view of all users with our local via (in our database).

Should get done eventually mostly via webhooks, etc., -- but for now this is OK.
###

fs    = require('fs')
async = require('async')

misc                 = require('smc-util/misc')
{defaults, required} = misc

plans = require('./plans')
{get_stripe, init_stripe} = require('./connect')

exports.stripe_sync = (opts) ->
    opts = defaults opts,
        dump_only : false
        logger    : {debug:console.log}
        database  : required
        target    : undefined
        limit     : 1  # number at once -- stripe will kick us out due to exceeding rate limit thresh if this is bigger than 1...
        delay     : 10 # ms, additional delay to avoid rate limiting
        cb        : undefined

    dbg = (m) -> opts.logger?.debug("stripe_sync: #{m}")
    dbg()
    users  = undefined
    target = opts.target

    async.series([
        (cb) ->
            try
                await init_stripe(opts.database, opts.logger)
                cb()
            catch err
                cb(err)
        (cb) ->
            dbg("ensure all plans are defined in stripe")
            plans.create_missing_plans
                database : opts.database
                logger   : opts.logger
                cb       : cb
        (cb) ->
            dbg("get all customers from the database with stripe that have been active in the last month")
            opts.database._query
                query : "SELECT account_id, stripe_customer_id, stripe_customer FROM accounts WHERE stripe_customer_id IS NOT NULL AND last_active >= NOW() - INTERVAL '1 MONTH'"
                cb    : (err, x) ->
                    users = x?.rows
                    cb(err)
        (cb) ->
            if opts.dump_only
                cb()
                return
            dbg("got #{users.length} users with stripe info")
            stripe = get_stripe()
            f = (x, cb) ->
                dbg("updating customer #{x.account_id} data to our local database")
                opts.database.stripe_update_customer
                    account_id  : x.account_id
                    stripe      : stripe
                    customer_id : x.stripe_customer_id
                    cb          : (err) ->
                        # rate limiting
                        setTimeout(cb, opts.delay)
            async.mapLimit(users, opts.limit, f, cb)
    ], (err) ->
        if err
            dbg("error updating customer info -- #{err}")
        else
            dbg("updated all customer info successfully")
        opts.cb?(err)
    )

