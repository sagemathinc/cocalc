#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Ensure that plans are all correctly defined in stripe.

Stripe API docs https://stripe.com/docs/api/node#create_plan
###

async         = require('async')

misc          = require('smc-util/misc')
{upgrades}    = require('smc-util/upgrade-spec')
{init_stripe} = require('./connect')

{defaults, required} = misc

# Create all plans that are missing
exports.create_missing_plans = (opts) ->
    opts = defaults opts,
        database : required   # database connection
        logger   : {debug:console.log}
        cb       : required

    dbg = (m) -> opts.logger.debug("create_missing_plans: #{m}")
    dbg()
    locals =
        stripe : undefined
        plans  : undefined
    async.series([
        (cb) ->
            dbg("initialize stripe connection")
            init_stripe
                logger    : opts.logger
                database  : opts.database
                cb        : (err, stripe) ->
                    locals.stripe = stripe
                    cb(err)
        (cb) ->
            dbg("get already created plans")
            locals.stripe.plans.list {limit:999}, (err, plans) ->
                if plans?
                    locals.known = {}
                    for plan in plans.data
                        locals.known[plan.id] = true
                cb(err)
        (cb) ->
            dbg("create any missing plans")
            f = (name, cb) ->
                exports.create_plan
                    name     : name
                    database : opts.database
                    logger   : opts.logger
                    known    : locals.known
                    cb       : cb
            async.map(misc.keys(upgrades.subscription), f, cb)
    ], opts.cb)

# Create a specific plan (error if plan already defined)
exports.create_plan = (opts) ->
    opts = defaults opts,
        name     : required   # the name of the plan, one of the keys of upgrades.subscription;
                              # NOTE: there are multiple stripe plans associated to a single cocalc
                              # plan, due to different intervals.
        database : required   # database connection
        logger   : {debug:console.log}
        known    : {}         # map from known plan ids to true -- these are skipped
        cb       : required

    locals =
        spec   : upgrades.subscription[opts.name]
        stripe : undefined

    if not locals.spec?
        opts.cb("unknown plan id #{opts.id}")
        return
    dbg = (m) -> opts.logger.debug("create_plan(name='#{opts.name}'): #{m}")
    dbg()
    async.series([
        (cb) ->
            dbg("initialize stripe connection")
            init_stripe
                logger    : opts.logger
                database  : opts.database
                cb        : (err, stripe) ->
                    locals.stripe = stripe
                    cb(err)
        (cb) ->
            try
                locals.plans = spec_to_plans(opts.name, locals.spec, opts.known)
            catch err
                cb(err)
                return
            if locals.plans.length == 0
                dbg("no missing stripe plans")
                cb()
                return
            dbg("creating #{locals.plans.length} missing stripe plans")
            f = (plan, cb) ->
                locals.stripe.plans.create(plan, cb)
            async.map(locals.plans, f, cb)

    ], opts.cb)


spec_to_plans = (name, spec, known) ->
    v = []
    the_desc = spec.desc
    i = the_desc.indexOf('\n')
    if i != -1
        the_desc = the_desc.slice(0,i)
    for period, amount of spec.price
        switch period
            when 'month'
                id             = name
                interval       = 'month'
                interval_count = 1
                desc           = the_desc
            when 'month4'
                id             = name
                interval       = 'month'
                interval_count = 4
                desc           = the_desc
            when 'year', 'year1'
                id             = "#{name}-year"
                interval       = 'year'
                interval_count = 1
                desc           = "One Year #{the_desc}"
            when 'week'
                id             = "#{name}-week"
                interval       = 'week'
                interval_count = 1
                desc           = "One Week #{the_desc}"
            else
                throw Error("unknown period '#{period}'")

        if known?[id]
            continue

        statement = spec.statement
        if not statement?
            throw Error("plan statement must be defined but it is not for name='#{name}'")
        if statement.length > 17
            throw Error("statement '#{statement}' must be at most 17 characters, but is #{statement.length} characters for name='#{name}'")
        if interval == 'year'
            statement += ' YEAR'
        v.push
            id             : id
            interval       : interval
            interval_count : interval_count
            amount         : amount*100
            product        :
                name                 : desc
                statement_descriptor : statement
            currency       : 'usd'
    return v