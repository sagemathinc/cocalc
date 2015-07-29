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
- [x] (0:15?) run code in correct directory
- [x] (0:20?) change directory based on output
- [x] (0:15?) refresh file listing after running command
- [x] (0:15?) delete any existing code in project.css/html/coffee
- [x] (0:20?) way to forgot current execution (instead of waiting)?

IDEAS FOR LATER:

 - [ ] persistent history (in database/project store) -- this is in the log
 - [ ] tab completion
 - [ ] mode to evaluate in another program, e.g., %gp <...>
 - [ ] help

###

{rclass, React, rtypes, FluxComponent}  = require('flux')
{Button, Input, Row, Col} = require('react-bootstrap')
{ErrorDisplay, Icon} = require('r_misc')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.

exports.MiniTerminal = MiniTerminal = rclass
    displayName : "MiniTerminal"

    propTypes :
        project_id   : rtypes.string.isRequired
        current_path : rtypes.array  # provided by the project store; undefined = HOME

    getInitialState : ->
        input  : ''
        stdout : undefined
        state  : 'edit'   # 'edit' --> 'run' --> 'edit'
        error  : undefined

    execute_command : ->
        @setState(stdout:'', error:'')
        input = @state.input.trim()
        if not input
            return
        input0 = input + "\necho $HOME `pwd`"
        @setState(state:'run')
        path = @props.current_path.join('/')
        @_id = (@_id ? 0) + 1
        id = @_id
        salvus_client.exec
            project_id : @props.project_id
            command    : input0
            timeout    : 10
            max_output : 100000
            bash       : true
            path       : path
            err_on_exit: false
            cb         : (err, output) =>
                if @_id != id
                    # computation was cancelled -- ignore result.
                    return
                if err
                    @setState(error:err, state:'edit')
                else
                    actions = @props.flux.getProjectActions(@props.project_id)
                    if output.stdout
                        # Find the current path
                        # after the command is executed, and strip
                        # the output of "pwd" from the output:
                        s = output.stdout.trim()
                        i = s.lastIndexOf('\n')
                        if i == -1
                            output.stdout = ''
                        else
                            s = s.slice(i+1)
                            output.stdout = output.stdout.slice(0,i)
                        i = s.indexOf(' ')
                        full_path = s.slice(i+1)
                        if full_path.slice(0,i) == s.slice(0,i)
                            # only change if in project
                            path = s.slice(2*i+2)
                            actions.set_current_path(path)
                    if not output.stderr
                        # only log commands that worked...
                        actions.log({event:"miniterm", input:input})
                    @setState(state:'edit', error:output.stderr, stdout:output.stdout)
                    if not output.stderr
                        @setState(input:'')

    render_button : ->
        switch @state.state
            when 'edit'
                <Button onClick={@execute_command}>
                    <Icon name="play" />
                </Button>
            when 'run'
                <Button onClick={@execute_command}>
                    <Icon name="circle-o-notch" spin  />
                </Button>

    render_output : (x, style) ->
        if x
            <pre style=style>
                <a onClick={(e)=>e.preventDefault(); @setState(stdout:'', error:'')}
                   href=''
                   style={right:'5px', top:'0px', color:'#666', fontSize:'14pt', position:'absolute'}>
                       <Icon name='times' />
                </a>
                {x}
            </pre>

    keydown : (e) ->
        # IMPORTANT: if you do window.e and look at e, it's all null!! But it is NOT
        # all null right now -- see
        #     http://stackoverflow.com/questions/22123055/react-keyboard-event-handlers-all-null
        ## e.persist(); window.e = e  # for debugging
        if e.keyCode == 27
            @setState(input: '', stdout:'', error:'')

    render : ->
        # NOTE: The style in form below offsets Bootstrap's form margin-bottom of +15 to look good.
        # We don't use inline, since we still want the full horizontal width.
        <div>
            <form onSubmit={(e) => e.preventDefault(); @execute_command()} style={marginBottom: '-10px'}>
                <Input
                    type        = "text"
                    value       = {@state.input}
                    ref         = "input"
                    placeholder = "Terminal command..."
                    onChange    = {(e) => e.preventDefault(); @setState(input:@refs.input.getValue())}
                    onKeyDown   = {@keydown}
                    buttonAfter = {@render_button()}
                    />
            </form>
            <div style={position:'absolute', zIndex:1, width:'100%', boxShadow: '0px 0px 7px #aaa'}>
                {@render_output(@state.error, {color:'darkred', margin:0})}
                {@render_output(@state.stdout, {margin:0})}
            </div>
        </div>

render = (project_id, flux) ->
    store = flux.getProjectStore(project_id)
    # the store provides a current_path prop
    <FluxComponent flux={flux} connectToStores={[store.name]}>
        <MiniTerminal project_id={project_id} />
    </FluxComponent>
