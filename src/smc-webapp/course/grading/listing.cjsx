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

# React libraries
{React, rclass, rtypes} = require('../../smc-react')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# grading specific
{BigTime} = require('../common')
{ROW_STYLE, LIST_STYLE, LIST_ENTRY_STYLE, FLEX_LIST_CONTAINER, EMPTY_LISTING_TEXT, PAGE_SIZE, MAXPOINTS} = require('./const')

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

    getInitialState: ->
        active_autogrades : immutable.Set()

    shouldComponentUpdate: (next) ->
        x = misc.is_different(@props, next, \
            ['assignment', 'listing', 'num_pages', 'page_number', 'student_info',
            'student_id', 'subdir' ,'without_grade', 'collected_files', 'show_all_files'])
        y = @props.listing_files? and (not @props.listing_files.equals(next.listing_files))
        return x or y

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

        <Breadcrumb bsSize='small' style={margin: '0 15px 15px 0'}>
            {crumbs}
        </Breadcrumb>

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
        [
            <Col key={0} md={4} style={listing_colstyle2}>{@open_subdir(subdirpath)}</Col>
            <Col key={1} md={2} style={listing_colstyle}>{time}</Col>
            <Col key={2} md={4} style={listing_colstyle}>{@render_points_subdir(subdirpath)}</Col>
            <Col key={3} md={2}></Col>
        ]

    listing_file_row: (filename, time, masked) ->
        [
            <Col key={0} md={4} style={listing_colstyle2}>{@open_file(filename, masked)}</Col>
            <Col key={1} md={2} style={listing_colstyle}>{time}</Col>
            <Col key={2} md={4}>{@render_points_input(filename)}</Col>
            # <Col key={3} md={3}>{@render_autograde(filename)}</Col>
            <Col key={5} md={2} style={textAlign:'right'}>{@render_open_student_file(filename)}</Col>
        ]

    listing_rowstyle: (idx) ->
        col = if idx %% 2 == 0 then 'white' else COLORS.GRAY_LL
        style =
            background     : col
            paddingTop     : '5px'
            paddingBottom  : '5px'
        return misc.merge(style, LIST_ENTRY_STYLE)

    listing_error: (error) ->
        if error = 'no_dir'
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
        if not @props.listing?
            return <div style={EMPTY_LISTING_TEXT}><Loading /></div>

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
            More files are on the <a style={cursor:'pointer'} onClick={=>@listing_page(+1)}>next page</a> …
        </Row>

    listing: ->
        listing = <Row style={FLEX_LIST_CONTAINER} key={'listing'}>
            <ul className='list-group' style={LIST_STYLE}>
                {@listing_entries()}
            </ul>
        </Row>
        more = @listing_more_files_info()
        return (if more? then [listing, more] else listing)

    listing_controls: ->
        last_collect_time  = @props.student_info.getIn(['last_collect', 'time'])
        if last_collect_time
            time      = <BigTime date={last_collect_time} />
        else
            time      = "never"

        # enable button only when we have listing information and some files without errors
        disabled = not @props.listing?
        disabled or= (@props.listing?.get('error')?.length > 0) ? false

        <Row key={'controls'}>
            <div style={display: 'flex', flexDirection: 'row'}>
                {@render_listing_pager()}
                <div style={padding:'0', flex:'1'}>
                    {@render_listing_path()}
                </div>
                <div style={padding:'0', flex:'0'}>
                    <ButtonGroup style={marginBottom:'5px', display:'flex'}>
                        {@render_toggle_show_all_files()}
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
                    </ButtonGroup>
                </div>
            </div>
        </Row>

    render: ->
        [
            @listing_controls()
            @listing_header()
            @listing()
        ]