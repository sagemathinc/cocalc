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
{COLORS}             = require('smc-util/theme')
{Avatar}             = require('../../other-users')
{EmbeddedChat}       = require('../../side_chat')
editor_chat          = require('../../editor_chat')
chat_redux_name      = editor_chat.redux_name
{NO_DIR}             = require('../../project_store')

# React libraries
{React, rclass, rtypes, redux} = require('../../app-framework')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput, VisibleLG} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# course specific
{NO_ACCOUNT} = require('../util')
{BigTime} = require('../common')

# grading specific
{ROW_STYLE, LIST_STYLE, LIST_ENTRY_STYLE, FLEX_LIST_CONTAINER, EMPTY_LISTING_TEXT, PAGE_SIZE, MAXPOINTS} = require('./common')
{ChatMessageCount} = require('./extras')

listing_colstyle  = {margin: '10px 0'}
listing_colstyle2 = misc.merge({overflow: 'hidden', textOverflow: 'ellipsis'}, listing_colstyle)


exports.Listing = rclass
    displayName : 'CourseEditor-GradingStudentAssignment-Listing'

    propTypes:
        name            : rtypes.string.isRequired
        store           : rtypes.object.isRequired
        assignment      : rtypes.immutable.Map
        listing         : rtypes.immutable.Map
        listing_files   : rtypes.immutable.List
        num_pages       : rtypes.number
        page_number     : rtypes.number
        student_info    : rtypes.immutable.isRequired
        student_id      : rtypes.string.isRequired
        subdir          : rtypes.string
        without_grade   : rtypes.bool
        collected_files : rtypes.bool
        show_all_files  : rtypes.bool
        discussion_path : rtypes.string
        discussion_show : rtypes.bool
        project_id      : rtypes.string.isRequired

    getInitialState: ->
        active_autogrades : immutable.Set()
        opened_discussion : false

    componentWillReceiveProps: (props) ->
        if @props.student_id != props.student_id
            @setState(opened_discussion : props.discussion_show)
        else
            if props.discussion_show
                @setState(opened_discussion : true)

    shouldComponentUpdate: (next) ->
        update = misc.is_different(@props, next, \
            ['assignment', 'listing', 'num_pages', 'page_number', 'student_info',
            'student_id', 'subdir' ,'without_grade', 'collected_files',
            'show_all_files', 'discussion_show', 'discussion_path'])
        update or= @props.listing_files? and (not @props.listing_files.equals(next.listing_files))
        return update
    filepath: (filename) ->
        path_join(@props.subdir, filename)

    fullpath: (filename) ->
        path_join(@collect_student_path(), filename)

    open_assignment: (type, filepath) ->
        @actions(@props.name).open_assignment(type, @props.assignment, @props.student_id, filepath)

    open_directory: (path) ->
        @actions(@props.name).grading(
            assignment       : @props.assignment
            student_id       : @props.student_id
            direction        : 0
            subdir           : path
        )

    render_listing_path: ->
        crumbs  = [
            <Breadcrumb.Item
                key        = {''}
                onClick    = {=>@open_directory('')}
            >
                <Icon name='home' />
            </Breadcrumb.Item>
        ]

        path = ''
        segments = @props.subdir.split('/')
        segments.map (segment) =>
            path = path_join(path, segment)
            do (path, segment) =>
                crumbs.push(
                    <Breadcrumb.Item
                        key        = {path}
                        onClick    = {=>@open_directory(path)}
                    >
                        {segment}
                    </Breadcrumb.Item>
                )

        <div style={flex:'1', padding:'0'}>
            <Breadcrumb bsSize='small' style={margin: '0 15px 15px 0'}>
                {crumbs}
            </Breadcrumb>
        </div>

    listing_page: (offset) ->
        p = @props.page_number + offset
        @actions(@props.name).grading_set_entry('page_number', p)

    render_listing_pager: ->
        if (not @props.num_pages?) or (@props.num_pages ? 1) == 1 or (not @props.page_number?)
            return null
        btn_style =
            whiteSpace: 'nowrap'
        <div style={padding:'0', flex:'0', marginRight: '15px'}>
            <ButtonGroup style={marginBottom:'5px', display:'flex'}>
                <Button
                    onClick    = {=>@listing_page(-1)}
                    disabled   = {@props.page_number <= 0}
                    style      = {btn_style}
                >
                    <Icon name='angle-double-left' /> Prev
                </Button>
                <Button
                    style      = {btn_style}
                    disabled
                >
                    {"#{@props.page_number + 1}/#{@props.num_pages}"}
                </Button>
                <Button
                    onClick    = {=>@listing_page(+1)}
                    disabled   = {@props.page_number >= @props.num_pages - 1}
                    style      = {btn_style}
                >
                     Next <Icon name='angle-double-right' />
                </Button>
            </ButtonGroup>
        </div>

    toggle_show_all_files: ->
        @actions(@props.name).grading_toggle_show_all_files()

    toggle_discussion: (show) ->
        @actions(@props.name).grading_toggle_show_discussion(show)

    render_toggle_show_all_files: ->
        visible = @props.show_all_files
        icon    = if visible then 'eye' else 'eye-slash'

        <Button
            onClick    = {=>@toggle_show_all_files()}
            style      = {whiteSpace: 'nowrap'}
        >
            <Tip
                title     = {'Show/hide files'}
                tip       = {'By default, less important files are hidden from the files listing.'}
                placement = {'top'}
            >
                <Icon name={icon} />
            </Tip>
        </Button>

    # TODO this is pure demo
    autograde: (ext, filename) ->
        # ext in ['ipynb']
        fullpath = @fullpath(filename)
        filepath = @filepath(filename)
        @setState(active_autogrades : @state.active_autogrades.add(filepath))
        done = =>
            @save_points(filename, Math.floor(10 * Math.random()))
            @setState(active_autogrades : @state.active_autogrades.remove(filepath))
        setTimeout(done, 3000)

    render_autograde: (filename) ->
        ext    = misc.separate_file_extension(filename).ext
        active = @state.active_autogrades.includes(@filepath(filename))
        if active
            icon = <Icon name='cc-icon-cocalc-ring' spin />
        else
            icon = <Icon name='graduation-cap' />

        if ext == 'ipynb'
            <Button
                onClick  = {=>@autograde(ext, filename)}
                bsStyle  = {'default'}
                bsSize   = {'small'}
                disabled = {active}
            >
                {icon} Autograde
            </Button>

    listing_header: ->
        header_style =
            background  : COLORS.GRAY_LLL
            color       : COLORS.GRAY
            padding     : '5px 0px'

        <Row
            key    = {'header'}
            style  = {header_style}
        >
            <Col md={4}>Filename</Col>
            <Col md={2}>Last modified</Col>
            <Col md={4}>Points</Col>
            {###
            <Col md={2}>Autograde</Col>
            ###}
            <Col md={2} style={textAlign:'right'}>Student file</Col>
        </Row>

    save_points: (filename, points) ->
        filepath = @filepath(filename)
        @actions(@props.name).set_points(@props.assignment, @props.student_id, filepath, points)

    render_points_input: (filename) ->
        filepath = @filepath(filename)
        points   = @props.store.get_points_filepath(@props.assignment, @props.student_id, filepath)
        <NumberInput
            number          = {points}
            bsSize          = {'small'}
            min             = {0}
            max             = {MAXPOINTS}
            bsSize          = {'small'}
            formgroupstyle  = {'marginBottom' : 0}
            on_change       = {(val)=>@save_points(filename, val)}
            plusminus       = {true}
            select_on_click = {true}
            mantissa_length = {2}
            allow_empty     = {true}
            empty_text      = {'(no points)'}
        />

    render_points_subdir: (subdir) ->
        p = @props.store.get_points_subdir(@props.assignment, @props.student_id, subdir)
        return "Sum: #{p} #{misc.plural(p, 'pt')}."

    open_subdir: (subdir) ->
        if @props.subdir.length > 0
            name = subdir[@props.subdir.length+1 ..]
        else
            name = subdir
        style =
            fontWeight    : 'bold'
            cursor        : 'pointer'
        <a
            style   = {style}
            onClick = {=>@actions(@props.name).grading(
                assignment       : @props.assignment
                student_id       : @props.student_id
                direction        : 0
                without_grade    : @props.without_grade
                collected_files  : @props.collected_files
                subdir           : subdir
            )}
        >
            <Icon name='folder-open-o'/> {name}{'/'}
        </a>

    open_file: (filename, masked) ->
        filepath = @filepath(filename)
        style =
            fontWeight    : 'bold'
            cursor        : 'pointer'
        if masked
            style.color      = COLORS.GRAY
            style.fontWeight = 'inherit'
        <a
            style     = {style}
            onClick   = {=>@open_assignment('collected', filepath)}
        >
            {filename}
        </a>

    render_open_student_file: (filename) ->
        filepath = @filepath(filename)
        <Tip
            title     = {"Open the student's file"}
            title     = {"This opens the corresponding file in the student's project. This allows you to see the progress via 'TimeTravel' for many file types, etc."}
            placement = {'left'}
        >
            <Button
                onClick = {=>@open_assignment('assigned', filepath)}
                bsStyle = {'default'}
                bsSize  = {'small'}
                style   = {color:COLORS.GRAY}
            >
                Student file <Icon name='external-link' />
            </Button>
        </Tip>

    listing_directory_row: (filename, time) ->
        subdirpath = path_join(@props.subdir, filename)
        <React.Fragment>
            <Col md={4} style={listing_colstyle2}>{@open_subdir(subdirpath)}</Col>
            <Col md={2} style={listing_colstyle}>{time}</Col>
            <Col md={4} style={listing_colstyle}>{@render_points_subdir(subdirpath)}</Col>
            <Col md={2}></Col>
        </React.Fragment>

    listing_file_row: (filename, time, masked) ->
        <React.Fragment>
            <Col md={4} style={listing_colstyle2}>{@open_file(filename, masked)}</Col>
            <Col md={2} style={listing_colstyle}>{time}</Col>
            <Col md={4}>{@render_points_input(filename)}</Col>
            {### <Col md={3}>{@render_autograde(filename)}</Col> ###}
            <Col md={2} style={textAlign:'right'}>{@render_open_student_file(filename)}</Col>
        </React.Fragment>

    listing_rowstyle: (idx) ->
        col = if idx %% 2 == 0 then 'white' else COLORS.GRAY_LLL
        style =
            background     : col
            paddingTop     : '5px'
            paddingBottom  : '5px'
        return misc.merge(style, LIST_ENTRY_STYLE)

    listing_error: (error) ->
        if error = NO_DIR
            # TODO insert collect button here and refresh listing accordingly ...
            return <div style={EMPTY_LISTING_TEXT}>
                       No directory. Not yet collected from student?
                   </div>
        else
            return <div style={EMPTY_LISTING_TEXT}>
                       <div>Got an error listing directory:</div>
                       <pre>{error}</pre>
                   </div>

    listing_entries: ->
        return @render_loading() if not @props.listing?

        error = @props.listing.get('error')
        return @listing_error(error) if error?

        files = @props.listing_files
        if files?.size > 0
            begin = PAGE_SIZE * (@props.page_number ? 0)
            end   = begin + PAGE_SIZE
            return files.slice(begin, end).map (file, idx) =>
                filename = file.get('name')
                masked   = file.get('mask') ? false
                time     = <BigTime date={(file.get('mtime') ? 0) * 1000} />
                isdir    = file.get('isdir') == true

                <li key={filename} style={@listing_rowstyle(idx)} className={'list-group-item'}>
                    <Row>
                    {
                        if isdir
                            @listing_directory_row(filename, time)
                        else
                            @listing_file_row(filename, time, masked)
                    }
                    </Row>
                </li>
        else
            return <div style={EMPTY_LISTING_TEXT}>No files.</div>

    listing_more_files_info: ->
        num_pages = @props.num_pages ? 1
        page      = (@props.page_number ? 1) + 1
        return null if num_pages == 1 or page >= num_pages
        <Row style={color:COLORS.GRAY} key={'listing_bottom'}>
            More files are on the{' '}
            <a style={cursor:'pointer'} onClick={=>@listing_page(+1)}>next page</a> …
        </Row>

    listing: ->
        listing = <Row style={FLEX_LIST_CONTAINER} key={'listing'}>
            <ul className='list-group' style={LIST_STYLE}>
                {@listing_entries()}
            </ul>
        </Row>
        more = @listing_more_files_info()
        return (if more? then [listing, more] else listing)

    render_switch_mode_buttons: ->
        chat_name = chat_redux_name(@props.project_id, @props.discussion_path)

        <div style={padding:'0', flex:'0', marginRight: '15px'}>
            <ButtonGroup style={marginBottom:'5px', display:'flex'}>
                <Button
                    onClick   = {=>@toggle_discussion(false)}
                    active    = {not @props.discussion_show}
                    style     = {whiteSpace: 'nowrap'}
                >
                    <Tip
                        title     = {'Show collected files of student assignment.'}
                        placement = {'bottom'}
                    >
                        <Icon name={'copy'} /> <VisibleLG> Files</VisibleLG>
                    </Tip>
                </Button>
                <Button
                    onClick   = {=>@toggle_discussion(true)}
                    active    = {@props.discussion_show}
                    style     = {whiteSpace:'nowrap'}
                >
                    <Tip
                        title     = {'Show associated private discussion.'}
                        placement = {'bottom'}
                    >
                        <Icon name={'comments'} />{' '}
                        <ChatMessageCount
                            highlight = {(not @props.discussion_show) and (not @state.opened_discussion)}
                            chat_name = {chat_name}
                        />
                    </Tip>
                </Button>
            </ButtonGroup>
        </div>

    render_discussion_info: ->
        outer_style =
            flex            : '1'
            padding         : '0'
            display         : 'flex'
            alignItems      : 'center'
            justifyContent  : 'center'

        inner_style =
            color           : COLORS.GRAY
            fontSize        : 'small'

        <div style={outer_style}>
            <div style={inner_style}>
                (This is a private discussion. It is not shared with the student.)
            </div>
        </div>

    render_show_student_files_button: ->
        <Button
            onClick = {=>@open_assignment('assigned')}
            style   = {whiteSpace:'nowrap'}
        >
            <Tip
                title     = {"Open this directory of files in the student's project."}
                placement = {'bottom'}
            >
                Student <Icon name='external-link' />
            </Tip>
        </Button>

    render_open_collected_files_button: ->
        last_collect_time  = @props.student_info.getIn(['last_collect', 'time'])
        if last_collect_time
            time      = <BigTime date={last_collect_time} />
        else
            time      = "never"

        # enable collected button only when we have listing information and some files without errors
        disabled = not @props.listing?
        disabled or= (@props.listing?.get('error')?.length > 0) ? false

        <Button
            style    = {whiteSpace:'nowrap'}
            disabled = {disabled}
            onClick  = {=>@open_assignment('collected')}
        >
            <Tip
                title     = {'Open the collected files right here in your own project.'}
                placement = {'bottom'}
            >
                <Icon name='folder-open-o' /><span className='hidden-md'> Collected</span> {time}
            </Tip>
        </Button>

    render_listing_buttons: ->
        <div style={padding:'0', flex:'0'}>
            <ButtonGroup style={marginBottom:'5px', display:'flex'}>
                {@render_toggle_show_all_files() if not @props.discussion_show}
                {@render_open_collected_files_button() if not @props.discussion_show}
                {@render_show_student_files_button()}
            </ButtonGroup>
        </div>

    listing_controls: ->
        <Row key={'controls'}>
            <div style={display: 'flex', flexDirection: 'row'}>
                {@render_switch_mode_buttons()}
                {@render_listing_pager() if not @props.discussion_show}
                {
                    if @props.discussion_show
                        @render_discussion_info()
                    else
                        @render_listing_path()
                }
                {@render_listing_buttons()}
            </div>
        </Row>

    discussion: ->
        <Row style={FLEX_LIST_CONTAINER} key={'discussion'}>
        {
            if not @props.discussion_path?
                @render_loading()
            else if @props.discussion_path == NO_ACCOUNT
                <Alert bsStyle={'info'}>
                    No account exists for this student yet.
                    The student needs to register first, or sort out any related issues!
                </Alert>
            else
                <EmbeddedChat
                    path       = {@props.discussion_path}
                    redux      = {redux}
                    project_id = {@props.project_id}
                />
        }
        </Row>

    render_loading: ->
        <div style={EMPTY_LISTING_TEXT}><Loading /></div>

    render: ->
        <React.Fragment>
            {@listing_controls()}
            {
                if @props.discussion_show
                    @discussion()
                else
                    <React.Fragment>
                        {@listing_header()}
                        {@listing()}
                    </React.Fragment>
            }
        </React.Fragment>
