###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./smc-react')
{Col, Row, Button, ButtonGroup, ButtonToolbar, Input, Panel, Well} = require('react-bootstrap')
{Icon, Loading, TimeAgo, FileLink, r_join, Space, Tip} = require('./r_misc')
{User} = require('./users')
{file_action_buttons} = require('./project_files')
{ProjectTitleAuto} = require('./projects')


LogMessage = rclass
    displayName : 'ProjectLog-LogMessage'

    render :->
        <div>
            This is a log message
        </div>

LogSearch = rclass
    displayName : 'ProjectLog-LogSearch'

    propTypes :
        search           : rtypes.string
        actions          : rtypes.object.isRequired
        selected         : rtypes.object

    clear_and_focus_input : ->
        @refs.project_log_search.getInputDOMNode().focus()
        @props.actions.setState(search:'', page:0)

    render_clear_button : ->
        s = if @props.search?.length > 0 then 'warning' else "default"
        <Button onClick={@clear_and_focus_input} bsStyle={s}>
            <Icon name='times-circle' />
        </Button>

    do_open_selected : (e) ->
        e.preventDefault()
        e = @props.selected?.event
        if not e?
            return
        switch e.event
            when 'open'
                target = e.filename
                if target?
                    @props.actions.open_file(path:target, foreground:true)
            when 'set'
                @props.actions.set_focused_page('project-settings')

    keydown : (e) ->
        if e.keyCode == 27
            @props.actions.setState(search:'', page:0)

    on_change : (e) ->
        e.preventDefault()
        x = @refs.project_log_search.getValue()
        @props.actions.setState(search : x, page : 0)

    render : ->
        <form onSubmit={@do_open_selected}>
            <Input
                autoFocus
                type        = 'search'
                value       = @props.search
                ref         = 'project_log_search'
                placeholder = 'Search log...'
                onChange    = {@on_change}
                buttonAfter = {@render_clear_button()}
                onKeyDown   = {@keydown}
                />
        </form>

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
        actions         : rtypes.object.isRequired

    click_filename : (e) ->
        e.preventDefault()
        @props.actions.open_file
            path       : @props.event.filename
            foreground : misc.should_open_in_foreground(e)

    render_open_file : ->
        <span>opened<Space/>
            <FileLink
                path    = {@props.event.filename}
                full    = {true}
                style   = {if @props.cursor then selected_item}
                trunc   = 50
                actions = {@props.actions} />
        </span>

    render_miniterm_command : (cmd) ->
        if cmd.length > 50
            <Tip title='Full command' tip={cmd}>
                <kbd>{misc.trunc_middle(cmd, 50)}</kbd>
            </Tip>
        else
            <kbd>{cmd}</kbd>

    render_miniterm : ->
        <span>executed mini terminal command {@render_miniterm_command(@props.event.input)}</span>

    project_title : ->
        <ProjectTitleAuto project_id={@props.event.project} />

    file_link : (path, link, i) ->
        <FileLink
            path    = {path}
            full    = {true}
            style   = {if @props.cursor then selected_item}
            key     = {i}
            trunc   = 50
            link    = {link}
            actions = {@props.actions} />

    multi_file_links : (link = true) ->
        links = []
        for path, i in @props.event.files
            links.push @file_link(path, link, i)
        return r_join(links)

    render_file_action : ->
        e = @props.event
        switch e?.action
            when 'deleted'
                <span>deleted {@multi_file_links(false)} {(if e.count? then "(#{e.count} total)" else '')}</span>
            when 'downloaded'
                <span>downloaded {@file_link(e.path ? e.files, true, 0)} {(if e.count? then "(#{e.count} total)" else '')}</span>
            when 'moved'
                <span>moved {@multi_file_links(false)} {(if e.count? then "(#{e.count} total)" else '')} to {@file_link(e.dest, true, 0)}</span>
            when 'copied'
                <span>copied {@multi_file_links()} {(if e.count? then "(#{e.count} total)" else '')} to {e.dest} {if e.project? then @project_title()}</span>
            when 'shared'
                <span>shared {@multi_file_links()} {(if e.count? then "(#{e.count} total)" else '')}</span>

    click_set : (e) ->
        e.preventDefault()
        @props.actions.set_focused_page('project-settings')

    render_set : (obj) ->
        i = 0
        for key, value of obj
            i += 1
            content = "#{key} to #{value}"
            if i < obj.length
                content += '<Space/>and'
            <span key={i}>
                set <a onClick={@click_set} style={if @props.cursor then selected_item} href=''>{content}</a>
            </span>

    render_upgrade : ->
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

    render_invite_user : ->
        <span>invited user <User user_map={@props.user_map} account_id={@props.event.invitee_account_id} /></span>
        
    render_invite_nonuser : ->
        <span>invited nonuser {@props.event.invitee_email}</span>

    file_action_icons :
        deleted    : 'delete'
        downloaded : 'download'
        moved      : 'move'
        copied     : 'copy'
        share      : 'shared'

    render_desc : ->
        if typeof(@props.event) is 'string'
            return <span>{@props.event}</span>

        switch @props.event?.event
            when 'open_project'
                return <span>opened this project</span>
            when 'open' # open a file
                return @render_open_file()
            when 'set'
                return @render_set(misc.copy_without(@props.event, 'event'))
            when 'miniterm'
                return @render_miniterm()
            when 'file_action'
                return @render_file_action()
            when 'upgrade'
                return @render_upgrade()
            when 'invite_user'
                return @render_invite_user()
            when 'invite_nonuser'
                return @render_invite_nonuser()
            else
                # TODO!
                return <span>{misc.to_json(@props.event)}</span>

    render_user : ->
        <User user_map={@props.user_map} account_id={@props.account_id} />

    icon : ->
        switch @props.event?.event
            when 'open_project'
                return 'folder-open-o'
            when 'open' # open a file
                x = require('./editor').file_associations[@props.event.type]?.icon
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
                return file_action_buttons[icon]?.icon
            when 'upgrade'
                return 'arrow-circle-up'
            when 'invite_user'
                return 'user'
            when 'invite_nonuser'
                return 'user'
            else
                return 'dot-circle-o'

    render : ->
        style = if @props.cursor then selected_item else @props.backgroundStyle
        <Row style={underscore.extend({borderBottom:'1px solid lightgrey'}, style)}>
            <Col sm=1 style={textAlign:'center'}>
                <Icon name={@icon()} style={style} />
            </Col>
            <Col sm=11>
                {@render_user()}<Space/>
                {@render_desc()}<Space/>
                <TimeAgo style={style} date={@props.time} popover={true} />
            </Col>
        </Row>

