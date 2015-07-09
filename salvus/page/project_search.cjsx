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

{Col, Row, Button, Input, Well} = require('react-bootstrap')

{Icon, Loading} = require('r_misc')
diffsync        = require('diffsync')
misc_page       = require('misc_page')
{salvus_client} = require('salvus_client')
project_store   = require('project_store')

NativeListener = require('react-native-listener')




ProjectSearchInput = rclass

    propTypes :
        search_cb : rtypes.func
        flux      : rtypes.object

    getInitialState: ->
        user_input : ''

    clear_and_focus_input : ->
        @setState(user_input : '')
        @refs.project_search_input.getInputDOMNode().focus()

    clear_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name="times-circle" />
        </Button>

    handle_change : (event) ->
        @setState(user_input : event.target.value)

    submit : (e) ->
        e.preventDefault()
        project_store.getActions(@props.project_id, flux).setTo(user_input : @state.user_input)
        @props.search_cb(@state.user_input)

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
        too_many_results_styles =
            backgroundColor : 'white'
            fontWeight      : 'bold'

        if @props.too_many_results
            <Well style={too_many_results_styles}>
                There were more results than displayed below. Try making your search more specific.
            </Well>

    get_results : ->
        if @props.search_error?
            return <div style={fontWeight:'bold'}>Search error: {@props.search_error} Please
                    try again with a more restrictive search</div>
        if @props.results?.length == 0
            return <div style={fontWeight:'bold'}>There were no results for your search</div>
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



ProjectSearchOutputHeading = rclass

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
        return "/" + @props.most_recent_path

    change_info_visible : ->
        @setState(info_visible : not @state.info_visible)

    get_info : ->
        output_command_styles =
            backgroundColor : 'white'
            fontFamily      : 'monospace'
            fontSize        : '10pt'
            color           : '#888'

        if @state.info_visible
            <div>
                <ul>
                    <li>
                        Search command: <span style={output_command_styles}>'{@props.command}'</span>
                    </li>
                    <li>
                        Number of results: {@props.search_error ? @props.search_results?.length ? <Loading />}
                    </li>
                </ul>
            </div>

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
        checkboxes : rtypes.object

    handle_change : (name) ->
        project_store.getActions(@props.project_id, flux).setTo("#{name}": @refs[name].getChecked())

    input : (name, label) ->
        <Input
            ref      = {name}
            key      = {name}
            type     = 'checkbox'
            label    = {label}
            checked  = {@props[name]}
            onChange = {=>@handle_change(name)}
            style    = {fontSize:'16px'} />

    render : ->
        <div style={fontSize:'16px'}>
            {(@input(name, label) for name, label of @props.checkboxes)}
        </div>


ProjectSearchDisplay = rclass

    propTypes: ->
        user_input : rtypes.string
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


    search : (query) ->
        if query.trim() == ''
            return

        cmd = @generate_command(query, @props.subdirectories, not @props.case_sensitive, @props.hidden_files)
        max_results = 1000
        max_output  = 110 * max_results  # just in case

        project_store.getActions(@props.project_id, flux).setTo
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
                @process_results(err, output, max_results, max_output)


    process_results : (err, output, max_results, max_output) ->

        if (err and not output?) or (output? and not output.stdout?)
            project_store.getActions(@props.project_id, flux).setTo(search_error : err)
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

        project_store.getActions(@props.project_id, flux).setTo
            too_many_results : too_many_results
            search_results   : search_results



    output_heading : ->
        if @props.most_recent_search? and @props.most_recent_path?
            <ProjectSearchOutputHeading
                most_recent_path   = {@props.most_recent_path}
                command            = {@props.command}
                most_recent_search = {@props.most_recent_search}
                search_results     = {@props.search_results}
                search_error       = {@props.search_error} />

    output : ->
        if @props.search_results? or @props.search_error?
            <ProjectSearchOutput
                project_id       = {@props.project_id}
                results          = {@props.search_results}
                too_many_results = {@props.too_many_results}
                search_error     = {@props.search_error} />
        else if @props.most_recent_search?
            # a search has been made but the search_results or search_error hasn't come in yet
            <Loading />

    render : ->
        <Well>
            <Row>
                <Col sm=8>
                    <ProjectSearchInput search_cb={@search} project_id={@props.project_id} />
                    {@output_heading()}
                </Col>

                <Col sm=4>
                    <ProjectSearchSettings
                        project_id     = {@props.project_id}
                        checkboxes     = {@settings_checkboxes}
                        case_sensitive = {@props.case_sensitive}
                        subdirectories = {@props.subdirectories}
                        hidden_files   = {@props.hidden_files} />
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
        project_store.getActions(@props.project_id, flux).open_file(path:@props.filename, foreground:misc_page.open_in_foreground(e))

    render : ->
        <div style={wordWrap:'break-word'}>
            <NativeListener onClick={@click_filename}>
                <a href=""><strong>{@props.filename}</strong></a>
            </NativeListener>
            <span style={color:"#666"}> {@props.description}</span>
        </div>


render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <div>
        <Row>
            <Col sm=12>
                <h1>
                    <Icon name="search" /> Search
                    <span className="hidden-xs"> in current directory </span>
                </h1>
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
