{Actions, Store, redux, rtypes, computed} = require('./smc-react')
{salvus_client}         = require('./salvus_client')
misc                    = require('smc-util/misc')

{set_url}               = require('./history')
{set_window_title}      = require('./browser')

{alert_message}         = require('./alerts')

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
    set_active_key_handler: (handler) =>
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

    set_active_tab: (key) =>
        @setState(active_top_tab : key)
        switch key
            when 'projects'
                set_url('/projects')
                set_window_title('Projects')
            when 'account'
                redux.getActions('account').push_state()
                set_window_title('Account')
            when 'about'
                set_url('/help')
                set_window_title('Help')
            when undefined
                return
            else
                redux.getProjectActions(key)?.push_state()
                set_window_title("Loading Project")
                redux.getStore('projects').wait
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
        if val != 'connecting' or time - (redux.getStore('page').get('last_status_time') ? 0) > 0
            @setState(connection_status : val, last_status_time : time)

    set_new_version: (version) =>
        @setState(new_version : version)

    set_fullscreen: (val) =>
        @setState(fullscreen : val)

    show_cookie_warning: =>
        @setState(cookie_warning : true)

    show_local_storage_warning: =>
        @setState(local_storage_warning : true)

    check_unload: (e) =>
        if redux.getStore('account')?.get_confirm_close()
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

redux.createActions('page', PageActions)

# redux.createStore('page', active_top_tab:'account')

# FUTURE: Save entire state to database for #450, saved workspaces
redux.createStore
    name: 'page'

    getInitialState: ->
        active_top_tab        : 'account'

    stateTypes:
        active_top_tab        : rtypes.string    # key of the active tab
        show_connection       : rtypes.bool
        ping                  : rtypes.number
        avgping               : rtypes.number
        connection_status     : rtypes.string
        new_version           : rtypes.object
        fullscreen            : rtypes.bool
        cookie_warning        : rtypes.bool
        local_storage_warning : rtypes.bool
        show_file_use         : rtypes.bool
        num_ghost_tabs        : rtypes.number

recent_disconnects = []
record_disconnect = () ->
    recent_disconnects.push(+new Date())
    # avoid buffer overflow
    recent_disconnects = recent_disconnects[-100..]

num_recent_disconnects = (minutes=10) ->
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

salvus_client.on "ping", (ping_time) ->
    ping_time_smooth = redux.getStore('page').get('avgping') ? ping_time
    # reset outside 3x
    if ping_time > 3 * ping_time_smooth or ping_time_smooth > 3 * ping_time
        ping_time_smooth = ping_time
    else
        decay = 1 - Math.exp(-1)
        ping_time_smooth = decay * ping_time_smooth + (1-decay) * ping_time
    redux.getActions('page').set_ping(ping_time, Math.round(ping_time_smooth))

salvus_client.on "connected", () ->
    redux.getActions('page').set_connection_status('connected', new Date())

salvus_client.on "disconnected", (state) ->
    record_disconnect()
    redux.getActions('page').set_connection_status('disconnected', new Date())
    redux.getActions('page').set_ping(undefined, undefined)

salvus_client.on "connecting", () ->
    date = new Date()
    f = ->
        redux.getActions('page').set_connection_status('connecting', date)
    window.setTimeout(f, 2000)
    attempt = salvus_client._num_attempts ? 1
    reconnect = (msg) ->
        # reset recent disconnects, and hope that after the reconnection the situation will be better
        recent_disconnects = []
        reconnection_warning = +new Date()
        console.log("ALERT: connection unstable, notification + attempting to fix it -- #{attempt} attempts and #{num_recent_disconnects()} disconnects")
        if not recent_wakeup_from_standby()
            alert_message(msg)
        salvus_client._fix_connection(true)
        # remove one extra reconnect added by the call above
        setTimeout((-> recent_disconnects.pop()), 500)

    console.log "attempt: #{attempt} and num_recent_disconnects: #{num_recent_disconnects()}"
    if num_recent_disconnects() >= 2 or (attempt >= 10)
        # this event fires several times, limit displaying the message and calling reconnect() too often
        if (reconnection_warning == null) or (reconnection_warning < (+misc.minutes_ago(1)))
            if num_recent_disconnects() >= 5 or attempt >= 20
                reconnect
                    type: "error"
                    timeout: 10
                    message: "Your connection is unstable or SMC is temporarily not available."
            else if attempt >= 10
                reconnect
                    type: "info"
                    timeout: 10
                    message: "Your connection could be weak or the SMC service is temporarily unstable. Proceed with caution."
    else
        reconnection_warning = null

salvus_client.on 'new_version', (ver) ->
    redux.getActions('page').set_new_version(ver)
