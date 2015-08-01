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

misc = require('misc')
misc_page = require('misc_page')
underscore = require('underscore')
immutable  = require('immutable')

{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row, Button, ButtonGroup, ButtonToolbar, Input, Panel, Well} = require('react-bootstrap')
{Icon, TimeAgo, FileLink, r_join} = require('r_misc')
{User} = require('users')
{file_action_buttons} = require('project_files')

project_store = require('project_store')

LogMessage = rclass
    displayName : "ProjectLog-LogMessage"

    render:->
        <div>
            This is a log message
        </div>

LogSearch = rclass
    displayName : "ProjectLog-LogSearch"

    propTypes :
        do_search        : rtypes.func.isRequired
        do_open_selected : rtypes.func.isRequired

    getInitialState : ->
        search    : ''   # search that user has typed in so far

    clear_and_focus_input : ->
        @setState(search : '')
        @refs.project_log_search.getInputDOMNode().focus()
        @props.do_search('')

    render_clear_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name="times-circle" />
        </Button>

    do_search : (e) ->
        e.preventDefault()
        @props.do_search(@state.search)

    do_open_selected : (e) ->
        e.preventDefault()
        @props.do_open_selected()

    keydown : (e) ->
        if e.keyCode == 27
            @setState(search:'')
            @props.do_search('')

    render : ->
        <form onSubmit={@do_open_selected}>
            <Input
                autoFocus
                type        = "search"
                value       = @state.search
                ref         = "project_log_search"
                placeholder = "Search log..."
                onChange    = {(e) => e.preventDefault(); x=@refs.project_log_search.getValue(); @setState(search:x); @props.do_search(x)}
                buttonAfter = {@render_clear_button()}
                onKeyDown   = {@keydown}
                />
        </form>

selected_item =
    backgroundColor : "#08c"
    color           : 'white'

LogEntry = rclass
    displayName : "ProjectLog-LogEntry"

    propTypes :
        time       : rtypes.object
        event      : rtypes.object
        account_id : rtypes.string
        user_map   : rtypes.object
        project_id : rtypes.string.isRequired
        cursor     : rtypes.bool

    click_filename : (e) ->
        e.preventDefault()
        project_store.getActions(@props.project_id, @props.flux).open_file(path:@props.event.filename, foreground:misc_page.open_in_foreground(e))

    a : (content, key, click) ->
        <a onClick={click} key={key} style={if @props.cursor then selected_item} href=''>{content}</a>

    render_open_file : ->
        <span>opened {@a(@props.event.filename, 'open', @click_filename)}</span>

    render_miniterm : ->
        <span>executed mini terminal command <tt>{@props.event.input}</tt></span>

    project_title : ->
        <ProjectTitleAuto project_id={@props.event.project} />

    multi_file_links : ->
        r_join(<FileLink project_id={@props.project_id} path={a.split('/')} full={true} style={if @props.cursor then selected_item} key={i} trunc={50} flux={@props.flux}/> for a, i in @props.event.files)

    render_file_action : ->
        e = @props.event
        switch e?.action
            when 'delete'
                <span>deleted {@multi_file_links()} {(if e.count? then "(#{e.count} #{total})" else '')}</span>
            when 'download'
                <span>downloaded {@multi_file_links()} {(if e.count? then "(#{e.count} #{total})" else '')}</span>
            when 'move'
                <span>moved {@multi_file_links()} {(if e.count? then "(#{e.count} #{total})" else '')} to {e.dest}</span>
            when 'rename'
                <span>renamed {e.src} to {e.dest}</span>
            when 'compress'
                <span>compressed {@multi_file_links()} {(if e.count? then "(#{e.count} #{total})" else '')} to {e.dest}</span>
            when 'copy'
                <span>
                    copied {@multi_file_links()} {(if e.count? then "(#{e.count} #{total})" else '')} to {e.dest} {if e.project? then @project_title()}
                </span>
            when 'share'
                <span>Shared</span>

    click_set : (e) ->
        e.preventDefault()
        project_store.getActions(@props.project_id, @props.flux).set_focused_page('project_settings')

    render_set : (obj) ->
        i = 0
        for key, value of obj
            i += 1
            content = "#{key} to #{value}"
            if i < obj.length
                content += '&nbsp;and'
            @a(content, 'set', @click_set)

    render_desc : ->
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
            else
                # TODO!
                return <span>{misc.to_json(@props.event)}</span>

    render_user : ->
        <User user_map={@props.user_map} account_id={@props.account_id} />

    icon : ->
        switch @props.event?.event
            when 'open_project'
                return "folder-open-o"
            when 'open' # open a file
                x = require('editor').file_associations[@props.event.type]?.icon
                if x?
                    if x.slice(0,3) == 'fa-'  # temporary -- until change code there?
                        x = x.slice(3)
                    return x
                else
                    return 'file-code-o'
            when 'set'
                return 'wrench'
            when 'file_action'
                return file_action_buttons[@props.event.action]?.icon
            else
                return 'dot-circle-o'

    render : ->
        style = if @props.cursor then selected_item
        <Row style={underscore.extend({borderBottom:'1px solid lightgrey'}, style)}>
            <Col sm=1 style={textAlign:'center'}>
                <Icon name={@icon()} style={style} />
            </Col>
            <Col sm=11>
                {@render_user()}&nbsp;
                {@render_desc()}&nbsp;
                <TimeAgo style={style} date={@props.time} />
            </Col>
        </Row>

