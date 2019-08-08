###############################################################################
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

misc = require('smc-util/misc')
misc_page = require('./misc_page')
underscore = require('underscore')
immutable  = require('immutable')

{React, ReactDOM, rtypes, rclass, Redux, redux}  = require('./app-framework')
{Grid, Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, InputGroup, Panel, Well} = require('react-bootstrap')
{Icon, Loading, TimeAgo, PathLink, r_join, SearchInput, Space, Tip} = require('./r_misc')
{WindowedList} = require("./r_misc/windowed-list")
{User} = require('./users')
{file_actions} = require('./project_store')
{ProjectTitleAuto} = require('./projects')

{file_associations} = require('./file-associations')

LogMessage = rclass
    displayName : 'ProjectLog-LogMessage'

    render:->
        <div>
            This is a log message
        </div>

# This is used for these cases, where `account_id` isn't set. This means, a back-end system process is responsible.
# In the case of stopping a project, the name is recorded in the event.by field.
SystemProcess = rclass
    displayName : 'ProjectLog-SystemProcess'

    propTypes :
        event : rtypes.any

    render: ->
        if @props.event.by?
            <span>System service <code>{@props.event.by}</code></span>
        else
            <span>A system service</span>

LogSearch = rclass
    displayName : 'ProjectLog-LogSearch'

    componentWillMount: ->
        @mounted = true
        @on_change = underscore.debounce(@on_change, 300)

    componentWillUnmount: ->
        delete @mounted
        delete @on_change

    propTypes :
        search           : rtypes.string
        actions          : rtypes.object.isRequired
        selected         : rtypes.immutable.Map
        increment_cursor : rtypes.func.isRequired
        decrement_cursor : rtypes.func.isRequired
        reset_cursor     : rtypes.func.isRequired

    open_selected: (value, info) ->
        e = @props.selected?.get('event')
        if not e?
            return
        e = e.toJS()
        switch e.event
            when 'open'
                target = e.filename
                if target?
                    @props.actions.open_file
                        path       : target
                        foreground : not info.ctrl_down
            when 'set'
                @props.actions.set_active_tab('settings')

    on_change: (value) ->
        if not @mounted
            return
        @props.reset_cursor()
        @props.actions.setState(search : value)

    render: ->
        <SearchInput
            ref         = {"box"}
            autoFocus   = {true}
            autoSelect  = {true}
            placeholder = 'Search log...'
            value       = {@props.search}
            on_change   = {@on_change}
            on_submit   = {@open_selected}
            on_up       = {@props.decrement_cursor}
            on_down     = {@props.increment_cursor}
            on_escape   = {=> @props.actions.setState(search:'')}
        />

selected_item =
    backgroundColor : '#08c'
    color           : 'white'

