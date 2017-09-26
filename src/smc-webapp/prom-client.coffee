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
    if not webapp_client.is_connected()
        #console.log("prom-client.send: not connected")
        return
    metrics = exports.Registry.globalRegistry.getMetricsAsJSON()
    webapp_client.send_metrics(metrics)
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
