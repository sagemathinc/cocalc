#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{Actions, Store, redux, rtypes, computed} = require('./app-framework')
{webapp_client}         = require('./webapp_client')
misc                    = require('smc-util/misc')

history                 = require('./history')
{set_window_title}      = require('./browser')
{get_browser}           = require('./feature')

{alert_message}         = require('./alerts')

{QueryParams} = require('./misc/query-params')
{COCALC_FULLSCREEN, COCALC_MINIMAL} = require('./fullscreen')
init_csi = require("./custom-software/init").init

# Ephemeral websockets mean a browser that kills the websocket whenever
# the page is backgrounded.  So far, it seems that maybe all mobile devices
# do this.  The only impact is we don't show a certain error message for
# such devices.

EPHEMERAL_WEBSOCKETS    = require('./feature').isMobile.any()

require('./app/actions')
require('./app/store')
init_csi()

{parse_target} = require("./history2")

recent_disconnects = []
record_disconnect = () ->
    recent_disconnects.push(+new Date())
    # avoid buffer overflow
    recent_disconnects = recent_disconnects[-100..]

num_recent_disconnects = (minutes=5) ->
    # note the "+", since we work with timestamps
    ago = +misc.minutes_ago(minutes)
    return (x for x in recent_disconnects when x > ago).length

reconnection_warning = null

# heartbeats are used to detect standby's.
# The reason to record more than one is to take rapid re-fireing of the time after resume into account.
heartbeats = []
heartbeat_N = 3
heartbeat_interval_min = 1
heartbeat_interval_ms  = heartbeat_interval_min * 60 * 1000
record_heartbeat = ->
    heartbeats.push(+new Date())
    heartbeats = heartbeats[-heartbeat_N..]
setInterval(record_heartbeat, heartbeat_interval_ms)
# heuristic to detect recent wakeup from standby: second last heartbeat older than (N+1)x the interval
recent_wakeup_from_standby = ->
    (heartbeats.length == heartbeat_N) and (+misc.minutes_ago((heartbeat_N+1) * heartbeat_interval_min) > heartbeats[0])

webapp_client.on "connected", () ->
    redux.getActions('page').set_connection_status('connected', new Date())

DISCONNECTED_STATE_DELAY_MS = 5000

webapp_client.on "disconnected", (state) ->
    record_disconnect()
    date = new Date()
    f = ->
        redux.getActions('page').set_connection_status('disconnected', date)
    if redux.getStore('page').get('connection_status') != 'connected'
        f()
    else
        window.setTimeout(f, DISCONNECTED_STATE_DELAY_MS)
    redux.getActions('page').set_ping(undefined, undefined)

CONNECTING_STATE_DELAY_MS = 3000
webapp_client.on "connecting", () ->
    date = new Date()
    f = ->
        redux.getActions('page').set_connection_status('connecting', date)
    if redux.getStore('page').get('connection_status') != 'connected'
        f()
    else
        window.setTimeout(f, CONNECTING_STATE_DELAY_MS)
    attempt = webapp_client.hub_client.get_num_attempts()
    reconnect = (msg) ->
        # reset recent disconnects, and hope that after the reconnection the situation will be better
        recent_disconnects = []
        reconnection_warning = +new Date()
        console.log("ALERT: connection unstable, notification + attempting to fix it -- #{attempt} attempts and #{num_recent_disconnects()} disconnects")
        if not recent_wakeup_from_standby()
            alert_message(msg)
        webapp_client.hub_client.fix_connection()
        # remove one extra reconnect added by the call above
        setTimeout((-> recent_disconnects.pop()), 500)

    console.log("attempt: #{attempt} and num_recent_disconnects: #{num_recent_disconnects()}")
    # NOTE: On mobile devices the websocket is disconnected every time one backgrounds
    # the application.  This normal and expected behavior, which does not indicate anything
    # bad about the user's actual network connection.  Thus displaying this error in the case
    # of mobile is likely wrong.  (It could also be right, of course.)
    if not EPHEMERAL_WEBSOCKETS and (num_recent_disconnects() >= 2 or (attempt >= 10))
        # this event fires several times, limit displaying the message and calling reconnect() too often
        {SITE_NAME} = require('smc-util/theme')
        SiteName = redux.getStore('customize').site_name ? SITE_NAME
        if (reconnection_warning == null) or (reconnection_warning < (+misc.minutes_ago(1)))
            if num_recent_disconnects() >= 7 or attempt >= 20
                redux.getActions('page').set_connection_quality("bad")
                reconnect
                    type: "error"
                    timeout: 10
                    message: "Your connection is unstable or #{SiteName} is temporarily not available."
            else if attempt >= 10
                redux.getActions('page').set_connection_quality("flaky")
                reconnect
                    type: "info"
                    timeout: 10
                    message: "Your connection could be weak or the #{SiteName} service is temporarily unstable. Proceed with caution."
    else
        reconnection_warning = null
        redux.getActions('page').set_connection_quality("good")

webapp_client.on 'new_version', (ver) ->
    redux.getActions('page').set_new_version(ver)

# enable fullscreen mode upon a URL like /app?fullscreen and additionally kiosk-mode upon /app?fullscreen=kiosk
if COCALC_FULLSCREEN
    if COCALC_FULLSCREEN == 'kiosk'
        redux.getActions('page').set_fullscreen('kiosk')
        # We also check if user is loading a specific project in kiosk mode
        # (which is the only thing they should ever do!), and in that
        # case we record the project_id, so that we can make various
        # query optimizations elsewhere.
        x = parse_target(window.cocalc_target)
        if x.page == 'project' and x.target?
            kiosk_project_id = x.target.slice(0,36)
            if misc.is_valid_uuid_string(kiosk_project_id)
                redux.getActions('page').setState({kiosk_project_id})
    else
        redux.getActions('page').set_fullscreen('default')

# setup for frontend mocha testing.
test_query_value = QueryParams.get('test')
if test_query_value
    # include entryway for running mocha tests.
    redux.getActions('page').setState(test: test_query_value)
    console.log("TESTING mode -- waiting for sign in...")
    webapp_client.once 'signed_in', ->
        console.log("TESTING mode -- waiting for projects to load...")
        redux.getStore('projects').wait
            until : (store) -> store.get('project_map')
            cb    : ->
                console.log("TESTING mode -- projects loaded; now loading and running tests...")
                require('test-mocha/setup').mocha_run(test_query_value)

# configure the session
# This makes it so the default session is 'default' and there is no
# way to NOT have a session, except via session=, which is treated
# as "no session" (also no session for kiosk mode).
session = QueryParams.get('session') ? 'default'
if COCALC_FULLSCREEN == 'kiosk' or test_query_value
    # never have a session in kiosk mode, since you can't access the other files.
    session = ''

redux.getActions('page').set_session(session)

get_api_key_query_value = QueryParams.get('get_api_key')
if get_api_key_query_value
    redux.getActions('page').set_get_api_key(get_api_key_query_value)
    redux.getActions('page').set_fullscreen('default')
