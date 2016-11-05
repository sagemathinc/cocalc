###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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

# This is a small helper class to record real-time metrics about the hub.
# It is designed for the hub, such that a local process can easily check its health.
# optionally, it stores the metrics to a status file -- TODO: also push this to the DB
# usage: after init, publish key/value pairs which are then going to be reported

fs         = require('fs')
underscore = require('underscore')
misc       = require('smc-util/misc')


# some constants
FREQ_s     = 10   # write stats every FREQ seconds
DELAY_s    = 5    # with an initial delay of DELAY seconds
DISC_LEN   = 10   # length of queue for recording discrete values
MAX_BUFFER = 1000 # max. size of buffered values, which are cleared in the @_update step


# exponential smoothing, based on linux's load 1-exp(-1) smoothing
# with compensation for sampling time FREQ_s
d = 1 - Math.pow(Math.exp(-1), FREQ_s / 60)
DECAY = [d, Math.pow(d, 5), Math.pow(d, 15)]


# there is more than just continuous values
# cont: continuous (like number of changefeeds), will be smoothed
#       disc: discrete, like blocked, will be recorded with timestamp
#             in a queue of length DISC_LEN
exports.TYPE = TYPE =
    LAST : 'latest'     # only the most recent value is recorded
    DISC : 'discrete'   # timeseries of length DISC_LEN
    CONT : 'continuous' # continuous with exponential decay
    MAX  : 'contmax'    # like CONT, reduces buffer to max value
    SUM  : 'contsum'    # like CONT, reduces buffer to sum of values divided by FREQ_s


class exports.MetricsRecorder
    constructor: (@filename, @dbg, @collect, cb) ->
        ###
        * @filename: if set, periodically saved there. otherwise use @get.
        * @collect: call this function on every _update
        * @dbg: e.g. reporting via winston or whatever
        ###
        # stores the current state of the statistics
        @_stats = {}
        @_types = {} # key → TYPE.T mapping

        # the full statistic
        @_data  = {}

        # start of periodically calling publish/update
        setTimeout((=> setInterval(@_publish, FREQ_s * 1000)), DELAY_s * 1000)
        # record start time (as string!)
        @record("start", new Date(), TYPE.LAST)

        # initialization finished
        cb?()

    get: =>
        return misc.deep_copy(@_data)

    # every FREQ_s the _data dict is being updated
    # e.g current value, exp decay, later on also "intelligent" min/max, etc.
    _update: ->
        @collect?()

        smooth = (new_value, arr) ->
            arr ?= []
            arr[0] = new_value
            # compute smoothed value sval for each decay param
            for d, idx in DECAY
                sval = arr[idx + 1] ? new_value
                sval = d * new_value + (1-d) * sval
                arr[idx + 1] = sval
            return arr

        for key, values of @_stats
            # if no new value is available, we have to create one for smoothing
            if not values?.length > 0
                # fallback to last, unless discrete
                if @_types[key] != TYPE.DISC
                    [..., value] = @_data[key]
                    # in case _data[key] is empty, abort
                    if not value?
                        continue
                    # sum is special case, because of sum/FREQ_s below
                    if @_types[key] == TYPE.SUM
                        value *= FREQ_s
                    # one-element array
                    values = [value]
                else
                    values = []

            # computing the updated value for the @_data entries
            switch @_types[key]
                when TYPE.MAX
                    @_data[key] = smooth(values[0], @_data[key])

                when TYPE.CONT
                    # compute the average value (TODO median?)
                    sum = underscore.reduce(values, ((a, b) -> a+b), 0)
                    avg = sum / values.length
                    @_data[key] = smooth(avg, @_data[key])

                when TYPE.SUM
                    # compute the cumulative sum per second (e.g. database modifications)
                    sum = underscore.reduce(values, ((a, b) -> a+b), 0)
                    sum /= FREQ_s # to get a per 1s value!
                    @_data[key] = smooth(sum, @_data[key])

                when TYPE.DISC
                    # this is a pair [timestamp, discrete value], appended to the data queue
                    queue = @_data[key] ? []
                    @_data[key] = [queue..., values...][-DISC_LEN..]

                when TYPE.LAST
                    if values?.length > 0
                        # ... just store the most recent one
                        @_data[key] = values[0]

            # we've consumed the value(s), reset them
            @_stats[key] = []

    # the periodically called publication step
    _publish: (cb) =>
        @record("timestamp", new Date(), TYPE.LAST)
        # also record system metrics like cpu, memory, ... ?
        @_update()
        # only if we have a @filename, save it there
        if @filename?
            json = JSON.stringify(@_data, null, 2)
            fs.writeFile(@filename, json, cb?())

    record: (key, value, type = TYPE.CONT) =>
        # store in @_stats a key → bounded array
        if (@_types[key] ? type) != type
            @dbg("WARNING: you are switching types from #{@_types[key]} to #{type} -- IGNORED")
            return
        @_types[key] = type
        switch type
            when TYPE.LAST
                @_stats[key] = [value]
            when TYPE.CONT, TYPE.SUM
                arr = @_stats[key] ? []
                @_stats[key] = [arr..., value]
            when TYPE.MAX
                current = @_stats[key] ? Number.NEGATIVE_INFINITY
                @_stats[key] = [Math.max(value, current)]
            when TYPE.DISC
                ts = (new Date()).toISOString()
                arr = @_stats[key] ? []
                @_stats[key] = [arr..., [ts, value]]
            else
                @dbg?('hub/record_stats: unknown or undefined type #{type}')
        # avoid overflows
        @_stats[key] = @_stats[key][-MAX_BUFFER..]