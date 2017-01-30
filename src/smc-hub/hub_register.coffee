###
Hub Registration (recording number of clients)

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

winston = require('winston')
misc    = require('smc-util/misc')
{defaults, required} = misc

# Global variables
database_is_working = false
the_database = undefined
the_host     = undefined
the_port     = undefined
the_interval = undefined
the_clients  = []

number_of_clients = () ->
    return (C for id,C of the_clients when not C._destroy_timer? and not C.closed).length

exports.number_of_clients = () ->
    if not the_database?
        throw new Error("database not yet set")
    return number_of_clients()

register_hub = (cb) ->
    if not the_database?
        cb?("database not yet set")
        return
    the_database.register_hub
        host    : the_host
        port    : the_port
        clients : number_of_clients()
        ttl     : 3*the_interval
        cb      : (err) ->
            if err
                database_is_working = false
                winston.debug("Error registering with database - #{err}")
            else
                database_is_working = true
            cb?(err)

exports.database_is_working = ->
    return database_is_working

exports.start = (opts) ->
    opts = defaults opts,
        database   : required
        clients    : required
        host       : required
        port       : required
        interval_s : required
    the_database = opts.database
    the_clients  = opts.clients
    the_host     = opts.host
    the_port     = opts.port
    the_interval = opts.interval_s
    register_hub()
    setInterval(register_hub, the_interval*1000)
