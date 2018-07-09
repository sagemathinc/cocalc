###
List of Tasks
###

{debounce} = require('underscore')

misc = require('smc-util/misc')

{Button} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

{Task} = require('./task')
SortableTask = SortableElement(Task)

MIN_SHOW = 25
SHOW_INC = 50

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
        style             : rtypes.object
        font_size         : rtypes.number
        sortable          : rtypes.bool
        read_only         : rtypes.bool
        selected_hashtags : rtypes.immutable.Map
        search_terms      : rtypes.immutable.Set
        show_max          : rtypes.number         # max number of tasks to show

    shouldComponentUpdate: (next) ->
        return @props.tasks             != next.tasks or \
               @props.visible           != next.visible or \
               @props.current_task_id   != next.current_task_id or \
               @props.local_task_state  != next.local_task_state or \
               @props.full_desc         != next.full_desc or \
               @props.font_size         != next.font_size or \
               @props.sortable          != next.sortable or \
               @props.read_only         != next.read_only or \
               @props.selected_hashtags != next.selected_hashtags or \
               @props.search_terms      != next.search_terms or \
               @props.show_max          != next.show_max

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
        x = []
        index = 0
        @props.visible.forEach (task_id) =>
            x.push(@render_task(index, task_id))
            index += 1
            if @props.show_max? and index >= @props.show_max
                return false
            return
        return x

    save_scroll_position: ->
        if not @props.actions?
            return
        node = ReactDOM.findDOMNode(@refs.main_div)
        if node?
            @props.actions.set_local_view_state(scroll: {scrollTop:node.scrollTop})

    show_more: ->
        @props.actions.set_show_max(@props.show_max + SHOW_INC)

    show_less: ->
        @props.actions.set_show_max(Math.max(MIN_SHOW, @props.show_max - SHOW_INC))

    render_show_more: (num_hidden) ->
        <div key={'more'} style={marginTop:'10px'}>
            <Button style={minWidth:'150px'} onClick={@show_more}>
                <Icon name={'plus'}/> Show {Math.min(num_hidden, SHOW_INC)} more
            </Button>
        </div>

    render_show_less: ->
        <div key={'less'} style={marginTop:'10px'}>
            <Button style={minWidth:'150px'} onClick={@show_less}>
                <Icon name={'minus'}/> Show {SHOW_INC} less
            </Button>
        </div>

    render_show_more_less: ->
        if not @props.show_max?
            return
        num_hidden = @props.visible.size - @props.show_max
        v = []
        if num_hidden > 0
            v.push(<div key={'missing'}>Not showing {num_hidden} matching tasks.</div>)
            if @props.actions?
                v.push(@render_show_more(num_hidden))
        if @props.actions? and @props.show_max >= MIN_SHOW + SHOW_INC
            v.push(@render_show_less())
        if v.length == 0
            return
        <div style={margin: '15px', color: '#666'}>
            {v}
        </div>

    on_click: (e) ->
        if e.target == @refs.main_div
            @props.actions.enable_key_handler()

    render: ->
        <div style={@props.style} ref='main_div' onClick={@on_click}>
            {@render_tasks()}
            {@render_show_more_less()}
        </div>
