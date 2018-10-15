##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
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

{Actions, Store, redux, rtypes, computed} = require('./app-framework')
{webapp_client}         = require('./webapp_client')
misc                    = require('smc-util/misc')

history                 = require('./history')
{set_window_title}      = require('./browser')

{alert_message}         = require('./alerts')

# Ephemeral websockets mean a browser that kills the websocket whenever
# the page is backgrounded.  So far, it seems that maybe all mobile devices
# do this.  The only impact is we don't show a certain error message for
# such devices.

EPHEMERAL_WEBSOCKETS    = require('./feature').isMobile.any()

###
# Page Redux
###

class PageActions extends Actions
    # Expects a func which takes a browser keydown event
    # Only allows one keyhandler to be active at a time.
    # FUTURE: Develop more general way to make key mappings for editors
    # HACK: __suppress_key_handlers is for file_use. See FUTURE above.
    #       Adding even a single suppressor leads to spaghetti code.
    #       Don't do it. -- J3

    # ws: added logic with project_id/path so that
    # only the currently focused editor can set/unset
    # the keyboard handler -- see https://github.com/sagemathinc/cocalc/issues/2826
    # This feels a bit brittle though, but obviously something like this is needed,
    # due to slightly async calls to set_active_key_handler, and expecting editors
    # to do this is silly.
    set_active_key_handler: (handler, project_id, path) =>
        if project_id?
            if @redux.getStore('page').get('active_top_tab') != project_id or \
               @redux.getProjectStore(project_id)?.get('active_project_tab') != 'editor-' + path
                return

        if handler?
            $(window).off("keydown", @active_key_handler)
            @active_key_handler = handler

        if @active_key_handler? and not @__suppress_key_handlers
            $(window).on("keydown", @active_key_handler)

    # Only clears it from the window
    unattach_active_key_handler: =>
        $(window).off("keydown", @active_key_handler)

    # Actually removes the handler from active memory
    # takes a handler to only remove if it's the active one
    erase_active_key_handler: (handler) =>
        if not handler? or handler == @active_key_handler
            $(window).off("keydown", @active_key_handler)
            @active_key_handler = undefined

    # FUTURE: Will also clear all click handlers.
    # Right now there aren't even any ways (other than manually)
    # of adding click handlers that the app knows about.
    clear_all_handlers: =>
        $(window).off("keydown", @active_key_handler)
        @active_key_handler = undefined

    add_a_ghost_tab: () =>
        current_num = redux.getStore('page').get('num_ghost_tabs')
        @setState(num_ghost_tabs : current_num + 1)

    clear_ghost_tabs: =>
        @setState(num_ghost_tabs : 0)

    close_project_tab: (project_id) =>

        page_store = redux.getStore('page')
        projects_store = redux.getStore('projects')

        open_projects = projects_store.get('open_projects')
        active_top_tab = page_store.get('active_top_tab')

        index = open_projects.indexOf(project_id)
        if index == -1
            return

        @_session_manager?.close_project(project_id)  # remembers what files are open

        size = open_projects.size
        if project_id == active_top_tab
            if index == -1 or size <= 1
                next_active_tab = 'projects'
            else if index == size - 1
                next_active_tab = open_projects.get(index - 1)
            else
                next_active_tab = open_projects.get(index + 1)
            @set_active_tab(next_active_tab)

        # The point of these "ghost tabs" is to make it so you can quickly close several
        # open tabs, like in Chrome.
        if index == size - 1
            @clear_ghost_tabs()
        else
            @add_a_ghost_tab()

        # TODO: The functionality below should perhaps here and not in the projects actions (?).
        redux.getActions('projects').set_project_closed(project_id)
        @save_session()

        # if there happens to be a websocket to this project, get rid of it.  Nothing will be using it when the project is closed.
        require('./project/websocket/connect').disconnect_from_project(project_id)

    set_active_tab: (key, change_history=true) =>
        @setState(active_top_tab : key)
        switch key
            when 'projects'
                if change_history
                    history.set_url('/projects')
                set_window_title('Projects')
            when 'account'
                if change_history
                    redux.getActions('account').push_state()
                set_window_title('Account')
            when 'about'
                if change_history
                    history.set_url('/help')
                set_window_title('Help')
            when 'file-use'
                if change_history
                    history.set_url('/file-use')
                set_window_title('File Usage')
            when 'admin'
                if change_history
                    history.set_url('/admin')
                set_window_title('Admin')
            when undefined
                return
            else
                if change_history
                    redux.getProjectActions(key)?.push_state()
                set_window_title("Loading Project")
                projects_store = redux.getStore('projects')

                if projects_store.date_when_course_payment_required(key)
                    redux.getActions('projects').apply_default_upgrades(project_id : key)

                projects_store.wait
                    until   : (store) =>
                        title = store.getIn(['project_map', key, 'title'])
                        title ?= store.getIn(['public_project_titles', key])
                        if title == ""
                            return "Untitled Project"
                        if not title?
                            redux.getActions('projects').fetch_public_project_title(key)
                        return title
                    timeout : 15
                    cb      : (err, title) => set_window_title(title ? "")

    show_connection: (shown) =>
        @setState(show_connection : shown)

    # Toggles visibility of file use widget
    # Temporarily disables window key handlers until closed
    # FUTURE: Develop more general way to make key mappings
    toggle_show_file_use: =>
        currently_shown = redux.getStore('page').get('show_file_use')
        if currently_shown
            # Enable whatever the current key handler should be
            @__suppress_key_handlers = false # HACK: Terrible way to do this.
            @set_active_key_handler()
        else
            # Suppress the activation of any new key handlers until file_use closes
            @__suppress_key_handlers = true
            @unattach_active_key_handler()

        @setState(show_file_use: !currently_shown)

    set_ping: (ping, avgping) =>
        @setState(ping : ping, avgping : avgping)

    set_connection_status: (val, time) =>
        if time > (redux.getStore('page').get('last_status_time') ? 0)
            @setState(connection_status : val, last_status_time : time)

    set_new_version: (version) =>
        @setState(new_version : version)

    set_fullscreen: (val) =>
        # if kiosk is ever set, disable toggling back
        if redux.getStore('page').get('fullscreen') == 'kiosk'
            return
        @setState(fullscreen : val)
        history.update_params()

    set_get_api_key: (val) =>
        @setState(get_api_key: val)
        history.update_params()

    toggle_fullscreen: =>
        @set_fullscreen(if redux.getStore('page').get('fullscreen')? then undefined else 'default')

    set_session: (val) =>
        # If existing different session, close it.
        if val != redux.getStore('page')?.get('session')
            @_session_manager?.close()
            delete @_session_manager

        # Save state and update URL.
        @setState(session : val)
        history.update_params()

        # Make new session manager if necessary
        if val
            @_session_manager ?= require('./session').session_manager(val, redux)

    save_session: =>
        @_session_manager?.save()

    restore_session: (project_id) =>
        @_session_manager?.restore(project_id)

    show_cookie_warning: =>
        @setState(cookie_warning : true)

    show_local_storage_warning: =>
        @setState(local_storage_warning : true)

    check_unload: (e) =>
        # Returns a defined string if the user should confirm exiting the site.
        s = redux.getStore('account')
        if s?.get_user_type() == 'signed_in' and s?.get_confirm_close()
            return "Changes you make may not have been saved."
        else
            return

    set_sign_in_func: (func) =>
        @sign_in = func

    remove_sign_in_func: =>
        @sign_in = => false

    # Expected to be overridden by functions above
    sign_in: =>
        false

