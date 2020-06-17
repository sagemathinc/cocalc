#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Compute sales tax for a given customer.
###

misc                 = require('smc-util/misc')
{defaults, required} = misc

misc_node            = require('smc-util-node/misc_node')


exports.stripe_sales_tax = (opts) ->
    opts = defaults opts,
        customer_id : required
        cb          : required
    stripe = require('./connect').get_stripe()
    if not stripe?
        opts.cb("stripe not initialized")
        return
    stripe.customers.retrieve opts.customer_id, (err, customer) ->
        if err
            opts.cb(err)
            return
        if not customer.default_source?
            opts.cb(undefined, 0)
            return
        zip = undefined
        state = undefined
        for x in customer.sources.data
            if x.id == customer.default_source
                zip = x.address_zip?.slice(0,5)
                state = x.address_state
                break
        if not zip? or state != 'WA'
            opts.cb(undefined, 0)
            return
        opts.cb(undefined, misc_node.sales_tax(zip))
