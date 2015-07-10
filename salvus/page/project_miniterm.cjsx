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

###
miniterm.cjsx -- a small terminal that lets you enter a single bash command.

- [x] input box
- [x] display output
- [x] evaluate code on button click or form submit
- [x] don't push page down
- [x] clear output by pressing escape.
- [x] record event in project log
- [x] only log successful executions.
- [x] (0:15?) close button for output
- [ ] (0:15?) run code in correct directory
- [ ] (0:20?) change directory based on output
- [ ] (0:15?) delete any existing code in project.css/html/coffee
- [ ] (0:20?) way to forgot current execution (instead of waiting)?

TODO LATER:

 - [ ] persistent history (in database/project store)
 - [ ] tab completion
 - [ ] mode to evaluate in another program, e.g., %gp <...>
 - [ ] help

###

{rclass, React, rtypes, FluxComponent}  = require('flux')
{Button, Input, Row, Col} = require('react-bootstrap')
{ErrorDisplay, Icon} = require('r_misc')

project_store = require('project_store')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.

MiniTerminal = rclass
    propTypes: ->
        project_id   : rtypes.string.isRequired
        current_path : rtypes.array  # provided by the project store; undefined = HOME

    getInitialState: ->
        input  : ''
        stdout : undefined
        state  : 'edit'   # 'edit' --> 'run' --> 'edit'
        error  : undefined

    execute_command: ->
        @setState(stdout:'', error:'')
        input = @state.input.trim()
        if not input
            return
        @setState(state:'run')
        path = '.' # TODO
        salvus_client.exec
            project_id : @props.project_id
            command    : @state.input
            timeout    : 10
            max_output : 100000
            bash       : true
            path       : path
            err_on_exit: true
            cb         : (err, output) =>
                if err
                    @setState
                        state:'edit'
                        error:"Terminal command '#{input}' error -- #{err}\n (Hint: Click +New, then Terminal for full terminal.)"
                else
                    project_store.getActions(@props.project_id, @props.flux).log({event:"miniterm", input:input, path:path})
                    @setState(state:'edit', error:'', stdout:output.stdout, input:'')

    render_button: ->
        switch @state.state
            when 'edit'
                <Button onClick={@execute_command}>
                    <Icon name="play" />
                </Button>
            when 'run'
                <Button onClick={@execute_command}>
                    <Icon name="circle-o-notch" spin  />
                </Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render_stdout: ->
        if @state.stdout
            <pre>
                <a onClick={(e)=>e.preventDefault(); @setState(stdout:'')}
                   href=''
                   style={right:'5px', top:'0px', color:'#666', fontSize:'14pt', position:'absolute'}>
                       <Icon name='times' />
                </a>
                {@state.stdout}
            </pre>

    keydown: (e) ->
        # IMPORTANT: if you do window.e and look at e, it's all null!! But it is NOT
        # all null right now -- see
        #     http://stackoverflow.com/questions/22123055/react-keyboard-event-handlers-all-null
        ## e.persist(); window.e = e  # for debugging
        if e.keyCode == 27
            @setState(input: '', stdout:'', error:'')

    render: ->
        # NOTE: The style in form below offsets Bootstrap's form margin-bottom of +15 to look good.
        # We don't use inline, since we still want the full horizontal width.
        <div>
            <form onSubmit={(e) => e.preventDefault(); @execute_command()} style={marginBottom: '-10px'}>
                <Input
                    type        = "text"
                    value       = {@state.input}
                    ref         = "input"
                    placeholder = "Terminal command..."
                    readOnly    = {@state.state == 'run'}
                    onChange    = {(e) => e.preventDefault(); @setState(input:@refs.input.getValue())}
                    onKeyDown   = {@keydown}
                    buttonAfter = {@render_button()}
                    />
            </form>
            <div style={position:'absolute', zIndex:1, width:'100%', boxShadow: '0px 0px 7px #aaa'}>
                {@render_error()}
                {@render_stdout()}
            </div>
        </div>

render = (project_id) ->
    <MiniTerminal project_id={project_id} />

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    # the store provides a current_path prop
    <FluxComponent flux={flux} connectToStores={[store.name]}>
        <MiniTerminal project_id={project_id} />
    </FluxComponent>


exports.render_miniterm = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)