redux.createStore('page', {active_top_tab: 'account'})
redux.createActions('page', PageActions)
###
    name: 'page'

    getInitialState: ->
        console.log "Setting initial state in page"
        active_top_tab        : 'account'

    stateTypes:
        active_top_tab        : rtypes.string    # key of the active tab
        show_connection       : rtypes.bool
        ping                  : rtypes.number
        avgping               : rtypes.number
        connection_status     : rtypes.string
        new_version           : rtypes.immutable.Map
        fullscreen            : rtypes.oneOf(['default', 'kiosk'])
        test                  : rtypes.string  # test query in the URL
        cookie_warning        : rtypes.bool
        local_storage_warning : rtypes.bool
        show_file_use         : rtypes.bool
        num_ghost_tabs        : rtypes.number
        session               : rtypes.string # session query in the URL
        last_status_time      : rtypes.string
        get_api_key           : rtypes.string
###
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

# exporting this test. maybe somewhere else useful, too...
exports.recent_wakeup_from_standby = recent_wakeup_from_standby

if DEBUG
    window.smc ?= {}
    window.smc.init_app =
        recent_wakeup_from_standby : recent_wakeup_from_standby
        num_recent_disconnects     : num_recent_disconnects

prom_client = require('./prom-client')
if prom_client.enabled
    prom_ping_time = prom_client.new_histogram('ping_ms', 'ping time',
         {buckets : [50, 100, 150, 200, 300, 500, 1000, 2000, 5000]})
    prom_ping_time_last = prom_client.new_gauge('ping_last_ms', 'last reported ping time')