LogMessages = rclass
    displayName : 'ProjectLog-LogMessages'

    propTypes :
        log        : rtypes.array.isRequired
        user_map   : rtypes.object
        cursor     : rtypes.string    # id of the cursor
        actions    : rtypes.object.isRequired

    render_entries : ->
        for x, i in @props.log
            <LogEntry
                key             = {x.id}
                cursor          = {@props.cursor==x.id}
                time            = {x.time}
                event           = {x.event}
                account_id      = {x.account_id}
                user_map        = {@props.user_map}
                backgroundStyle = {if i % 2 is 0 then backgroundColor : '#eee'}
                actions         = {@props.actions} />

    render : ->
        <div style={wordWrap:'break-word'}>
            {@render_entries()}
        </div>

PAGE_SIZE = 50  # number of entries to show per page (TODO: move to account settings)

search_string = (x, users) ->  # TODO: this code is ugly, but can be easily changed here only.
    v = [users.get_name(x.account_id)]
    event = x.event
    if event?
        for k,val of event
            if k != 'event' and k!='filename'
                v.push(k)
            if k == 'type'
                continue
            v.push(val)
    return v.join(' ').toLowerCase()

matches = (s, words) ->
    for word in words
        if s.indexOf(word) == -1
            return false
    return true

ProjectLog = (name) -> rclass
    displayName : 'ProjectLog'

    reduxProps :
        "#{name}" :
            project_log : rtypes.immutable
            search      : rtypes.string
            page        : rtypes.number
        users :
            user_map    : rtypes.immutable

    propTypes :
        actions : rtypes.object.isRequired
        redux   : rtypes.object

    getDefaultProps : ->
        search : ''   # search that user has requested
        page   : 0

    shouldComponentUpdate : (nextProps) ->
        if @props.search != nextProps.search
            return true
        if @props.page != nextProps.page
            return true
        if not @props.project_log? or not nextProps.project_log?
            return true
        if not @props.user_map? or not nextProps.user_map?
            return true
        return not nextProps.project_log.equals(@props.project_log) or not nextProps.user_map.equals(@props.user_map)

    componentWillReceiveProps : (next) ->
        if not @props.user_map? or not @props.project_log?
            return
        if not immutable.is(@props.project_log, next.project_log) or not immutable.is(@props.user_map, next.user_map)
            @update_log(next.project_log, next.user_map)

    previous_page : ->
        if @props.page > 0
            @props.actions.setState(page: @props.page-1)

    next_page : ->
        @props.actions.setState(page: @props.page+1)

    process_log_entry : (x, users) ->
        x.search = search_string(x, users)
        return x

    update_log : (next_project_log, next_user_map) ->
        if not next_project_log? or not next_user_map?
            return

        if not immutable.is(next_user_map, @_last_user_map) and @_log?
            users = @props.redux.getStore('users')
            # Update any names that changed in the existing log
            next_user_map.map (val, account_id) =>
                if not immutable.is(val, @_last_user_map?.get(account_id))
                    for x in @_log
                        if x.account_id == account_id
                            @process_log_entry(x, users)

        if not immutable.is(next_project_log, @_last_project_log)
            # The project log changed, so record the new entries
            new_log = []
            next_project_log.map (val, id) =>
                if not @_last_project_log?.get(id)?
                    # new entry we didn't have before
                    new_log.push(val.toJS())
            if new_log.length > 1
                new_log.sort((a,b) -> misc.cmp(b.time, a.time))
                # combine redundant subsequent events that differ only by time
                v = []
                for i in [1...new_log.length]
                    x = new_log[i-1]; y = new_log[i]
                    if x.account_id != y.account_id or not underscore.isEqual(x.event, y.event)
                        v.push(x)
                new_log = v
            # process new log entries (search/name info)
            users = @props.redux.getStore('users')
            new_log = (@process_log_entry(x, users) for x in new_log)

            # combine logs
            if @_log?
                @_log = new_log.concat(@_log)
            else
                @_log = new_log

            # save immutable maps we just used
            @_last_project_log = next_project_log
            @_last_user_map = next_user_map

        return @_log

    visible_log : ->
        log = @_log
        if not log?
            # first attempt
            log = @update_log(@props.project_log, @props.user_map)
        if not log?
            return []
        words = misc.split(@props.search?.toLowerCase())
        if words.length > 0
            log = (x for x in log when matches(x.search, words))
        return log

    render_paging_buttons : (num_pages, cur_page) ->
        <ButtonGroup>
            <Button onClick={@previous_page} disabled={@props.page<=0} >
                <Icon name='angle-double-left' /> Newer
            </Button>
            <Button disabled>{"#{cur_page + 1}/#{num_pages}"}</Button>
            <Button onClick={@next_page} disabled={@props.page>=num_pages-1} >
                Older <Icon name='angle-double-right' />
            </Button>
        </ButtonGroup>

    render_log_panel : ->
        if not @props.redux
            return <Loading/>
        # get visible log
        log = @visible_log()
        # do some pager stuff
        num_pages = Math.ceil(log.length / PAGE_SIZE)
        page = @props.page
        log = log.slice(PAGE_SIZE*page, PAGE_SIZE*(page+1))
        # make first visible entry appear "selected" (TODO: implement cursor to move)
        if log.length > 0
            cursor = log[0].id
            selected = log[0]
        else
            cursor = undefined
            selected = undefined

        <Panel>
            <Row>
                <Col sm=4>
                    <LogSearch actions={@props.actions} search={@props.search} selected={selected} />
                </Col>
                <Col sm=4>
                    {@render_paging_buttons(num_pages, @props.page)}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <LogMessages log={log} cursor={cursor} user_map={@props.user_map} actions={@props.actions} />
                </Col>
            </Row>
            <Row>
                <Col sm=4 style={marginTop:'15px'}>
                    {@render_paging_buttons(num_pages, @props.page)}
                </Col>
            </Row>
        </Panel>

    render : ->
        <div>
            <h1><Icon name='history' /> Project activity log</h1>
            {if @props.redux and @props.project_log then @render_log_panel() else <Loading/>}
        </div>

render = (project_id, redux) ->
    store   = redux.getProjectStore(project_id)
    actions = redux.getProjectActions(project_id)
    C = ProjectLog(store.name)
    <Redux redux={redux} connectToStores={[store.name, 'users']}>
        <C actions={actions} redux={redux} />
    </Redux>

exports.render_log = (project_id, dom_node, redux) ->
    #console.log("mount project_log")
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount project_log")
    ReactDOM.unmountComponentAtNode(dom_node)

