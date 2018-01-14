###
List of Tasks
###

{debounce} = require('underscore')

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

{Task} = require('./task')
Task = SortableElement(Task)

exports.TaskList = SortableContainer rclass
    propTypes :
        actions          : rtypes.object
        path             : rtypes.string
        project_id       : rtypes.string
        tasks            : rtypes.immutable.Map.isRequired
        visible          : rtypes.immutable.List.isRequired
        current_task_id  : rtypes.string
        local_task_state : rtypes.immutable.Map
        scroll           : rtypes.immutable.Map  # scroll position -- only used when initially mounted, so is NOT in shouldComponentUpdate below.
        scroll_into_view : rtypes.bool
        style            : rtypes.object
        font_size        : rtypes.number
        sortable         : rtypes.bool
        read_only        : rtypes.bool
        selected_hashtags : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.tasks             != next.tasks or \
               @props.visible           != next.visible or \
               @props.current_task_id   != next.current_task_id or \
               @props.local_task_state  != next.local_task_state or \
               @props.font_size         != next.font_size or \
               @props.sortable          != next.sortable or \
               @props.read_only         != next.read_only or \
               @props.selected_hashtags != next.selected_hashtags

    componentDidMount: ->
        if @props.scroll?
            ReactDOM.findDOMNode(@refs.main_div)?.scrollTop = @props.scroll.get('scrollTop')

    componentWillUnmount: ->
        @save_scroll_position()

    componentWillReceiveProps: (next) ->
        if next.scroll_into_view
            @scroll_into_view()

    scroll_into_view: ->
        @_scroll_into_view()
        @props.actions.scroll_into_view_done()

    _scroll_into_view: ->
        if not @props.current_task_id?
            return
        elt = $(ReactDOM.findDOMNode(@refs.main_div))
        cur = $(ReactDOM.findDOMNode(@refs[@props.current_task_id]))
        if cur.length == 0
            return
        if cur.length > 0
            # use jquery because it works!?
            cur.scrollintoview(direction:'vertical', viewPadding: { y: 50 })

    render_task: (index, task_id) ->
        task = @props.tasks.get(task_id)
        if not task?  # task deletion and visible list might not quite immediately be in sync/consistent
            return
        <Task
            ref              = {task_id}
            key              = {task_id}
            index            = {index}
            actions          = {@props.actions}
            path             = {@props.path}
            project_id       = {@props.project_id}
            task             = {task}
            is_current       = {@props.current_task_id == task_id}
            editing_due_date = {@props.local_task_state?.getIn([task_id, 'editing_due_date'])}
            editing_desc     = {@props.local_task_state?.getIn([task_id, 'editing_desc'])}
            min_desc         = {@props.local_task_state?.getIn([task_id, 'min_desc'])}
            font_size        = {@props.font_size}
            sortable         = {@props.sortable}
            read_only        = {@props.read_only}
            selected_hashtags= {@props.selected_hashtags}
        />

    render_tasks: ->
        x = []
        index = 0
        @props.visible.forEach (task_id) =>
            x.push(@render_task(index, task_id))
            index += 1
            return
        return x

    save_scroll_position: ->
        if not @props.actions?
            return
        node = ReactDOM.findDOMNode(@refs.main_div)
        if node?
            @props.actions.set_local_view_state(scroll: {scrollTop:node.scrollTop})

    render: ->
        <div style={@props.style} ref='main_div'>
            {@render_tasks()}
        </div>
