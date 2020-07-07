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

get_api_key_query_value = QueryParams.get('get_api_key')
if get_api_key_query_value
    redux.getActions('page').set_get_api_key(get_api_key_query_value)
    redux.getActions('page').set_fullscreen('default')




# configure the session
# This makes it so the default session is 'default' and there is no
# way to NOT have a session, except via session=, which is treated
# as "no session" (also no session for kiosk mode).
session = QueryParams.get('session') ? 'default'
if COCALC_FULLSCREEN == 'kiosk' or test_query_value
    # never have a session in kiosk mode, since you can't access the other files.
    session = ''

redux.getActions('page').set_session(session)
