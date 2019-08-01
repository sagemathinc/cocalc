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
lodash = require('lodash')

{React, ReactDOM, rtypes, rclass, Redux, redux}  = require('./app-framework')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, InputGroup, Panel, Well} = require('react-bootstrap')
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

    propTypes :
        search           : rtypes.string
        actions          : rtypes.object.isRequired
        selected         : rtypes.object
        increment_cursor : rtypes.func.isRequired
        decrement_cursor : rtypes.func.isRequired
        reset_cursor     : rtypes.func.isRequired

    open_selected: (value, info) ->
        e = @props.selected?.event
        if not e?
            return
        if typeof e.stopPropagation  == 'function'
            e.stopPropagation()
        if typeof e.preventDefault  == 'function'
            e.preventDefault()
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
        @props.reset_cursor()
        @props.actions.setState(search : value, page : 0)

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
            on_escape   = {=> @props.actions.setState(search:'', page:0)}
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

LogMessages = rclass
    displayName : 'ProjectLog-LogMessages'

    propTypes :
        log        : rtypes.array.isRequired
        project_id : rtypes.string.isRequired
        user_map   : rtypes.object
        cursor     : rtypes.string    # id of the cursor

    render_entries: ->
        for x, i in lodash.sortBy(@props.log, (el) -> -el.time)
            <LogEntry
                key             = {x.id}
                cursor          = {@props.cursor==x.id}
                time            = {x.time}
                event           = {x.event}
                account_id      = {x.account_id}
                user_map        = {@props.user_map}
                backgroundStyle = {if i % 2 is 0 then backgroundColor : '#eee'}
                project_id      = {@props.project_id} />

    render: ->
        <div style={wordWrap:'break-word'}>
            {@render_entries()}
        </div>

PAGE_SIZE = 50  # number of entries to show per page (SMELL: move to account settings)

matches = (s, words) ->
    for word in words
        if s.indexOf(word) == -1
            return false
    return true

