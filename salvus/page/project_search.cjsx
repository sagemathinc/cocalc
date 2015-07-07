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

{Icon}          = require('r_misc')
diffsync        = require('diffsync')
{salvus_client} = require('salvus_client')


# Define project search actions
class ProjectSearchActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('flux').flux.getActions('project_search').setTo({search_query : "foo"})
    setTo: (settings) ->
        settings : settings

# Register project search actions
flux.createActions('project_search', ProjectSearchActions)

# Define project search store
class ProjectSearchStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('project_search')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (message) ->
        @setState(message.settings)

# Register project_search store
flux.createStore('project_search', ProjectSearchStore, flux)




ProjectSearchInput = rclass

    propTypes :
        search_cb : rtypes.func
        flux      : rtypes.object

    getInitialState: ->
        user_input : ''

    clear_and_focus_input : ->
        @setState(user_input : '')
        React.findDOMNode(@refs.project_search_input).focus()

    clear_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name="times-circle" />
        </Button>

    handle_change : (event) ->
        @setState(user_input : event.target.value)

    submit : (e) ->
        e.preventDefault()
        flux.getActions('project_search').setTo(user_input : @state.user_input)
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
        results          : rtypes.object
        too_many_results : rtypes.bool

    too_many_results : ->
        if @props.too_many_results
            <Well style={backgroundColor:'white';fontFamily:'monospace'}>
                There were more results than displayed below. Try making your search more specific.
            </Well>

    get_results : ->
        for filename, description of results
            <ProjectSearchResultLine
                filename    = {filename}
                description = {description} />

    render : ->
        <div>
            {@too_many_results()}
            <Well style={backgroundColor:'white';fontFamily:'monospace'}>
                {@get_results()}
            </Well>
        </div>



ProjectSearchOutputHeading = rclass

    propTypes :
        path         : rtypes.string
        show_command : rtypes.bool
        command      : rtypes.string
        output_terms : rtypes.string

    output_path : ->
        if @props.path then path else <Icon name="home" />

    output_command : ->
        if @props.show_command
            <span style={output_command_styles}>
                (search command: '{@props.command}')
            </span>

    render : ->
        output_command_styles =
            backgroundColor : 'white'
            fontFamily      : 'monospace'
            fontSize        : '10pt'
            color           : "#888"

        <div>
            <span style={color:'#666'}>
                <a href="#project-file-listing">Navigate to a different folder</a> to search in it.
            </span>

            <h4>
                Results of searching in {@output_path()} for "{@output_terms}"
            </h4>

            {@output_command()}
        </div>


ProjectSearchSettings = rclass

    propTypes :
        checkboxes : rtypes.object


    get_inputs : ->
        for name, label of @props.checkboxes
            <Input
                ref      = {name}
                key      = {name}
                type     = 'checkbox'
                label    = {label}
                onChange = {=>flux.getActions('project_search').setTo("#{name}": @refs[name].getChecked())}
                style    = {fontSize:'16px'} />

    render : ->
        <div>
            {@get_inputs()}
        </div>


ProjectSearchDisplay = rclass

    propTypes: ->
        user_input : rtypes.string

    getInitialState : ->
        state : 'search'   # search --> loading --> display


    settings_checkboxes :
        subdirectories : 'Include subdirectories'
        case_sensitive : 'Case sensitive'
        hidden_files   : 'Hidden files (begin with .)'
        show_command   : 'Show command'

    search : (query) ->
        if query.trim() == ''
            return

        @setState(state : 'loading')

        recursive   = @props.subdirectories
        insensitive = not @props.case_sensitive
        hidden      = @props.hidden_files
        max_results = 1000
        max_output  = 110 * max_results  # just in case

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


        # Exclude worksheet input cell markers
        cmd += " | grep -v #{diffsync.MARKERS.cell}"

        path = @current_pathname()

        path_prefix = path
        if path_prefix != ''
            path_prefix += '/'

        if @project.location?.path?
            flux.getActions('project_search').setTo(path : @project.location.path + '/' + path)
        else
            flux.getActions('project_search').setTo(path : ' ')


        that = @
        salvus_client.exec
            project_id      : @project.project_id
            command         : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout         : 10   # how long grep runs on client
            network_timeout : 15   # how long network call has until it must return something or get total error.
            max_output      : max_output
            bash            : true
            err_on_exit     : true
            path            : path
            cb              : (err, output) =>
                @setState(state : 'display')
                if (err and not output?) or (output? and not output.stdout?)
                    result = "Search took too long; please try a more restrictive search."
                    return

                num_results = 0
                results = output.stdout.split('\n')
                if output.stdout.length >= max_output or results.length > max_results or err
                    flux.getActions('project_search').setTo(too_many_results : true)
                else
                    flux.getActions('project_search').setTo(too_many_results : false)
                @process_results(results, max_output)



    process_results : (results, max_output) ->
        num_results = 0
        for line in results
            if line.trim() == ""
                continue
            i = line.indexOf(":")
            num_results += 1
            if i == -1
                path_prefix = ".foo"
                # the find part
                filename = line
                if filename.slice(0,2) == "./"
                    filename = filename.slice(2)

                search_results.push {filename : path_prefix + filename, description : '(filename)'}

            else
                # the rgrep part
                filename = line.slice(0,i)
                if filename.slice(0,2) == "./"
                    filename = filename.slice(2)
                context = line.slice(i+1)
                # strip codes in worksheet output
                if context.length > 0 and context[0] == diffsync.MARKERS.output
                    i = context.slice(1).indexOf(diffsync.MARKERS.output)
                    context = context.slice(i+2,context.length-1)

                search_results.push {filename : path_prefix + filename, description : context}

            if num_results >= max_output
                break

        flux.getActions('project_search').setTo(search_results : search_results)



    output_heading : ->
        switch @state.state
            when 'loading', 'display'
                <ProjectSearchOutputHeading
                    path         = {@props.path}
                    show_command = {@props.show_command}
                    command      = {@props.command}
                    output_terms = {@props.output_terms} />

    output : ->
        if @state.state == 'display'
            <ProjectSearchOutput
                search_results   = {@props.search_results}
                too_many_results = {@props.too_many_results} />

    render : ->
        <Well>
            <Row>
                <Col sm=8>
                    <ProjectSearchInput search_cb={@search} />
                    {@output_heading()}
                </Col>

                <Col sm=4>
                    <ProjectSearchSettings checkboxes={@settings_checkboxes}/>
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


    handle_click : (event) ->
        open_file(path:@props.filename, foreground:not(event.which == 2 or (event.ctrlKey or event.metaKey)))

    render : ->
        <div style={wordWrap:'break-word'}>
            <a onClick={@handle_click}><strong>{@props.filename}</strong></a>

        </div>


render = ->
    console.log "v2"
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
                <FluxComponent flux={flux} connectToStores={'project_search'}>
                    <ProjectSearchDisplay />
                </FluxComponent>
            </Col>
        </Row>
    </div>

exports.render_project_search = (project_id, dom_node) ->
    React.render(render(project_id), dom_node)
