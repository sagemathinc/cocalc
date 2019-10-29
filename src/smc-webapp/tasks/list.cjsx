###
List of Tasks
###

{debounce} = require('underscore')

misc = require('smc-util/misc')

{Button} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

{WindowedList} = require('../r_misc/windowed-list')

{Task} = require('./task')
SortableTask = SortableElement(Task)

exports.TaskList = SortableContainer rclass
    propTypes :
        actions           : rtypes.object
        path              : rtypes.string
        project_id        : rtypes.string
        tasks             : rtypes.immutable.Map.isRequired
        visible           : rtypes.immutable.List.isRequired
        current_task_id   : rtypes.string
        local_task_state  : rtypes.immutable.Map
        full_desc         : rtypes.immutable.Set  # id's of tasks for which show full description
        scroll            : rtypes.immutable.Map  # scroll position -- only used when initially mounted, so is NOT in shouldComponentUpdate below.
        scroll_into_view  : rtypes.bool
        font_size         : rtypes.number
        sortable          : rtypes.bool
        read_only         : rtypes.bool
        selected_hashtags : rtypes.immutable.Map
        search_terms      : rtypes.immutable.Set

    shouldComponentUpdate: (next) ->
        if @props.visible != next.visible
            @windowed_list_ref.current.refresh()

        return @props.tasks             != next.tasks or \
               @props.visible           != next.visible or \
               @props.current_task_id   != next.current_task_id or \
               @props.local_task_state  != next.local_task_state or \
               @props.full_desc         != next.full_desc or \
               @props.font_size         != next.font_size or \
               @props.sortable          != next.sortable or \
               @props.read_only         != next.read_only or \
               @props.selected_hashtags != next.selected_hashtags or \
               @props.search_terms      != next.search_terms

    componentWillUnmount: ->
        @save_scroll_position()

    componentDidUpdate: () ->
        if @props.scroll_into_view
            @scroll_into_view()

    scroll_into_view: ->
        @_scroll_into_view()
        @props.actions.scroll_into_view_done()

    _scroll_into_view: ->
        if not @props.current_task_id?
            return
        # Figure out the index of current_task_id.
        index = @props.visible.indexOf(@props.current_task_id)
        if index == -1
            return
        @windowed_list_ref?.current?.scrollToRow(index)

    render_task: (index, task_id) ->
        if index == @props.visible.size
            # Empty div at the bottom makes it possible to scroll
            # the calendar into view...
            return <div style={height:'300px'} />

        task = @props.tasks.get(task_id)
        if not task?  # task deletion and visible list might not quite immediately be in sync/consistent
            return
        if @props.sortable
            T = SortableTask
        else
            T = Task
        if @props.actions?
            state            = @props.local_task_state?.get(task_id)
            full_desc        = @props.full_desc?.has(task_id)
            editing_due_date = state?.get('editing_due_date')
            editing_desc     = state?.get('editing_desc')
        else
            # full_desc = true since always expand, e.g., in (stateless) history viewer -- until we implement some state for it (?)
            full_desc = true
            editing_due_date = editing_desc = false
        <T
            ref              = {task_id}
            key              = {task_id}
            index            = {index}
            actions          = {@props.actions}
            path             = {@props.path}
            project_id       = {@props.project_id}
            task             = {task}
            is_current       = {@props.current_task_id == task_id}
            editing_due_date = {editing_due_date}
            editing_desc     = {editing_desc}
            full_desc        = {full_desc}
            font_size        = {@props.font_size}
            sortable         = {@props.sortable}
            read_only        = {@props.read_only}
            selected_hashtags= {@props.selected_hashtags}
            search_terms     = {@props.search_terms}
        />

    render_tasks: ->
        @windowed_list_ref ?= React.createRef()

        return <WindowedList
          ref = {@windowed_list_ref}
          overscan_row_count = {10}
          estimated_row_size={44}
          row_count={@props.visible.size+1}
          row_renderer={(obj) => @render_task(obj.index, obj.key)}
          row_key={(index) => @props.visible.get(index) ? 'filler'}
          cache_id={@props.actions?.name}
          scroll_top={@props.scroll?.get('scrollTop')}
          hide_resize={false}
        />
        # hide_resize is false so drag and drop works.

    save_scroll_position: ->
        if not @props.actions?
            return
        scrollTop = @windowed_list_ref?.current?.get_scroll()?.scrollTop
        if scrollTop?
            @props.actions.set_local_view_state(scroll: {scrollTop})

    on_click: (e) ->
        if e.target == @refs.main_div
            @props.actions.enable_key_handler()

    render: ->
        return <div className="smc-vfill" ref='main_div' onClick={@on_click}>
            {@render_tasks()}
        </div>
