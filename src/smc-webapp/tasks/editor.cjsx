#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Top-level react component for task list
###

{React, rclass, rtypes} = require('../app-framework')

{Loading}               = require('../r_misc')

{TaskList}              = require('./list')
{ButtonBar}             = require('./buttonbar.cjsx')
{Find}                  = require('./find')
{DescVisible}           = require('../frame-editors/task-editor/desc-visible')
{HashtagBar}            = require('./hashtag-bar')
{is_sortable} =  require('../frame-editors/task-editor/headings-info')
{Headings} = require('./headings')
{Row, Col}              = require('react-bootstrap')

{IS_MOBILE} = require('../feature')

exports.TaskEditor = rclass ({name}) ->
    displayName : "TaskEditor"

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
            search_terms            : rtypes.immutable.Set
            search_desc             : rtypes.string
            focus_find_box          : rtypes.bool
            read_only               : rtypes.bool
            scroll_into_view        : rtypes.bool
            load_time_estimate      : rtypes.immutable.Map

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
               @props.search_terms            != next.search_terms or \
               @props.scroll_into_view        != next.scroll_into_view or \
               !!next.focus_find_box and not @props.focus_find_box

    componentDidMount: ->
        @props.actions.enable_key_handler()

    componentWillUnmount: ->
        @props.actions.disable_key_handler()

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

    render_find_bar: ->
        <Row>
            <Col md={7}>
                {@render_find()}
            </Col>
            <Col md={5}>
                {@render_desc_visible()}
            </Col>
        </Row>

    render_button_bar: ->
        <ButtonBar
            actions                 = {@props.actions}
            read_only               = {@props.read_only}
            has_unsaved_changes     = {@props.has_unsaved_changes}
            has_uncommitted_changes = {@props.has_uncommitted_changes}
            current_task_id         = {@props.current_task_id}
            current_task_is_deleted = {@props.tasks?.get(@props.current_task_id)?.get('deleted')}
            sort_column             = {@props.local_view_state?.getIn(['sort', 'column'])}
            />

    on_sort_end: ({oldIndex, newIndex}) ->
        @props.actions?.reorder_tasks(oldIndex, newIndex)

    render_loading: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            <Loading estimate={@props.load_time_estimate} />
        </div>

    render_new_hint: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            Click New to create a task.
        </div>

    render_list: ->
        if not @props.tasks? or not @props.visible?
            return @render_loading()
        if @props.visible.size == 0 and @props.actions?
            return @render_new_hint()

        # The 300px is needed so the pop-up calendar is not hidden
        <TaskList
            actions              = {@props.actions}
            path                 = {@props.path}
            project_id           = {@props.project_id}
            tasks                = {@props.tasks}
            visible              = {@props.visible}
            current_task_id      = {@props.current_task_id}
            local_task_state     = {@props.local_task_state}
            full_desc            = {@props.local_view_state?.get('full_desc')}
            scroll               = {@props.local_view_state?.get('scroll')}
            scroll_into_view     = {@props.scroll_into_view}
            font_size            = {@props.local_view_state?.get('font_size')}
            sortable             = {not @props.read_only and is_sortable(@props.local_view_state?.getIn(['sort', 'column']))}
            read_only            = {@props.read_only}
            selected_hashtags    = {@props.local_view_state?.get('selected_hashtags')}
            search_terms         = {@props.search_terms}
            onSortEnd            = {@on_sort_end}
            useDragHandle        = {true}
            lockAxis             = {'y'}
            lockToContainerEdges = {true}
        />

    render_headings: ->
        <Headings
            actions = {@props.actions}
            sort    = {@props.local_view_state?.get('sort')}
            />

    render: ->
        <div className={'smc-vfill'}>
            {@render_hashtag_bar()}
            {@render_find_bar()}
            {@render_button_bar()}
            {@render_headings()}
            {@render_list()}
        </div>