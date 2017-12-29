###
Top-level react component for task list
###

{React, rclass, rtypes}  = require('../smc-react')

{UncommittedChanges} = require('../jupyter/uncommitted-changes')

{TaskList}  = require('./list')

{ButtonBar} = require('./buttonbar')

{Find}      = require('./find')

{Headings}  = require('./headings')

{DescVisible} = require('./desc-visible')

exports.TaskEditor = rclass ({name}) ->
    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string
        project_id : rtypes.string

    reduxProps :
        "#{name}" :
            tasks                   : rtypes.immutable.Map
            counts                  : rtypes.immutable.Map
            visible                 : rtypes.immutable.List
            current_task_id         : rtypes.string
            has_unsaved_changes     : rtypes.bool
            has_uncommitted_changes : rtypes.bool
            local_task_state        : rtypes.immutable.Map
            local_view_state        : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.tasks                   != next.tasks or \
               @props.counts                  != next.counts or \
               @props.visible                 != next.visible or \
               @props.current_task_id         != next.current_task_id or \
               @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.local_task_state        != next.local_task_state  or \
               @props.local_view_state        != next.local_view_state

    render_uncommitted_changes: ->
        if not @props.has_uncommitted_changes
            return
        <div style={margin:'10px', padding:'10px', fontSize:'12pt'}>
            <UncommittedChanges
                has_uncommitted_changes = {@props.has_uncommitted_changes}
                delay_ms                = {10000}
                />
        </div>

    render_find: ->
        <Find
            actions          = {@props.actions}
            local_view_state = {@props.local_view_state}
            counts           = {@props.counts}
            />

    render_desc_visible: ->
        <DescVisible
            num_visible      = {@props.visible?.size}
            num_tasks        = {@props.tasks?.size}
            local_view_state = {@props.local_view_state}
        />

    render_button_bar: ->
        <ButtonBar
            actions                 = {@props.actions}
            has_unsaved_changes     = {@props.has_unsaved_changes}
            current_task_id         = {@props.current_task_id}
            current_task_is_deleted = {@props.tasks?.get(@props.current_task_id)?.get('deleted')}
            />

    render_list: ->
        if not @props.tasks? or not @props.visible?
            return
        <TaskList
            actions          = {@props.actions}
            path             = {@props.path}
            project_id       = {@props.project_id}
            tasks            = {@props.tasks}
            visible          = {@props.visible}
            current_task_id  = {@props.current_task_id}
            local_task_state = {@props.local_task_state}
            scroll           = {@props.local_view_state?.get('scroll')}
            font_size        = {@props.local_view_state?.get('font_size')}
            style            = {overflowY:'auto'}
        />

    render_headings: ->
        <Headings />

    render: ->
        <div style={margin:'15px', border:'1px solid grey'} className='smc-vfill'>
            {@render_uncommitted_changes()}
            {@render_find()}
            {@render_desc_visible()}
            {@render_button_bar()}
            {@render_headings()}
            {@render_list()}
        </div>