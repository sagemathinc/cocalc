##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

path      = require('path')
path_join = path.join
immutable = require('immutable')
_         = require('underscore')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../../webapp_client')
{COLORS}             = require('smc-util/theme')
{Avatar}             = require('../../other-users')

# React libraries
{React, rclass, rtypes, ReactDOM} = require('../../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# CoCalc and course components
util   = require('../util')
styles = require('../styles')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{STEPS, step_direction, step_verb, step_ready} = util

# Grading specific
{Grading}       = require('./models')
{Grade}         = require('./grade')
{GradingStats}  = require('./stats')
{Listing}       = require('./listing')
{StudentList}   = require('./student-list')
{ROW_STYLE, LIST_STYLE, LIST_ENTRY_STYLE, FLEX_LIST_CONTAINER, EMPTY_LISTING_TEXT, PAGE_SIZE} = require('./const')


exports.GradingStudentAssignment = rclass
    displayName : "CourseEditor-GradingStudentAssignment"

    propTypes :
        name            : rtypes.string.isRequired
        redux           : rtypes.object.isRequired
        assignment      : rtypes.object.isRequired
        students        : rtypes.object.isRequired
        user_map        : rtypes.object.isRequired
        grading         : rtypes.instanceOf(Grading).isRequired

    reduxProps:
        account :
            account_id  : rtypes.string

    shouldComponentUpdate: (props) ->
        misc.is_different(@props, props, ['assignment', 'students', 'user_map', 'grading'])

    getInitialState: ->
        store : @props.redux.getStore(@props.name)
        #active_autogrades : immutable.Set()

    componentDidMount: ->
        show_entry       =  =>
            $(ReactDOM.findDOMNode(@refs.student_list)).find('.active').scrollintoview()
        @scrollToStudent = _.debounce(show_entry, 100)
        @scrollToStudent()

        if @_timer?
            clearInterval(@_timer)
        @_timer = setInterval((=>@actions(@props.name).grading_update_activity()), 60 * 1000)

    componentWillUnmount: ->
        if @_timer?
            clearInterval(@_timer)
        delete @_timer
        # don't call actions.grading_remove_activity, because the user is probably just in another tab

    componentDidUpdate: (prevProps, prevState) ->
        # only scroll when current_idx in the student list changes
        if prevProps.grading?.current_idx != @props.grading?.current_idx
            @scrollToStudent()

    collect_student_path: ->
        return path_join(@props.assignment.get('collect_path'), @props.grading.student_id, @props.grading.subdir)

    jump: (direction, without_grade, collected_files) ->
        @actions(@props.name).grading(
            assignment       : @props.assignment
            student_id       : @props.grading.student_id
            direction        : direction
            without_grade    : without_grade
            collected_files  : collected_files
        )

    previous: (without_grade, collected_files) ->
        @jump(-1, without_grade, collected_files)

    next: (without_grade, collected_files) ->
        @jump(+1, without_grade, collected_files)

    pick_next: (direction=1) ->
        without_grade   = @get_only_not_graded()
        collected_files = @get_only_collected()
        @jump(direction, without_grade, collected_files)

    render_info: ->
        if @props.grading.end_of_list
            <span>End of student list</span>
        else if @props.grading.student_id?
            student_name = @state.store.get_student_name(@props.grading.student_id, true)
            <span style={fontSize:'120%'}>Student <b>{student_name?.full ? 'N/A'}</b></span>

    get_only_not_graded: ->
        @props.grading.only_not_graded

    get_only_collected: ->
        @props.grading.only_collected

    set_only_not_graded: (only_not_graded) ->
        actions = @actions(@props.name)
        actions.grading_set_entry('only_not_graded', only_not_graded)

    set_only_collected: (only_collected) ->
        actions = @actions(@props.name)
        actions.grading_set_entry('only_collected', only_collected)

    render_filter_only_not_graded: ->
        only_not_graded = @get_only_not_graded()
        if only_not_graded
            icon = 'check-square-o'
        else
            icon = 'square-o'

        <Button
            onClick  = {=>@set_only_not_graded(not only_not_graded)}
            bsStyle  = {'default'}
        >
            <Icon name={icon} /> Not graded
        </Button>

    render_filter_only_collected: ->
        only_collected = @get_only_collected()
        if only_collected
            icon = 'check-square-o'
        else
            icon = 'square-o'

        <Button
            onClick  = {=>@set_only_collected(not only_collected)}
            bsStyle  = {'default'}
        >
            <Icon name={icon} /> Collected
        </Button>

    render_nav: () ->
        <Col md={3}>
            <Row style={ROW_STYLE}>
                <ButtonGroup>
                    <Button
                        onClick  = {=>@pick_next(-1)}
                        bsStyle  = {'default'}
                        disabled = {@props.grading.current_idx == 0}
                    >
                        <Icon name={'step-backward'} />
                    </Button>
                    <Button
                        onClick  = {=>@pick_next(+1)}
                        bsStyle  = {'primary'}
                    >
                        <Icon name={'step-forward'} /> Pick next
                        <span className='hidden-md'> student</span>
                    </Button>
                </ButtonGroup>
            </Row>
            <Row style={color:COLORS.GRAY}>
                Filter students by:
            </Row>
            <Row style={ROW_STYLE}>
                <ButtonGroup>
                    {@render_filter_only_not_graded()}
                    {@render_filter_only_collected()}
                </ButtonGroup>
            </Row>
        </Col>

    percentile_rank_help: ->
        url = 'https://en.wikipedia.org/wiki/Percentile_rank'
        {open_new_tab} = require('smc-webapp/misc_page')
        open_new_tab(url)

    render_points: ->
        <Row>
            <Col md={10} style={textAlign: 'center'}>
                <ButtonGroup>
                    <Button
                        disabled={true}
                    >
                        Total points
                    </Button>
                    <Button
                        style    = {fontWeight: 'bold', color:'black', paddingLeft:'20px', paddingRight:'20px'}
                        disabled = {true}
                    >
                        {misc.round2(@props.grading.total_points)}
                    </Button>
                    {
                        if @props.grading.all_points.size >= 5
                            pct = misc.percentRank(
                                @props.grading.all_points.toJS(),
                                @props.grading.total_points,
                                true
                            )
                            <Button
                                style     = {color: COLORS.GRAY}
                                onClick   = {=>@percentile_rank_help()}
                            >
                                {misc.round1(pct)}%
                                <span className='hidden-md'> percentile</span>
                            </Button>
                    }
                </ButtonGroup>
            </Col>
        </Row>

    start_fresh: ->
        @actions(@props.name).grading(
            student_id       : undefined
            assignment       : @props.assignment
            without_grade    : @get_only_not_graded()
            collected_files  : @get_only_collected()
        )

    render_end_of_list: ->
        <Col>
            <Row style={marginTop: '75px', marginBottom:'30px'}>
                <h2 style={textAlign:'center'}>
                    Congratulations! You reached the end of the student list.
                </h2>
                <div style={color:COLORS.GRAY, textAlign:'center'}>
                    Take a deep breath and …
                </div>
            </Row>
            <Row style={textAlign:'center', marginBottom:'100px'}>
                <Button
                    onClick  = {=>@start_fresh()}
                    bsStyle  = {'primary'}
                    bsSize   = {'large'}
                >
                    … take another round <Space/> <Icon name='gavel' />
                </Button>
                <Button
                    style    = {marginLeft: '3rem'}
                    onClick  = {=>@actions(@props.name).grading_stop()}
                    bsStyle  = {'default'}
                    bsSize   = {'large'}
                >
                    <Icon name={'sign-out'} /> Exit
                </Button>
            </Row>
        </Col>

    render: ->
        if @props.grading.end_of_list
            return @render_end_of_list()

        if not @props.grading.student_id?
            return <div>No student left to grade…</div>

        flexcolumn =
            display        : 'flex'
            flexDirection  : 'column'
            marginRight    : '15px'

        <Row
            style={height: '70vh', display: 'flex'}
        >
            <Col md={3} style={misc.merge({marginLeft:'15px'}, flexcolumn)}>
                <StudentList
                    name             = {@props.name}
                    store            = {@state.store}
                    assignment       = {@props.assignment}
                    cursors          = {@props.grading.cursors}
                    student_list     = {@props.grading.student_list}
                    student_filter   = {@props.grading.student_filter}
                    student_id       = {@props.grading.student_id}
                    account_id       = {@props.account_id}
                    anonymous        = {@props.grading.anonymous}
                />
            </Col>
            <Col md={9} style={flexcolumn}>
                <Row style={marginBottom: '15px'}>
                    {@render_nav()}
                    <Col md={5}>
                        {@render_points()}
                        <GradingStats all_points={@props.grading.all_points} />
                    </Col>
                    <Grade
                        actions        = {@actions(@props.name)}
                        store          = {@state.store}
                        assignment     = {@props.assignment}
                        student_id     = {@props.grading.student_id}
                        list_of_grades = {@props.grading.list_of_grades}
                    />
                </Row>
                {###
                Info: <code>{misc.to_json(@props.grading.student_info)}</code>.
                <br/>
                ###}
                <Listing
                    name             = {@props.name}
                    store            = {@state.store}
                    assignment       = {@props.assignment}
                    page_number      = {@props.grading.page_number}
                    num_pages        = {@props.grading.num_pages}
                    student_info     = {@props.grading.student_info}
                    listing          = {@props.grading.listing}
                    listing_files    = {@props.grading.listing_files}
                    student_id       = {@props.grading.student_id}
                    subdir           = {@props.grading.subdir}
                    without_grade    = {@get_only_not_graded()}
                    collected_files  = {@get_only_collected()}
                    show_all_files   = {@props.grading.show_all_files}
                />
            </Col>
        </Row>
