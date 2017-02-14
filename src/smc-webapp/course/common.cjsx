# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')

# React libraries
{React, rclass, rtypes, Actions, ReactDOM}  = require('../smc-react')

{Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, InputGroup, Row, Col} = require('react-bootstrap')

{ErrorDisplay, Icon, Space, TimeAgo, Tip, SearchInput} = require('../r_misc')

immutable = require('immutable')

# Move these to funcs file
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

exports.BigTime = BigTime = rclass
    displayName : "CourseEditor-BigTime"

    render: ->
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

    render: ->
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
        title      : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object
        grade      : rtypes.string
        info       : rtypes.object.isRequired

    getInitialState: ->
        editing_grade : false

    open: (type, assignment_id, student_id) ->
        @actions(@props.name).open_assignment(type, assignment_id, student_id)

    copy: (type, assignment_id, student_id) ->
        @actions(@props.name).copy_assignment(type, assignment_id, student_id)

    stop: (type, assignment_id, student_id) ->
        @actions(@props.name).stop_copying_assignment(type, assignment_id, student_id)

    save_grade: (e) ->
        e?.preventDefault()
        @actions(@props.name).set_grade(@props.assignment, @props.student, @state.grade)
        @setState(editing_grade:false)

    edit_grade: ->
        @setState(grade:@props.grade, editing_grade:true)

    render_grade_score: ->
        if @state.editing_grade
            <form key='grade' onSubmit={@save_grade} style={marginTop:'15px'}>
                <FormGroup>
                    <InputGroup>
                        <FormControl
                            autoFocus
                            value       = {@state.grade}
                            ref         = 'grade_input'
                            type        = 'text'
                            placeholder = 'Grade (any text)...'
                            onChange    = {=>@setState(grade:ReactDOM.findDOMNode(@refs.grade_input).value)}
                            onBlur      = {@save_grade}
                            onKeyDown   = {(e)=>if e.keyCode == 27 then @setState(grade:@props.grade, editing_grade:false)}
                        />
                        <InputGroup.Button>
                            <Button bsStyle='success'>Save</Button>
                        </InputGroup.Button>
                    </InputGroup>
                </FormGroup>
            </form>
        else
            if @props.grade
                <div key='grade' onClick={@edit_grade}>
                    Grade: {@props.grade}
                </div>

    render_grade: (width) ->
        bsStyle = if not (@props.grade ? '').trim() then 'primary'
        <Col md={width} key='grade'>
            <Tip title="Enter student's grade" tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number).">
                <Button key='edit' onClick={@edit_grade} bsStyle={bsStyle}>Enter grade</Button>
            </Tip>
            {@render_grade_score()}
        </Col>

    render_last_time: (name, time) ->
        <div key='time' style={color:"#666"}>
            (<BigTime date={time} />)
        </div>

    render_open_recopy_confirm: (name, open, copy, copy_tip, open_tip, placement) ->
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

    render_open_recopy: (name, open, copy, copy_tip, open_tip) ->
        placement = if name == 'Return' then 'left' else 'right'
        <ButtonToolbar key='open_recopy'>
            {@render_open_recopy_confirm(name, open, copy, copy_tip, open_tip, placement)}
            <Button key='open'  onClick={open}>
                <Tip title="Open assignment" placement={placement} tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonToolbar>

    render_open_copying: (name, open, stop) ->
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

    render_copy: (name, copy, copy_tip) ->
        if name == "Return"
            placement = 'left'
        <Tip key="copy" title={name} tip={copy_tip} placement={placement} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> {name}
            </Button>
        </Tip>

    render_error: (name, error) ->
        if typeof(error) != 'string'
            error = misc.to_json(error)
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the assignment.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '140px', overflow:'auto'}/>

    render_last: (name, obj, type, enable_copy, copy_tip, open_tip) ->
        open = => @open(type, @props.info.assignment_id, @props.info.student_id)
        copy = => @copy(type, @props.info.assignment_id, @props.info.student_id)
        stop = => @stop(type, @props.info.assignment_id, @props.info.student_id)
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

    render_peer_assign: ->
        <Col md={2} key='peer-assign'>
            {@render_last('Peer Assign', @props.info.last_peer_assignment, 'peer-assigned', @props.info.last_collect?,
               "Copy collected assignments from your project to this student's project so they can grade them.",
               "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading.")}
        </Col>

    render_peer_collect: ->
        <Col md={2} key='peer-collect'>
            {@render_last('Peer Collect', @props.info.last_peer_collect, 'peer-collected', @props.info.last_peer_assignment?,
               "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
               "Open your copy of your student's peer grading work in your own project, so that you can grade their work.")}
        </Col>

    render: ->
        peer_grade = @props.assignment.get('peer_grade')?.get('enabled')
        show_grade_col = (peer_grade and @props.info.last_peer_collect) or (not peer_grade and @props.info.last_collect)
        width = if peer_grade then 2 else 3
        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md=2 key="title">
                {@props.title}
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md={width} key='last_assignment'>
                        {@render_last('Assign', @props.info.last_assignment, 'assigned', true,
                           "Copy the assignment from your project to this student's project so they can do their homework.",
                           "Open the student's copy of this assignment directly in their project.  You will be able to see them type, chat with them, leave them hints, etc.")}
                    </Col>
                    <Col md={width} key='collect'>
                        {@render_last('Collect', @props.info.last_collect, 'collected', @props.info.last_assignment?,
                           "Copy the assignment from your student's project back to your project so you can grade their work.",
                           "Open the copy of your student's work in your own project, so that you can grade their work.")}
                    </Col>
                    {@render_peer_assign()  if peer_grade and @props.info.peer_assignment}
                    {@render_peer_collect() if peer_grade and @props.info.peer_collect}
                    {if show_grade_col then @render_grade(width) else <Col md={width} key='grade'></Col>}
                    <Col md={width} key='return_graded'>
                        {@render_last('Return', @props.info.last_return_graded, 'graded', @props.info.last_collect?,
                           "Copy the graded assignment back to your student's project.",
                           "Open the copy of your student's work that you returned to them. This opens the returned assignment directly in their project.") if @props.grade}
                    </Col>
                </Row>
            </Col>
        </Row>

