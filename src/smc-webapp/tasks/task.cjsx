###
A single task
###

{React, rclass, rtypes}  = require('../smc-react')

{DescriptionRendered} = require('./desc-rendered')

exports.Task = rclass
    propTypes :
        task : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return @props.task != next.task

    render_desc: ->
        <div style={padding:'10px'}>
            <DescriptionRendered
                desc = {@props.task.get('desc')}
            />
        </div>

    render_last_edited: ->
        <span>{@props.task.get('last_edited')}</span>

    render_due_date: ->
        <span>{@props.task.get('due_date')}</span>


    render: ->
        <div style={border:'1px solid grey'}>
            {@render_desc()}
            <br/>
            {@render_last_edited()}
            <br/>
            {@render_due_date()}
        </div>