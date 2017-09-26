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

exports.send = ->
    {webapp_client} = require('./webapp_client')
    metrics = exports.Registry.globalRegistry.getMetricsAsJSON()
    webapp_client.send_metrics(metrics)

the_send_interval = undefined
exports.send_interval = (interval_s=120) ->
    exports.clear_send_interval()
    the_send_interval = setInterval(exports.send, 1000*interval_s)

exports.clear_send_interval = ->
    if the_send_interval?
        clearInterval(the_send_interval)
        the_send_interval = undefined
