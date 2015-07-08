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

{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row, Button, ButtonGroup, ButtonToolbar, Input, Panel, Well} = require('react-bootstrap')
TimeAgo = require('react-timeago')
{Icon} = require('r_misc')
{User} = require('users')

project_store = require('project_store')

LogMessage = rclass
    render:->
        <div>
            This is a log message
        </div>

LogSearch = rclass
    propTypes: ->
        do_search : rtypes.function.isRequired
        do_select_first : rtypes.function.isRequired

    getInitialState: ->
        search    : ''   # search that user has typed in so far

    clear_and_focus_input : ->
        @setState(search : '')
        #React.findDOMNode(@refs.search).focus()
        # TODO: Using jquery -- this hack actually works, unlike the above -- maybe react-bootstrap needs a focus method...
        $(React.findDOMNode(@refs.search)).find("input").focus()
        @props.do_search('')

    render_clear_button: ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name="times-circle" />
        </Button>

    do_search: (e) ->
        e.preventDefault()
        @props.do_search(@state.search)

    do_select_first: (e) ->
        e.preventDefault()
        @props.do_select_first()

    render :->
        <form onSubmit={@do_select_first}>
            <Input
                autoFocus
                type        = "search"
                value       = @state.search
                ref         = "search"
                placeholder = "Search log..."
                onChange    = {(e) => e.preventDefault(); x=@refs.search.getValue(); @setState(search:x); @props.do_search(x)}
                buttonAfter = {@render_clear_button()}
                />
        </form>

NativeListener = require('react-native-listener')

LogEntry = rclass
    propTypes: ->
        time       : rtypes.object
        event      : rtypes.object
        account_id : rtypes.string
        user_map   : rtypes.object
        project_id : rtypes.string.isRequired

    click_filename: (e) ->
        e.preventDefault()
        project_store.getActions(@props.project_id, @props.flux).open_file(path:@props.event.filename, foreground:misc_page.open_in_foreground(e))

    render_open_file: ->
        # TODO: we may be able to remove use of NativeListener below once we have changed everything to use React.
        <span>opened&nbsp;
            <NativeListener onClick={@click_filename}>
                <a href=''>{@props.event.filename}</a>
            </NativeListener>
        </span>

    render_desc: ->
        switch @props.event?.event
            when 'open_project'
                return <span>opened this project</span>
            when 'open' # open a file
                return @render_open_file()
            else
                if @props.event?.event?
                    return <span>{misc.capitalize(@props.event?.event)}</span>
                else
                    return <span>{misc.to_json(@props.event)}</span>

    icon: ->
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
            else
                return 'dot-circle-o'

    render: ->
        <Row>
            <Col sm=1>
                <Icon className="pull-right" name={@icon()} />
            </Col>
            <Col sm=11>
                <a href=""><User user_map={@props.user_map} account_id={@props.account_id} /></a>&nbsp;
                {@render_desc()}&nbsp;
                <TimeAgo date={@props.time} />
            </Col>
        </Row>

LogMessages = rclass
    propTypes: ->
        log : rtypes.array.isRequired
        project_id : rtypes.string.isRequired
        user_map : rtypes.object

    render_entries: ->
        for x in @props.log
            <FluxComponent key={x.id} >
                <LogEntry time={x.time} event={x.event} account_id={x.account_id}
                          user_map={@props.user_map} project_id={@props.project_id} />
            </FluxComponent>

    render :->
        <div>
            {@render_entries()}
        </div>

PAGE_SIZE = 10  # number of entries to show per page (TODO: move to account settings)

matches = (s, words) ->
    for word in words
        if s.indexOf(word) == -1
            return false
    return true

ProjectLog = rclass
    propTypes: ->
        project_log : rtypes.object
        user_map    : rtypes.object
        project_id  : rtypes.string.isRequired

    getInitialState: ->
        search : ''   # search that user has requested
        page   : 0

    do_search: (search) ->
        @setState(search:search.toLowerCase())

    do_select_first: ->
        if not @_log?
            return
        for x in @_log
            target = x.event?.filename
            if target?
                project_store.getActions(@props.project_id, @props.flux).open_file(path:target, foreground:true)
                return

    shouldComponentUpdate: (nextProps, nextState) ->
        if @state.search != nextState.search
            return true
        if @state.page != nextState.page
            return true
        if not @props.project_log or not nextProps.project_log?
            return true
        if not @props.user_map or not nextProps.user_map?
            return true
        return not nextProps.project_log.equals(@props.project_log) or not nextProps.user_map.equals(@props.user_map)

    previous_page: ->
        if @state.page > 0
            @setState(page: @state.page-1)

    next_page: ->
        @setState(page: @state.page+1)

    render : ->
        # compute visible log entries to render, based on page, search, filters, etc.
        log = []
        if @props.project_log?
            @props.project_log.map (val,key) =>
                log.push(val.toJS())
        log.sort((a,b) -> misc.cmp(b.time, a.time))
        if log.length > 0
            # combine redundant subsequent events that differ only by time (?)
            # (TODO: currently we just delete all but first... but could make times into ranges or count events...?)
            users = @props.flux.getStore('users')
            v = []
            for i in [1...log.length]
                x = log[i-1]; y = log[i]
                if x.account_id != y.account_id or not underscore.isEqual(x.event, y.event)
                    x.search = (users.get_name(x.account_id) + " " + (x.event?.filename ? "")).toLowerCase()
                    v.push(x)
            log = v
        words = misc.split(@state.search)
        if @state.search
            log = (x for x in log when matches(x.search, words))
        page = @state.page
        num_pages = Math.ceil(log.length / PAGE_SIZE)
        log = log.slice(PAGE_SIZE*page, PAGE_SIZE*(page+1))
        @_log = log

        <Panel head="Project activity log">
            <Row>
                <Col sm=4>
                    <LogSearch do_search={@do_search} do_select_first={@do_select_first} />
                </Col>
                <Col sm=4>
                    <ButtonGroup>
                        <Button onClick={@previous_page} disabled={page<=0} >
                            <Icon name="angle-double-left" /> Newer
                        </Button>
                        <Button onClick={@next_page} disabled={page>=num_pages-1} >
                            <Icon name="angle-double-right" /> Older
                        </Button>
                    </ButtonGroup>
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <LogMessages log={log} user_map={@props.user_map} project_id={@props.project_id} />
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

