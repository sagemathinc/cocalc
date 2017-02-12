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

{synchronized_db} = require('./syncdb')

{salvus_client} = require('./salvus_client')

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
            timers : rtypes.immutable.Map
            error  : rtypes.string

    render_stopwatches: ->
        if not @props.timers?
            return
        v = []
        click_button = @click_button
        @props.timers.map (data, id) =>
            v.push <Stopwatch
                    key          = {id}
                    label        = {data.get('label')}
                    total        = {data.get('total')}
                    state        = {data.get('state')}
                    time         = {data.get('time')}
                    click_button = {(button) -> click_button(id, button)} />
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
        else if @props.timers?
            <Well style={margin:'15px'}>
                {@render_stopwatches()}
            </Well>
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
                amount = @props.total + (salvus_client.server_time() - @props.time)
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
        <div>
            {@render_time()}
            {@render_buttons()}
        </div>

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
        window.t = @  # for debugging
        # be explicit about exactly what state is in the store
        @setState
            timers : undefined

    init_error: (err) =>
        @setState
            error : err

    # Initialize the state of the store from the contents of the syncdb.
    init_from_syncdb: =>
        v = {}
        for x in @syncdb.select()
            if x.corrupt?
                console.warn('corrupt timer: ', x)
                continue
            v[x.id] = x

        @setState
            timers : immutable.fromJS(v)

        @syncdb.on('change', @_syncdb_change)

        if misc.len(v) == 0
            @add_stopwatch()

    _syncdb_change: (changes) =>
        w = v = @store.get('timers')
        if not w?
            return
        for x in changes
            if x.remove?
                w = w.delete(x.remove.id)
            if x.insert?
                w = w.set(x.insert.id, immutable.fromJS(x.insert))
        if w != v
            @setState(timers : w)

    add_stopwatch: =>
        @syncdb.update
            set :
                label  : ''
                total  : 0
                state  : 'stopped'  # 'paused', 'running', 'stopped'
                time   : salvus_client.server_time()
            where :
                id : '0'
        @syncdb.save()

    stop_stopwatch: (id) =>
        @syncdb.update
            set :
                total : 0
                state : 'stopped'
                time  : salvus_client.server_time()
            where :
                id : id
        @syncdb.save()

    start_stopwatch: (id) =>
        @syncdb.update
            set :
                time  : salvus_client.server_time()
                state : 'running'
            where :
                id : id
        @syncdb.save()

    pause_stopwatch: (id) =>
        x = @store.get('timers').get(id)
        @syncdb.update
            set :
                time  : salvus_client.server_time()
                total : x.get('total') + (salvus_client.server_time() - x.get('time'))
                state : 'paused'
            where :
                id : id
        @syncdb.save()



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

        require('./syncdb').synchronized_db
            project_id    : project_id
            filename      : path
            sync_interval : 0
            cb            : (err, syncdb) ->
                if err
                    actions.init_error("unable to open '#{path}'")
                else
                    actions.syncdb = syncdb
                    actions.store  = store
                    actions.init_from_syncdb()
        return name

    remove    : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        actions = redux.getActions(name)
        actions?.syncdb?.destroy()
        store = redux.getStore(name)
        if not store?
            return
        delete store.state
        # It is *critical* to first unmount the store, then the actions,
        # or there will be a huge memory leak.
        redux.removeStore(name)
        redux.removeActions(name)
        return name
