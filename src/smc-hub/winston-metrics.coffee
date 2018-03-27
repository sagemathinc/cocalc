##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


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