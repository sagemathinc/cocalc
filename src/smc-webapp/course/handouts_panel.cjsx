##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

# CoCalc libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{webapp_client} = require('../webapp_client')

# React Libraries
{React, rclass, rtypes} = require('../app-framework')
{Alert, Button, ButtonToolbar, ButtonGroup, Input, FormGroup, FormControl, Row, Col, Panel, Table} = require('react-bootstrap')

# CoCalc and course components
util = require('./util')
styles = require('./styles')
{BigTime, FoldersToolbar} = require('./common')
{ErrorDisplay, Icon, Tip, MarkdownInput} = require('../r_misc')

# Could be merged with steps system of assignments.
# Probably not a good idea mixing the two.
# Could also be coded into the components below but steps could be added in the future?
STEPS = () ->
    ['handout']

previous_step = (step, peer) ->
    switch step
        when 'handout'
            return
        else
            console.warn("BUG! previous_step('#{step}')")

step_direction = (step) ->
    switch step
        when 'handout'
            return 'to'
        else
            console.warn("BUG! step_direction('#{step}')")

step_verb = (step) ->
    switch step
        when 'handout'
            return 'distribute'
        else
            console.warn("BUG! step_verb('#{step}')")

step_ready = (step, n) ->
    switch step
        when 'handout'
            return ''

past_tense = (word) ->
    if word[word.length-1] == 'e'
        return word + 'd'
    else
        return word + 'ed'

exports.HandoutsPanel = rclass ({name}) ->

    displayName : 'Course-editor-HandoutsPanel'

    reduxProps :
        "#{name}":
            expanded_handouts : rtypes.immutable.Set

    propTypes :
        actions         : rtypes.object.isRequired
        store_object    : rtypes.object
        project_actions : rtypes.object.isRequired
        project_id      : rtypes.string.isRequired
        all_handouts    : rtypes.immutable.Map.isRequired # handout_id -> handout
        students        : rtypes.immutable.Map.isRequired # student_id -> student
        user_map        : rtypes.object.isRequired

    getInitialState: ->
        show_deleted : false
        search          : ''      # Search value for filtering handouts

    # Update on different students, handouts, or filter parameters
    # TODO: this is BS -- do this right.  Get rid of store_object above and
    # put the actual data it uses; make everything immutable!
    shouldComponentUpdate: (nextProps, nextState) ->
        if nextProps.all_handouts != @props.all_handouts or nextProps.students != @props.students or @props.expanded_handouts != nextProps.expanded_handouts
            return true
        if not misc.is_equal(nextState, @state)
            return true
        return false

    compute_handouts_list: ->
        list = util.immutable_to_list(@props.all_handouts, 'handout_id')

        {list, num_omitted} = util.compute_match_list
            list        : list
            search_key  : 'path'
            search      : @state.search.trim()

        {list, deleted, num_deleted} = util.order_list
            list             : list
            compare_function : (a,b) => misc.cmp(a.path?.toLowerCase(), b.path?.toLowerCase())
            include_deleted  : @state.show_deleted

        return {shown_handouts:list, deleted_handouts:deleted, num_omitted:num_omitted, num_deleted:num_deleted}

    render_show_deleted_button: (num_deleted, num_shown) ->
        if @state.show_deleted
            <Button style={styles.show_hide_deleted(needs_margin : num_shown > 0)} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Handouts are never really deleted.  Click this button so that deleted handouts aren't included at the bottom of the list.">
                    Hide {num_deleted} deleted handouts
                </Tip>
            </Button>
        else
            <Button style={styles.show_hide_deleted(needs_margin : num_shown > 0)} onClick={=>@setState(show_deleted:true, search:'')}>
                <Tip placement='left' title="Show deleted" tip="Handouts are not deleted forever even after you delete them.  Click this button to show any deleted handouts at the bottom of the list of handouts.  You can then click on the handout and click undelete to bring the handout back.">
                    Show {num_deleted} deleted handouts
                </Tip>
            </Button>

    yield_adder: (deleted_handouts) ->
        deleted_paths = {}
        deleted_handouts.map (obj) =>
            if obj.path
                deleted_paths[obj.path] = obj.handout_id

        (path) =>
            if deleted_paths[path]?
                @props.actions.undelete_handout(deleted_paths[path])
            else
                @props.actions.add_handout(path)

    render: ->
        # Computed data from state changes have to go in render
        {shown_handouts, deleted_handouts, num_omitted, num_deleted} = @compute_handouts_list()
        add_handout = @yield_adder(deleted_handouts)

        header =
            <FoldersToolbar
                search        = {@state.search}
                search_change = {(value) => @setState(search:value)}
                num_omitted   = {num_omitted}
                project_id    = {@props.project_id}
                items         = {@props.all_handouts}
                add_folders   = {(paths)=>paths.map(add_handout)}
                item_name     = {"handout"}
                plural_item_name = {"handouts"}
            />

        <Panel header={header}>
            {for handout, i in shown_handouts
                <Handout backgroundColor={if i%2==0 then "#eee"}  key={handout.handout_id}
                        handout={@props.all_handouts.get(handout.handout_id)} project_id={@props.project_id}
                        students={@props.students} user_map={@props.user_map} actions={@props.actions}
                        store_object={@props.store_object} open_directory={@props.project_actions.open_directory}
                        is_expanded={@props.expanded_handouts.has(handout.handout_id)}
                        name={@props.name}
                />}
            {@render_show_deleted_button(num_deleted, shown_handouts.length ? 0) if num_deleted > 0}
        </Panel>