exports.ProjectLog = rclass ({name}) ->
    displayName : 'ProjectLog'

    reduxProps:
        "#{name}" :
            project_log     : rtypes.immutable
            project_log_all : rtypes.immutable
            search          : rtypes.string
            page            : rtypes.number
        users :
            user_map    : rtypes.immutable
            get_name    : rtypes.func

    propTypes:
        project_id : rtypes.string.isRequired

    getDefaultProps: ->
        search : ''   # search that user has requested
        page   : 0

    getInitialState: ->
        cursor_index : 0

    shouldComponentUpdate: (nextProps, nextState) ->
        if @state.cursor_index != nextState.cursor_index
            return true
        if @props.search != nextProps.search
            return true
        if @props.page != nextProps.page
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

    componentWillReceiveProps: (next) ->
        if not next.user_map? or (not next.project_log? and not next.project_log_all?)
            return
        if not immutable.is(@props.project_log, next.project_log) or not immutable.is(@props.user_map, next.user_map) or not immutable.is(@props.project_log_all, next.project_log_all)
            if next.project_log_all?
                x = next.project_log_all
            else
                x = next.project_log
            @update_log(x, next.user_map)

    previous_page: ->
        if @props.page > 0
            @reset_cursor()
            @actions(name).setState(page: @props.page-1)

    next_page: ->
        @reset_cursor()
        @actions(name).setState(page: @props.page+1)

    search_string: (x) ->  # SMELL: this code is ugly, but can be easily changed here only.
        v = [@props.get_name(x.account_id)]
        event = x.event
        if event?
            for k,val of event
                if k != 'event' and k!='filename'
                    v.push(k)
                if k == 'type'
                    continue
                v.push(val)
        return v.join(' ').toLowerCase()

    process_log_entry: (x) ->
        x.search = @search_string(x)
        return x

    update_log: (next_project_log, next_user_map) ->
        if not next_project_log? or not next_user_map?
            return

        if not immutable.is(next_user_map, @_last_user_map) and @_log?
            next_user_map.map (val, account_id) =>
                if not immutable.is(val, @_last_user_map?.get(account_id))
                    for x in @_log
                        if x.account_id == account_id
                            @process_log_entry(x)

        if not immutable.is(next_project_log, @_last_project_log)
            # The project log changed, so record the new entries
            # and update any existing entries that changed, e.g.,
            # timing information added.
            new_log = []
            next_project_log.map (val, id) =>
                e = @_last_project_log?.get(id)
                if not e?
                    # new entry we didn't have before
                    new_log.push(val.toJS())
                else if not immutable.is(val, e)
                    # An existing entry changed; this happens
                    # when files are opened and the total time
                    # to open gets reported.
                    id = val.get('id')
                    # find it in the past log:
                    for x in @_log
                        if x.id == id
                            # and process the change
                            for k, v of val.toJS()
                                x[k] = v
                            @process_log_entry(x)
                            break
            if new_log.length > 1
                new_log = lodash.sortBy(new_log, (el) -> -el.time)
                # combine redundant subsequent events that differ only by time
                v = []
                for i in [1...new_log.length]
                    x = new_log[i-1]; y = new_log[i]
                    if x.account_id != y.account_id or not underscore.isEqual(x.event, y.event)
                        v.push(x)
                new_log = v
            # process new log entries (search/name info)
            new_log = (@process_log_entry(x) for x in new_log)

            # combine logs
            if @_log?
                @_log = new_log.concat(@_log)
            else
                @_log = new_log

            # save immutable maps we just used
            @_last_project_log = next_project_log
            @_last_user_map = next_user_map

        return @_log

    visible_log: ->
        log = @_log
        if not log?
            # first attempt
            if @props.project_log?
                x = @props.project_log
            else
                x = @props.project_log_all
            log = @update_log(x, @props.user_map)
        if not log?
            return []
        words = misc.split(@props.search?.toLowerCase())
        if words.length > 0
            log = (x for x in log when matches(x.search, words))
        return log

    increment_cursor: ->
        if @state.cursor_index == Math.min(PAGE_SIZE - 1, @displayed_log_size - 1)
            return
        @setState(cursor_index : @state.cursor_index + 1)

    decrement_cursor: ->
        if @state.cursor_index == 0
            return
        @setState(cursor_index : @state.cursor_index - 1)

    reset_cursor: ->
        @setState(cursor_index : 0)

    render_paging_buttons: (num_pages, cur_page) ->
        <ButtonGroup>
            <Button onClick={@previous_page} disabled={@props.page<=0} >
                <Icon name='angle-double-left' /> Newer
            </Button>
            <Button disabled>{"#{cur_page + 1}/#{num_pages}"}</Button>
            <Button onClick={@next_page} disabled={@props.page>=num_pages-1} >
                Older <Icon name='angle-double-right' />
            </Button>
        </ButtonGroup>

    load_all: ->
        @reset_cursor()
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
        if not @_log?
            return
        if index == @_log.length
            return @render_load_all_button()
        x = @_log[index]
        if not x?
            return
        return <LogEntry
            cursor          = {@props.cursor==x.id}
            time            = {x.time}
            event           = {x.event}
            account_id      = {x.account_id}
            user_map        = {@props.user_map}
            backgroundStyle = {if index % 2 == 0 then backgroundColor : '#eee'}
            project_id      = {@props.project_id} />

    row_key: (index) ->
        return "#{index}"

    render_log_entries: ->
        if not @_log?
            if @props.project_log_all?
                x = @props.project_log_all
            else
                x = @props.project_log
            @update_log(x, @props.user_map)
        if not @_log?
            return
        <WindowedList
            overscan_row_count = {10}
            estimated_row_size={20}
            row_count={@_log.length + 1}
            row_renderer = {(x) => @row_renderer(x.index)}
            row_key = {@row_key}
        />

    render_log_panel: ->
        # TODO: [ ] search box
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

    render: ->
        <div style={padding:'15px'} className={"smc-vfill"}>
            <h1 style={marginTop:"0px"}><Icon name='history' /> Project activity log</h1>
            {@render_body()}
        </div>