# Multiple result selector
# use on_change and search to control the search bar
# Coupled with Assignments Panel and Handouts Panel
exports.MultipleAddSearch = MultipleAddSearch = rclass
    propTypes :
        add_selected     : rtypes.func.isRequired   # Submit user selected results add_selected(['paths', 'of', 'folders'])
        do_search        : rtypes.func.isRequired   # Submit search query
        clear_search     : rtypes.func.isRequired
        is_searching     : rtypes.bool.isRequired   # whether or not it is asking the backend for the result of a search
        search_results   : rtypes.immutable.List    # contents to put in the selection box after getting search result back
        item_name        : rtypes.string

    getDefaultProps: ->
        item_name        : 'result'

    getInitialState: ->
        selected_items : '' # currently selected options
        show_selector : false

    shouldComponentUpdate: (newProps, newState) ->
        return newProps.search_results != @props.search_results or
            newProps.item_name != @props.item_name or
            newProps.is_searching != @props.is_searching or
            newState.selected_items != @state.selected_items

    componentWillReceiveProps: (newProps) ->
        @setState
            show_selector : newProps.search_results? and newProps.search_results.size > 0

    clear_and_focus_search_input: ->
        @props.clear_search()
        @setState(selected_items:'')
        @refs.search_input.clear_and_focus_search_input()

    search_button: ->
        if @props.is_searching
            # Currently doing a search, so show a spinner
            <Button>
                <Icon name="circle-o-notch" spin />
            </Button>
        else if @state.show_selector
            # There is something in the selection box -- so only action is to clear the search box.
            <Button onClick={@clear_and_focus_search_input}>
                <Icon name="times-circle" />
            </Button>
        else
            # Waiting for user to start a search
            <Button onClick={(e)=>@refs.search_input.submit(e)}>
                <Icon name="search" />
            </Button>

    add_button_clicked: (e) ->
        e.preventDefault()
        @props.add_selected(@state.selected_items)
        @clear_and_focus_search_input()

    change_selection: (e) ->
        v = []
        for option in e.target.selectedOptions
            v.push(option.label)
        @setState(selected_items : v)

    render_results_list: ->
        v = []
        @props.search_results.map (item) =>
            v.push(<option key={item} value={item} label={item}>{item}</option>)
        return v

    render_add_selector: ->
        <FormGroup>
            <FormControl componentClass='select' multiple ref="selector" size=5 rows=10 onChange={@change_selection}>
                {@render_results_list()}
            </FormControl>
            <ButtonToolbar>
                {@render_add_selector_button()}
                <Button onClick={@clear_and_focus_search_input}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </FormGroup>

    render_add_selector_button: ->
        num_items_selected = @state.selected_items.length ? 0
        btn_text = switch @props.search_results.size
            when 0 then "No #{@props.item_name} found"
            when 1 then "Add #{@props.item_name}"
            else switch num_items_selected
                when 0 then "Select #{@props.item_name} above"
                when 1 then "Add selected #{@props.item_name}"
                else "Add #{num_items_selected} #{@props.item_name}s"
        disabled = @props.search_results.size == 0 or (@props.search_results.size >= 2 and num_items_selected == 0)
        <Button disabled={disabled} onClick={@add_button_clicked}><Icon name="plus" /> {btn_text}</Button>

    render: ->
        <div>
            <SearchInput
                autoFocus     = {true}
                ref           = 'search_input'
                default_value = ''
                placeholder   = "Add #{@props.item_name} by folder name (enter to see available folders)..."
                on_submit     = {@props.do_search}
                on_escape     = {@clear_and_focus_search_input}
                buttonAfter   = {@search_button()}
            />
            {@render_add_selector() if @state.show_selector}
         </div>

