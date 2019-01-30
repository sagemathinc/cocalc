###
The stripe connection object, which communicates with the remote stripe server.

Configure via the admin panel in account settings of an admin user.
###

DEFAULT_VERSION = '2018-11-08'

async = require('async')

misc                 = require('smc-util/misc')
{defaults, required} = misc

stripe  = undefined

# Return the stripe api object if it has been initialized (via init_stripe below), or
# undefined if it has not yet been initialized.
exports.get_stripe = ->
    return stripe

# init_stripe: call this to ensure that the stripe library
# and key, etc., is available to other functions.  Additional
# calls are ignored.
#
# TODO: this could listen to a changefeed on the database
# for changes to the server_settings table.
exports.init_stripe = (opts) ->
    opts = defaults opts,
        logger   : undefined
        database : required
        cb       : undefined   # cb(err, stripe)

    dbg = (m) -> opts.logger?.debug("init_stripe: #{m}")
    dbg()

    if stripe?
        dbg("already done")
        opts.cb?(undefined, stripe)
        return

    async.series([
        (cb) ->
            opts.database.get_server_setting
                name : 'stripe_secret_key'
                cb   : (err, secret_key) ->
                    if err
                        dbg("error getting stripe_secret_key")
                        cb(err)
                    else
                        if secret_key
                            dbg("go stripe secret_key")
                        else
                            dbg("invalid secret_key")
                        stripe = require("stripe")(secret_key)
                        stripe.setApiVersion(DEFAULT_VERSION)
                        cb()
        (cb) ->
            opts.database.get_server_setting
                name : 'stripe_publishable_key'
                cb   : (err, value) ->
                    dbg("stripe_publishable_key #{err}, #{value}")
                    if err
                        cb(err)
                    else
                        stripe.publishable_key = value
                        cb()
    ], (err) ->
        if err
            dbg("error initializing stripe: #{err}")
        else
            dbg("successfully initialized stripe api")
        opts.cb?(err, stripe)
    )