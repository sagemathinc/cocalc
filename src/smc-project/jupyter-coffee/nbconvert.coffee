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
        args    = opts.args.slice(0, j).concat(opts.args.slice(j+3))  # j+3 cuts out --to and --.
    else
        command = 'jupyter'
        args    = ['nbconvert'].concat(opts.args)

    # Note about bash/ulimit_timeout below.  This is critical since nbconvert
    # could launch things like pdflatex that might run forever and without
    # ulimit they do not get killed properly; this has happened in production!
    misc_node.execute_code
        command        : command
        args           : args
        path           : opts.directory
        err_on_exit    : true
        timeout        : opts.timeout   # in seconds
        ulimit_timeout : true
        bash           : true    # so can use ulimit_timeout
        cb          : (err, output) =>
            if err and output?.stderr
                err = output?.stderr
            opts.cb(err)
