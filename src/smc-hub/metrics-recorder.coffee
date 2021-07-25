#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# This is a small helper class to record real-time metrics about the hub.
# It is designed for the hub, such that a local process can easily check its health.
# After an initial version, this has been repurposed to use prometheus.
# It wraps its client elements and adds some instrumentation to some hub components.

fs         = require('fs')
path       = require('path')
underscore = require('underscore')
{execSync} = require('child_process')
{defaults} = misc = require('smc-util/misc')

# Prometheus client setup -- https://github.com/siimon/prom-client
prom_client = require('prom-client')


# additionally, record GC statistics
# https://www.npmjs.com/package/prometheus-gc-stats
# See my comment in smc-project/kucalc.coffee
# require('prometheus-gc-stats')()()

# some constants
FREQ_s     = 5   # update stats every FREQ seconds
DELAY_s    = 10    # with an initial delay of DELAY seconds
#DISC_LEN   = 10   # length of queue for recording discrete values
#MAX_BUFFER = 1000 # max. size of buffered values, which are cleared in the @_update step

# collect some recommended default metrics
prom_client.collectDefaultMetrics(timeout: FREQ_s * 1000)

# CLK_TCK (usually 100, but maybe not ...)
try
    CLK_TCK = parseInt(execSync('getconf CLK_TCK', {encoding: 'utf8'}))
catch err
    CLK_TCK = null

###
# exponential smoothing, based on linux's load 1-exp(-1) smoothing
# with compensation for sampling time FREQ_s
d = 1 - Math.pow(Math.exp(-1), FREQ_s / 60)
DECAY = [d, Math.pow(d, 5), Math.pow(d, 15)]
###

###
# there is more than just continuous values
# cont: continuous (like number of changefeeds), will be smoothed
#       disc: discrete, like blocked, will be recorded with timestamp
#             in a queue of length DISC_LEN
exports.TYPE = TYPE =
    COUNT: 'counter'    # strictly non-decrasing integer
    GAUGE: 'gauge'      # only the most recent value is recorded
    LAST : 'latest'     # only the most recent value is recorded
    DISC : 'discrete'   # timeseries of length DISC_LEN
    CONT : 'continuous' # continuous with exponential decay
    MAX  : 'contmax'    # like CONT, reduces buffer to max value
    SUM  : 'contsum'    # like CONT, reduces buffer to sum of values divided by FREQ_s
###

PREFIX = 'cocalc_hub_'

exports.new_counter = new_counter = (name, help, labels) ->
    # a prometheus counter -- https://github.com/siimon/prom-client#counter
    # use it like counter.labels(labelA, labelB).inc([positive number or default is 1])
    if not name.endsWith('_total')
        throw "Counter metric names have to end in [_unit]_total but I got '#{name}' -- https://prometheus.io/docs/practices/naming/"
    return new prom_client.Counter(name: PREFIX + name, help: help, labelNames: labels ? [])

exports.new_gauge = new_gauge = (name, help, labels) ->
    # a prometheus gauge -- https://github.com/siimon/prom-client#gauge
    # basically, use it like gauge.labels(labelA, labelB).set(value)
    return new prom_client.Gauge(name: PREFIX + name, help: help, labelNames: labels ? [])

exports.new_quantile = new_quantile = (name, help, config={}) ->
    # invoked as quantile.observe(value)
    config = defaults config,
        # a few more than the default, in particular including the actual min and max
        percentiles: [0.0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1.0]
        labels : []
    return new prom_client.Summary(name: PREFIX + name, help: help, labelNames:config.labels, percentiles: config.percentiles)

exports.new_histogram = new_histogram = (name, help, config={}) ->
    # invoked as histogram.observe(value)
    config = defaults config,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        labels: []
    return new prom_client.Histogram(name: PREFIX + name, help: help, labelNames: config.labels, buckets:config.buckets)


