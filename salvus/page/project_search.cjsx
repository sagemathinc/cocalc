###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, Nich Ruhland
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


underscore = require('underscore')

{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')

{Col, Row, Button, Input, Well, Alert} = require('react-bootstrap')

{Icon, Loading} = require('r_misc')
misc            = require('misc')
diffsync        = require('diffsync')
misc_page       = require('misc_page')
{salvus_client} = require('salvus_client')
project_store   = require('project_store')
{PathLink} = require('project_new')



ProjectSearchInput = rclass
    displayName : 'ProjectSearch-ProjectSearchInput'

    propTypes :
        search_cb    : rtypes.func
        user_input   : rtypes.string
        actions      : rtypes.object

    getDefaultProps : ->
        user_input : ''

    clear_and_focus_input : ->
        @props.actions.setTo(user_input : '')
        @refs.project_search_input.getInputDOMNode().focus()

    clear_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name='times-circle' />
        </Button>

    handle_change : ->
        user_input = @refs.project_search_input.getValue()
        @props.actions.setTo(user_input : user_input)

    submit : (event) ->
        event.preventDefault()
        @props.search_cb?()

    render : ->
        <form onSubmit={@submit}>
            <Input
                ref         = 'project_search_input'
                autoFocus
                type        = 'text'
                placeholder = 'Search files in the current directory...'
                value       = {@props.user_input}
                buttonAfter = {@clear_button()}
                onChange    = {@handle_change} />
        </form>

ProjectSearchOutput = rclass
    displayName : 'ProjectSearch-ProjectSearchOutput'

    propTypes :
        results          : rtypes.array
        too_many_results : rtypes.bool
        most_recent_path : rtypes.string
        project_id       : rtypes.string
        search_error     : rtypes.string

    too_many_results : ->
        if @props.too_many_results
            <Alert bsStyle='warning'>
                There were more results than displayed below. Try making your search more specific.
            </Alert>

    get_results : ->
        if @props.search_error?
            return <Alert bsStyle='warning'>Search error: {@props.search_error} Please
                    try again with a more restrictive search</Alert>
        if @props.results?.length == 0
            return <Alert bsStyle='warning'>There were no results for your search</Alert>
        for i, result of @props.results
                <ProjectSearchResultLine
                    key              = {i}
                    filename         = {result.filename}
                    description      = {result.description}
                    most_recent_path = {@props.most_recent_path}
                    actions          = {@props.actions} />

    render : ->
        results_well_styles =
            backgroundColor : 'white'
            fontFamily      : 'monospace'

        <div>
            {@too_many_results()}
            <Well style={results_well_styles}>
                {@get_results()}
            </Well>
        </div>

ProjectSearchOutputHeader = rclass
    displayName : 'ProjectSearch-ProjectSearchOutputHeader'

    propTypes :
        most_recent_path   : rtypes.string.isRequired
        command            : rtypes.string.isRequired
        most_recent_search : rtypes.string.isRequired
        search_results     : rtypes.array
        info_visible       : rtypes.bool
        search_error       : rtypes.string
        actions            : rtypes.object

    getDefaultProps : ->
        info_visible : false

    output_path : ->
        if @props.most_recent_path is ''
            return <Icon name='home' />
        return @props.most_recent_path

    change_info_visible : ->
        @props.actions.setTo(info_visible : not @props.info_visible)

    get_info : ->
        if @props.info_visible
            <Alert bsStyle='info'>
                <ul>
                    <li>
                        Search command: <kbd>{@props.command}</kbd>
                    </li>
                    <li>
                        Number of results: {@props.search_error ? @props.search_results?.length ? <Loading />}
                    </li>
                </ul>
            </Alert>

    render : ->
        <div>
            <span style={color:'#666'}>
                <a href='#project-file-listing'>Navigate to a different folder</a> to search in it.
            </span>

            <h4>
                Results of searching in {@output_path()} for
                "{@props.most_recent_search}" <Button bsStyle='info' bsSize='xsmall' onClick={@change_info_visible}>
                <Icon name='info-circle' /></Button>
            </h4>

            {@get_info()}
        </div>

ProjectSearchSettings = rclass
    displayName : 'ProjectSearch-ProjectSearchSettings'

    propTypes :
        checkboxes      : rtypes.object
        toggle_checkbox : rtypes.func
        case_sensitive  : rtypes.bool
        subdirectories  : rtypes.bool
        hidden_files    : rtypes.bool
        actions         : rtypes.object

    getDefaultProps: ->
        case_sensitive  : false    # do not change any of these to true without also changing
        subdirectories  : false    # the "@checkbox_state = {}" below.
        hidden_files    : false

    handle_change : (name) ->
        @props.toggle_checkbox(name)
        @props.actions.setTo("#{name}":not @props[name])

    render_checkbox : (name, label) ->
        <Input
            ref      = {name}
            key      = {name}
            type     = 'checkbox'
            label    = {label}
            checked  = {@props[name]}
            onChange = {=>@handle_change(name)} />

    render : ->
        <div style={fontSize:'16px'}>
            {(@render_checkbox(name, label) for name, label of @props.checkboxes)}
        </div>

ProjectSearchDisplay = rclass
    displayName : 'ProjectSearch-ProjectSearchDisplay'

    propTypes :
        project_id         : rtypes.string
        current_path       : rtypes.string
        user_input         : rtypes.string
        search_results     : rtypes.array
        search_error       : rtypes.string
        too_many_results   : rtypes.bool
        command            : rtypes.string
        most_recent_search : rtypes.string
        most_recent_path   : rtypes.string
        actions            : rtypes.object

    getDefaultProps : ->
        user_input         : ''
        too_many_results   : false

    componentWillMount : ->
        if not @checkbox_state?
            @checkbox_state = {}

    toggle_checkbox : (checkbox) ->
        @checkbox_state[checkbox] = not @checkbox_state[checkbox]
        @search()

    settings_checkboxes :
        subdirectories : 'Include subdirectories'
        case_sensitive : 'Case sensitive'
        hidden_files   : 'Hidden files (begin with .)'

    # generate the grep command for the given query with the given flags
    generate_command : (query, recursive, insensitive, hidden) ->
        if insensitive
            ins = ' -i '
        else
            ins = ''

        query = '"' + query.replace(/"/g, '\\"') + '"'

        if recursive
            if hidden
                cmd = "rgrep -H --exclude-dir=.sagemathcloud --exclude-dir=.snapshots #{ins} #{query} *"
            else
                cmd = "rgrep -H --exclude-dir='.*' --exclude='.*' #{ins} #{query} *"
        else
            if hidden
                cmd = "grep -H #{ins} #{query} .* *"
            else
                cmd = "grep -H #{ins} #{query} *"

        cmd += " | grep -v #{diffsync.MARKERS.cell}"
        return cmd

    search : ->
        query = @props.user_input
        if query.trim() == ''
            @props.actions.setTo
                search_results     : []
                search_error       : undefined
                command            : ''
                most_recent_search : ''
                most_recent_path   : @props.current_path
            return

        cmd = @generate_command(query, @checkbox_state.subdirectories, not @checkbox_state.case_sensitive, @checkbox_state.hidden_files)
        max_results = 1000
        max_output  = 110 * max_results  # just in case

        @props.actions.setTo
            search_results     : undefined
            search_error       : undefined
            command            : cmd
            most_recent_search : query
            most_recent_path   : @props.current_path

        salvus_client.exec
            project_id      : @props.project_id
            command         : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout         : 10   # how long grep runs on client
            network_timeout : 15   # how long network call has until it must return something or get total error.
            max_output      : max_output
            bash            : true
            err_on_exit     : true
            path            : @props.current_path
            cb              : (err, output) =>
                @process_results(err, output, max_results, max_output, cmd)

    process_results : (err, output, max_results, max_output, cmd) ->

        if (err and not output?) or (output? and not output.stdout?)
            @props.actions.setTo(search_error : err)
            return

        results = output.stdout.split('\n')
        too_many_results = output.stdout.length >= max_output or results.length > max_results or err
        num_results = 0
        search_results = []
        for line in results
            if line.trim() == ''
                continue
            i = line.indexOf(':')
            num_results += 1
            if i isnt -1
                # all valid lines have a ':', the last line may have been truncated too early
                filename = line.slice(0, i)
                if filename.slice(0, 2) == './'
                    filename = filename.slice(2)
                context = line.slice(i + 1)
                # strip codes in worksheet output
                if context.length > 0 and context[0] == diffsync.MARKERS.output
                    i = context.slice(1).indexOf(diffsync.MARKERS.output)
                    context = context.slice(i + 2, context.length - 1)

                search_results.push
                    filename    : filename
                    description : context

            if num_results >= max_results
                break

        if @props.command is cmd # only update the state if the results are from the most recent command
            @props.actions.setTo
                too_many_results : too_many_results
                search_results   : search_results

    set_user_input : (new_value) ->
        @props.actions.setTo(user_input : new_value)

    output_header : ->
        if @props.most_recent_search? and @props.most_recent_path?
            <ProjectSearchOutputHeader
                most_recent_path   = {@props.most_recent_path}
                command            = {@props.command}
                most_recent_search = {@props.most_recent_search}
                search_results     = {@props.search_results}
                search_error       = {@props.search_error}
                info_visible       = {@props.info_visible}
                actions            = {@props.actions} />

    output : ->
        if @props.search_results? or @props.search_error?
            return <ProjectSearchOutput
                project_id       = {@props.project_id}
                most_recent_path = {@props.most_recent_path}
                results          = {@props.search_results}
                too_many_results = {@props.too_many_results}
                search_error     = {@props.search_error}
                actions            = {@props.actions}/>
        else if @props.most_recent_search?
            # a search has been made but the search_results or search_error hasn't come in yet
            <Loading />

    render : ->
        <Well>
            <Row>
                <Col sm=8>
                    <ProjectSearchInput
                        search_cb    = {@search}
                        user_input   = {@props.user_input}
                        actions      = {@props.actions} />
                    {@output_header()}
                </Col>

                <Col sm=4>
                    <ProjectSearchSettings
                        checkboxes      = {@settings_checkboxes}
                        toggle_checkbox = {@toggle_checkbox}
                        case_sensitive  = {@checkbox_state.case_sensitive}
                        subdirectories  = {@checkbox_state.subdirectories}
                        hidden_files    = {@checkbox_state.hidden_files}
                        actions         = {@props.actions} />
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    {@output()}
                </Col>
            </Row>
        </Well>

ProjectSearchResultLine = rclass
    displayName : 'ProjectSearch-ProjectSearchResultLine'

    propTypes :
        filename         : rtypes.string
        description      : rtypes.string
        most_recent_path : rtypes.string
        actions          : rtypes.object

    click_filename : (e) ->
        e.preventDefault()
        @props.actions.open_file
            path       : misc.path_to_file(@props.most_recent_path, @props.filename)
            foreground : misc_page.open_in_foreground(e)

    render : ->
        <div style={wordWrap:'break-word'}>
            <a onClick={@click_filename} href=''><strong>{@props.filename}</strong></a>
            <span style={color:'#666'}> {@props.description}</span>
        </div>

ProjectSearchHeader = rclass
    displayName : 'ProjectSearch-ProjectSearchHeader'

    propTypes :
        flux         : rtypes.object
        project_id   : rtypes.string.isRequired
        current_path : rtypes.string

    render : ->
        if not @props.flux
            <Loading />
        else
            <h1>
                <Icon name='search' /> Search <span className='hidden-xs'> in <PathLink project_id={@props.project_id} path={@props.current_path} flux={@props.flux} /></span>
            </h1>

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <div>
        <Row>
            <Col sm=12>
                <FluxComponent flux={flux} connectToStores={[store.name]}>
                    <ProjectSearchHeader project_id={project_id} />
                </FluxComponent>
            </Col>
        </Row>
        <Row>
            <Col sm=12>
                <FluxComponent flux={flux} connectToStores={[store.name]}>
                    <ProjectSearchDisplay project_id={project_id} actions={flux.getProjectActions(project_id)}/>
                </FluxComponent>
            </Col>
        </Row>
    </div>

exports.render_project_search = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)


exports.unmount = (dom_node) ->
    #console.log("unmount project_search")
    React.unmountComponentAtNode(dom_node)
