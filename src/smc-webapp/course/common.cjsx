# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc

# React libraries
{React, rclass, rtypes, Actions}  = require('../smc-react')

{Button, ButtonToolbar, ButtonGroup, Input, Row, Col} = require('react-bootstrap')

{ErrorDisplay, Icon, Space, TimeAgo, Tip} = require('../r_misc')

exports.STEPS = (peer) ->
    if peer
        return ['assignment', 'collect', 'peer_assignment', 'peer_collect', 'return_graded']
    else
        return ['assignment', 'collect', 'return_graded']

exports.previous_step = (step, peer) ->
    switch step
        when 'collect'
            return 'assignment'
        when 'return_graded'
            if peer
                return 'peer_collect'
            else
                return 'collect'
        when 'assignment'
            return
        when 'peer_assignment'
            return 'collect'
        when 'peer_collect'
            return 'peer_assignment'
        else
            console.warn("BUG! previous_step('#{step}')")

exports.step_direction = (step) ->
    switch step
        when 'assignment'
            return 'to'
        when 'collect'
            return 'from'
        when 'return_graded'
            return 'to'
        when 'peer_assignment'
            return 'to'
        when 'peer_collect'
            return 'from'
        else
            console.warn("BUG! step_direction('#{step}')")

exports.step_verb = (step) ->
    switch step
        when 'assignment'
            return 'assign'
        when 'collect'
            return 'collect'
        when 'return_graded'
            return 'return'
        when 'peer_assignment'
            return 'assign'
        when 'peer_collect'
            return 'collect'
        else
            console.warn("BUG! step_verb('#{step}')")

exports.step_ready = (step, n) ->
    switch step
        when 'assignment'
            return ''
        when 'collect'
            return if n >1 then ' who have already received it' else ' who has already received it'
        when 'return_graded'
            return ' whose work you have graded'
        when 'peer_assignment'
            return ' for peer grading'
        when 'peer_collect'
            return ' who should have peer graded it'

exports.DirectoryLink = rclass
    displayName : "DirectoryLink"

    propTypes :
        project_id : rtypes.string.isRequired
        path       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired

    open_path : ->
        @props.redux.getProjectActions(@props.project_id).open_directory(@props.path)

    render : ->
        <a href="" onClick={(e)=>e.preventDefault(); @open_path()}>{@props.path}</a>

exports.BigTime = BigTime = rclass
    displayName : "CourseEditor-BigTime"

    render : ->
        date = @props.date
        if not date?
            return
        if typeof(date) == 'string'
            return <span>{date}</span>
        return <TimeAgo popover={true} date={date} />

exports.StudentAssignmentInfoHeader = rclass
    displayName : "CourseEditor-StudentAssignmentInfoHeader"

    propTypes :
        title      : rtypes.string.isRequired
        peer_grade : rtypes.bool

    render_col: (number, key, width) ->
        switch key
            when 'last_assignment'
                title = 'Assign to Student'
                tip   = 'This column gives the status of making homework available to students, and lets you copy homework to one student at a time.'
            when 'collect'
                title = 'Collect from Student'
                tip   = 'This column gives status information about collecting homework from students, and lets you collect from one student at a time.'
            when 'grade'
                title = 'Grade'
                tip   = 'Record homework grade" tip="Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Settings tab.'

            when 'peer-assign'
                title = 'Assign Peer Grading'
                tip   = 'This column gives the status of sending out collected homework to students for peer grading.'

            when 'peer-collect'
                title = 'Collect Peer Grading'
                tip   = 'This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.'

            when 'return_graded'
                title = 'Return to Student'
                tip   = 'This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.'
                placement = 'left'
        <Col md={width} key={key}>
                <Tip title={title} tip={tip}>
                    <b>{number}. {title}</b>
                </Tip>
        </Col>


    render_headers: ->
        w = 3
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'grade', w)}
            {@render_col(4, 'return_graded', w)}
        </Row>

    render_headers_peer: ->
        w = 2
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'peer-assign', w)}
            {@render_col(4, 'peer-collect', w)}
            {@render_col(5, 'grade', w)}
            {@render_col(6, 'return_graded', w)}
        </Row>

    render : ->
        <Row style={borderBottom:'2px solid #aaa'} >
            <Col md=2 key='title'>
                <Tip title={@props.title} tip={if @props.title=="Assignment" then "This column gives the directory name of the assignment." else "This column gives the name of the student."}>
                    <b>{@props.title}</b>
                </Tip>
            </Col>
            <Col md=10 key="rest">
                {if @props.peer_grade then @render_headers_peer() else @render_headers()}
            </Col>
        </Row>