LogEntry = rclass
    displayName : 'ProjectLog-LogEntry'

    propTypes :
        time            : rtypes.object
        event           : rtypes.any
        account_id      : rtypes.string
        user_map        : rtypes.object
        cursor          : rtypes.bool
        backgroundStyle : rtypes.object
        project_id      : rtypes.string

    render_took: ->
        if not @props.event?.time
            return
        <span style={color:'#666'}>
            <Space />(took {(Math.round(@props.event.time/100)/10).toFixed(1)}s)
        </span>

    render_open_file: ->
        <span>opened<Space/>
            <PathLink
                path       = {@props.event.filename}
                full       = {true}
                style      = {if @props.cursor then selected_item}
                trunc      = {50}
                project_id = {@props.project_id} />
            {@render_took()}
        </span>

    render_start_project: ->
        <span>started this project {@render_took()}</span>

    render_project_restart_requested: ->
        <span>requested to restart this project</span>

    render_project_stop_requested: ->
        <span>requested to stop this project</span>

    render_project_stopped: ->
        <span>stopped this project</span>

    render_miniterm_command: (cmd) ->
        if cmd.length > 50
            <Tip title='Full command' tip={cmd} delayHide={10000} rootClose={true} >
                <kbd>{misc.trunc_middle(cmd, 50)}</kbd>
            </Tip>
        else
            <kbd>{cmd}</kbd>

    render_miniterm: ->
        <span>executed mini terminal command {@render_miniterm_command(@props.event.input)}</span>

    project_title: ->
        <ProjectTitleAuto style={if @props.cursor then selected_item} project_id={@props.event.project} />

    file_link: (path, link, i, project_id) ->
        <PathLink
            path       = {path}
            full       = {true}
            style      = {if @props.cursor then selected_item}
            key        = {i}
            trunc      = {50}
            link       = {link}
            project_id = {project_id ? @props.project_id} />

    multi_file_links: (link = true) ->
        links = []
        for path, i in @props.event.files
            links.push @file_link(path, link, i)
        return r_join(links)

    to_link: ->
        e = @props.event
        if e.project?
            return @project_title()
        else if e.dest?
            return @file_link(e.dest, true, 0)
        else
            return "???"

    render_file_action: ->
        e = @props.event
        switch e?.action
            when 'deleted'
                <span>deleted {@multi_file_links(false)} {(if e.count? then "(#{e.count} total)" else '')}</span>
            when 'downloaded'
                <span>downloaded {@file_link(e.path ? e.files, true, 0)} {(if e.count? then "(#{e.count} total)" else '')}</span>
            when 'moved'
                <span>moved {@multi_file_links(false)} {(if e.count? then "(#{e.count} total)" else '')} to {@to_link()}</span>
            when 'copied'
                <span>copied {@multi_file_links()} {(if e.count? then "(#{e.count} total)" else '')} to {@to_link()}</span>
            when 'shared'
                <span>shared {@multi_file_links()} {(if e.count? then "(#{e.count} total)" else '')}</span>
            when 'uploaded'
                <span>uploaded {@file_link(e.file, true, 0)}</span>

    click_set: (e) ->
        e.preventDefault()
        @actions(project_id : @props.project_id).set_active_tab('settings')

    render_set: (obj) ->
        i = 0
        for key, value of obj
            i += 1
            content = "#{key} to #{value}"
            if i < obj.length
                content += '<Space/>and'
            <span key={i}>
                set <a onClick={@click_set} style={if @props.cursor then selected_item} href=''>{content}</a>
            </span>

    render_x11: ->
        return if not @props.event.action == 'launch'
        <span>launched X11 app <code>{@props.event.command}</code> in {@file_link(@props.event.path, true, 0)}</span>

    render_library: ->
        return if not @props.event.target?
        <span>copied "{@props.event.title}" from the library to {@file_link(@props.event.target, true, 0)}</span>

    render_assistant: ->
        e = @props.event
        switch e?.action
            when 'insert'
                lang = misc.jupyter_language_to_name(e.lang)
                <span>used the <i>assistant</i> to insert the "{lang}" example{' '}
                    {'"'}{e.entry.join(' → ')}{'"'}
                    {' into '}
                    <PathLink
                        path       = {@props.event.path}
                        full       = {true}
                        style      = {if @props.cursor then selected_item}
                        trunc      = {50}
                        project_id = {@props.project_id}
                    />
                </span>

    render_upgrade: ->
        params = require('smc-util/schema').PROJECT_UPGRADES.params
        v = []
        for param, val of @props.event.upgrades
            factor = params[param]?.display_factor ? 1
            unit = params[param]?.display_unit ? 'upgrade'
            display = params[param]?.display ? 'Upgrade'
            n = misc.round1(if val? then factor * val else 0)
            v.push <span key={param}>
                {display}: {n} {misc.plural(n, unit)}
            </span>
        v = if v.length > 0 then r_join(v) else 'nothing'
        <span>set <a onClick={@click_set} style={if @props.cursor then selected_item} href=''>upgrade contributions</a> to: {v}</span>

    render_invite_user: ->
        <span>invited user <User user_map={@props.user_map} account_id={@props.event.invitee_account_id} /></span>

    render_invite_nonuser: ->
        <span>invited nonuser {@props.event.invitee_email}</span>

    render_remove_collaborator: ->
        <span>removed collaborator {@props.event.removed_name}</span>

    file_action_icons :
        deleted    : 'delete'
        downloaded : 'download'
        moved      : 'move'
        copied     : 'copy'
        share      : 'shared'
        uploaded   : 'upload'

    render_desc: ->
        if typeof(@props.event) is 'string'
            return <span>{@props.event}</span>

        switch @props.event?.event
            when 'start_project'
                return @render_start_project()
            when 'project_stop_requested'
                return @render_project_stop_requested()
            when 'project_restart_requested'
                return @render_project_restart_requested()
            when 'project_stopped'
                return @render_project_stopped()
            when 'open' # open a file
                return @render_open_file()
            when 'set'
                return @render_set(misc.copy_without(@props.event, 'event'))
            when 'miniterm'
                return @render_miniterm()
            when 'termInSearch'
                return @render_miniterm()
            when 'file_action'
                return @render_file_action()
            when 'upgrade'
                return @render_upgrade()
            when 'invite_user'
                return @render_invite_user()
            when 'invite_nonuser'
                return @render_invite_nonuser()
            when 'remove_collaborator'
                return @render_remove_collaborator()
            when 'open_project'  # not used anymore???
                return <span>opened this project</span>
            when 'library'
                return @render_library()
            when 'assistant'
                return @render_assistant()
            when 'x11'
                return @render_x11()
            # ignore unknown -- would just look mangled to user...
            #else
            # FUTURE:
            #    return <span>{misc.to_json(@props.event)}</span>

    render_user: ->
        if @props.account_id?
            <User user_map={@props.user_map} account_id={@props.account_id} />
        else
            <SystemProcess event={@props.event} />

    icon: ->
        if not @props.event?.event
            return 'dot-circle-o'

        switch @props.event.event
            when 'open_project'
                return 'folder-open-o'
            when 'open' # open a file
                x = file_associations[@props.event.type]?.icon
                if x?
                    if x.slice(0,3) == 'fa-'  # temporary -- until change code there?
                        x = x.slice(3)
                    return x
                else
                    return 'file-code-o'
            when 'set'
                return 'wrench'
            when 'file_action'
                icon = @file_action_icons[@props.event.action]
                return file_actions[icon]?.icon
            when 'upgrade'
                return 'arrow-circle-up'
            when 'invite_user'
                return 'user'
            when 'invite_nonuser'
                return 'user'

        if @props.event.event.indexOf('project') != -1
            return 'edit'
        else
            return 'dot-circle-o'

    render: ->
        style = if @props.cursor then selected_item else @props.backgroundStyle
        <Grid fluid={true} style={{width:'100%'}}>
            <Row style={underscore.extend({borderBottom:'1px solid lightgrey'}, style)}>
                <Col sm={1} style={textAlign:'center'}>
                    <Icon name={@icon()} style={style} />
                </Col>
                <Col sm={11}>
                    {@render_user()}<Space/>
                    {@render_desc()}<Space/>
                    <TimeAgo style={style} date={@props.time} popover={true} />
                </Col>
            </Row>
        </Grid>

