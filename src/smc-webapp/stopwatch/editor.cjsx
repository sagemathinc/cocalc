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


{React, rclass, rtypes} = require('../smc-react')
{Loading}               = require('../r_misc')

{Stopwatch}             = require('./stopwatch')
{ButtonBar}             = require('./button-bar')

exports.EditorTime = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

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

    render_button_bar: ->
        <ButtonBar actions={@props.actions} />

    render: ->
        if @props.error?
            return @render_error()
        else if @props.timers? and @props.timers.size > 0
            <div>
                {@render_button_bar()}
                <div>
                    {@render_stopwatches()}
                </div>
            </div>
        else
            <Loading/>