# This is modified by the Client class (in client.coffee) when metrics
# get pushed from browsers.  It's a map from client_id to
# an array of metrics objects, which are already labeled with extra
# information about the client_id and account_id.
exports.client_metrics = {}

class MetricsRecorder
    constructor: (@dbg, cb) ->
        ###
        * @dbg: reporting via winston, instance with configuration passed in from hub.coffee
        ###
        # stores the current state of the statistics
        @_stats = {}
        @_types = {} # key → TYPE.T mapping

        # the full statistic
        @_data  = {}
        @_collectors = []

        # initialization finished
        @setup_monitoring()
        cb?(undefined, @)

    client_metrics: =>
        ###
        exports.client_metrics is a mapping of client id to the json exported metric.
        The AggregatorRegistry is supposed to work with a list of metrics, and by default,
        it sums them up. `aggregate` is a static method and hence it should be ok to use it directly.
        ###
        metrics = (m for _, m of exports.client_metrics)

        registry = prom_client.AggregatorRegistry.aggregate(metrics)
        return await registry.metrics()

    metrics: =>
        ###
        get a serialized representation of the metrics status
        (was a dict that should be JSON, now it is for prometheus)
        it's only called by the HTTP stuff in servers for the /metrics endpoint
        ###
        hub     = await prom_client.register.metrics()
        clients = await @client_metrics()
        return hub + clients

    register_collector: (collector) =>
        # The added collector functions will be evaluated periodically to gather metrics
        @_collectors.push(collector)

    setup_monitoring: =>
        # setup monitoring of some components
        # called by the hub *after* setting up the DB, etc.
        num_clients_gauge = new_gauge('clients_count', 'Number of connected clients')
        {number_of_clients} = require('./hub_register')
        @register_collector ->
            try
                num_clients_gauge.set(number_of_clients())
            catch
                num_clients_gauge.set(0)


        # our own CPU metrics monitor, separating user and sys!
        # it's actually a counter, since it is non-decreasing, but we'll use .set(...)
        @_cpu_seconds_total = new_gauge('process_cpu_categorized_seconds_total', 'Total number of CPU seconds used', ['type'])

        @_collect_duration = new_histogram('metrics_collect_duration_s', 'How long it took to gather the metrics', buckets:[0.0001, 0.001, 0.01, 1])
        @_collect_duration_last = new_gauge('metrics_collect_duration_s_last', 'How long it took the last time to gather the metrics')

        # init periodically calling @_collect
        setTimeout((=> setInterval(@_collect, FREQ_s * 1000)), DELAY_s * 1000)

    _collect: =>
        endG = @_collect_duration_last.startTimer()
        endH = @_collect_duration.startTimer()

        # called by @_update to evaluate the collector functions
        #@dbg('_collect called')
        for c in @_collectors
            c()
        # linux specific: collecting this process and all its children sys+user times
        # http://man7.org/linux/man-pages/man5/proc.5.html
        fs.readFile path.join('/proc', ''+process.pid, 'stat'), 'utf8', (err, infos) =>
            if err or not CLK_TCK?
                @dbg("_collect err: #{err}")
                return
            # there might be spaces in the process name, hence split after the closing bracket!
            infos = infos[infos.lastIndexOf(')') + 2...].split(' ')
            @_cpu_seconds_total.labels('user')       .set(parseFloat(infos[11]) / CLK_TCK)
            @_cpu_seconds_total.labels('system')     .set(parseFloat(infos[12]) / CLK_TCK)
            # time spent waiting on child processes
            @_cpu_seconds_total.labels('chld_user')  .set(parseFloat(infos[13]) / CLK_TCK)
            @_cpu_seconds_total.labels('chld_system').set(parseFloat(infos[14]) / CLK_TCK)

            # END: the timings for this run.
            endG()
            endH()

metricsRecorder = null
exports.init = (winston, cb) ->
    dbg = (msg) ->
        winston.info("MetricsRecorder: #{msg}")
    metricsRecorder = new MetricsRecorder(dbg, cb)

exports.get = ->
    return metricsRecorder