LogMessages = rclass
    displayName : "ProjectLog-LogMessages"

    propTypes :
        log        : rtypes.array.isRequired
        project_id : rtypes.string.isRequired
        user_map   : rtypes.object
        cursor     : rtypes.string    # id of the cursor

    render_entries : ->
        for x in @props.log
            <FluxComponent key={x.id} >
                <LogEntry cursor={@props.cursor==x.id} time={x.time} event={x.event} account_id={x.account_id}
                          user_map={@props.user_map} project_id={@props.project_id} />
            </FluxComponent>

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

ProjectLog = rclass
    displayName : "ProjectLog-ProjectLog"

    propTypes :
        project_log : rtypes.object
        user_map    : rtypes.object
        project_id  : rtypes.string.isRequired

    getInitialState : ->
        search : ''   # search that user has requested
        page   : 0

    do_search : (search) ->
        @setState(search:search.toLowerCase(), page:0)

    do_open_selected : ->
        e = @_selected?.event
        if not e?
            return
        switch e.event
            when 'open'
                target = e.filename
                if target?
                    project_store.getActions(@props.project_id, @props.flux).open_file(path:target, foreground:true)
            when 'set'
                project_store.getActions(@props.project_id, @props.flux).set_focused_page("project_settings")

    shouldComponentUpdate : (nextProps, nextState) ->
        if @state.search != nextState.search
            return true
        if @state.page != nextState.page
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
        if @state.page > 0
            @setState(page: @state.page-1)

    next_page : ->
        @setState(page: @state.page+1)

    process_log_entry : (x, users) ->
        x.search = search_string(x, users)
        return x

    update_log : (next_project_log, next_user_map) ->
        if not next_project_log? or not next_user_map?
            return

        if not immutable.is(next_user_map, @_last_user_map) and @_log?
            users = @props.flux.getStore('users')
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
            users = @props.flux.getStore('users')
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
        words = misc.split(@state.search)
        if words.length > 0
            log = (x for x in log when matches(x.search, words))
        return log

    render_paging_buttons : (num_pages) ->
        <ButtonGroup>
            <Button onClick={@previous_page} disabled={@state.page<=0} >
                <Icon name="angle-double-left" /> Newer
            </Button>
            <Button onClick={@next_page} disabled={@state.page>=num_pages-1} >
                <Icon name="angle-double-right" /> Older
            </Button>
        </ButtonGroup>

    render : ->
        # get visible log
        log = @visible_log()
        # do some pager stuff
        num_pages = Math.ceil(log.length / PAGE_SIZE)
        page = @state.page
        log = log.slice(PAGE_SIZE*page, PAGE_SIZE*(page+1))
        # make first visible entry appear "selected" (TODO: implement cursor to move)
        if log.length > 0
            cursor = log[0].id
            @_selected = log[0]
        else
            cursor = undefined
            @_selected = undefined
        <Panel head="Project activity log">
            <Row>
                <Col sm=4>
                    <LogSearch do_search={@do_search} do_open_selected={@do_open_selected} />
                </Col>
                <Col sm=4>
                    {@render_paging_buttons(num_pages)}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <LogMessages log={log} cursor={cursor} user_map={@props.user_map} project_id={@props.project_id} />
                </Col>
            </Row>
            <Row>
                <Col sm=4 style={marginTop:'15px'}>
                    {@render_paging_buttons(num_pages)}
                </Col>
            </Row>
        </Panel>


render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <FluxComponent flux={flux} connectToStores={[store.name, 'users']}>
        <ProjectLog project_id={project_id} />
    </FluxComponent>

exports.render_log = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)

