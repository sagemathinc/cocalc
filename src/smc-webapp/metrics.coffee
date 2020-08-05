#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

"""
Reporting of time-consuming events to the backend so we can improve
the usability of CoCalc.
"""

misc = require('smc-util/misc')
{webapp_client} = require('./webapp-client')

# Only report events that take at least this long
THRESH_S = 3

events = {}

send_queue = []

exports.start = (event) ->
    id = misc.uuid()
    events[id] = {start:new Date(), event:event}
    return id

exports.stop = (id, err) ->
    if not events[id]
        return
    x =
        time  : new Date() - events[id].start
        event : events[id].event
    delete events[id]
    console.log('stop', x)
    if x.time >= THRESH_S*1000
        console.log('will report to backend...')
        send_queue.push(x)
    else
        console.log("too quick; not reporting")

send_queued_events = ->
    console.log('checking for queued events')
    if send_queue.length == 0
        console.log("no queued events")
        return
    console.log("sending queue of #{send_queue.length} messages...")
    send_queue = []

setInterval(send_queued_events, 60*1000)