# Definitely not a good abstraction.
# Purely for code reuse (bad reason..)
# Complects FilterSearchBar and AddSearchBar...
exports.FoldersToolbar = rclass
    propTypes :
        search        : rtypes.string
        search_change : rtypes.func.isRequired      # search_change(current_search_value)
        num_omitted   : rtypes.number
        project_id    : rtypes.string
        items         : rtypes.object.isRequired
        add_folders   : rtypes.func                 # add_folders (Iterable<T>)
        item_name     : rtypes.string
        plural_item_name : rtypes.string

    getDefaultProps: ->
        item_name : "item"
        plural_item_name : "items"

    getInitialState: ->
        add_is_searching : false
        add_search_results : immutable.List([])

    do_add_search: (search) ->
        if @state.add_is_searching
            return
        @setState(add_is_searching:true)
        salvus_client.find_directories
            project_id : @props.project_id
            query      : "*#{search.trim()}*"
            cb         : (err, resp) =>
                if err
                    @setState(add_is_searching:false, err:err, add_search_results:undefined)
                else
                    filtered_results = @filter_results(resp.directories, search, @props.items)
                    if filtered_results.length == @state.add_search_results.size
                        merged = @state.add_search_results.merge(filtered_results)
                    else
                        merged = immutable.List(filtered_results)
                    @setState(add_is_searching:false, add_search_results:merged)

    # Filter directories based on contents of all_items
    filter_results: (directories, search, all_items) ->
        if directories.length > 0
            # Omit any -collect directory (unless explicitly searched for).
            # Omit any currently assigned directory
            paths_to_omit = []

            active_items = all_items.filter (val) => not val.get('deleted')
            active_items.map (val) =>
                path = val.get('path')
                if path  # path might not be set in case something went wrong (this has been hit in production)
                    paths_to_omit.push(path)

            should_omit = (path) =>
                if path.indexOf('-collect') != -1 and search.indexOf('collect') == -1
                    # omit assignment collection folders unless explicitly searched (could cause confusion...)
                    return true
                return paths_to_omit.includes(path)

            directories = directories.filter (x) => not should_omit(x)
            directories.sort()
        return directories

    submit_selected: (path_list) ->
        @props.add_folders(path_list)
        @clear_add_search()

    clear_add_search: ->
        @setState(add_search_results:immutable.List([]))

    render: ->
        <Row style={marginBottom:'-15px'}>
            <Col md=3>
                <SearchInput
                    placeholder   = {"Find #{@props.plural_item_name}..."}
                    default_value = {@props.search}
                    on_change     = {@props.search_change}
                />
            </Col>
            <Col md=4>
              {<h5>(Omitting {@props.num_omitted} {if @props.num_ommitted > 1 then @props.plural_item_name else @props.item_name})</h5> if @props.num_omitted}
            </Col>
            <Col md=5>
                <MultipleAddSearch
                    add_selected   = {@submit_selected}
                    do_search      = {@do_add_search}
                    clear_search   = {@clear_add_search}
                    is_searching   = {@state.add_is_searching}
                    item_name      = {@props.item_name}
                    err            = {undefined}
                    search_results = {@state.add_search_results}
                 />
            </Col>
        </Row>