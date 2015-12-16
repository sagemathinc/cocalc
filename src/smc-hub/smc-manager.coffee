async   = require('async')
winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc = require('smc-util/misc')
{defaults, required} = misc

smc_gcloud = require('./smc_gcloud')

exports.smc = (opts) -> new SMC(opts)

class SMC
    constructor: ->
        @_gcloud = require('./smc_gcloud').gcloud()

    dbg: (f) ->
        return (m) -> winston.debug("smc.#{f}: #{m}")

    create_compute_vm: (opts) =>
        opts = defaults opts,
            name        : required        # e.g., 'compute11'
            base        : 'compute0-us'   # name of disk to clone
            type        : 'n1-standard-1'
            preemptible : true
            cb          : required
        dbg = @dbg("create_compute_vm(name='#{opts.name}')")
        async.series([
            (cb) =>
                dbg("create base disk from current live disk '#{opts.base}'")
                disk = @_gcloud.disk(name:opts.base)
                disk.copy
                    name : opts.name
                    cb   : cb
            (cb) =>
                dbg("create vm")
                @_gcloud.create_vm
                    name        : opts.name
                    type        : opts.type
                    preemptible : opts.preemptible
                    tags        : ['compute']
                    disks       : [opts.name]
                    cb          : cb
        ], opts.cb)

    create_web_vm: (opts) =>
        opts = defaults opts,
            name        : required     # e.g., 'web10'
            base        : 'web0'       # name of disk to clone
            type        : 'g1-small'
            preemptible : true
            cb          : required
        dbg = @dbg("create_web_vm(name='#{opts.name}')")
        async.series([
            (cb) =>
                dbg("create base disk from current live disk '#{opts.base}'")
                disk = @_gcloud.disk(name:opts.base)
                disk.copy
                    name : opts.name
                    cb   : cb
            (cb) =>
                dbg("create vm")
                @_gcloud.create_vm
                    name        : opts.name
                    type        : opts.type
                    preemptible : opts.preemptible
                    tags        : ['http-server', 'https-server', 'hub']
                    disks       : [opts.name]
                    cb          : cb
        ], opts.cb)
