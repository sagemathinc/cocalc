###
The stripe connection object, which communicates with the remote stripe server.

Configure via the admin panel in account settings of an admin user.
###

async = require('async')

misc                 = require('smc-util/misc')
{defaults, required} = misc

stripe  = undefined
DEFAULT_VERSION = '2017-08-15'

exports.get_stripe = (version) ->
    stripe.setApiVersion(version ? DEFAULT_VERSION)
    return stripe

# TODO: this could listen to a changefeed on the database
# for changes to the server_settings table.
exports.init_stripe = (opts) ->
    opts = defaults opts,
        logger   : undefined
        database : required
        cb       : undefined

    dbg = (m) -> opts.logger?.debug("init_stripe: #{m}")
    dbg()

    if stripe?
        dbg("already done")
        opts.cb?()
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
        opts.cb?(err)
    )