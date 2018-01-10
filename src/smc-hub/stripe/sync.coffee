###
Sync remote stripe view of all users with our local via (in our database).

Should get done eventually mostly via webhooks, etc., -- but for now this is OK.
###

fs    = require('fs')
async = require('async')

misc                 = require('smc-util/misc')
{defaults, required} = misc

exports.stripe_sync = (opts) ->
    opts = defaults opts,
        dump_only : false
        logger    : undefined
        database  : required
        target    : undefined
        limit     : 3  # number at once
        cb        : undefined

    dbg = (m) -> opts.logger?.debug("stripe_sync: #{m}")
    dbg()
    users  = undefined
    target = opts.target

    async.series([
        (cb) ->
            require('./connect').init_stripe
                logger    : opts.logger
                database  : opts.database
                cb        : cb
        (cb) ->
            dbg("get all customers from the database with stripe -- this is a full scan of the database and will take a while")
            # TODO: we could make this faster by putting an index on the stripe_customer_id field.
            opts.database._query
                query : 'SELECT account_id, stripe_customer_id, stripe_customer FROM accounts WHERE stripe_customer_id IS NOT NULL'
                cb    : (err, x) ->
                    users = x?.rows
                    cb(err)
        (cb) ->
            dbg("dump stripe_customer data to file for statistical analysis")
            if target?
                cb()
                return
            target = "#{process.env.HOME}/stripe/"
            fs.exists target, (exists) ->
                if not exists
                    fs.mkdir(target, cb)
                else
                    cb()
        (cb) ->
            dbg('actually writing customer data')
            # NOTE: Of coure this is potentially one step out of date -- but in theory this should always be up to date
            dump = []
            for x in users
                # these could all be embarassing if this backup "got out" -- remove anything about actual credit card
                # and person's name/email.
                y = misc.copy_with(x.stripe_customer, ['created', 'subscriptions', 'metadata'])
                y.subscriptions = y.subscriptions?.data
                y.metadata = y.metadata?.account_id?.slice(0,8)
                dump.push(y)
            fs.writeFile("#{target}/stripe_customers-#{misc.to_iso(new Date())}.json", misc.to_json(dump), cb)
        (cb) ->
            if opts.dump_only
                cb()
                return
            dbg("got #{users.length} users with stripe info")
            stripe = require('./connect').get_stripe()
            f = (x, cb) ->
                dbg("updating customer #{x.account_id} data to our local database")
                opts.database.stripe_update_customer
                    account_id  : x.account_id
                    stripe      : stripe
                    customer_id : x.stripe_customer_id
                    cb          : cb
            async.mapLimit(users, opts.limit, f, cb)
    ], (err) ->
        if err
            dbg("error updating customer info -- #{err}")
        else
            dbg("updated all customer info successfully")
        opts.cb?(err)
    )