exports.ProjectLog = rclass ({name}) ->
    displayName : 'ProjectLog'

    reduxProps:
        "#{name}" :
            project_log     : rtypes.immutable
            project_log_all : rtypes.immutable
            search          : rtypes.string
        users :
            user_map    : rtypes.immutable
            get_name    : rtypes.func

    propTypes:
        project_id : rtypes.string.isRequired

    getDefaultProps: ->
        search : ''   # search that user has requested

    getInitialState: ->
        # Temporarily sticking this here until we switch to typescript
        @windowed_list_ref = React.createRef()

        return {cursor_index : 0}

    shouldComponentUpdate: (nextProps, nextState) ->
        if @state.cursor_index != nextState.cursor_index
            return true
        if @props.search != nextProps.search
            return true
        if (not @props.project_log? or not nextProps.project_log?) and (not @props.project_log_all? or not nextProps.project_log_all?)
            return true
        if not @props.user_map? or not nextProps.user_map?
            return true
        if not nextProps.user_map.equals(@props.user_map)
            return true
        if nextProps.project_log?
            return not nextProps.project_log.equals(@props.project_log)
        if nextProps.project_log_all?
            return not nextProps.project_log_all.equals(@props.project_log_all)
        return false

    componentWillReceiveProps: (next, next_state) ->
        if not next.user_map? or (not next.project_log? and not next.project_log_all?)
            return
        if not immutable.is(@props.project_log, next.project_log) or not immutable.is(@props.project_log_all, next.project_log_all) or @props.search != next.search
            delete @_log

    get_log: () ->
        if @_log?
            return @_log
        v = @props.project_log_all ? @props.project_log
        if not v?
            @_log = immutable.List()
            return @_log

        v = v.valueSeq()
        if @props.search
            @_search_cache ?= {}
            terms = misc.search_split(@props.search.toLowerCase())
            names = {}
            match = (z) =>
                s = @_search_cache[z.get('id')]
                if not s?
                    s = names[z.get('account_id')] ?= @props.get_name(z.get('account_id'))
                    event = z.get('event')
                    if event?
                        event.forEach (val, k) =>
                            if k != 'event' and k != 'filename'
                                s += ' ' + k
                            if k == 'type'
                                return
                            s += ' ' + val
                            return
                    s = s.toLowerCase()
                    @_search_cache[z.get('id')] = s
                return misc.search_match(s, terms)
            v = v.filter(match)
        v = v.sort((a,b) => b.get('time') - a.get('time'))

        return @_log = v

    move_cursor_to: (cursor_index) ->
        if cursor_index < 0 or cursor_index >= @get_log().size
            return
        @setState({cursor_index : cursor_index})
        @windowed_list_ref.current?.scrollToRow(cursor_index)

    increment_cursor: ->
        @move_cursor_to(@state.cursor_index + 1)

    decrement_cursor: ->
        @move_cursor_to(@state.cursor_index - 1)

    reset_cursor: ->
        @move_cursor_to(0)

    load_all: ->
        @_next_cursor_pos = @get_log().size - 1
        delete @_last_project_log
        delete @_last_user_map
        delete @_loading_table
        @actions(name).project_log_load_all()

    render_load_all_button: ->
        if @props.project_log_all?
            return
        <Button bsStyle={"info"} onClick={@load_all} disabled={@props.project_log_all?}>
            Load older log entries
        </Button>

    focus_search_box: ->
        input = @refs.search.refs.box.refs.input
        ReactDOM.findDOMNode(input).focus()

    row_renderer: (index) ->
        log = @get_log()
        if index == log.size
            return @render_load_all_button()
        x = log.get(index)
        if not x?
            return
        return <LogEntry
            cursor          = {@state.cursor_index == index}
            time            = {x.get('time')}
            event           = {x.get('event',immutable.Map()).toJS()}
            account_id      = {x.get('account_id')}
            user_map        = {@props.user_map}
            backgroundStyle = {if index % 2 == 0 then backgroundColor : '#eee'}
            project_id      = {@props.project_id} />

    row_key: (index) ->
        return "#{index}"

    render_log_entries: ->
        next_cursor_pos = @_next_cursor_pos
        if @_next_cursor_pos
            delete @_next_cursor_pos
        return <WindowedList
            ref = {@windowed_list_ref}
            overscan_row_count = {20}
            estimated_row_size={22}
            row_count={@get_log().size + 1}
            row_renderer = {(x) => @row_renderer(x.index)}
            row_key = {@row_key}
            scroll_to_index={next_cursor_pos}
            cache_id={"project_log" + @props.project_id}
        />

    render_log_panel: ->
        return <div className="smc-vfill" style={border: '1px solid #ccc', borderRadius: '3px'}>
            {@render_log_entries()}
        </div>

    render_body: ->
        if not @props.project_log and not @props.project_log_all
            if not @_loading_table
                @_loading_table = true
                # The project log not yet loaded, so kick off the load.
                # This is safe to call multiple times and is done so that the
                # changefeed for the project log is only setup if the user actually
                # looks at the project log at least once.
                redux.getProjectStore(@props.project_id).init_table('project_log')
            return <Loading theme={"medium"}/>
        @_loading_table = false
        return @render_log_panel()

    render_search: ->
        return <LogSearch
            ref              = {"search"}
            actions          = {@actions(name)}
            search           = {@props.search}
            selected         = {@get_log().get(@state.cursor_index)}
            increment_cursor = {@increment_cursor}
            decrement_cursor = {@decrement_cursor}
            reset_cursor     = {@reset_cursor}
        />

    render: ->
        <div style={padding:'15px'} className={"smc-vfill"}>
            <h1 style={marginTop:"0px"}><Icon name='history' /> Project activity log</h1>
            {@render_search()}
            {@render_body()}
        </div>