webapp_client.on "ping", (ping_time) ->
    ping_time_smooth = redux.getStore('page').get('avgping') ? ping_time
    # reset outside 3x
    if ping_time > 3 * ping_time_smooth or ping_time_smooth > 3 * ping_time
        ping_time_smooth = ping_time
    else
        decay = 1 - Math.exp(-1)
        ping_time_smooth = decay * ping_time_smooth + (1-decay) * ping_time
    redux.getActions('page').set_ping(ping_time, Math.round(ping_time_smooth))

    if prom_client.enabled
        prom_ping_time.observe(ping_time)
        prom_ping_time_last.set(ping_time)

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
    attempt = webapp_client._num_attempts ? 1
    reconnect = (msg) ->
        # reset recent disconnects, and hope that after the reconnection the situation will be better
        recent_disconnects = []
        reconnection_warning = +new Date()
        console.log("ALERT: connection unstable, notification + attempting to fix it -- #{attempt} attempts and #{num_recent_disconnects()} disconnects")
        if not recent_wakeup_from_standby()
            alert_message(msg)
        webapp_client._fix_connection(true)
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
                reconnect
                    type: "error"
                    timeout: 10
                    message: "Your connection is unstable or #{SiteName} is temporarily not available."
            else if attempt >= 10
                reconnect
                    type: "info"
                    timeout: 10
                    message: "Your connection could be weak or the #{SiteName} service is temporarily unstable. Proceed with caution."
    else
        reconnection_warning = null

webapp_client.on 'new_version', (ver) ->
    redux.getActions('page').set_new_version(ver)

# enable fullscreen mode upon a URL like /app?fullscreen and additionally kiosk-mode upon /app?fullscreen=kiosk
misc_page = require('./misc_page')
fullscreen_query_value = misc_page.get_query_param('fullscreen')
if fullscreen_query_value
    if fullscreen_query_value == 'kiosk'
        redux.getActions('page').set_fullscreen('kiosk')
    else
        redux.getActions('page').set_fullscreen('default')

# setup for frontend mocha testing.
test_query_value = misc_page.get_query_param('test')
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
session = misc_page.get_query_param('session') ? 'default'
if fullscreen_query_value == 'kiosk' or test_query_value
    # never have a session in kiosk mode, since you can't access the other files.
    session = ''

redux.getActions('page').set_session(session)

get_api_key_query_value = misc_page.get_query_param('get_api_key')
if get_api_key_query_value
    redux.getActions('page').set_get_api_key(get_api_key_query_value)
    redux.getActions('page').set_fullscreen('kiosk')
