#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Use prom-client in browser!

NOTE: We explicitly import inside the prom-client package, since the index.js
in that package imports some things that make no sense in a browser.
###

{COCALC_MINIMAL} = require('./fullscreen')
exports.enabled = true and not COCALC_MINIMAL
console.log("initializing prometheus client. enabled =", exports.enabled)

exports.register           = require('prom-client/lib/registry').globalRegistry
exports.Registry           = require('prom-client/lib/registry')
exports.contentType        = require('prom-client/lib/registry').globalRegistry.contentType

exports.Counter            = require('prom-client/lib/counter')
exports.Gauge              = require('prom-client/lib/gauge')
exports.Histogram          = require('prom-client/lib/histogram')
exports.Summary            = require('prom-client/lib/summary')
exports.Pushgateway        = require('prom-client/lib/pushgateway')

exports.linearBuckets      = require('prom-client/lib/bucketGenerators').linearBuckets
exports.exponentialBuckets = require('prom-client/lib/bucketGenerators').exponentialBuckets

exports.aggregators        = require('prom-client/lib/metricAggregators').aggregators

# ATTN: default metrics do not work, because they are only added upon "proper" export -- not our .get json trick
# exports.register.setDefaultLabels(defaultLabels)

exports.send = ->
    {webapp_client} = require('./webapp_client')
    if not webapp_client.is_connected()
        #console.log("prom-client.send: not connected")
        return
    metrics = exports.Registry.globalRegistry.getMetricsAsJSON()
    webapp_client.tracking_client.send_metrics(metrics)
    #console.log('prom-client.send: sending metrics')

_interval_s = undefined
exports.start_metrics = (interval_s=120) ->
    #console.log('start_metrics')
    exports.stop_metrics()
    # send once so hub at least knows something about our metrics.
    exports.send()
    # and then send every interval_s seconds:
    _interval_s = setInterval(exports.send, 1000*interval_s)

exports.stop_metrics = ->
    if _interval_s?
        clearInterval(_interval_s)
        _interval_s = undefined

# convenience functions
{defaults} = require('smc-util/misc')

PREFIX = 'webapp_'

exports.new_counter = new_counter = (name, help, labels) ->
    # a prometheus counter -- https://github.com/siimon/prom-client#counter
    # use it like counter.labels(labelA, labelB).inc([positive number or default is 1])
    if not name.endsWith('_total')
        throw "Counter metric names have to end in [_unit]_total but I got '#{name}' -- https://prometheus.io/docs/practices/naming/"
    return new exports.Counter(name: PREFIX + name, help: help, labelNames: labels)

exports.new_gauge = new_gauge = (name, help, labels) ->
    # a prometheus gauge -- https://github.com/siimon/prom-client#gauge
    # basically, use it like gauge.labels(labelA, labelB).set(value)
    return new exports.Gauge(name: PREFIX + name, help: help, labelNames: labels)

exports.new_quantile = new_quantile = (name, help, config={}) ->
    # invoked as quantile.observe(value)
    config = defaults config,
        # a few more than the default, in particular including the actual min and max
        percentiles: [0.0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1.0]
        labels     : []
    return new exports.Summary(name: PREFIX + name, help: help, labelNames:config.labels, percentiles: config.percentiles)

exports.new_histogram = new_histogram = (name, help, config={}) ->
    # invoked as histogram.observe(value)
    config = defaults config,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        labels : []
    return new exports.Histogram(name: PREFIX + name, help: help, labelNames: config.labels, buckets:config.buckets)