exports.StudentAssignmentInfo = rclass
    displayName : "CourseEditor-StudentAssignmentInfo"

    propTypes :
        name       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        title      : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object
        grade      : rtypes.string

    getInitialState : ->
        editing_grade : false

    open : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).open_assignment(type, assignment_id, student_id)

    copy : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).copy_assignment(type, assignment_id, student_id)

    stop : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).stop_copying_assignment(type, assignment_id, student_id)

    save_grade : (e) ->
        e?.preventDefault()
        @props.redux.getActions(@props.name).set_grade(@props.assignment, @props.student, @state.grade)
        @setState(editing_grade:false)

    edit_grade : ->
        @setState(grade:@props.grade, editing_grade:true)

    render_grade_score : ->
        if @state.editing_grade
            <form key='grade' onSubmit={@save_grade} style={marginTop:'15px'}>
                <Input
                    autoFocus
                    value       = {@state.grade}
                    ref         = 'grade_input'
                    type        = 'text'
                    placeholder = 'Grade (any text)...'
                    onChange    = {=>@setState(grade:@refs.grade_input.getValue())}
                    onBlur      = {@save_grade}
                    onKeyDown   = {(e)=>if e.keyCode == 27 then @setState(grade:@props.grade, editing_grade:false)}
                    buttonAfter = {<Button bsStyle='success'>Save</Button>}
                />
            </form>
        else
            if @props.grade
                <div key='grade' onClick={@edit_grade}>
                    Grade: {@props.grade}
                </div>

    render_grade : (info, width) ->
        bsStyle = if not (@props.grade ? '').trim() then 'primary'
        <Col md={width} key='grade'>
            <Tip title="Enter student's grade" tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number).">
                <Button key='edit' onClick={@edit_grade} bsStyle={bsStyle}>Enter grade</Button>
            </Tip>
            {@render_grade_score()}
        </Col>

    render_last_time : (name, time) ->
        <div key='time' style={color:"#666"}>
            (<BigTime date={time} />)
        </div>

    render_open_recopy_confirm : (name, open, copy, copy_tip, open_tip, placement) ->
        key = "recopy_#{name}"
        if @state[key]
            v = []
            v.push <Button key="copy_confirm" bsStyle="danger" onClick={=>@setState("#{key}":false);copy()}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> Yes, {name.toLowerCase()} again
            </Button>
            v.push <Button key="copy_cancel" onClick={=>@setState("#{key}":false);}>
                 Cancel
            </Button>
            return v
        else
            <Button key="copy" bsStyle='warning' onClick={=>@setState("#{key}":true)}>
                <Tip title={name} placement={placement}
                    tip={<span>{copy_tip}</span>}>
                    <Icon name='share-square-o' rotate={"180" if name.indexOf('ollect')!=-1}/> {name}...
                </Tip>
            </Button>

    render_open_recopy : (name, open, copy, copy_tip, open_tip) ->
        placement = if name == 'Return' then 'left' else 'right'
        <ButtonToolbar key='open_recopy'>
            {@render_open_recopy_confirm(name, open, copy, copy_tip, open_tip, placement)}
            <Button key='open'  onClick={open}>
                <Tip title="Open assignment" placement={placement} tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonToolbar>

    render_open_copying : (name, open, stop) ->
        if name == "Return"
            placement = 'left'
        <ButtonGroup key='open_copying'>
            <Button key="copy" bsStyle='success' disabled={true}>
                <Icon name="circle-o-notch" spin /> {name}ing
            </Button>
            <Button key="stop" bsStyle='danger' onClick={stop}>
                <Icon name="times" />
            </Button>
            <Button key='open'  onClick={open}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </ButtonGroup>

    render_copy : (name, copy, copy_tip) ->
        if name == "Return"
            placement = 'left'
        <Tip key="copy" title={name} tip={copy_tip} placement={placement} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> {name}
            </Button>
        </Tip>

    render_error : (name, error) ->
        if typeof(error) != 'string'
            error = misc.to_json(error)
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the assignment.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '140px', overflow:'auto'}/>

    render_last : (name, obj, type, info, enable_copy, copy_tip, open_tip) ->
        open = => @open(type, info.assignment_id, info.student_id)
        copy = => @copy(type, info.assignment_id, info.student_id)
        stop = => @stop(type, info.assignment_id, info.student_id)
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

    render_peer_assign: (info) ->
        <Col md={2} key='peer-assign'>
            {@render_last('Peer Assign', info.last_peer_assignment, 'peer-assigned', info, info.last_collect?,
               "Copy collected assignments from your project to this student's project so they can grade them.",
               "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading.")}
        </Col>

    render_peer_collect: (info) ->
        <Col md={2} key='peer-collect'>
            {@render_last('Peer Collect', info.last_peer_collect, 'peer-collected', info, info.last_peer_assignment?,
               "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
               "Open your copy of your student's peer grading work in your own project, so that you can grade their work.")}
        </Col>

    render : ->
        info = @props.redux.getStore(@props.name).student_assignment_info(@props.student, @props.assignment)
        peer_grade = @props.assignment.get('peer_grade')?.get('enabled')
        show_grade_col = (peer_grade and info.last_peer_collect) or (not peer_grade and info.last_collect)
        width = if peer_grade then 2 else 3
        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md=2 key="title">
                {@props.title}
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md={width} key='last_assignment'>
                        {@render_last('Assign', info.last_assignment, 'assigned', info, true,
                           "Copy the assignment from your project to this student's project so they can do their homework.",
                           "Open the student's copy of this assignment directly in their project.  You will be able to see them type, chat with them, leave them hints, etc.")}
                    </Col>
                    <Col md={width} key='collect'>
                        {@render_last('Collect', info.last_collect, 'collected', info, info.last_assignment?,
                           "Copy the assignment from your student's project back to your project so you can grade their work.",
                           "Open the copy of your student's work in your own project, so that you can grade their work.")}
                    </Col>
                    {@render_peer_assign(info)  if peer_grade and info.peer_assignment}
                    {@render_peer_collect(info) if peer_grade and info.peer_collect}
                    {if show_grade_col then @render_grade(info, width) else <Col md={width} key='grade'></Col>}
                    <Col md={width} key='return_graded'>
                        {@render_last('Return', info.last_return_graded, 'graded', info, info.last_collect?,
                           "Copy the graded assignment back to your student's project.",
                           "Open the copy of your student's work that you returned to them. This opens the returned assignment directly in their project.") if @props.grade}
                    </Col>
                </Row>
            </Col>
        </Row>
