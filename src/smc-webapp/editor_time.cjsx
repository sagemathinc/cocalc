###
Time

Right now this is the simplest possible imaginable stopwatch, with state synchronized properly.

This is also probably a good relatiely simple example of a React-based SMC editor that
uses persistent shared state.

Later, maybe:

 - Make the editor title tab display the current time
 - Make TimeTravel rendering work (so easy undo in case accidentally hit stop)
 - Labels/description, which is full markdown, hence can have links
 - Ability to set a specific time
 - Initialize this will just be a simple stopwatch, synchronized between viewers.
 - Maybe a bunch of stopwatches and countdown timers, with labels, markdown links, etc.;  draggable.
 - Later yet, it may hook into what other activities are going on in a project, to auto stop/start, etc.
 - Time tracking
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store, redux_name}  = require('./smc-react')

{Icon, Loading, SetIntervalMixin} = require('./r_misc')

{Button, ButtonGroup, Well} = require('react-bootstrap')

{webapp_client} = require('./webapp_client')
{alert_message} = require('./alerts')

misc = require('smc-util/misc')
{defaults, required} = misc

###
The React components
###

EditorTime = rclass ({name}) ->
    propTypes :
        error      : rtypes.string
        actions    : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            timers : rtypes.immutable.List
            error  : rtypes.string

    render_stopwatches: ->
        if not @props.timers?
            return
        v = []
        click_button = @click_button
        @props.timers.map (data) =>
            v.push <Stopwatch
                    key          = {data.get('id')}
                    label        = {data.get('label')}
                    total        = {data.get('total')}
                    state        = {data.get('state')}
                    time         = {data.get('time')}
                    click_button = {(button) -> click_button(data.get('id'), button)} />
            return
        return v

    click_button: (id, button) ->
        switch button
            when 'stop'
                @props.actions.stop_stopwatch(id)
            when 'start'
                @props.actions.start_stopwatch(id)
            when 'pause'
                @props.actions.pause_stopwatch(id)
            else
                console.warn("unknown button '#{button}'")

    render: ->
        if @props.error?
            return @render_error()
        else if @props.timers? and @props.timers.size > 0
            <div style={margin:'15px'}>
                {@render_stopwatches()}
            </div>
        else
            <Loading/>

Stopwatch = rclass
    propTypes:
        label        : rtypes.string.isRequired  # a text label
        total        : rtypes.number.isRequired  # total time accumulated before entering current state
        state        : rtypes.string.isRequired  # 'paused' or 'running' or 'stopped'
        time         : rtypes.object.isRequired  # when entered this state
        click_button : rtypes.func.isRequired

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval((=> @forceUpdate()), 1000)

    render_start_button: ->
        <Button bsStyle='primary' onClick={=>@props.click_button('start')} style={width:'8em'}>
            <Icon name='play'/> Start
        </Button>

    render_stop_button: ->
        <Button bsStyle='warning' onClick={=>@props.click_button('stop')}>
            <Icon name='stop'/> Stop
        </Button>

    render_pause_button: ->
        <Button bsStyle='info' onClick={=>@props.click_button('pause')} style={width:'8em'}>
            <Icon name='pause'/> Pause
        </Button>

    render_time: ->
        switch @props.state
            when 'stopped'
                amount = 0
            when 'paused'
                amount = @props.total
            when 'running'
                amount = @props.total + (webapp_client.server_time() - @props.time)
            else
                return <div>Invalid state {@props.state}</div>

        return <TimeAmount amount={amount} />

    render_buttons: ->
        switch @props.state
            when 'stopped'
                @render_start_button()
            when 'paused'
                <ButtonGroup>
                    {@render_start_button()}
                    {@render_stop_button()}
                </ButtonGroup>
            when 'running'
                <ButtonGroup>
                    {@render_pause_button()}
                    {@render_stop_button()}
                </ButtonGroup>

    render: ->
        <Well>
            {@render_time()}
            {@render_buttons()}
        </Well>

zpad = (n) ->
    n = "#{n}"
    if n.length == 1
        n = "0" + n
    return n

TimeAmount = rclass
    propTypes :
        amount : rtypes.number.isRequired

    render : ->
        t = Math.round(@props.amount / 1000)
        hours = Math.floor(t/3600)
        t -= 3600*hours
        minutes = Math.floor(t/60)
        t -= 60*minutes
        seconds = t
        <div style={fontSize:'50pt', fontFamily:'courier'}>
            {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
        </div>

###
The actions -- what you can do with a timer, and also the
underlying synchronized state.
###

class TimeActions extends Actions

    _init: () =>
        # window.t = @  # for debugging
        # be explicit about exactly what state is in the store
        @setState
            timers : undefined

    init_error: (err) =>
        @setState
            error : err

    _syncdb_change: =>
        @setState
            timers : @syncdb.get()

        if @syncdb.count() == 0
            @add_stopwatch()

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk

    add_stopwatch: =>
        id = 1
        while @syncdb.get_one(id:id)?
            id += 1
        @_set
            id     : id
            label  : ''
            total  : 0
            state  : 'stopped'  # 'paused', 'running', 'stopped'
            time   : webapp_client.server_time() - 0

    stop_stopwatch: (id) =>
        @_set
            id    : id
            total : 0
            state : 'stopped'
            time  : webapp_client.server_time() - 0

    start_stopwatch: (id) =>
        @_set
            id    : id
            time  : webapp_client.server_time() - 0
            state : 'running'

    pause_stopwatch: (id) =>
        x = @syncdb.get_one(id:id)
        if not x?
            # stopwatch was deleted
            return
        @_set
            id    : id
            time  : webapp_client.server_time() - 0
            total : x.get('total') + (webapp_client.server_time() - x.get('time'))
            state : 'paused'



###
Register this editor with SMC
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
###

require('./project_file').register_file_editor
    ext       : ['time']

    is_public : false

    icon      : 'clock-o'

    component : EditorTime

    init      : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        if redux.getActions(name)?
            return name  # already initialized

        actions = redux.createActions(name, TimeActions)
        store   = redux.createStore(name)

        actions._init()

        syncdb = webapp_client.sync_db
            project_id   : project_id
            path         : path
            primary_keys : ['id']
            string_cols  : ['label']
        actions.syncdb = syncdb
        actions.store  = store
        syncdb.once 'init', (err) =>
            if err
                mesg = "Error opening '#{path}' -- #{err}"
                console.warn(mesg)
                alert_message(type:"error", message:mesg)
                return
            actions._syncdb_change()
            syncdb.on('change', actions._syncdb_change)
        return name

    remove    : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        actions = redux.getActions(name)
        actions?.syncdb?.close()
        store = redux.getStore(name)
        if not store?
            return
        delete store.state
        # It is *critical* to first unmount the store, then the actions,
        # or there will be a huge memory leak.
        redux.removeStore(name)
        redux.removeActions(name)
        return name
