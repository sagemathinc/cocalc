###
The port_manager manages the ports for the various servers.

It reads the port from memory or from disk and returns it.
###

fs = require('fs')
misc_node = require('smc-util-node/misc_node')

SMC = process.env.SMC

exports.port_file = port_file = (type) ->
    return "#{SMC}/#{type}_server/#{type}_server.port"

ports = {}
exports.get_port = (type, cb) ->   # cb(err, port number)
    if ports[type]?
        cb(false, ports[type])
    else
        fs.readFile misc_node.abspath(port_file(type)), (err, content) ->
            if err
                cb(err)
            else
                try
                    ports[type] = parseInt(content)
                    cb(false, ports[type])
                catch e
                    cb("#{type}_server port file corrupted")

exports.forget_port = (type) ->
    if ports[type]?
        delete ports[type]