exports.HandoutsPanel.Header = rclass
    propTypes :
        n : rtypes.number

    render: ->
        <Tip delayShow={1300}
             title="Handouts"
             tip="This tab lists all of the handouts associated with your course.">
            <span>
                <Icon name="files-o"/> Handouts {if @props.n? then " (#{@props.n})" else ""}
            </span>
        </Tip>

Handout = rclass
    propTypes :
        name                : rtypes.string
        handout             : rtypes.object
        backgroundColor     : rtypes.string
        store_object        : rtypes.object
        actions             : rtypes.object
        open_directory      : rtypes.func     # open_directory(path)
        is_expanded         : rtypes.bool

    getInitialState: ->
        confirm_delete : false

    open_handout_path: (e)->
        e.preventDefault()
        @props.open_directory(@props.handout.get('path'))

    copy_handout_to_all: (step, new_only) ->
        @props.actions.copy_handout_to_all_students(@props.handout, new_only)

    render_more_header: ->
        <div>
            <div style={fontSize:'15pt', marginBottom:'5px'} >
                {@props.handout.get('path')}
            </div>
            <Button onClick={@open_handout_path}>
                <Icon name="folder-open-o" /> Edit Handout
            </Button>
        </div>

    render_handout_notes: ->
        <Row key='note' style={styles.note}>
            <Col xs={2}>
                <Tip title="Notes about this handout" tip="Record notes about this handout here. These notes are only visible to you, not to your students.  Put any instructions to students about handouts in a file in the directory that contains the handout.">
                    Private Handout Notes<br /><span style={color:"#666"}></span>
                </Tip>
            </Col>
            <Col xs={10}>
                <MarkdownInput
                    persist_id    = {@props.handout.get('path') + @props.handout.get('assignment_id') + "note"}
                    attach_to     = {@props.name}
                    rows          = {6}
                    placeholder   = 'Private notes about this handout (not visible to students)'
                    default_value = {@props.handout.get('note')}
                    on_save       = {(value)=>@props.actions.set_handout_note(@props.handout, value)}
                />
            </Col>
        </Row>

    render_copy_all: (status) ->
        steps = STEPS()
        for step in steps
            if @state["copy_confirm_#{step}"]
                @render_copy_confirm(step, status)

    render_copy_confirm: (step, status) ->
        <span key={"copy_confirm_#{step}"}>
            {@render_copy_confirm_to_all(step, status) if status[step]==0}
            {@render_copy_confirm_to_all_or_new(step, status) if status[step]!=0}
        </span>

    render_copy_cancel: (step) ->
        cancel = =>
            @setState(
                "copy_confirm_#{step}"         : false
                "copy_confirm_all_#{step}"     : false
                copy_confirm                   : false
                copy_handout_confirm_overwrite : false
            )
        <Button key='cancel' onClick={cancel}>Cancel</Button>

    render_copy_handout_confirm_overwrite: (step) ->
        return if not @state.copy_handout_confirm_overwrite
        do_it = =>
            @copy_handout(step, false)
            @setState(
                copy_handout_confirm_overwrite         : false
                copy_handout_confirm_overwrite_text    : ''
            )
        <div style={marginTop:'15px'}>
            Type in "OVERWRITE" if you are certain to replace the handout files of all students.
            <FormGroup>
                <FormControl
                    autoFocus
                    type        = 'text'
                    ref         = 'copy_handout_confirm_overwrite_field'
                    onChange    = {(e)=>@setState(copy_handout_confirm_overwrite_text : e.target.value)}
                    style       = {marginTop : '1ex'}
                />
            </FormGroup>
            <ButtonToolbar style={textAlign: 'center', marginTop: '15px'}>
                <Button
                    disabled = {@state.copy_handout_confirm_overwrite_text != 'OVERWRITE'}
                    bsStyle  = 'danger'
                    onClick  = {do_it}
                >
                    <Icon name='exclamation-triangle' /> Confirm replacing files
                </Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </div>

    copy_handout: (step, new_only, overwrite) ->
        # handout to all (non-deleted) students
        switch step
            when 'handout'
                @props.actions.copy_handout_to_all_students(@props.handout, new_only, overwrite)
            else
                console.log("BUG -- unknown step: #{step}")
        @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)

    render_copy_confirm_to_all: (step, status) ->
        n = status["not_#{step}"]
        <Alert bsStyle='warning' key={"#{step}_confirm_to_all"} style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this handout {step_direction(step)} the {n} student{if n>1 then "s" else ""}{step_ready(step, n)}?
            </div>
            <ButtonToolbar>
                <Button key='yes' bsStyle='primary' onClick={=>@copy_handout(step, false)} >Yes</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </Alert>

    copy_confirm_all_caution: (step) ->
        switch step
            when 'handout'
                return """
                       This will recopy all of the files to them.
                       CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.
                       Select "Replace student files!" in case you do not want to create any backups and also delete all other files in the assignment directory of their projects.
                       """

    render_copy_confirm_overwrite_all: (step, status) ->
        <div key="copy_confirm_overwrite_all" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {@copy_confirm_all_caution(step)}
            </div>
            <ButtonToolbar>
                <Button key='all' bsStyle='warning'
                    onClick={=>@copy_handout(step, false)}
                >Yes, do it</Button>
                <Button key='all-overwrite' bsStyle='danger'
                    onClick={=>@setState(copy_handout_confirm_overwrite:true)}
                >Replace student files!</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_handout_confirm_overwrite(step)}
        </div>

    render_copy_confirm_to_all_or_new: (step, status) ->
        n = status["not_#{step}"]
        m = n + status[step]
        <Alert bsStyle='warning' key={"#{step}_confirm_to_all_or_new"} style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this handout {step_direction(step)}...
            </div>
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@setState("copy_confirm_all_#{step}":true, copy_confirm:true)}
                        disabled={@state["copy_confirm_all_#{step}"]} >
                    {if step=='handout' then 'All' else 'The'} {m} students{step_ready(step, m)}...
                </Button>
                {<Button key='new' bsStyle='primary' onClick={=>@copy_handout(step, true)}>The {n} student{if n>1 then 's' else ''} not already {past_tense(step_verb(step))} {step_direction(step)}</Button> if n}
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_confirm_overwrite_all(step, status) if @state["copy_confirm_all_#{step}"]}
        </Alert>

    render_handout_button: (status) ->
        handout_count = status.handout
        not_handout   = status.not_handout
        if handout_count == 0
            bsStyle = "primary"
        else
            if not_handout == 0
                bsStyle = 'success'
            else
                bsStyle = "warning"
        <Button key='handout'
                bsStyle  = {bsStyle}
                onClick  = {=>@setState(copy_confirm_handout:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                style    = {@outside_button_style}>
            <Tip title={<span>Handout: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                 tip="Copy the files for this handout from this project to all other student projects.">
                <Icon name="share-square-o" /> Distribute...
            </Tip>
        </Button>

    delete_handout: ->
        @props.actions.delete_handout(@props.handout)
        @setState(confirm_delete:false)

    undelete_handout: ->
        @props.actions.undelete_handout(@props.handout)

    render_confirm_delete: ->
        <Alert bsStyle='warning' key='confirm_delete'>
            Are you sure you want to delete this handout (you can undelete it later)?
            <br/> <br/>
            <ButtonToolbar>
                <Button key='yes' onClick={@delete_handout} bsStyle='danger'>
                    <Icon name="trash" /> Delete
                </Button>
                <Button key='no' onClick={=>@setState(confirm_delete:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_delete_button: ->
        if @props.handout.get('deleted')
            <Tip key='delete' placement='left' title="Undelete handout" tip="Make the handout visible again in the handout list and in student grade lists.">
                <Button onClick={@undelete_handout} style={@outside_button_style}>
                    <Icon name="trash-o" /> Undelete
                </Button>
            </Tip>
        else
            <Tip key='delete' placement='left' title="Delete handout" tip="Deleting this handout removes it from the handout list and student grade lists, but does not delete any files off of disk.  You can always undelete an handout later by showing it using the 'show deleted handouts' button.">
                <Button onClick={=>@setState(confirm_delete:true)} disabled={@state.confirm_delete} style={@outside_button_style}>
                    <Icon name="trash" /> Delete...
                </Button>
            </Tip>

    render_more: ->
        <Row key='more'>
            <Col sm={12}>
                <Panel header={@render_more_header()}>
                    <StudentListForHandout handout={@props.handout} students={@props.students}
                        user_map={@props.user_map} store_object={@props.store_object} actions={@props.actions}/>
                    {@render_handout_notes()}
                </Panel>
            </Col>
        </Row>

    outside_button_style :
        margin        : '4px'
        paddingTop    : '6px'
        paddingBottom : '4px'

    render: ->
        status = @props.store_object.get_handout_status(@props.handout)
        <Row style={if @props.is_expanded then styles.selected_entry else styles.entry}>
            <Col xs={12}>
                <Row key='summary' style={backgroundColor:@props.backgroundColor}>
                    <Col md={2} style={paddingRight:'0px'}>
                        <h5>
                            <a href='' onClick={(e)=>e.preventDefault();@actions(@props.name).toggle_item_expansion('handout', @props.handout.get('handout_id'))}>
                                <Icon style={marginRight:'10px', float:'left'}
                                      name={if @props.is_expanded then 'caret-down' else 'caret-right'} />
                                <div>
                                    {misc.trunc_middle(@props.handout.get('path'), 24)}
                                    {<b> (deleted)</b> if @props.handout.get('deleted')}
                                </div>
                            </a>
                        </h5>
                    </Col>
                    <Col md={6}>
                        <Row style={marginLeft:'8px'}>
                            {@render_handout_button(status)}
                            <span style={color:'#666', marginLeft:'5px'}>
                                ({status.handout}/{status.handout + status.not_handout} received)
                            </span>
                        </Row>
                        <Row style={marginLeft:'8px'}>
                            {@render_copy_all(status)}
                        </Row>
                    </Col>
                    <Col md={4}>
                        <Row>
                            <span className='pull-right'>
                                {@render_delete_button()}
                            </span>
                        </Row>
                        <Row>
                            {@render_confirm_delete() if @state.confirm_delete}
                        </Row>
                    </Col>
                </Row>
                {@render_more() if @props.is_expanded}
            </Col>
        </Row>

StudentListForHandout = rclass
    propTypes :
        user_map     : rtypes.object
        students     : rtypes.object
        handout      : rtypes.object
        store_object : rtypes.object
        actions      : rtypes.object

    render_students: ->
        v = util.immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        v = (x for x in v when not x.deleted)
        for x in v
            user = @props.user_map.get(x.account_id)
            if user?
                x.first_name = user.get('first_name')
                x.last_name  = user.get('last_name')
                x.name = x.first_name + ' ' + x.last_name
                x.sort = (x.last_name + ' ' + x.first_name).toLowerCase()
            else if x.email_address?
                x.name = x.sort = x.email_address.toLowerCase()

        v.sort (a,b) ->
            return misc.cmp(a.sort, b.sort)

        for x in v
            @render_student_info(x.student_id, x)

    render_student_info: (id, student) ->
        <StudentHandoutInfo
            key = {id}
            actions = {@props.actions}
            info = {@props.store_object.student_handout_info(id, @props.handout)}
            title = {misc.trunc_middle(@props.store_object.get_student_name(id), 40)}
            student = {id}
            handout = {@props.handout}
        />

    render: ->
        <div>
            <StudentHandoutInfoHeader
                key        = 'header'
                title      = "Student"
            />
            {@render_students()}
        </div>

StudentHandoutInfoHeader = rclass
    displayName : "CourseEditor-StudentHandoutInfoHeader"

    propTypes :
        title      : rtypes.string.isRequired

    render_col: (step_number, key, width) ->
        switch key
            when 'last_handout'
                title = 'Distribute to Student'
                tip   = 'This column gives the status whether a handout was received by a student and lets you copy the handout to one student at a time.'
        <Col md={width} key={key}>
            <Tip title={title} tip={tip}>
                <b>{step_number}. {title}</b>
            </Tip>
        </Col>


    render_headers: ->
        w = 12
        <Row>
            {@render_col(1, 'last_handout', w)}
        </Row>

    render: ->
        <Row style={borderBottom:'2px solid #aaa'} >
            <Col md={2} key='title'>
                <Tip title={@props.title} tip={if @props.title=="Handout" then "This column gives the directory name of the handout." else "This column gives the name of the student."}>
                    <b>{@props.title}</b>
                </Tip>
            </Col>
            <Col md={10} key="rest">
                {@render_headers()}
            </Col>
        </Row>

StudentHandoutInfo = rclass
    displayName : "CourseEditor-StudentHandoutInfo"

    propTypes :
        actions    : rtypes.object.isRequired
        info       : rtypes.object.isRequired
        title      : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        handout    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (handout_id) or handout immutable js object

    getInitialState: ->
        {}

    open: (handout_id, student_id) ->
        @props.actions.open_handout(handout_id, student_id)

    copy: (handout_id, student_id) ->
        @props.actions.copy_handout_to_student(handout_id, student_id)

    stop: (handout_id, student_id) ->
        @props.actions.stop_copying_handout(handout_id, student_id)

    render_last_time: (name, time) ->
        <div key='time' style={color:"#666"}>
            (<BigTime date={time} />)
        </div>

    render_open_recopy_confirm: (name, open, copy, copy_tip, open_tip) ->
        key = "recopy_#{name}"
        if @state[key]
            v = []
            v.push <Button key="copy_confirm" bsStyle="danger" onClick={=>@setState("#{key}":false);copy()}>
                <Icon name="share-square-o"/> Yes, {name.toLowerCase()} again
            </Button>
            v.push <Button key="copy_cancel" onClick={=>@setState("#{key}":false);}>
                 Cancel
            </Button>
            return v
        else
            <Button key="copy" bsStyle='warning' onClick={=>@setState("#{key}":true)}>
                <Tip title={name}
                    tip={<span>{copy_tip}</span>}>
                    <Icon name='share-square-o'/> {name}...
                </Tip>
            </Button>

    render_open_recopy: (name, open, copy, copy_tip, open_tip) ->
        <ButtonToolbar key='open_recopy'>
            {@render_open_recopy_confirm(name, open, copy, copy_tip, open_tip)}
            <Button key='open'  onClick={open}>
                <Tip title="Open handout" tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonToolbar>

    render_open_copying: (name, open, stop) ->
        <ButtonGroup key='open_copying'>
            <Button key="copy" bsStyle='success' disabled={true}>
                <Icon name="cc-icon-cocalc-ring" spin /> Working...
            </Button>
            <Button key="stop" bsStyle='danger' onClick={stop}>
                <Icon name="times" />
            </Button>
            <Button key='open'  onClick={open}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </ButtonGroup>

    render_copy: (name, copy, copy_tip) ->
        <Tip key="copy" title={name} tip={copy_tip} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" /> {name}
            </Button>
        </Tip>

    render_error: (name, error) ->
        if typeof(error) != 'string'
            error = misc.to_json(error)
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the handout.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '140px', overflow:'auto'}/>

    render_last: (name, obj, info, enable_copy, copy_tip, open_tip) ->
        open = => @open(info.handout_id, info.student_id)
        copy = => @copy(info.handout_id, info.student_id)
        stop = => @stop(info.handout_id, info.student_id)
        obj ?= {}
        v = []
        if enable_copy
            if obj.start
                v.push(@render_open_copying(name, open, stop))
            else if obj.time
                v.push(@render_open_recopy(name, open, copy, copy_tip, open_tip))
            else
                v.push(@render_copy(name, copy, copy_tip))
        if obj.time
            v.push(@render_last_time(name, obj.time))
        if obj.error
            v.push(@render_error(name, obj.error))
        return v

    render: ->
        width = 12
        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md={2} key="title">
                {@props.title}
            </Col>
            <Col md={10} key="rest">
                <Row>
                    <Col md={width} key='last_handout'>
                        {@render_last('Distribute', @props.info.status, @props.info, true,
                           "Copy the handout from your project to this student's project.",
                           "Open the student's copy of this handout directly in their project.  You will be able to see them type, chat with them, answer questions, etc.")}
                    </Col>
                </Row>
            </Col>
        </Row>
