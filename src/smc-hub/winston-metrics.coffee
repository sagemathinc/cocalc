#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

winston           = require('winston')
metrics_recorder  = require('./metrics-recorder')

number = 0
new_name = ->
    number += 1
    return "log-#{number}"

# one metric for all WinstonMetrics instances (instead, they have a name and the level!)
counter = metrics_recorder.new_counter('log_lines_total', 'counts the number of printed log lines', ['name', 'level'])

class exports.WinstonMetrics extends winston.Transport
    constructor: (opts) ->
        opts ?= {}
        super(level:opts.level)
        @name = opts.name ? new_name()

exports.WinstonMetrics::name = 'transport-metric'

exports.WinstonMetrics::log = (level, msg) ->
    counter.labels(@name, "#{level}").inc(1)

# just a convenience function, which does what we usually do for each component
# it's a drop-in replacement, use it like: winston = require('...').get_logger(<name>)
exports.get_logger = (name) ->
    transports = [new exports.WinstonMetrics({name: name, level: 'debug'})]
    SMC_TEST = process.env.SMC_TEST
    if not SMC_TEST
        transports.push(new winston.transports.Console({level: 'debug', timestamp:true, colorize:true}))
    logger = new winston.Logger(transports:transports)
    return logger