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
{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row, Button, ButtonToolbar, Input, Well} = require('react-bootstrap')



project_store = require('project_store')

LogMessage = rclass
    render:->
        <div>
            This is a log message
        </div>

LogSearch = rclass
    getInitialState: ->
        search    : ''   # search that user has typed in so far

    render :->
        <form onSubmit={@do_search}>
            <Input
                autoFocus
                type        = "search"
                value       =  @props.search
                ref         = "search"
                placeholder = "Search log..."
                onChange    = {=> @setState(search:@refs.search.getValue())}
                />
        </form>

LogEntry = rclass
    propTypes: ->
        time       : rtypes.object
        event      : rtypes.object
        account_id : rtypes.string

    render: ->
        <Row>
            <Col sm=3>
                user {@props.account_id}
                {misc.to_json(@props.time)}
            </Col>
            <Col sm=1>
                icon
            </Col>
            <Col sm=8>
                message {misc.to_json(@props.event)}
            </Col>
        </Row>

LogMessages = rclass
    propTypes: ->
        log : rtypes.array.isRequired

    render_entries: ->
        for x in @props.log
            <LogEntry key={x.id} time={x.time} event={x.event} account_id={x.account_id} />

    render :->
        <div>
            {@render_entries()}
        </div>

ProjectLog = rclass
    propTypes: ->
        project_log : rtypes.object.isRequired

    shouldComponentUpdate: (nextProps) ->
        if not @props.project_log or not nextProps.project_log?
            return true
        return not nextProps.project_log.equals(@props.project_log)

    render : ->
        # compute visible log entries to render, based on page, search, etc.
        log = []
        if @props.project_log?
            @props.project_log.map (val,key) =>
                log.push(val.toJS())

        <div>
            <h1>Project activity log</h1>
            <Well>
                <Row>
                    <Col>
                        <LogSearch />
                    </Col>
                </Row>
                <LogMessages log={log}/>
            </Well>
        </div>

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <FluxComponent flux={flux} connectToStores={store.name}>
        <ProjectLog />
    </FluxComponent>

exports.render_log = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)

