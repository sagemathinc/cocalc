{Actions, Store, redux} = require('./smc-react')
{salvus_client} = require('./salvus_client')
misc = require('smc-util/misc')

{set_url} = require('./history')
{set_window_title} = require('./browser')
###
# Page Redux
###

class PageActions extends Actions
    # Expects a func which takes a browser keydown event
    # Only allows one keyhandler to be active at a time.
    set_active_key_handler : (handler) =>
        if handler?
            $(window).off("keydown", @active_key_handler)
            @active_key_handler = handler

        if @active_key_handler?
            $(window).on("keydown", @active_key_handler)

    clear_active_key_handler : =>
        $(window).off("keydown", @active_key_handler)

    clear_all_handlers : =>
        $(window).off("keydown", @active_key_handler)

    add_a_ghost_tab : () =>
        current_num = redux.getStore('page').get('num_ghost_tabs')
        @setState(num_ghost_tabs : current_num + 1)

    clear_ghost_tabs : =>
        @setState(num_ghost_tabs : 0)

    close_project_tab : (project_id) =>
        page_store = redux.getStore('page')
        projects_store = redux.getStore('projects')

        open_projects = projects_store.get('open_projects')
        active_top_tab = page_store.get('active_top_tab')

        index = open_projects.indexOf(project_id)
        size = open_projects.size
        if project_id == active_top_tab
            next_active_tab = 'projects'
            if index == -1 or size <= 1
                next_active_tab = 'projects'
            else if index == size - 1
                next_active_tab = open_projects.get(index - 1)
            else
                next_active_tab = open_projects.get(index + 1)
            @set_active_tab(next_active_tab)
        if index == size - 1
            @clear_ghost_tabs()
        else
            @add_a_ghost_tab()
        # SMELL probably should be in here and not projects
        redux.getActions('projects').set_project_closed(project_id)

    set_active_tab : (key) =>
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
                project_map = redux.getStore('projects').get('project_map')
                set_window_title(project_map?.getIn([key, 'title']))

    show_connection : (shown) =>
        @setState(show_connection : shown)

    toggle_show_file_use : =>
        is_shown = redux.getStore('page').get('show_file_use')
        if is_shown
            @set_active_key_handler(undefined)
        else
            @clear_active_key_handler()

        @setState(show_file_use: !is_shown)

    set_ping : (ping, avgping) =>
        @setState(ping : ping, avgping : avgping)

    set_connection_status : (val, time) =>
        if val != 'connecting' or time - (redux.getStore('page').get('last_status_time') ? 0) > 0
            @setState(connection_status : val, last_status_time : time)

    set_new_version : (version) =>
        @setState(new_version : version)

    set_fullscreen : (val) =>
        @setState(fullscreen : val)

    show_cookie_warning : =>
        @setState(cookie_warning : true)

redux.createActions('page', PageActions)

# FUTURE: Save entire state to database for #450, saved workspaces
class PageStore extends Store
    todo : ->
        'place holder'

init_store =
    active_top_tab : 'account' # One of: projects, account, about, [project id]

redux.createStore('page', PageStore, init_store)

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

salvus_client.on "ping", (ping_time) ->
    ping_time_smooth = redux.getStore('page').get('avgping') ? ping_time
    # reset outside 3x
    if ping_time > 3 * ping_time_smooth or ping_time_smooth > 3 * ping_time
        ping_time_smooth = ping_time
    else
        decay = 1 - Math.exp(-1)
        ping_time_smooth = decay * ping_time_smooth + (1-decay) * ping_time
    redux.getActions('page').set_ping(ping_time, ping_time_smooth)

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
                    message: "Your internet connection is unstable/down or SMC is temporarily not available. Therefore SMC is not working."
            else if attempt >= 10
                reconnect
                    type: "info"
                    timeout: 10
                    message: "Your internet connection could be weak or the SMC service is temporarily unstable. Proceed with caution."
    else
        reconnection_warning = null

salvus_client.on 'new_version', (ver) ->
    redux.getActions('page').set_new_version(ver)
