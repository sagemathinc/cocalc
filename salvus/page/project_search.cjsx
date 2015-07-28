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


{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')

{Col, Row, Button, Input, Well, Alert} = require('react-bootstrap')

{Icon, Loading} = require('r_misc')
misc            = require('misc')
diffsync        = require('diffsync')
misc_page       = require('misc_page')
{salvus_client} = require('salvus_client')
project_store   = require('project_store')
{PathLink} = require('project_files')

NativeListener = require('react-native-listener')




ProjectSearchInput = rclass

    propTypes :
        search_cb    : rtypes.func
        set_state_cb : rtypes.func

    getInitialState: ->
        user_input : ''

    clear_and_focus_input : ->
        @setState(user_input : '')
        @refs.project_search_input.getInputDOMNode().focus()

    clear_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name="times-circle" />
        </Button>

    handle_change : ->
        user_input = @refs.project_search_input.getValue()
        @setState(user_input : user_input)
        @props.set_state_cb(user_input : user_input)

    submit : (event) ->
        event.preventDefault()
        @props.search_cb?()

    render : ->
        <form onSubmit={@submit}>
            <Input
                ref         = 'project_search_input'
                autoFocus
                type        = 'text'
                placeholder = "Search files in the current directory..."
                value       = {@state.user_input}
                buttonAfter = {@clear_button()}
                onChange    = {@handle_change} />
        </form>

ProjectSearchOutput = rclass

    propTypes :
        results          : rtypes.array
        too_many_results : rtypes.bool
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
                    project_id  = @props.project_id
                    key         = {i}
                    filename    = {result.filename}
                    description = {result.description} />

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

    propTypes :
        most_recent_path   : rtypes.string.isRequired
        command            : rtypes.string.isRequired
        most_recent_search : rtypes.string.isRequired
        search_results     : rtypes.array

    getInitialState : ->
        info_visible : false

    output_path : ->
        if @props.most_recent_path == ""
            return <Icon name="home" />
        return @props.most_recent_path

    change_info_visible : ->
        @setState(info_visible : not @state.info_visible)

    get_info : ->
        output_command_styles =
            fontFamily      : 'monospace'
            fontSize        : '10pt'
            color           : '#888'

        if @state.info_visible
            <Alert bsStyle='info'>
                <ul>
                    <li>
                        Search command: <span style={output_command_styles}>'{@props.command}'</span>
                    </li>
                    <li>
                        Number of results: {@props.search_error ? @props.search_results?.length ? <Loading />}
                    </li>
                </ul>
            </Alert>

    render : ->
        <div>
            <span style={color:'#666'}>
                <a href="#project-file-listing">Navigate to a different folder</a> to search in it.
            </span>

            <h4>
                Results of searching in {@output_path()} for
                "{@props.most_recent_search}" <Button bsStyle='info' bsSize='xsmall' onClick={@change_info_visible}>
                <Icon name='info-circle' /></Button>
            </h4>

            {@get_info()}
        </div>


ProjectSearchSettings = rclass

    propTypes :
        checkboxes      : rtypes.object
        toggle_checkbox : rtypes.func
        search_cb       : rtypes.func

    getInitialState: ->
        case_sensitive  : false    # do not change any of these to true without also changing
        subdirectories  : false    # the "@checkbox_state = {}" below.
        hidden_files    : false

    handle_change : (name) ->
        @props.toggle_checkbox(name)
        @setState("#{name}":not @state[name])

    render_checkbox : (name, label) ->
        <Input
            ref      = {name}
            key      = {name}
            type     = 'checkbox'
            label    = {label}
            checked  = {@state[name]}
            onChange = {=>@handle_change(name)} />

    render : ->
        <div style={fontSize:'16px'}>
            {(@render_checkbox(name, label) for name, label of @props.checkboxes)}
        </div>


ProjectSearchDisplay = rclass

    getInitialState : ->
        user_input         : ''
        search_results     : undefined
        search_error       : undefined
        too_many_results   : false
        command            : undefined
        most_recent_search : undefined
        most_recent_path   : undefined

    componentWillMount: ->
        if not @checkbox_state?
            @checkbox_state = {}

    toggle_checkbox : (checkbox) ->
        @checkbox_state[checkbox] = not @checkbox_state[checkbox]
        @search()

    propTypes: ->
        project_id : rtypes.string

    settings_checkboxes :
        subdirectories : 'Include subdirectories'
        case_sensitive : 'Case sensitive'
        hidden_files   : 'Hidden files (begin with .)'

    # generate the grep command for the given query with the given flags
    generate_command : (query, recursive, insensitive, hidden) ->
        if insensitive
            ins = " -i "
        else
            ins = ""

        query = '"' + query.replace(/"/g, '\\"') + '"'

        if recursive
            if hidden
                cmd = "find . -xdev | grep #{ins} #{query}; rgrep -H --exclude-dir=.sagemathcloud --exclude-dir=.snapshots #{ins} #{query} * .*"
            else
                cmd = "find . -xdev \! -wholename '*/.*' | grep #{ins} #{query}; rgrep -H --exclude-dir='.*' --exclude='.*' #{ins} #{query} *"
        else
            if hidden
                cmd = "ls -a1 | grep #{ins} #{query}; grep -H #{ins} #{query} .* *"
            else
                cmd = "ls -1 | grep #{ins} #{query}; grep -H #{ins} #{query} *"

        cmd += " | grep -v #{diffsync.MARKERS.cell}"
        return cmd


    search : ->
        query = @state.user_input
        if query.trim() == ''
            @setState
                search_results     : []
                search_error       : undefined
                command            : ""
                most_recent_search : ""
                most_recent_path   : @props.current_path.join("/")
            return

        cmd = @generate_command(query, @checkbox_state.subdirectories, not @checkbox_state.case_sensitive, @checkbox_state.hidden_files)
        max_results = 1000
        max_output  = 110 * max_results  # just in case

        @setState
            search_results     : undefined
            search_error       : undefined
            command            : cmd
            most_recent_search : query
            most_recent_path   : @props.current_path.join("/")

        salvus_client.exec
            project_id      : @props.project_id
            command         : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout         : 10   # how long grep runs on client
            network_timeout : 15   # how long network call has until it must return something or get total error.
            max_output      : max_output
            bash            : true
            err_on_exit     : true
            path            : @props.current_path.join("/") # expects a string
            cb              : (err, output) =>
                @process_results(err, output, max_results, max_output, cmd)


    process_results : (err, output, max_results, max_output, cmd) ->

        if (err and not output?) or (output? and not output.stdout?)
            @setState(search_error : err)
            return

        results = output.stdout.split('\n')
        too_many_results = output.stdout.length >= max_output or results.length > max_results or err
        num_results = 0
        search_results = []
        for line in results
            if line.trim() == ""
                continue
            i = line.indexOf(":")
            num_results += 1
            if i == -1
                # the find part
                filename = line
                if misc.startswith(filename, "Binary file ") and misc.endswith(filename, " matches") and filename.length > 20
                    # we assume this is a binary file match.
                    # could mess up a result if a file is actually named "Binary file * matches"
                    search_results.push
                        filename    : filename.slice(12, -8)
                        description : '(binary file match)'
                else
                    # we have a filename match
                    if filename.slice(0,2) == "./"
                        filename = filename.slice(2)
                    search_results.push
                        filename    : filename
                        description : '(filename)'

            else
                # the rgrep part
                filename = line.slice(0, i)
                if filename.slice(0, 2) == "./"
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

        if @state.command is cmd # only update the state if the results are from the most recent command
            @setState
                too_many_results : too_many_results
                search_results   : search_results


    set_user_input : (new_value) ->
        @setState(user_input : new_value)

    output_header : ->
        if @state.most_recent_search? and @state.most_recent_path?
            <ProjectSearchOutputHeader
                most_recent_path   = {@state.most_recent_path}
                command            = {@state.command}
                most_recent_search = {@state.most_recent_search}
                search_results     = {@state.search_results}
                search_error       = {@state.search_error} />

    output : ->
        if @state.search_results? or @state.search_error?
            return <ProjectSearchOutput
                project_id       = {@props.project_id}
                results          = {@state.search_results}
                too_many_results = {@state.too_many_results}
                search_error     = {@state.search_error} />
        else if @state.most_recent_search?
            # a search has been made but the search_results or search_error hasn't come in yet
            <Loading />

    render : ->
        <Well>
            <Row>
                <Col sm=8>
                    <ProjectSearchInput
                        search_cb    = {@search}
                        set_state_cb = {(new_state)=>@setState(new_state)}
                        project_id   = {@props.project_id} />
                    {@output_header()}
                </Col>

                <Col sm=4>
                    <ProjectSearchSettings
                        project_id      = {@props.project_id}
                        checkboxes      = {@settings_checkboxes}
                        toggle_checkbox = {@toggle_checkbox}
                        search_cb       = {@search} />
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    {@output()}
                </Col>
            </Row>
        </Well>

ProjectSearchResultLine = rclass

    propTypes :
        filename    : rtypes.string
        description : rtypes.string


    click_filename : (e) ->
        e.preventDefault()
        project_store.getActions(@props.project_id, flux).open_file(path:@props.filename, foreground:misc_page.open_in_foreground(e))

    render : ->
        <div style={wordWrap:'break-word'}>
            <NativeListener onClick={@click_filename}>
                <a href=""><strong>{@props.filename}</strong></a>
            </NativeListener>
            <span style={color:"#666"}> {@props.description}</span>
        </div>

ProjectSearchHeader = rclass
    propTypes :
        flux         : rtypes.object
        project_id   : rtypes.string.isRequired
        current_path : rtypes.array

    render : ->
        <h1>
            <Icon name="search" /> Search
            <span className="hidden-xs"> in <PathLink project_id={@props.project_id} path={@props.current_path} flux={@props.flux} /></span>
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
                    <ProjectSearchDisplay project_id={project_id}/>
                </FluxComponent>
            </Col>
        </Row>
    </div>

exports.render_project_search = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)
