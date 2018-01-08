###
Top-level react component for task list
###

{React, rclass, rtypes}  = require('../smc-react')

{UncommittedChanges} = require('../jupyter/uncommitted-changes')
{TaskList}           = require('./list')
{ButtonBar}          = require('./buttonbar')
{Find}               = require('./find')
{DescVisible}        = require('./desc-visible')
{HashtagBar}         = require('./hashtag-bar')
{Headings, is_sortable} = require('./headings')

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
            hashtags                : rtypes.immutable.Map
            search_desc             : rtypes.string
            focus_find_box          : rtypes.bool
            read_only               : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.tasks                   != next.tasks or \
               @props.counts                  != next.counts or \
               @props.visible                 != next.visible or \
               @props.current_task_id         != next.current_task_id or \
               @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.local_task_state        != next.local_task_state  or \
               @props.local_view_state        != next.local_view_state or \
               @props.hashtags                != next.hashtags  or \
               @props.read_only               != next.read_only or \
               @props.search                  != next.search    or \
               !!next.focus_find_box and not @props.focus_find_box

    componentDidMount: ->
        @props.actions.enable_key_handler()

    componentWillUnmount: ->
        @props.actions.disable_key_handler()

    render_uncommitted_changes: ->
        if not @props.has_uncommitted_changes
            return
        <div style={margin:'10px', padding:'10px', fontSize:'12pt'}>
            <UncommittedChanges
                has_uncommitted_changes = {@props.has_uncommitted_changes}
                delay_ms                = {10000}
                />
        </div>

    render_hashtag_bar: ->
        if not @props.hashtags?
            return
        <HashtagBar
            actions  = {@props.actions}
            hashtags = {@props.hashtags}
            selected = {@props.local_view_state?.get('selected_hashtags')}
            />

    render_find: ->
        <Find
            actions          = {@props.actions}
            local_view_state = {@props.local_view_state}
            counts           = {@props.counts}
            focus_find_box   = {@props.focus_find_box}
            />

    render_desc_visible: ->
        <DescVisible
            num_visible      = {@props.visible?.size}
            num_tasks        = {@props.tasks?.size}
            local_view_state = {@props.local_view_state}
            search_desc      = {@props.search_desc}
        />

    render_button_bar: ->
        <ButtonBar
            actions                 = {@props.actions}
            read_only               = {@props.read_only}
            has_unsaved_changes     = {@props.has_unsaved_changes}
            current_task_id         = {@props.current_task_id}
            current_task_is_deleted = {@props.tasks?.get(@props.current_task_id)?.get('deleted')}
            sort_column             = {@props.local_view_state?.getIn(['sort', 'column'])}
            />

    on_sort_end: ({oldIndex, newIndex}) ->
        @props.actions?.reorder_tasks(oldIndex, newIndex)

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
            sortable         = {not @props.read_only and is_sortable(@props.local_view_state?.getIn(['sort', 'column']))}
            read_only        = {@props.read_only}
            onSortEnd        = {@on_sort_end}
            useDragHandle    = {true}
            lockAxis         = {'y'}
            lockToContainerEdges = {true}
        />

    render_headings: ->
        <Headings
            actions = {@props.actions}
            sort    = {@props.local_view_state?.get('sort')}
            />

    render: ->
        <div style={margin:'15px', border:'1px solid grey'} className='smc-vfill'>
            {@render_uncommitted_changes()}
            {@render_hashtag_bar()}
            {@render_find()}
            {@render_desc_visible()}
            {@render_button_bar()}
            {@render_headings()}
            {@render_list()}
        </div>