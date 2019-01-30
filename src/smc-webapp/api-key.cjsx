###
API Key Configuration
###

misc = require('smc-util/misc')

{webapp_client} = require('./webapp_client')

{React, ReactDOM, rtypes, rclass, redux}  = require('./app-framework')

{CloseX, ErrorDisplay, Icon, LabeledRow, Loading} = require('./r_misc')

{Button, FormControl, Well} = require('react-bootstrap')

exports.APIKeySetting = rclass
    getInitialState: ->
        api_key      : undefined   # if it has been loaded
        password     : ''   # must be defined so that input control is controlled
        error        : undefined
        state        : 'init'

        ###
        The states are:
        'init'     - initial state -- show nothing and wait to click to request to view key; no info
        'error'    - showing an error
        'password' - requesting password from user
        'loading'  - loading something from backend (doing api call)
        'showkey'  - showing the api key (or that there is none)
        'confirm-delete' - confirming delete of API key
        'confirm-regenerate' - confirming regenerate of API key
        ###

    componentDidMount: ->
        @_mounted = true

    componentWillUnmount: ->
        @_mounted = false

    render_confirm: ->
        switch @state.state
            when 'confirm-delete'
                action = 'delete'
                mesg = "Are you sure you want to delete your API key?  "
            when 'confirm-regenerate'
                action = 'regenerate'
                mesg = "Are you sure you want to regenerate your API key?  "
        <div>
            {mesg} <b><i>Anything using the current API key will stop working.</i></b>
            <br/>
            <br/>
            <Button onClick={=>@do_action(action)} style={marginRight:'5px'} bsStyle='warning'>
                Yes
            </Button>
            <Button onClick={=>@setState(state:'showkey')}>
                Cancel
            </Button>
        </div>


    do_action: (action) ->
        @setState(state:'loading')
        webapp_client.api_key
            action   : action
            password : @state.password
            cb       : (err, api_key) =>
                if @_mounted
                    if err
                        @setState(error:err, password:undefined, api_key:undefined, state:'error')
                    else
                        @setState(api_key:api_key, state:'showkey')

    render_api_key: ->
        if @state.api_key
            <div>
                <pre>
                    {@state.api_key}
                </pre>
                {@render_button('delete', 'Delete key')}
                <span style={marginRight:'5px'}></span>
                {@render_button('regenerate', 'Regenerate key')}
            </div>
        else
            <div>
                You do not have an API key.
                <br/>
                <br/>
                {@render_button('regenerate', 'Create API Key')}
            </div>

    click_action_button: (action) ->
        switch @state.state
            when 'init'
                @setState(state: 'password')
            when 'password'
                @do_action(action)
            when 'showkey'
                if @state.api_key
                    @setState(state: "confirm-#{action}")
                else
                    @do_action(action)

    render_button: (action, name, disabled) ->
        if not name?
            switch action
                when 'get'
                    name = 'Reveal Key'
                when 'delete'
                    name = 'Delete Key'
                when 'regenerate'
                    name = 'Regenerate Key'
        if misc.startswith(@state.state, 'confirm-')
            disabled = true
        <Button
            onClick   = {=>@click_action_button(action)}
            disabled  = {disabled}
        >
            {name}{if @state.api_key or @state.state == 'init' then "..." else ""}
        </Button>

    render_get_password: ->
        <div style={display:'flex'}>
            <FormControl
                autoFocus
                style       = {flex:1, marginRight:'5px'}
                type        = 'password'
                ref         = 'password'
                placeholder = 'Current Password'
                value       = {@state.password}
                onChange    = {=>@setState(password : ReactDOM.findDOMNode(@refs.password).value)}
            />
            {@render_button('get', undefined, not @state.password)}
        </div>

    render_content: ->
        if @state.error
            return <ErrorDisplay error={@state.error} onClose={=>@setState(error:'', state:'init', password:undefined)} />
        switch @state.state
            when 'loading'
                return <Loading />
            when 'password'
                return @render_get_password()
            when 'showkey'
                return @render_api_key()
            when 'confirm-delete', 'confirm-regenerate'
                return <span>{@render_api_key()}<br/>{@render_confirm()}</span>

    render_close: ->
        <CloseX on_close={=>@setState(@getInitialState())} style={marginRight:'5px'} />

    render_docs: ->
        <div>
            <hr/>
            <span style={color:'#666'}>
            NOTE: If you do not have a password set, there is <a href="https://github.com/sagemathinc/cocalc/wiki/password" target="_blank" rel="noopener">a workaround to generate your API key.</a>
            <br/><br/>
            See the <a href="#{window.app_base_url}/doc/api.html" target="_blank" rel="noopener">CoCalc API documentation</a> to learn about the API.
            </span>
        </div>

    render_well: ->
        <div>
            {@render_close()}
            <Well>
                {@render_content()}
                {@render_docs()}
            </Well>
        </div>

    render_init: ->
        <div className='pull-right'>
            {@render_button('get')}
        </div>

    render: ->
        <LabeledRow label='API key'>
            <div style={minHeight:'30px'}>
                {if @state.state == 'init' then @render_init() else @render_well()}
            </div>
        </LabeledRow>
