#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

underscore = require('underscore')
misc       = require('smc-util/misc')

# NOTE: react has its own profiling tools, which we are not using below https://reactjs.org/docs/perf.html

exports.react_debug_trace = (react_component, mintime_s = 0.01) ->
    renderings      = []
    time_window_ms  = 10 * 1000 # we take the last ~10 seconds into account
    rclass = (x) ->
        x._render = x.render
        x.render = () ->
            # measure time in ms
            t0 = performance.now()
            r  = @_render()
            t1 = performance.now()
            dt = t1 - t0
            renderings.push([t0, dt])
            # don't output info about very short render events
            return r if dt < mintime_s

            # … and only keep what's in the time_window
            while renderings.length > 1
                if renderings[0][0] < t1 - time_window_ms
                    renderings.shift()
                else
                    break

            # and adjust the minute interval to the actual interval
            t_start  = renderings[0][0]
            timespan = (t1 - t_start)
            rate     = renderings.length / (timespan / 1000)
            # … and what percentage of that time was this?
            pct      = renderings.reduce(((x, y) -> x + y[1]), 0) / timespan
            # finally, add additional info to know what this rendering was all about
            props    = underscore.object([k, v] for k, v of (@props ? {}) when v? and (k not in ['children', 'redux', 'actions']))
            state    = underscore.object([k, v] for k, v of (@state ? {}) when v?)
            timeinfo = "[took #{misc.round2(dt)}secs, #{misc.round2(rate)} renderings/minute, #{misc.round2(100 * pct)}% time spent]"
            console.log(x.displayName, timeinfo, '\nprops:', props, '\nstate:', state)
            return r
        return react_component(x)
    return rclass