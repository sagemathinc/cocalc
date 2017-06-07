###
Node.js interface to nbconvert.
###

misc = require('smc-util/misc')
{defaults, required} = misc

misc_node = require('smc-util-node/misc_node')

exports.nbconvert = (opts) ->
    opts = defaults opts,
        args      : required
        directory : undefined
        timeout   : 30
        cb        : required

    to = undefined
    j = undefined
    for i in [0...opts.args.length]
        if opts.args[i] == '--to'
            j  = i
            to = opts.args[i+1]
            break
    if to == 'sagews'
        # support sagews convertor, which is its own script, not in nbconvert.
        command = 'smc-ipynb2sagews'
        args    = opts.args.slice(0, j).concat(opts.args.slice(j+2))
    else
        command = 'jupyter'
        args    = ['nbconvert'].concat(opts.args)

    misc_node.execute_code
        command     : command
        args        : args
        path        : opts.directory
        err_on_exit : true
        timeout     : opts.timeout   # in seconds
        cb          : (err, output) =>
            if err and output?.stderr
                err = output?.stderr
            opts.cb(err)
